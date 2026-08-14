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
 * 两种模式（P1-泡泡，对齐 design-tokens / prompt_1.png + 评审移动端方案）：
 * - 普通事件泡泡：标题(15px/700) + 年份(12px 朱砂)，不显示摘要（信息密度
 *   与卡片尺寸匹配，可读性优先）；高度 76px；
 * - 选中泡泡：标题 + 年份 + 两行摘要（12px，StaticLayout 两行截断），
 *   高度 116px，朱砂底白字 + 浅色聚焦描边；
 * - 聚合泡泡：紧凑「事件简称 +N」，高度 44px，独立视觉。
 *
 * 其它约束：
 * - 政权/城市/地点标签（layoutMapLabels 结果）作为固定障碍避让；
 * - clamp 回收时受纵向安全区约束（顶栏底 / 时间轴顶），泡泡不进 UI 铬区；
 * - 选中泡泡（详情打开）始终最后绘制（最上层），朱砂底白字；
 * - 指向线朱砂虚线 + 箭头，锚点画事件点（10px 朱砂圆 + 米白描边）。
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

/** 从 detail 抽取短摘要（首句截断，避免地图上大段正文；无安全摘要返回空） */
fun shortEventSummary(detail: String, max: Int = 18): String {
    val first = detail.split(Regex("[。！？；.!?;]")).firstOrNull { it.isNotBlank() }?.trim() ?: return ""
    if (first.isEmpty()) return ""
    return if (first.length > max) first.take(max - 1) + "…" else first
}

/** 泡泡标题文字样式（设计 15px/700 衬线；textSize = 15 × scale，P20 上 1:1 对齐设计 px） */
private fun bubbleTitlePaint(scale: Float, selected: Boolean) = android.text.TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
    textSize = MapTokens.Typography.BUBBLE_TITLE.size * scale
    typeface = MapFonts.SerifBold
    color = if (selected) 0xFFFDF8EC.toInt() else 0xFF3A3428.toInt()
}

/** 泡泡年份文字样式（12px 朱砂） */
private fun bubbleYearPaint(scale: Float, selected: Boolean) = android.text.TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
    textSize = MapTokens.Typography.BUBBLE_BODY.size * scale
    typeface = MapFonts.Serif
    color = if (selected) 0xE6FDF8EC.toInt() else 0xFFB03A2E.toInt()
}

/** 泡泡摘要文字样式（12px/400 衬线） */
private fun bubbleBodyPaint(scale: Float, selected: Boolean) = android.text.TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
    textSize = MapTokens.Typography.BUBBLE_BODY.size * scale
    typeface = MapFonts.Serif
    color = if (selected) 0xE0FDF8EC.toInt() else 0xB33A3428.toInt()
}

/** 事件聚合簇：按屏幕邻近锚点分组 */
private data class Cluster(
    val events: MutableList<EventEntity> = mutableListOf(),
) {
    var ax = 0f
        private set
    var ay = 0f
        private set

    fun add(ev: EventEntity, sx: Float, sy: Float) {
        events.add(ev)
        val n = events.size
        ax = ax + (sx - ax) / n
        ay = ay + (sy - ay) / n
    }
}

