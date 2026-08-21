// MapScreen UI blocks (A5 split): legend / label layer / detail sheets / share & paint helpers.
// Moved verbatim from MapScreen.kt; only private -> internal.
package com.historymap.app

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Paint
import android.util.Log
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Image
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow


/** 图例：朱砂「政权」标题小笺 + 纸面卡片（手机端默认折叠，展开后限高滚动） */
@Composable
internal fun LegendPanel(
    regimes: List<Pair<String, FloatArray>>,
    collapsed: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (regimes.isEmpty()) return
    Column(modifier = modifier) {
        // 朱砂标题小笺（点击切换折叠；可点击 Surface 自带 ≥44dp 触摸区）
        Surface(
            onClick = onToggle,
            shape = RoundedCornerShape(designDp(6f)),
            color = MapTokens.VERMILION,
        ) {
            Row(
                modifier = Modifier.padding(horizontal = designDp(18f), vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "政权",
                    fontFamily = MapFonts.Family,
                    fontSize = designSp(14f),
                    fontWeight = FontWeight.Bold,
                    letterSpacing = designSp(2f),
                    color = MapTokens.PAPER_CARD,
                )
                if (collapsed) {
                    Spacer(Modifier.width(6.dp))
                    Text("▾", fontSize = designSp(12f), color = MapTokens.PAPER_CARD)
                }
            }
        }
        if (!collapsed) {
            Spacer(Modifier.height(10.dp))
            // 纸面卡片：细描边 + 单层淡墨阴影；政权行 38px 行高、水彩短色条。
            // 主要政权优先（fillOpacity 高者在前，如宋 .38 排首位）。
            Surface(
                modifier = Modifier.width(designDp(MapTokens.Dimensions.LEGEND_WIDTH.toFloat())),
                color = MapTokens.PAPER_CARD.copy(alpha = MapTokens.Alpha.LEGEND_BACKGROUND / 255f),
                shape = RoundedCornerShape(designDp(10f)),
                border = androidx.compose.foundation.BorderStroke(1.dp, Color(0x143A3428)),
                shadowElevation = 2.dp,
            ) {
                Column(
                    modifier = Modifier
                        .heightIn(max = designDp(MapTokens.Dimensions.LEGEND_HEIGHT.toFloat()))
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = designDp(16f), vertical = designDp(12f)),
                ) {
                    regimes.sortedByDescending { it.second[3] }.forEach { (name, color) ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.height(designDp(42f)),
                        ) {
                            // P2-水彩色块：竖向渐变 + 圆角短色条（模拟水彩自然渗色，
                            // 而非纯色矩形；宽度 18dp、上下 alpha 变化）
                            Box(
                                Modifier
                                    .size(width = designDp(18f), height = designDp(12f))
                                    .background(
                                        Brush.verticalGradient(
                                            listOf(
                                                Color(color[0], color[1], color[2]).copy(alpha = 0.9f),
                                                Color(color[0], color[1], color[2]).copy(alpha = 0.4f),
                                            ),
                                        ),
                                        RoundedCornerShape(designDp(3f)),
                                    ),
                            )
                            Spacer(Modifier.width(designDp(12f)))
                            Text(
                                name,
                                fontFamily = MapFonts.Family,
                                fontSize = designSp(MapTokens.Typography.LEGEND_ITEM.size.toFloat()),
                                letterSpacing = designSp(1f),
                                fontWeight = if (color[3] > 0.35f) FontWeight.Bold else FontWeight.Normal,
                                color = MapTokens.INK,
                            )
                        }
                    }
                }
            }
        }
    }
}

