package com.historymap.app

import android.graphics.Paint
import android.text.TextUtils
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntSize

/**
 * 事件泡泡层：按时间窗口显示当前事件，屏幕空间碰撞推挤（翻译 Web 版
 * EventBubbles + collisions.js），推挤后画指向线连回事件真实位置。
 *
 * 泡泡形态（对齐 Web .bubble-inner 单行胶囊，2026-08 由大卡片收轻）：
 * - 普通/选中/聚合同一款单行胶囊：印章竖条 + 事件简称一行（13px 常规衬线），
 *   高度 ≈24px、圆角左 2 右 10、米白底朱砂描边；
 * - 选中（is-focus）仅变色（朱砂底米白字 + 浅米聚焦描边），不展开摘要——
 *   事件详情由底部抽屉承载（与 Web 语义一致）；
 * - 聚合泡泡：「事件简称 +N」同款单行。
 *
 * 其它约束：
 * - 政权/城市/地点标签（layoutMapLabels 结果）作为固定障碍避让；
 * - clamp 回收时受纵向安全区约束（顶栏底 / 时间轴顶），泡泡不进 UI 铬区；
 * - 选中泡泡（详情打开）始终最后绘制（最上层）；
 * - 指向线朱砂虚线 + 箭头，锚点画事件点（朱砂圆 + 米白描边）。
 */

/** 布局结果：泡泡屏幕矩形（已含碰撞偏移）+ 事件真实位置锚点 */
data class PlacedBubble(
    val events: List<EventEntity>,
    val rect: RectF2,     // 推挤后的屏幕矩形（与实际绘制一致）
    val anchor: Offset,   // 事件真实位置（屏幕，聚合时为簇中心）
    val pushed: Boolean,  // 是否被推挤（需要指向线）
    val selected: Boolean,
    val label: String,    // 标题（聚合时为「简称 +N」）
    val year: String,     // 「1127 年」（聚合为空）
    val body: String,     // 摘要（普通泡泡为空；选中泡泡为两行摘要）
    val aggregated: Boolean,
) {
    /** 泡泡标识：单事件 "ev:id"，聚合 "agg:id1,id2"（动画 key，跨帧稳定） */
    val key: String
        get() = if (events.size > 1) {
            "agg:" + events.map { it.id }.sorted().joinToString(",")
        } else {
            "ev:" + events.first().id
        }
}

/** 泡泡文字样式（对齐 Web .bubble-inner：13px 常规体衬线；×density 换屏幕 px） */
private fun bubbleTitlePaint(scale: Float, density: Float, selected: Boolean) = android.text.TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
    textSize = DesignMetrics.designToTextPx(MapTokens.Typography.BUBBLE_TITLE.size.toFloat(), density, scale)
    typeface = MapFonts.Serif
    color = if (selected) 0xFFFDF8EC.toInt() else 0xFF3A3428.toInt()
}

/** 泡泡年份文字样式（12px 朱砂） */
private fun bubbleYearPaint(scale: Float, density: Float, selected: Boolean) = android.text.TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
    textSize = DesignMetrics.designToTextPx(MapTokens.Typography.BUBBLE_BODY.size.toFloat(), density, scale)
    typeface = MapFonts.Serif
    color = if (selected) 0xE6FDF8EC.toInt() else 0xFFB03A2E.toInt()
}

/** 泡泡摘要文字样式（12px/400 衬线） */
private fun bubbleBodyPaint(scale: Float, density: Float, selected: Boolean) = android.text.TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
    textSize = DesignMetrics.designToTextPx(MapTokens.Typography.BUBBLE_BODY.size.toFloat(), density, scale)
    typeface = MapFonts.Serif
    color = if (selected) 0xE0FDF8EC.toInt() else 0xB33A3428.toInt()
}

/**
 * 计算全部可见泡泡的推挤布局（纯计算，绘制与命中测试共用）：
 * 1. 事件 → 屏幕锚点（不预聚合；P5 对齐 Web 版 EventBubbles._applyFolds——
 *    先推挤，推挤后仍互相重叠的 ≥3 个才收成「+N」聚合泡泡；2 个近邻事件
 *    由碰撞推挤分开，避免 1127 靖康之变等三事件被过早合并成单泡）
 * 2. 地图标签（PlacedMapLabel）→ 固定障碍
 * 3. 碰撞推挤 + 安全区 clamp 回收 + 二次碰撞
 * 4. 折叠：并查集按「推挤后仍重叠」聚簇，簇 ≥3 收成聚合泡泡
 * @param safeTop / safeBottom 纵向安全区（px）：顶栏底 / 时间轴顶
 */