/**
 * 计算全部可见泡泡的推挤布局（纯计算，绘制与命中测试共用）：
 * 1. 事件 → 屏幕锚点，按邻近距离聚合为簇
 * 2. 地图标签（PlacedMapLabel）→ 固定障碍
 * 3. 碰撞推挤 + 安全区 clamp 回收 + 二次碰撞
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
    // 设计画布宽度 → 当前视口比例（气泡尺寸按设计 px × scale；P20 上 scale=1）
    val scale = if (viewW > 0f) viewW / DesignMetrics.CANVAS_WIDTH else 1f
    val b = MapTokens.Bubble

    // 1. 聚合：屏幕邻近事件并簇（阈值与泡泡尺寸联动）
    val anchors = events.map { ev ->
        val (wx, wy) = renderer.projectEvent(ev.lng, ev.lat)
        val (sx, sy) = renderer.worldToScreen(wx, wy)
        ev to (sx to sy)
    }
    val clusters = mutableListOf<Cluster>()
    for ((ev, pos) in anchors) {
        var joined = false
        for (c in clusters) {
            val d = kotlin.math.hypot((pos.first - c.ax).toDouble(), (pos.second - c.ay).toDouble())
            if (d < b.CLUSTER_DIST_DP * density) {
                c.add(ev, pos.first, pos.second)
                joined = true
                break
            }
        }
        if (!joined) clusters.add(Cluster().apply { add(ev, pos.first, pos.second) })
    }

    // 2. 簇 → 泡泡矩形（普通：标题+年份 76px；选中：+两行摘要 116px；聚合：44px 紧凑）
    val maxW = b.MAX_WIDTH * scale
    val minW = b.MIN_WIDTH * scale
    val content = clusters.map { c ->
        val first = c.events.first()
        val aggregated = c.events.size > 1
        val selected = c.events.any { it.id == selectedId }
        val label = if (aggregated) {
            "${first.short.ifEmpty { "未命名事件" }} +${c.events.size - 1}"
        } else {
            first.short.ifEmpty { "未命名事件" }
        }
        val year = if (aggregated) "" else "${first.year} 年"
        // P1-移动端方案：普通泡泡不显示摘要（信息密度匹配 76px 卡片），
        // 选中泡泡展开两行摘要（36 字上限，StaticLayout 绘制时两行截断）
        val body = when {
            aggregated -> ""
            selected -> shortEventSummary(first.detail, max = 36)
            else -> ""
        }
        val textMaxW = (maxW - b.TEXT_LEFT * scale - b.PAD_X * scale).coerceAtLeast(40f * scale)
        val titleShown = ellipsize(label, titlePaint, textMaxW)
        val yearShown = if (year.isEmpty()) "" else ellipsize(year, yearPaint, textMaxW)
        val bodyW = if (body.isEmpty()) 0f else minOf(bodyPaint.measureText(body), textMaxW)
        val contentW = maxOf(
            titlePaint.measureText(titleShown),
            if (yearShown.isNotEmpty()) yearPaint.measureText(yearShown) else 0f,
            bodyW,
        )
        val w = (contentW + b.TEXT_LEFT * scale + b.PAD_X * scale).coerceIn(minW, maxW)
        val h = when {
            aggregated -> b.HEIGHT_COMPACT * scale
            selected -> b.HEIGHT_SELECTED * scale
            else -> b.HEIGHT * scale
        }
        Pair(
            ClusterContent(label = titleShown, year = yearShown, body = body, aggregated = aggregated),
            CollisionNode(first.year, RectF2(c.ax - w / 2, c.ay - h / 2, w, h)),
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

    return clusters.mapIndexed { i, c ->
        val node = nodes[i]
        val shift = finalShifts[i]
        val rect = RectF2(node.rect.x + shift.dx, node.rect.y + shift.dy, node.rect.w, node.rect.h)
        val cc = content[i].first
        PlacedBubble(
            events = c.events,
            rect = rect,
            anchor = Offset(c.ax, c.ay),
            pushed = kotlin.math.abs(shift.dx) + kotlin.math.abs(shift.dy) > 4f,
            selected = c.events.any { it.id == selectedId },
            label = cc.label,
            year = cc.year,
            body = cc.body,
            aggregated = cc.aggregated,
        )
    }
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
                bubbleTitlePaint(scale, false), bubbleYearPaint(scale, false), bubbleBodyPaint(scale, false),
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
        val titlePaint = bubbleTitlePaint(scale, selected = false)
        val titlePaintSel = bubbleTitlePaint(scale, selected = true)
        val yearPaint = bubbleYearPaint(scale, selected = false)
        val yearPaintSel = bubbleYearPaint(scale, selected = true)
        val bodyPaint = bubbleBodyPaint(scale, selected = false)
        val bodyPaintSel = bubbleBodyPaint(scale, selected = true)
        // 选中泡泡最后绘制（始终在最上层），普通在前
        for (bubble in placed.sortedBy { if (it.selected) 1 else 0 }) {
            val a = appear[bubble.key] ?: 1f
            drawBubbleAnimated(
                bubble,
                if (bubble.selected) titlePaintSel else titlePaint,
                if (bubble.selected) yearPaintSel else yearPaint,
                if (bubble.selected) bodyPaintSel else bodyPaint,
                scale, alpha = a, scaleFactor = 0.85f + 0.15f * a,
            )
        }
        // 退场泡泡：最后位置淡出（alpha = 退场进度）
        for ((k, p) in exiting) {
            val bubble = lastPlaced.value[k] ?: continue
            drawBubbleAnimated(bubble, titlePaint, yearPaint, bodyPaint, scale, alpha = p, scaleFactor = 1f)
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
    alpha: Float,
    scaleFactor: Float,
) {
    if (alpha <= 0f) return
    val center = Offset(bubble.rect.x + bubble.rect.w / 2, bubble.rect.y + bubble.rect.h / 2)
    this.scale(scaleFactor, scaleFactor, center) {
        drawIntoCanvas { canvas ->
            val layerPaint = androidx.compose.ui.graphics.Paint().apply { this.alpha = alpha }
            val bounds = Rect(bubble.rect.x, bubble.rect.y, bubble.rect.x + bubble.rect.w, bubble.rect.y + bubble.rect.h)
            canvas.saveLayer(bounds, layerPaint)
            if (bubble.pushed) {
                // 指向线：事件真实位置 → 泡泡中心（朱砂虚线 + 箭头 + 锚点事件点）
                drawLine(
                    color = MapTokens.VERMILION.copy(alpha = 0.55f),
                    start = bubble.anchor,
                    end = center,
                    strokeWidth = MapTokens.Bubble.STROKE_PX * scale,
                    pathEffect = PathEffect.dashPathEffect(
                        floatArrayOf(
                            MapTokens.Dimensions.LEADER_DASH_LENGTH * scale,
                            MapTokens.Dimensions.LEADER_GAP * scale,
                        ),
                    ),
                )
                // 锚点事件点（10px 朱砂圆 + 米白描边）
                val dotR = MapTokens.Dimensions.EVENT_POINT_DIAMETER / 2f * scale
                drawCircle(color = MapTokens.VERMILION, radius = dotR, center = bubble.anchor)
                drawCircle(
                    color = MapTokens.PAPER_CARD,
                    radius = dotR,
                    center = bubble.anchor,
                    style = Stroke(width = 2f * scale),
                )
                drawLeaderArrow(center, bubble.anchor, scale)
            }
            drawBubble(bubble, titlePaint, yearPaint, bodyPaint, scale)
            canvas.restore()
        }
    }
}

/** 指向线箭头（泡泡端小三角，指示方向；arrow-l 8px / arrow-w 5px） */
private fun DrawScope.drawLeaderArrow(tip: Offset, from: Offset, scale: Float) {
    val dx = tip.x - from.x
    val dy = tip.y - from.y
    val len = kotlin.math.hypot(dx.toDouble(), dy.toDouble())
    if (len < 12f * scale) return
    val ux = (dx / len).toFloat()
    val uy = (dy / len).toFloat()
    val size = MapTokens.Dimensions.ARROW_WIDTH * scale
    val len2 = MapTokens.Dimensions.ARROW_LENGTH * scale
    val base = Offset(tip.x - ux * len2, tip.y - uy * len2)
    val p1 = Offset(base.x - uy * size * 0.7f, base.y + ux * size * 0.7f)
    val p2 = Offset(base.x + uy * size * 0.7f, base.y - ux * size * 0.7f)
    drawLine(color = MapTokens.VERMILION.copy(alpha = 0.55f), start = p1, end = tip, strokeWidth = MapTokens.Bubble.STROKE_PX * scale)
    drawLine(color = MapTokens.VERMILION.copy(alpha = 0.55f), start = p2, end = tip, strokeWidth = MapTokens.Bubble.STROKE_PX * scale)
}