/** 详情面板内容：元信息 chip（可换行）+ 标题（≤2 行）+ 地点 + 详情 + 影响卡片 + 相关事件 + 水墨插画 */
/** 州府考据卡片（P4）：元丰九域志户口/土贡 + 舆地广记沿革 + 来源/置信度/校订 */
@Composable
internal fun PrefectureProvenanceContent(pref: PrefecturePolygon) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .navigationBarsPadding()
            .padding(horizontal = 20.dp)
            .padding(bottom = 28.dp),
    ) {
        SheetHeader(title = "${pref.name} · 府州考据", onClose = {})
        val props = pref.props
        if (props == null) {
            Text(
                "该州府暂无考据信息",
                fontFamily = MapFonts.Family,
                fontSize = designSp(14f),
                color = MapTokens.INK_SOFT,
            )
            return@Column
        }
        val route = props.optString("route")
        val type = props.optString("type")
        if (route.isNotEmpty() || type.isNotEmpty()) {
            Text(
                listOf(route, type.ifEmpty { "州" }).filter { it.isNotEmpty() }.joinToString(" · "),
                fontFamily = MapFonts.Family,
                fontSize = designSp(13f),
                color = MapTokens.INK_SOFT,
            )
            Spacer(Modifier.height(8.dp))
        }
        val hh = props.optJSONObject("households")
        if (hh != null) {
            ProvenanceRow("户口 · 元丰九域志", "主户 ${hh.optInt("main")} 户 · 客户 ${hh.optInt("guest")} 户")
            Spacer(Modifier.height(8.dp))
        }
        val tribute = props.optString("tribute")
        if (tribute.isNotEmpty()) {
            ProvenanceRow("土贡 · 元丰九域志", tribute)
            Spacer(Modifier.height(8.dp))
        }
        val evolution = props.optString("evolution")
        if (evolution.isNotEmpty()) {
            ProvenanceRow("沿革 · 舆地广记", "${evolution}…")
            Spacer(Modifier.height(8.dp))
        }
        val sourceFix = props.optString("sourceFix")
        if (sourceFix.isNotEmpty()) {
            ProvenanceRow("校订", sourceFix)
            Spacer(Modifier.height(8.dp))
        }
        val confidence = props.optString("confidence", "medium")
        ProvenanceRow(
            "资料来源",
            "${props.optString("source", "元丰九域志")} · 置信度：${if (confidence == "high") "史有明文" else "综合整理"} · ${props.optString("license", "公版古籍")}",
        )
    }
}

@Composable
internal fun ProvenanceRow(title: String, text: String) {
    PaperCard(color = Color(0x13000000), cornerRadius = 8.dp, shadow = 0.dp) {
        Column(Modifier.padding(12.dp)) {
            Text(
                title,
                fontFamily = MapFonts.Family,
                fontSize = scaledSp(12f),
                fontWeight = FontWeight.Bold,
                color = MapTokens.VERMILION,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text,
                fontFamily = MapFonts.Family,
                fontSize = scaledSp(13f),
                lineHeight = scaledSp(20f),
                color = MapTokens.INK.copy(alpha = 0.9f),
            )
        }
    }
}

