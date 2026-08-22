package com.historymap.app

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.changedToUp
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/** 轨道百分比 → (year, month)：clamp 到 [起始年1月, 结束年12月]。
 *  取整用四舍五入（对齐 Web calc.js pctToMonth 的 Math.round，截断会让双端拖拽落点差 1 个月）。 */
private fun timeAtPct(pct: Float, startYear: Int, endYear: Int): Pair<Int, Int> {
    val startIdx = TimeIndex.of(startYear, 1)
    val endIdx = TimeIndex.of(endYear, 12)
    val idx = kotlin.math.round(startIdx + pct * (endIdx - startIdx)).toInt().coerceIn(startIdx, endIdx)
    return TimeIndex.yearOf(idx) to TimeIndex.monthOf(idx)
}

/**
 * 底部时间轴（设计比例，对齐 design-tokens.json / 原型）：
 * 第一行：播放按钮（56px 视觉 / 44dp 触摸）+ 当前「年·月」（42px）+ 年份范围
 * 第二行：轨道（44dp 触摸区 + 6px 视觉线 + 32px 滑块/3px 朱砂描边 + 事件刻度点）
 * 第三行：事件分类图例（5 类均布色点 + 分类文字，窄屏随宽度自动收缩）
 * 轨道点击/拖动定位到「年·月」；事件刻度点点击跳时（距 24dp 内吸附）。
 * 时间轴自 960 年「年粒度」升级为「月粒度」：逐月推进，刻度按年打，标签精确到「年·月」。
 */