/** 绘制单个泡泡（普通：标题+年份纸笺；选中：朱砂底白字+两行摘要+聚焦描边；聚合：紧凑「简称 +N」） */
private fun DrawScope.drawBubble(
    bubble: PlacedBubble,
    titlePaint: Paint,
    yearPaint: Paint,
    bodyPaint: android.text.TextPaint,
    scale: Float,
) {
    val b = MapTokens.Bubble
    val rect = Rect(bubble.rect.x, bubble.rect.y, bubble.rect.x + bubble.rect.w, bubble.rect.y + bubble.rect.h)
    val radius = CornerRadius(MapTokens.Dimensions.EVENT_BUBBLE_RADIUS * scale)
    val fill = if (bubble.selected) {
        MapTokens.VERMILION
    } else {
        MapTokens.PAPER_CARD.copy(alpha = MapTokens.Alpha.BUBBLE_BACKGROUND / 255f)
    }
    // 单层淡墨阴影（偏移 2px 低透明圆角矩形，对齐 bubble-shadow alpha 35）
    drawRoundRect(
        color = MapTokens.INK.copy(alpha = MapTokens.Alpha.BUBBLE_SHADOW / 255f),
        topLeft = Offset(rect.left, rect.top + 2f * scale),
        size = Size(rect.width, rect.height),
        cornerRadius = radius,
    )
    drawRoundRect(color = fill, topLeft = rect.topLeft, size = Size(rect.width, rect.height), cornerRadius = radius)
    // P2-选中聚焦：朱砂底泡泡外圈浅米色聚焦描边（2px，比普通描边更宽更亮）
    if (bubble.selected) {
        drawRoundRect(
            color = Color(0xCCFDF8EC),
            topLeft = rect.topLeft,
            size = Size(rect.width, rect.height),
            cornerRadius = radius,
            style = Stroke(width = 2.2f * scale),
        )
    } else {
        drawRoundRect(
            color = MapTokens.VERMILION.copy(alpha = MapTokens.Alpha.BUBBLE_BORDER / 255f),
            topLeft = rect.topLeft,
            size = Size(rect.width, rect.height),
            cornerRadius = radius,
            style = Stroke(width = MapTokens.Dimensions.EVENT_BUBBLE_BORDER * scale),
        )
    }
    // 左侧分类竖条（左 11px、宽 6px、高跨内容区：顶部 13px 到底部 13px）
    val cat = MapTokens.categoryColor(bubble.events.first().category)
    drawRoundRect(
        color = if (bubble.selected) Color(0xCCFDF8EC) else cat,
        topLeft = Offset(rect.left + 11f * scale, rect.top + 13f * scale),
        size = Size(
            MapTokens.Dimensions.EVENT_CATEGORY_BAR_WIDTH * scale,
            (rect.height - 26f * scale).coerceAtLeast(8f * scale),
        ),
        cornerRadius = CornerRadius(2f * scale),
    )
    drawIntoCanvas { canvas ->
        val native = canvas.nativeCanvas
        val textX = rect.left + b.TEXT_LEFT * scale
        var lineTop = rect.top + b.PAD_TOP * scale
        // 标题
        native.drawText(bubble.label, textX, lineTop - titlePaint.fontMetrics.ascent, titlePaint)
        lineTop += b.TITLE_LINE * scale
        // 年份（朱砂）
        if (bubble.year.isNotEmpty()) {
            lineTop += b.LINE_GAP * scale
            native.drawText(bubble.year, textX, lineTop - yearPaint.fontMetrics.ascent, yearPaint)
            lineTop += b.YEAR_LINE * scale
        }
        // 摘要（选中泡泡：StaticLayout 两行截断，自动换行 + 省略号）
        if (bubble.body.isNotEmpty()) {
            lineTop += b.LINE_GAP * scale
            val maxW = (rect.width - b.TEXT_LEFT * scale - b.PAD_X * scale).toInt().coerceAtLeast(40)
            val layout = android.text.StaticLayout.Builder
                .obtain(bubble.body, 0, bubble.body.length, bodyPaint, maxW)
                .setMaxLines(b.BODY_MAX_LINES)
                .setEllipsize(TextUtils.TruncateAt.END)
                .build()
            native.save()
            native.translate(textX, lineTop)
            layout.draw(native)
            native.restore()
        }
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
        bubbleTitlePaint(scale, selected = false),
        bubbleYearPaint(scale, selected = false),
        bubbleBodyPaint(scale, selected = false),
        density,
        renderer.viewportWidth().toFloat(), renderer.viewportHeight().toFloat(), selectedId,
        safeTop, safeBottom,
    )
    return placed.firstOrNull { b ->
        x >= b.rect.x && x <= b.rect.x + b.rect.w && y >= b.rect.y && y <= b.rect.y + b.rect.h
    }?.events?.firstOrNull()
}