fun layoutBubbles(
    events: List<EventEntity>,
    placedLabels: List<PlacedMapLabel>,
    renderer: MapRenderer,
    titlePaint: android.text.TextPaint,
    yearPaint: android.text.TextPaint,
    bodyPaint: android.text.TextPaint,
    density: Float,
    viewW: Float,
    viewH: Float,
    selectedId: Long? = null,
    safeTop: Float = 0f,
    safeBottom: Float = 0f,
): List<PlacedBubble> {
    if (events.isEmpty()) return emptyList()
    // 设计画布宽度 → 当前视口比例；泡泡尺寸 token 为 CSS px 语义（同 Web），t() ×density 换屏幕 px
    val scale = if (viewW > 0f) viewW / DesignMetrics.CANVAS_WIDTH else 1f
    fun t(px: Float) = DesignMetrics.designToTextPx(px, density, scale)
    val b = MapTokens.Bubble

    // 1. 事件 → 屏幕锚点（每个事件独立泡泡，不预聚合）
    val anchors = events.map { ev ->
        val (wx, wy) = renderer.projectEvent(ev.lng, ev.lat)
        val (sx, sy) = renderer.worldToScreen(wx, wy)
        ev to (sx to sy)
    }

    // 2. 每个事件 → 泡泡矩形（单行胶囊：印章条 + 简称一行，对齐 Web .bubble-inner）
    val maxW = t(b.MAX_WIDTH)
    val minW = t(b.MIN_WIDTH)
    val textMaxW = (maxW - t(b.TEXT_LEFT) - t(b.PAD_X)).coerceAtLeast(t(40f))
    val content = anchors.map { (ev, pos) ->
        val selected = ev.id == selectedId
        val label = ev.short.ifEmpty { "未命名事件" }
        val titleShown = ellipsize(label, titlePaint, textMaxW)
        // 选中态只变色不展开（Web is-focus 语义）；详情由底部抽屉承载
        val w = (titlePaint.measureText(titleShown) + t(b.TEXT_LEFT) + t(b.PAD_X)).coerceIn(minW, maxW)
        val h = t(if (selected) b.HEIGHT_SELECTED else b.HEIGHT)
        Pair(
            ClusterContent(label = titleShown, year = "", body = "", aggregated = false),
            // 碰撞优先级用月粒度序号：同一年不同月的事件也能按时间先后正确排序
            CollisionNode(TimeIndex.of(ev.year, ev.month), RectF2(pos.first - w / 2, pos.second - h / 2, w, h)),
        )
    }
    val nodes = content.map { it.second }

    // 3. 地图标签 → 固定障碍（与绘制卡片对齐：label rect 直接使用）
    val labelNodes = placedLabels
        .filter { it.visible && it.label.kind != "rivers" }
        .map { l ->
            CollisionNode(
                Int.MIN_VALUE,
                RectF2(l.rect.left, l.rect.top, l.rect.width, l.rect.height),
                fixed = true,
            )
        }

    val all = labelNodes + nodes
    val shifts = resolveCollisions(all)
    // 安全区 clamp 回收：泡泡不进入顶栏/时间轴（minY=safeTop、maxY=viewH-safeBottom）
    val minY = maxOf(6f, safeTop)
    val maxY = minOf(viewH - 6f, viewH - safeBottom)
    val clamped = nodes.mapIndexed { i, node ->
        clampToViewport(node.rect, shifts[labelNodes.size + i].dx, shifts[labelNodes.size + i].dy, viewW, viewH, minY = minY, maxY = maxY)
    }
    // 二次碰撞：回收后可能重新压到其它泡泡/标签，用低 maxPush 再解一次
    val finalShifts = MutableList(nodes.size) { clamped[it] }
    for (i in nodes.indices) {
        for (j in i + 1 until nodes.size) {
            val a = nodes[i].rect
            val b = nodes[j].rect
            val ax = a.x + finalShifts[i].dx
            val ay = a.y + finalShifts[i].dy
            val bx = b.x + finalShifts[j].dx
            val by = b.y + finalShifts[j].dy
            val ox = minOf(ax + a.w, bx + b.w) - maxOf(ax, bx)
            val oy = minOf(ay + a.h, by + b.h) - maxOf(ay, by)
            if (ox > 0f && oy > 0f) {
                finalShifts[j] = Shift(finalShifts[j].dx + ox + 4f, finalShifts[j].dy)
            }
        }
    }

    // 4. 折叠：并查集按「推挤后仍重叠」聚簇（对齐 Web 版 _applyFolds），簇 ≥3 收聚合
    val rects = nodes.mapIndexed { i, node ->
        RectF2(node.rect.x + finalShifts[i].dx, node.rect.y + finalShifts[i].dy, node.rect.w, node.rect.h)
    }
    val parent = IntArray(rects.size) { it }
    fun find(x: Int): Int {
        var r = x
        while (parent[r] != r) r = parent[r]
        var c = x
        while (parent[c] != c) { val n = parent[c]; parent[c] = r; c = n }
        return r
    }
    for (i in rects.indices) {
        for (j in i + 1 until rects.size) {
            val a = rects[i]
            val b = rects[j]
            val ox = minOf(a.x + a.w, b.x + b.w) - maxOf(a.x, b.x)
            val oy = minOf(a.y + a.h, b.y + b.h) - maxOf(a.y, b.y)
            if (ox > 0f && oy > 0f) parent[find(i)] = find(j)
        }
    }
    val groups = HashMap<Int, MutableList<Int>>()
    rects.indices.forEach { i -> groups.getOrPut(find(i)) { mutableListOf() }.add(i) }

    val placed = mutableListOf<PlacedBubble>()
    for ((_, members) in groups) {
        if (members.size < 3) {
            // 独立泡泡（≤2 个不折叠）
            for (i in members) {
                val ev = anchors[i].first
                val cc = content[i].first
                val r = rects[i]
                placed.add(
                    PlacedBubble(
                        events = listOf(ev),
                        rect = r,
                        anchor = Offset(anchors[i].second.first, anchors[i].second.second),
                        pushed = kotlin.math.abs(finalShifts[i].dx) + kotlin.math.abs(finalShifts[i].dy) > 4f,
                        selected = ev.id == selectedId,
                        label = cc.label,
                        year = cc.year,
                        body = cc.body,
                        aggregated = false,
                    )
                )
            }
        } else {
            // 聚合泡泡：「简称 +N」紧凑卡片，位于成员锚点平均处
            val first = anchors[members.first()].first
            val ax = members.map { anchors[it].second.first }.average().toFloat()
            val ay = members.map { anchors[it].second.second }.average().toFloat()
            val label = "${first.short.ifEmpty { "未命名事件" }} +${members.size - 1}"
            val labelShown = ellipsize(label, titlePaint, textMaxW)
            val w = (titlePaint.measureText(labelShown) + t(b.TEXT_LEFT) + t(b.PAD_X)).coerceIn(minW, maxW)
            val h = t(b.HEIGHT_COMPACT)
            // 聚合矩形中心 clamp 回可视区（顶栏/时间轴安全区内 + 屏幕内），避免出屏或压 UI；
            // anchor 保留事件真实位置（指向线锚点）
            val cx = ax.coerceIn(w / 2f, (viewW - w / 2f).coerceAtLeast(w / 2f))
            val cy = ay.coerceIn(minY + h / 2f, (maxY - h / 2f).coerceAtLeast(minY + h / 2f))
            placed.add(
                PlacedBubble(
                    events = members.map { anchors[it].first },
                    rect = RectF2(cx - w / 2, cy - h / 2, w, h),
                    anchor = Offset(ax, ay),
                    pushed = true,
                    selected = false,
                    label = labelShown,
                    year = "",
                    body = "",
                    aggregated = true,
                )
            )
        }
    }
    // 保持稳定顺序：按年份升序（与 visibleEvents 一致）
    return placed.sortedBy { it.events.first().year }
}