@Composable
fun TimelineBar(
    timeline: TimelineController,
    events: List<EventEntity>,
    onEventClick: (EventEntity) -> Unit,
    modifier: Modifier = Modifier,
) {
    val density = androidx.compose.ui.platform.LocalDensity.current.density
    val scale = rememberDesignScale()

    Surface(
        modifier = modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .padding(
                start = designDp(MapTokens.Dimensions.TIMELINE_X.toFloat()),
                end = designDp(MapTokens.Dimensions.TIMELINE_X.toFloat()),
                bottom = designDp(MapTokens.Dimensions.TIMELINE_BOTTOM_SAFE_AREA.toFloat()),
            ),
        color = MapTokens.PAPER_CARD,
        shape = RoundedCornerShape(designDp(MapTokens.Dimensions.TIMELINE_RADIUS.toFloat())),
        shadowElevation = 3.dp,
    ) {
        Column(modifier = Modifier.padding(horizontal = designDp(18f), vertical = designDp(8f))) {
            // 第一行：播放 + 年份 + 范围
            Row(verticalAlignment = Alignment.CenterVertically) {
                PlayButton(timeline)
                Spacer(Modifier.width(designDp(16f)))
                Text(
                    text = "${timeline.year}年${timeline.month}月",
                    fontFamily = MapFonts.Family,
                    fontWeight = FontWeight.Bold,
                    fontSize = designSp(MapTokens.Typography.TIMELINE_YEAR.size.toFloat()),
                    letterSpacing = designSp(MapTokens.Typography.TIMELINE_YEAR.letterSpacing.toFloat()),
                    color = MapTokens.VERMILION,
                )
                Spacer(Modifier.weight(1f))
                // P1：年份范围 13→14px、透明度 60%→68%（评审要求提高约 15%）
                Text(
                    text = "${timeline.startYear} — ${timeline.endYear}",
                    fontFamily = MapFonts.Family,
                    fontSize = designSp(MapTokens.Typography.TIMELINE_RANGE.size.toFloat()),
                    letterSpacing = designSp(MapTokens.Typography.TIMELINE_RANGE.letterSpacing.toFloat()),
                    color = MapTokens.INK.copy(alpha = 0.68f),
                )
            }
            Spacer(Modifier.height(designDp(8f)))

            // 第二行：轨道（44dp 触摸区）
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(44.dp)
                    .pointerInput(timeline, events) {
                        // 手写手势：短拖动（<touchSlop）判定为 tap（吸附事件点或跳年），
                        // 超过 slop 判定为拖动（实时 setYear）。避免短拖动被 tap 误触发。
                        val touchSlop = viewConfiguration.touchSlop
                        awaitEachGesture {
                            val down = awaitFirstDown()
                            var dragging = false
                            while (true) {
                                val event = awaitPointerEvent()
                                val change = event.changes.firstOrNull() ?: break
                                if (change.positionChanged()) {
                                    if (!dragging &&
                                        (change.position - down.position).getDistance() > touchSlop
                                    ) {
                                        dragging = true
                                        timeline.pause()
                                    }
                                    if (dragging) {
                                        val pct = (change.position.x / size.width.toFloat()).coerceIn(0f, 1f)
                                        val (yy, mm) = timeAtPct(pct, timeline.startYear, timeline.endYear); timeline.setTime(yy, mm)
                                        change.consume()
                                    }
                                }
                                if (change.changedToUp()) {
                                    if (!dragging) {
                                        // tap：24dp 内吸附事件点，否则跳年
                                        val ev = nearestEventAt(events, timeline, down.position.x, size.width.toFloat(), density)
                                        if (ev != null) onEventClick(ev)
                                        else {
                                            val pct = (down.position.x / size.width.toFloat()).coerceIn(0f, 1f)
                                            val (yy, mm) = timeAtPct(pct, timeline.startYear, timeline.endYear); timeline.setTime(yy, mm)
                                        }
                                    }
                                    break
                                }
                            }
                        }
                    },
                contentAlignment = Alignment.Center,
            ) {
                // 视觉轨道（6px）+ 渐变进度 + 32px 滑块 + 事件刻度点
                val startYear = timeline.startYear
                val endYear = timeline.endYear
                val year = timeline.year
                val month = timeline.month
                // 月粒度进度：左端 = 起始年1月，右端 = 结束年12月
                val startIdx = TimeIndex.of(startYear, 1)
                val endIdx = TimeIndex.of(endYear, 12)
                val progress = (TimeIndex.of(year, month) - startIdx).toFloat() / (endIdx - startIdx).coerceAtLeast(1)
                val markerColor = CATEGORY_COLORS
                val trackH = DesignMetrics.designToTextPx(MapTokens.Timeline.TRACK_PX.toFloat(), density, scale)
                val thumbR = DesignMetrics.designToTextPx(MapTokens.Timeline.THUMB_PX.toFloat(), density, scale) / 2f
                val thumbStroke = DesignMetrics.designToTextPx(MapTokens.Timeline.THUMB_STROKE_PX.toFloat(), density, scale)
                val dotR = DesignMetrics.designToTextPx(MapTokens.Timeline.EVENT_DOT_PX.toFloat(), density, scale) / 2f
                Canvas(modifier = Modifier.fillMaxWidth().height(designDp(44f))) {
                    val trackY = size.height / 2f
                    // 轨道底（timelineTrack alpha 36/255）
                    drawRoundRect(
                        color = MapTokens.INK.copy(alpha = MapTokens.Alpha.TIMELINE_TRACK / 255f),
                        topLeft = Offset(0f, trackY - trackH / 2f),
                        size = Size(size.width, trackH),
                        cornerRadius = CornerRadius(trackH / 2f),
                    )
                    // 进度（朱砂 → 金渐变，参考图风格）
                    val progressW = size.width * progress
                    drawRoundRect(
                        brush = Brush.horizontalGradient(listOf(MapTokens.VERMILION, MapTokens.GOLD)),
                        topLeft = Offset(0f, trackY - trackH / 2f),
                        size = Size(progressW, trackH),
                        cornerRadius = CornerRadius(trackH / 2f),
                    )
                    // 滑块（米白内芯 + 朱砂描边；首尾不裁切）
                    val thumbX = (progressW).coerceIn(thumbR, size.width - thumbR)
                    drawCircle(color = MapTokens.PAPER_CARD, radius = thumbR, center = Offset(thumbX, trackY))
                    drawCircle(color = MapTokens.VERMILION, radius = thumbR, center = Offset(thumbX, trackY), style = Stroke(width = thumbStroke))
                    // 事件刻度点（同「年·月」去重 + 1dp 浅色外描边；当前「年·月」实心朱砂）。
                    // 相近年月/多月多事件合并为单点，避免连续小圆点连成粗线（评审 P2）。
                    val dotsByMonth = events
                        .distinctBy { TimeIndex.of(it.year, it.month) }
                        .map { ev ->
                            val x = size.width * (TimeIndex.of(ev.year, ev.month) - startIdx).toFloat() / (endIdx - startIdx).coerceAtLeast(1)
                            Triple(ev, x, markerColor[ev.category] ?: markerColor["era"]!!)
                        }
                    for ((ev, x, col) in dotsByMonth) {
                        val isCurrent = ev.year == year && ev.month == month
                        val fill = if (isCurrent) MapTokens.VERMILION else col.copy(alpha = 0.85f)
                        // 刻度点画在轨道中心线上（对齐 Web .tl-marker top:50% 居中，
                        // 盖在 5px 轨道上；滑块在其后绘制，层级与 Web z-index 一致）
                        // 1dp 浅色外描边（米白），与轨道背景分离
                        drawCircle(
                            color = MapTokens.PAPER_CARD,
                            radius = dotR + DesignMetrics.designToTextPx(1f, density, scale),
                            center = Offset(x, trackY),
                        )
                        drawCircle(
                            color = fill,
                            radius = dotR,
                            center = Offset(x, trackY),
                        )
                    }
                }
            }

            // 第三行：事件分类图例（5 类均布，色点 + 分类文字；窄屏随 designSp 自动收缩）
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = designDp(4f)),
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                // 分类图例短标签来自契约 ContractTokens.CATEGORY_SHORT_LABELS（含顺序）
                ContractTokens.CATEGORIES.map { it.id to it.labelShort }.forEach { (id, label) ->
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        // 分类色点：CSS px 语义（8dp 实心圆；EVENT_DOT_PX 是刻度点专用，
                        // 勿再用 designToDp 换算物理画布值——那会缩成 2.7dp）
                        Box(
                            Modifier
                                .size(8.dp)
                                .background(CATEGORY_COLORS[id] ?: CATEGORY_COLORS["era"]!!, CircleShape),
                        )
                        Spacer(Modifier.height(designDp(4f)))
                        Text(
                            label,
                            fontFamily = MapFonts.Family,
                            fontSize = designSp(MapTokens.Typography.TIMELINE_CATEGORY.size.toFloat()),
                            letterSpacing = designSp(MapTokens.Typography.TIMELINE_CATEGORY.letterSpacing.toFloat()),
                            color = MapTokens.INK_SOFT,
                        )
                    }
                }
            }
        }
    }
}