/** 详情面板内容：元信息 chip（可换行）+ 标题（≤2 行）+ 地点 + 详情 + 影响卡片 + 相关事件 + 水墨插画 */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
internal fun EventDetailContent(
    ev: EventEntity,
    allEvents: List<EventEntity>,
    onPickRelated: (EventEntity) -> Unit,
    onPickPerson: (RelatedPerson) -> Unit = {},
    onClose: () -> Unit,
) {
    val catLabel = ContractTokens.CATEGORY_LABELS[ev.category] ?: ev.category
    val context = LocalContext.current
    // 相关事件：同分类、按年份远近取 3 条（增强历史浏览连续性）
    val related = allEvents
        .filter { it.id != ev.id && it.category == ev.category }
        .sortedBy { kotlin.math.abs(it.year - ev.year) }
        .take(3)
    // 打开/切换详情时自动滚回顶部（相关事件点击会替换 ev → 重置滚动位置）
    val scrollState = rememberScrollState()
    LaunchedEffect(ev.id) { scrollState.scrollTo(0) }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(scrollState)
            .navigationBarsPadding()
            .padding(horizontal = 20.dp)
            .padding(bottom = 28.dp),
    ) {
        Spacer(Modifier.height(4.dp))
        // 元信息 chip 行（FlowRow 自动换行，布局扩展位：未来可加朝代/地点 chip）
        androidx.compose.foundation.layout.FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            YearBadge("${ev.year} 年")
            CategoryBadge(catLabel)
        }
        // 分享按钮（右对齐；系统分享面板 ACTION_SEND，分享标题+年份+地点+详情）
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            TextButton(onClick = { shareEvent(context, ev) }) {
                Text(
                    "分享",
                    fontFamily = MapFonts.Family,
                    fontSize = scaledSp(12f),
                    color = MapTokens.VERMILION,
                )
            }
        }
        Spacer(Modifier.height(6.dp))
        Text(
            ev.title.ifEmpty { "未命名事件" },
            fontFamily = MapFonts.Family,
            fontSize = designSp(22f),
            fontWeight = FontWeight.Bold,
            color = MapTokens.VERMILION,
            lineHeight = designSp(30f),
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        if (ev.place.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            Text(
                "◆ 地点  ${ev.place}",
                fontFamily = MapFonts.Family,
                fontSize = designSp(12f),
                color = MapTokens.INK_SOFT,
                letterSpacing = designSp(1f),
            )
        }
        // 相关人物（P1 人物视角）：点击徽章进入该人物的事件轨迹过滤
        if (ev.relatedPersons.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            androidx.compose.foundation.layout.FlowRow(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                ev.relatedPersons.forEach { p ->
                    Surface(
                        onClick = { onPickPerson(p) },
                        shape = RoundedCornerShape(999.dp),
                        color = MapTokens.PAPER_CARD,
                        border = androidx.compose.foundation.BorderStroke(1.dp, MapTokens.VERMILION.copy(alpha = if (p.role == "lead") 1f else 0.35f)),
                    ) {
                        Text(
                            if (p.role == "lead") "◆ ${p.name}" else p.name,
                            fontFamily = MapFonts.Family,
                            fontSize = scaledSp(12f),
                            color = MapTokens.INK,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                        )
                    }
                }
            }
        }
        Spacer(Modifier.height(10.dp))
        NoteDivider()
        Spacer(Modifier.height(12.dp))
        Text(
            ev.detail.ifEmpty { "暂无详情" },
            fontFamily = MapFonts.Family,
            fontSize = designSp(14f),
            lineHeight = designSp(24f),
            color = MapTokens.INK.copy(alpha = 0.92f),
        )
        if (ev.impact.isNotEmpty()) {
            Spacer(Modifier.height(16.dp))
            PaperCard(color = Color(0x13B03A2E), cornerRadius = 8.dp, shadow = 0.dp) {
                Column(Modifier.padding(14.dp)) {
                    Text(
                        "影 响",
                        fontFamily = MapFonts.Family,
                        fontSize = designSp(13f),
                        fontWeight = FontWeight.Bold,
                        color = MapTokens.VERMILION,
                        letterSpacing = designSp(4f),
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        ev.impact,
                        fontFamily = MapFonts.Family,
                        fontSize = designSp(13f),
                        lineHeight = designSp(22f),
                        color = MapTokens.INK.copy(alpha = 0.9f),
                    )
                }
            }
        }
        // 资料来源（P4 考据感）：古籍出处 + 置信度 + 许可，随事件数据走不依赖时空库
        if (ev.source.isNotEmpty()) {
            Spacer(Modifier.height(12.dp))
            ProvenanceRow(
                "资料来源",
                "${ev.source} · 置信度：${if (ev.confidence == "high") "史有明文" else "综合整理"} · ${ev.license}",
            )
        }
        // 相关事件（同分类，按年份远近）
        if (related.isNotEmpty()) {
            Spacer(Modifier.height(18.dp))
            Text(
                "相关事件",
                fontFamily = MapFonts.Family,
                fontSize = designSp(13f),
                fontWeight = FontWeight.Bold,
                color = MapTokens.VERMILION,
                letterSpacing = designSp(3f),
            )
            Spacer(Modifier.height(8.dp))
            related.forEach { rel ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 2.dp)
                        .background(Color(0x0B3A3428), RoundedCornerShape(8.dp))
                        .clickable { onPickRelated(rel) }
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        Modifier
                            .width(4.dp)
                            .height(16.dp)
                            .background(MapTokens.categoryColor(rel.category), RoundedCornerShape(2.dp)),
                    )
                    Spacer(Modifier.width(10.dp))
                    Text(
                        "${rel.year} 年",
                        fontFamily = MapFonts.Family,
                        fontSize = scaledSp(12f),
                        fontWeight = FontWeight.Bold,
                        color = MapTokens.VERMILION,
                        modifier = Modifier.width(58.dp),
                    )
                    Text(
                        rel.short.ifEmpty { "未命名事件" },
                        fontFamily = MapFonts.Family,
                        fontSize = scaledSp(13f),
                        color = MapTokens.INK,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
        Spacer(Modifier.height(20.dp))
        // 底部水墨山水插画（assets/web/ink-landscape.png，参考图详情页底部）
        val appContext = LocalContext.current
        val inkLandscape = remember { loadInkLandscape(appContext) }
        if (inkLandscape != null) {
            Spacer(Modifier.height(12.dp))
            Image(
                bitmap = inkLandscape.asImageBitmap(),
                contentDescription = null,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(96.dp)
                    .alpha(0.55f),
                contentScale = ContentScale.Fit,
            )
        }
    }
}

