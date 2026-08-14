package com.historymap.app

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * 统一 UI 基础样式（实施计划 M2「统一面板和控件基础样式」）：
 * 纸面卡片 / 朱砂标题 / 章节标题 / 年份与分类徽章 / 分隔线 / 拖拽条 / Sheet 头部。
 * 颜色、圆角、描边全部取自 MapTokens，供顶栏、图例、时间轴、详情、事件流、设置复用，
 * 不再散落硬编码颜色。
 *
 * 触摸区说明：可点击 Surface（material3 onClick 重载）内部已强制 ≥44dp 交互尺寸，
 * 无需额外 minTouch；需要更小视觉时用「外层 44dp 点击区 + 内层视觉」结构（见 PlayButton）。
 */

/** 纸面卡片：米白卡纸 + 单层淡墨阴影 + 可选细描边（图例卡/设置项/影响卡） */
@Composable
fun PaperCard(
    modifier: Modifier = Modifier,
    color: Color = MapTokens.PAPER_CARD,
    cornerRadius: Dp = 10.dp,
    border: BorderStroke? = null,
    shadow: Dp = 2.dp,
    content: @Composable () -> Unit,
) {
    Surface(
        modifier = modifier,
        color = color,
        shape = RoundedCornerShape(cornerRadius),
        border = border,
        shadowElevation = shadow,
    ) { content() }
}

/** 朱砂竖线标题（sheet 标题样式，如「历史事件」「设置」） */
@Composable
fun VermilionTitle(
    text: String,
    modifier: Modifier = Modifier,
    size: Int = 17,
    letterSpacing: Int = 3,
    showBar: Boolean = true,
) {
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically) {
        if (showBar) {
            Box(
                Modifier
                    .width(4.dp)
                    .height(18.dp)
                    .background(MapTokens.VERMILION, RoundedCornerShape(2.dp)),
            )
            Spacer(Modifier.width(8.dp))
        }
        Text(
            text,
            fontFamily = MapFonts.Family,
            fontSize = scaledSp(size.toFloat()),
            fontWeight = FontWeight.Bold,
            color = MapTokens.VERMILION,
            letterSpacing = letterSpacing.sp,
        )
    }
}

/** 章节标题（设置面板 SectionTitle 统一化） */
@Composable
fun InkSectionTitle(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        fontFamily = MapFonts.Family,
        fontSize = scaledSp(12f),
        color = MapTokens.INK_SOFT,
        letterSpacing = 2.sp,
        modifier = modifier.padding(top = 14.dp, bottom = 6.dp),
    )
}

/** 年份徽章（朱砂底米白字，详情页/事件流条目） */
@Composable
fun YearBadge(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        fontFamily = MapFonts.Family,
        fontSize = scaledSp(12f),
        fontWeight = FontWeight.Bold,
        color = MapTokens.PAPER_CARD,
        modifier = modifier
            .background(MapTokens.VERMILION, RoundedCornerShape(12.dp))
            .padding(horizontal = 12.dp, vertical = 4.dp),
    )
}

/** 分类徽章（淡墨底墨字，详情页） */
@Composable
fun CategoryBadge(text: String, color: Color = MapTokens.INK, modifier: Modifier = Modifier) {
    Text(
        text,
        fontFamily = MapFonts.Family,
        fontSize = scaledSp(12f),
        color = color,
        modifier = modifier
            .background(Color(0x0F3A3428), RoundedCornerShape(12.dp))
            .padding(horizontal = 10.dp, vertical = 4.dp),
    )
}

/** 朱砂→透明渐变分隔线（标题下装饰线） */
@Composable
fun NoteDivider(modifier: Modifier = Modifier) {
    Box(
        modifier
            .fillMaxWidth()
            .height(2.dp)
            .background(Brush.horizontalGradient(MapTokens.RULE_GRADIENT)),
    )
}

/** 淡墨 1px 分隔线（顶栏底部等） */
@Composable
fun InkDivider(modifier: Modifier = Modifier, alpha: Float = 0.10f) {
    Box(
        modifier
            .fillMaxWidth()
            .height(1.dp)
            .background(MapTokens.INK.copy(alpha = alpha)),
    )
}

/** 顶部拖拽条（bottom sheet 顶部，朱砂圆角条） */
@Composable
fun DragHandle(modifier: Modifier = Modifier) {
    Box(
        modifier
            .size(width = 40.dp, height = 4.dp)
            .background(MapTokens.VERMILION, RoundedCornerShape(2.dp)),
    )
}

/** 右上角关闭按钮（详情/事件流/设置 sheet 用，触摸区 ≥44dp；可点击 Surface 自带最小交互尺寸） */
@Composable
fun CloseButton(onClose: () -> Unit, modifier: Modifier = Modifier) {
    Surface(
        onClick = onClose,
        modifier = modifier.size(44.dp),
        shape = CircleShape,
        color = Color(0x0A3A3428),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text("✕", fontFamily = MapFonts.Family, fontSize = scaledSp(14f), color = MapTokens.INK_SOFT)
        }
    }
}

/**
 * Sheet 头部：朱砂标题 + 右侧副标题/关闭按钮（≥44dp 触摸区）。
 * 顶部拖拽条由 AppBottomSheet 统一渲染（本组件不含，避免双重拖拽条）。
 * 详情/事件流/设置三个抽屉复用，保证标题与返回一致。
 */
@Composable
fun SheetHeader(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: (@Composable () -> Unit)? = null,
    onClose: (() -> Unit)? = null,
) {
    Row(
        modifier = modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        VermilionTitle(title)
        Spacer(Modifier.weight(1f))
        if (subtitle != null) subtitle()
        if (onClose != null) {
            if (subtitle != null) Spacer(Modifier.width(8.dp))
            CloseButton(onClose)
        }
    }
}