/** 省略号截断（测量超宽时 END 截断） */
private fun ellipsize(text: String, paint: android.text.TextPaint, maxW: Float): String =
    if (paint.measureText(text) > maxW) {
        TextUtils.ellipsize(text, paint, maxW, TextUtils.TruncateAt.END).toString()
    } else text

/** 簇内容（标题/年份/正文/聚合标志），布局与绘制共用 */
private data class ClusterContent(
    val label: String,
    val year: String,
    val body: String,
    val aggregated: Boolean,
)

@Composable
fun EventBubblesLayer(
    events: List<EventEntity>,        // 当前年份窗口内的可见事件
    placedLabels: List<PlacedMapLabel>, // 地图标签放置结果（固定障碍）
    renderer: MapRenderer,
    selectedEventId: Long?,
    modifier: Modifier = Modifier,
    safeTop: Float = 0f,
    safeBottom: Float = 0f,
) {
    val density = LocalDensity.current.density
    var canvasSize by remember { mutableStateOf(IntSize.Zero) }

    // 布局在组合期计算（供动画跟踪 key 变化；绘制复用同一份结果）
    val placed = remember(
        events, placedLabels, renderer.zoom, renderer.cx, renderer.cy,
        canvasSize, selectedEventId, safeTop, safeBottom,
    ) {
        if (canvasSize.width <= 0 || canvasSize.height <= 0) emptyList()
        else {
            val scale = canvasSize.width / DesignMetrics.CANVAS_WIDTH
            layoutBubbles(
                events, placedLabels, renderer,
                bubbleTitlePaint(scale, density, false), bubbleYearPaint(scale, density, false), bubbleBodyPaint(scale, density, false),
                density, canvasSize.width.toFloat(), canvasSize.height.toFloat(), selectedEventId, safeTop, safeBottom,
            )
        }
    }

    // —— 出现/消失动画（180ms alpha + 缩放；仅新增/消失执行，平移缩放不触发）——
    val appear = remember { mutableStateMapOf<String, Float>() }        // 出现进度 0..1
    val exiting = remember { mutableStateListOf<Pair<String, Float>>() } // 退场 (key, 1..0)
    val lastPlaced = remember { mutableStateOf(emptyMap<String, PlacedBubble>()) }
    val lastKeys = remember { mutableStateOf(setOf<String>()) }

    LaunchedEffect(placed.map { it.key }) {
        val keys = placed.map { it.key }.toSet()
        val prev = lastKeys.value
        // 消失：用最后已知位置淡出
        val gone = prev - keys
        gone.forEach { k ->
            if (lastPlaced.value[k] != null) {
                exiting.add(k to 1f)
                appear.remove(k)
            }
        }
        // 新增：0 → 1
        val fresh = keys - appear.keys - exiting.map { it.first }.toSet()
        fresh.forEach { appear[it] = 0f }
        if (fresh.isNotEmpty() || gone.isNotEmpty()) {
            val start = withFrameNanos { it }
            while (true) {
                val t = ((withFrameNanos { it } - start) / 180_000_000f).coerceIn(0f, 1f)
                fresh.forEach { appear[it] = t }
                exiting.replaceAll { (k, _) -> k to (1f - t).coerceAtLeast(0f) }
                if (t >= 1f) break
            }
            exiting.removeAll { it.second <= 0f }
            fresh.forEach { appear[it] = 1f }
        }
        lastKeys.value = keys
        lastPlaced.value = placed.associateBy { it.key }
    }

    Canvas(modifier = modifier.onSizeChanged { canvasSize = it }) {
        val scale = if (size.width > 0f) size.width / DesignMetrics.CANVAS_WIDTH else 1f
        val titlePaint = bubbleTitlePaint(scale, density, selected = false)
        val titlePaintSel = bubbleTitlePaint(scale, density, selected = true)
        val yearPaint = bubbleYearPaint(scale, density, selected = false)
        val yearPaintSel = bubbleYearPaint(scale, density, selected = true)
        val bodyPaint = bubbleBodyPaint(scale, density, selected = false)
        val bodyPaintSel = bubbleBodyPaint(scale, density, selected = true)
        // 选中泡泡最后绘制（始终在最上层），普通在前
        for (bubble in placed.sortedBy { if (it.selected) 1 else 0 }) {
            val a = appear[bubble.key] ?: 1f
            drawBubbleAnimated(
                bubble,
                if (bubble.selected) titlePaintSel else titlePaint,
                if (bubble.selected) yearPaintSel else yearPaint,
                if (bubble.selected) bodyPaintSel else bodyPaint,
                scale, density, alpha = a, scaleFactor = 0.85f + 0.15f * a,
            )
        }
        // 退场泡泡：最后位置淡出（alpha = 退场进度）
        for ((k, p) in exiting) {
            val bubble = lastPlaced.value[k] ?: continue
            drawBubbleAnimated(bubble, titlePaint, yearPaint, bodyPaint, scale, density, alpha = p, scaleFactor = 1f)
        }
    }
}