/** 加载详情页底部水墨插画（失败返回 null，面板不受影响） */
internal fun loadInkLandscape(context: android.content.Context): Bitmap? {
    return try {
        val bytes = context.assets.open("web/ink-landscape.png").use { it.readBytes() }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    } catch (e: Exception) {
        null
    }
}

/**
 * 分享事件：弹出系统分享面板（ACTION_SEND 纯文本）。文本包含标题、年份、地点、详情，
 * 让用户分享到微信/QQ/备忘录等。无可用分享应用时静默忽略（不崩）。
 */
internal fun shareEvent(context: Context, ev: EventEntity) {
    val title = ev.title.ifEmpty { ev.short }
    val text = buildString {
        append(title)
        append("\n").append(ev.year).append(" 年")
        if (ev.place.isNotEmpty()) append(" · ").append(ev.place)
        if (ev.detail.isNotEmpty()) append("\n\n").append(ev.detail)
    }
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, title)
        putExtra(Intent.EXTRA_TEXT, text)
    }
    try {
        context.startActivity(Intent.createChooser(send, "分享事件"))
    } catch (e: android.content.ActivityNotFoundException) {
        Log.w("HistoryMap", "无可用分享应用", e)
    }
}

/**
 * 标签文字样式（与布局计算共用，保证测量与绘制一致；字体走 MapFonts 统一入口）。
 *
 * P0-2 修复 density 二次放大：Canvas 绘制/测量在屏幕像素空间，字号直接用
 * DesignMetrics.designToPx(设计px, scale)，不再乘 density（旧的 `size * density`
 * 会把 13px 设计字号在 480dpi 上放大成 39px，标签明显偏大、碰撞区膨胀）。
 *
 * P1-标签：评审要求地图地名可读——政权 16px/94%、核心城市 14px/83%、
 * 普通城市与河流/山脉/地点 13px/68%（旧值 13/12/11px + 55% 透明度几乎不可读）。
 */
internal fun labelTextPaints(scale: Float, density: Float): Map<String, Paint> {
    fun make(designPx: Float, bold: Boolean, color: Int): Paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        // 字体 token 为 CSS px 逻辑单位（同 Web）：×density 换成屏幕物理 px
        textSize = DesignMetrics.designToTextPx(designPx, density, scale)
        typeface = MapFonts.of(bold)
        this.color = color
    }
    return mapOf(
        "regime" to make(16f, true, 0xF03A3428.toInt()),
        "cities" to make(14f, false, 0xE03A3428.toInt()),
        "prefecture" to make(13.5f, false, 0xBF3A3428.toInt()), // 州府治所（元丰九域志基准）
        "mountains" to make(13f, false, 0xB83A3428.toInt()),
        "rivers" to make(13f, false, 0xB83A3428.toInt()),
        "places" to make(13f, false, 0xB83A3428.toInt()),
    )
}