/**
 * 播放按钮：对齐 Web #tl-play（38×38px、圆角 10、icon 13px 手机端值；
 * 米白底 + 朱砂描边）。外层 44dp 点击区，可点击 Surface 自带最小触摸尺寸。
 * 旧实现 Surface 用 56 设计 px（÷3 仅 18.7dp）却配 20sp 图标，框小字大溢出。
 */
@Composable
private fun PlayButton(timeline: TimelineController) {
    val icon = when {
        timeline.completed -> "↻"
        timeline.playing -> "❚❚"
        else -> "▶"
    }
    Box(
        modifier = Modifier.size(44.dp).clickable(onClick = { timeline.toggle() }),
        contentAlignment = Alignment.Center,
    ) {
        Surface(
            shape = RoundedCornerShape(10.dp),
            color = MapTokens.PAPER_CARD.copy(alpha = 0.9f),
            border = BorderStroke(1.dp, MapTokens.VERMILION),
            modifier = Modifier.size(38.dp),
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text(
                    icon,
                    fontFamily = MapFonts.Family,
                    fontSize = scaledSp(13f),
                    color = MapTokens.VERMILION,
                )
            }
        }
    }
}

/** 轨道上距离 x 24dp 内的事件点（吸附跳转） */
private fun nearestEventAt(
    events: List<EventEntity>,
    timeline: TimelineController,
    x: Float,
    trackW: Float,
    density: Float,
): EventEntity? {
    if (events.isEmpty() || trackW <= 0f) return null
    val threshold = 24f * density
    val startIdx = TimeIndex.of(timeline.startYear, 1)
    val endIdx = TimeIndex.of(timeline.endYear, 12)
    var best: EventEntity? = null
    var bestDist = threshold
    for (ev in events) {
        val px = trackW * (TimeIndex.of(ev.year, ev.month) - startIdx).toFloat() / (endIdx - startIdx).coerceAtLeast(1)
        val d = kotlin.math.abs(px - x)
        if (d < bestDist) {
            bestDist = d
            best = ev
        }
    }
    return best
}