/** 带透明度 + 缩放的泡泡绘制（出现/消失动画共用；缩放以泡泡中心为锚点，含指向线/锚点） */
private fun DrawScope.drawBubbleAnimated(
    bubble: PlacedBubble,
    titlePaint: Paint,
    yearPaint: Paint,
    bodyPaint: android.text.TextPaint,
    scale: Float,
    density: Float,
    alpha: Float,
    scaleFactor: Float,
) {
    if (alpha <= 0f) return
    fun t(px: Float) = DesignMetrics.designToTextPx(px, density, scale)
    val center = Offset(bubble.rect.x + bubble.rect.w / 2, bubble.rect.y + bubble.rect.h / 2)
    this.scale(scaleFactor, scaleFactor, center) {
        // 指向线/锚点/箭头：在 saveLayer 外绘制——saveLayer(bounds=气泡矩形) 会裁剪
        // 气泡矩形外的内容，导致指向线/事件点被切掉。手动给颜色乘 alpha 复刻动画淡入淡出。
        if (bubble.pushed) {
            drawLine(
                color = MapTokens.VERMILION.copy(alpha = 0.55f * alpha),
                start = bubble.anchor,
                end = center,
                strokeWidth = t(MapTokens.Bubble.STROKE_PX),
                pathEffect = PathEffect.dashPathEffect(
                    floatArrayOf(
                        t(MapTokens.Dimensions.LEADER_DASH_LENGTH.toFloat()),
                        t(MapTokens.Dimensions.LEADER_GAP.toFloat()),
                    ),
                ),
            )
            val dotR = t(MapTokens.Dimensions.EVENT_POINT_DIAMETER.toFloat()) / 2f
            drawCircle(color = MapTokens.VERMILION.copy(alpha = alpha), radius = dotR, center = bubble.anchor)
            drawCircle(
                color = MapTokens.PAPER_CARD.copy(alpha = alpha),
                radius = dotR,
                center = bubble.anchor,
                style = Stroke(width = t(2f)),
            )
            drawLeaderArrow(center, bubble.anchor, scale, density, alpha)
        }
        // 气泡卡片：saveLayer 内绘制（alpha 动画作用于卡片内容）
        drawIntoCanvas { canvas ->
            val layerPaint = androidx.compose.ui.graphics.Paint().apply { this.alpha = alpha }
            val bounds = Rect(bubble.rect.x, bubble.rect.y, bubble.rect.x + bubble.rect.w, bubble.rect.y + bubble.rect.h)
            canvas.saveLayer(bounds, layerPaint)
            drawBubble(bubble, titlePaint, yearPaint, bodyPaint, scale, density)
            canvas.restore()
        }
    }
}