/**
 * 地图标注层：绘制 layoutMapLabels 的放置结果（文字/指向线/城市点，垂直居中）。
 *
 * R6-标签（对齐效果图）：政权/城市名撤掉米白卡片+朱砂描边（UI 感强、遮挡色块），
 * 改为深墨文字直书 + 极细纸色 halo 描边保证在水彩色块上的可读性；
 * 城市标签在锚点画「墨点 + 纸色细环」的靶心标记。
 */
@Composable
fun LabelLayer(
    placedLabels: List<PlacedMapLabel>,
    modifier: Modifier = Modifier,
) {
    val designScale = rememberDesignScale()
    val density = LocalDensity.current.density
    // 统一左上光向的文字投影（右下偏移软影）：与政权贴图接触阴影（GL 侧）、
    // 泡泡阴影同一光向——HoMM3「焙烧阴影」的手机端移植，让元素有「贴在纸上」的厚度
    val paints = remember(designScale, density) {
        labelTextPaints(designScale, density).mapValues { (_, p) ->
            p.setShadowLayer(2.4f * density, 1.2f * density, 1.8f * density, 0x2E3A3428)
            p
        }
    }
    // 纸色 halo：与文字同字号描边（先描边后填充的双 pass 画法）
    val haloPaints = remember(designScale, density) {
        labelTextPaints(designScale, density).mapValues { (_, p) ->
            Paint(p).apply {
                style = Paint.Style.STROKE
                strokeWidth = 1.2f * density
                strokeJoin = android.graphics.Paint.Join.ROUND
                color = 0xCCF8F4E9.toInt()
            }
        }
    }
    val leaderInk = remember {
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 1.2f
            color = 0x663A3428.toInt()
            pathEffect = android.graphics.DashPathEffect(floatArrayOf(6f, 5f), 0f)
        }
    }
    // 城市靶心点：墨点 + 纸色细环（效果图的城市标记语言）
    val cityDot = remember { Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xCC3A3428.toInt() } }
    val cityDotRing = remember {
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 1f
            color = 0xCCF8F4E9.toInt()
        }
    }

    Canvas(modifier = modifier) {
        drawIntoCanvas { canvas ->
            val native = canvas.nativeCanvas
            for (pl in placedLabels) {
                if (!pl.visible) continue
                val l = pl.label
                val paint = paints[l.kind] ?: continue
                val halo = haloPaints[l.kind] ?: continue
                val cx = pl.rect.center.x
                val cy = pl.rect.center.y
                // 指向线：锚点 → 文字（仅被移开时）
                if (pl.needLeader) {
                    native.drawLine(pl.anchor.x, pl.anchor.y, cx, cy, leaderInk)
                }
                // 城市靶心点（锚点即城市位置）
                if (l.kind == "cities") {
                    val r = 3.8f * density
                    native.drawCircle(pl.anchor.x, pl.anchor.y, r + 1.6f * density, cityDotRing)
                    native.drawCircle(pl.anchor.x, pl.anchor.y, r, cityDot)
                }
                // 文字垂直居中：基线 = 中心 - (ascent+descent)/2（与泡泡一致）
                val fm = paint.fontMetrics
                val baseline = cy - (fm.ascent + fm.descent) / 2f
                native.drawText(l.text, pl.rect.left + 10f * density, baseline, halo)
                native.drawText(l.text, pl.rect.left + 10f * density, baseline, paint)
            }
        }
    }
}

/**
 * 朝代下拉菜单（A5 拆分自 MapScreen）：应用内嵌实现（DropdownMenu 基于 Popup
 * 窗口会触发华为系统栏闪现；此处用全屏点击层 + 绝对定位面板，不创建新 window）。
 */