/** 指向线箭头（泡泡端小三角，指示方向；arrow-l 8px / arrow-w 5px） */
private fun DrawScope.drawLeaderArrow(tip: Offset, from: Offset, scale: Float, density: Float, alpha: Float = 1f) {
    fun t(px: Float) = DesignMetrics.designToTextPx(px, density, scale)
    val dx = tip.x - from.x
    val dy = tip.y - from.y
    val len = kotlin.math.hypot(dx.toDouble(), dy.toDouble())
    if (len < t(12f)) return
    val ux = (dx / len).toFloat()
    val uy = (dy / len).toFloat()
    val size = t(MapTokens.Dimensions.ARROW_WIDTH.toFloat())
    val len2 = t(MapTokens.Dimensions.ARROW_LENGTH.toFloat())
    val base = Offset(tip.x - ux * len2, tip.y - uy * len2)
    val p1 = Offset(base.x - uy * size * 0.7f, base.y + ux * size * 0.7f)
    val p2 = Offset(base.x + uy * size * 0.7f, base.y - ux * size * 0.7f)
    val c = MapTokens.VERMILION.copy(alpha = 0.55f * alpha)
    drawLine(color = c, start = p1, end = tip, strokeWidth = t(MapTokens.Bubble.STROKE_PX))
    drawLine(color = c, start = p2, end = tip, strokeWidth = t(MapTokens.Bubble.STROKE_PX))
}

/**
 * 绘制单个泡泡：单行胶囊（对齐 Web .bubble-inner）——印章竖条 + 简称一行，
 * 米白底/朱砂描边/圆角左 2 右 10；选中（is-focus）朱砂底米白字 + 浅米聚焦描边；
 * 聚合同款（「简称 +N」）。
 */
private fun DrawScope.drawBubble(
    bubble: PlacedBubble,
    titlePaint: Paint,
    yearPaint: Paint,
    bodyPaint: android.text.TextPaint,
    scale: Float,
    density: Float,
) {
    val b = MapTokens.Bubble
    fun t(px: Float) = DesignMetrics.designToTextPx(px, density, scale)
    val rect = Rect(bubble.rect.x, bubble.rect.y, bubble.rect.x + bubble.rect.w, bubble.rect.y + bubble.rect.h)
    // 圆角（Web 为 2px 10px 10px 2px 分角；24dp 胶囊上观感差异极小，取中值统一圆角）
    val radius = CornerRadius(t((b.RADIUS_LEFT + b.RADIUS_RIGHT) / 2f))
    val fill = if (bubble.selected) MapTokens.VERMILION else {
        MapTokens.PAPER_CARD.copy(alpha = MapTokens.Alpha.BUBBLE_BACKGROUND / 255f)
    }
    // 单层淡墨阴影：右下偏移（统一左上来光）
    drawRoundRect(
        color = MapTokens.INK.copy(alpha = MapTokens.Alpha.BUBBLE_SHADOW / 255f),
        topLeft = Offset(rect.left + t(1f), rect.top + t(2f)),
        size = Size(rect.width, rect.height),
        cornerRadius = radius,
    )
    drawRoundRect(color = fill, topLeft = rect.topLeft, size = Size(rect.width, rect.height), cornerRadius = radius)
    if (bubble.selected) {
        drawRoundRect(
            color = Color(0xCCFDF8EC),
            topLeft = rect.topLeft, size = Size(rect.width, rect.height), cornerRadius = radius,
            style = Stroke(width = t(2f)),
        )
    } else {
        drawRoundRect(
            color = MapTokens.VERMILION.copy(alpha = MapTokens.Alpha.BUBBLE_BORDER / 255f),
            topLeft = rect.topLeft, size = Size(rect.width, rect.height), cornerRadius = radius,
            style = Stroke(width = t(1f)),
        )
    }
    // 印章竖条（Web .bubble-seal：宽 5px、与文字等高、上下内缩 3px）
    val cat = MapTokens.categoryColor(bubble.events.first().category)
    drawRoundRect(
        color = if (bubble.selected) Color(0xCCFDF8EC) else cat,
        topLeft = Offset(rect.left + t(3f), rect.top + t(3f)),
        size = Size(t(b.SEAL_WIDTH), (rect.height - t(6f)).coerceAtLeast(t(6f))),
        cornerRadius = CornerRadius(t(1.5f)),
    )
    // 单行文字：垂直居中（yearPaint/bodyPaint 保留签名供聚合扩展，单行态不使用）
    drawIntoCanvas { canvas ->
        val native = canvas.nativeCanvas
        val textX = rect.left + t(b.TEXT_LEFT)
        val cy = rect.top + rect.height / 2f
        val fm = titlePaint.fontMetrics
        val baseline = cy - (fm.ascent + fm.descent) / 2f
        native.drawText(bubble.label, textX, baseline, titlePaint)
    }
}

/** 命中测试：屏幕点落在哪个泡泡上（与绘制共用同一布局计算） */
fun hitTestBubble(
    events: List<EventEntity>,
    placedLabels: List<PlacedMapLabel>,
    renderer: MapRenderer,
    density: Float,
    selectedId: Long?,
    x: Float,
    y: Float,
    safeTop: Float = 0f,
    safeBottom: Float = 0f,
): EventEntity? {
    if (events.isEmpty()) return null
    val scale = if (renderer.viewportWidth() > 0) {
        renderer.viewportWidth().toFloat() / DesignMetrics.CANVAS_WIDTH
    } else 1f
    val placed = layoutBubbles(
        events, placedLabels, renderer,
        bubbleTitlePaint(scale, density, selected = false),
        bubbleYearPaint(scale, density, selected = false),
        bubbleBodyPaint(scale, density, selected = false),
        density,
        renderer.viewportWidth().toFloat(), renderer.viewportHeight().toFloat(), selectedId,
        safeTop, safeBottom,
    )
    return placed.firstOrNull { b ->
        x >= b.rect.x && x <= b.rect.x + b.rect.w && y >= b.rect.y && y <= b.rect.y + b.rect.h
    }?.events?.firstOrNull()
}