@Composable
internal fun BoxScope.DynastyDropdownMenu(
    visible: Boolean,
    dynasties: List<DynastyEntity>,
    currentDynasty: String,
    anchor: IntOffset,
    anchorHeight: Int,
    onDismiss: () -> Unit,
    onPick: (String) -> Unit,
) {
    if (!visible) return
    // 全屏点击关闭层（在菜单下层）
    Box(
        Modifier
            .fillMaxSize()
            .pointerInput(Unit) { detectTapGestures { onDismiss() } }
    )
    // 菜单面板（定位在朝代按钮下方）
    Surface(
        modifier = Modifier
            .align(Alignment.TopStart)
            .offset { IntOffset(anchor.x, anchor.y + anchorHeight) },
        color = MapTokens.PAPER_PANEL,
        shape = RoundedCornerShape(10.dp),
        shadowElevation = 8.dp,
    ) {
        Column {
            dynasties.forEach { d ->
                Text(
                    d.name,
                    fontFamily = MapFonts.Family,
                    fontSize = designSp(14f),
                    color = MapTokens.INK,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onPick(d.id) }
                        .padding(horizontal = 18.dp, vertical = 12.dp),
                )
            }
        }
    }
}


/**
 * 时期转场横幅（A5 拆分自 MapScreen）：跨时期边界时短暂显示；
 * 金边线 + 朱砂竖线装饰 + 淡入淡出。
 */
@Composable
internal fun BoxScope.PeriodBannerOverlay(text: String?) {
    Box(modifier = Modifier.align(Alignment.Center).padding(top = 100.dp)) {
        AnimatedVisibility(
            visible = text != null,
            enter = fadeIn(tween(300)),
            exit = fadeOut(tween(500)),
        ) {
            Surface(
                color = MapTokens.PANEL.copy(alpha = 0.9f),
                shape = RoundedCornerShape(12.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, MapTokens.GOLD),
                shadowElevation = 4.dp,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(horizontal = 24.dp, vertical = 12.dp),
                ) {
                    Box(
                        Modifier
                            .width(4.dp)
                            .height(24.dp)
                            .background(MapTokens.VERMILION, RoundedCornerShape(2.dp)),
                    )
                    Spacer(Modifier.width(12.dp))
                    Text(
                        text ?: "",
                        fontFamily = MapFonts.Family,
                        fontSize = designSp(22f),
                        fontWeight = FontWeight.Bold,
                        letterSpacing = designSp(6f),
                        color = MapTokens.GOLD_DEEP,
                    )
                }
            }
        }
    }
}

/**
 * 播放完毕提示（A5 拆分自 MapScreen）：自动播放到达 endYear 后出现，
 * 点击重播。
 */
@Composable
internal fun BoxScope.CompletedReplayChip(timeline: TimelineController?, modifier: Modifier) {
    if (timeline?.completed == true) {
        Surface(
            onClick = { timeline.play() },
            modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 168.dp),
            shape = RoundedCornerShape(999.dp),
            color = MapTokens.PAPER_PANEL.copy(alpha = 0.92f),
            border = androidx.compose.foundation.BorderStroke(
                1.dp, MapTokens.VERMILION.copy(alpha = 0.85f),
            ),
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 7.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "本朝历史播放完毕",
                    fontFamily = MapFonts.Family,
                    fontSize = designSp(13f),
                    color = MapTokens.VERMILION,
                )
                Text(
                    "  点 ▶ 可重新播放",
                    fontFamily = MapFonts.Family,
                    fontSize = designSp(11f),
                    color = MapTokens.INK_SOFT,
                )
            }
        }
    }
}

/**
 * 事件流抽屉（A5 拆分自 MapScreen）：打开时渲染 EventLogSheet。
 */
@Composable
internal fun EventLogSheetBlock(
    logOpen: Boolean,
    timeline: TimelineController?,
    seenEvents: List<EventEntity>,
    allEvents: List<EventEntity>,
    onOpenChange: (Boolean) -> Unit,
    onPick: (EventEntity) -> Unit,
) {
    if (logOpen) {
        timeline?.let { tl ->
            EventLogSheet(
                seenEvents = seenEvents,
                allEvents = allEvents,
                currentYear = tl.year,
                onPick = onPick,
                onDismiss = { onOpenChange(false) },
            )
        }
    }
}
