package com.historymap.app

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt

/**
 * 顶栏（A5 拆分自 MapScreen）：标题 / 全时期模式开关（P2）/ 朝代章钮 /
 * 事件流与设置入口。状态全部由 MapScreen 持有，本组件只回调（保持单一状态源）。
 */
@Composable
internal fun MapTopBar(
    dynastyName: String,
    allPeriodMode: Boolean,
    onToggleAllPeriod: () -> Unit,
    onDynastyClick: () -> Unit,
    onDynastyButtonPositioned: (IntOffset, Int) -> Unit,
    onLogClick: () -> Unit,
    onSettingsClick: () -> Unit,
    onBottomEdgeChanged: (Float) -> Unit,
) {
    // 顶栏（设计比例：高度 154px；P1-字体：标题 20px/700、朝代 16px、事件 15px、
    // 设置 20px 图标；按钮触摸区 ≥44dp，保持内嵌菜单避免系统栏闪烁）
    Surface(
        modifier = Modifier.fillMaxWidth().statusBarsPadding()
            .onGloballyPositioned { coords ->
                // 实测顶栏底边（含状态栏 inset + 154px 行 + 分隔线），供标签/泡泡安全区
                onBottomEdgeChanged(coords.positionInRoot().y + coords.size.height)
            },
        color = MapTokens.PAPER_BAR,
    ) {
        Column {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(designDp(MapTokens.Dimensions.TOP_BAR_HEIGHT.toFloat()))
                    .padding(horizontal = designDp(54f), vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "历史地图",
                    fontFamily = MapFonts.Family,
                    fontWeight = FontWeight.Bold,
                    fontSize = designSp(MapTokens.Typography.TOP_TITLE.size.toFloat()),
                    letterSpacing = designSp(MapTokens.Typography.TOP_TITLE.letterSpacing.toFloat()),
                    color = MapTokens.INK,
                    modifier = Modifier.weight(1f),
                )
                // 全时期模式开关（P2）：激活后按年份展示当时全部政权（宋/辽/西夏等同屏）
                Surface(
                    onClick = onToggleAllPeriod,
                    modifier = Modifier.padding(start = 8.dp, end = 8.dp, top = 4.dp, bottom = 4.dp),
                    shape = RoundedCornerShape(designDp(6f)),
                    color = if (allPeriodMode) MapTokens.VERMILION else MapTokens.PAPER_CARD.copy(alpha = 0.6f),
                    border = androidx.compose.foundation.BorderStroke(1.dp, MapTokens.VERMILION),
                ) {
                    Text(
                        text = "全时期",
                        fontFamily = MapFonts.Family,
                        fontSize = designSp(MapTokens.Typography.DYNASTY.size.toFloat()),
                        fontWeight = FontWeight.Bold,
                        color = if (allPeriodMode) MapTokens.PAPER_CARD else MapTokens.VERMILION,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                    )
                }
                // 朝代按钮：朱砂印章式（米白底 + 朱砂描边 + 朱砂字，圆角小方章）
                Surface(
                    onClick = onDynastyClick,
                    modifier = Modifier
                        .onGloballyPositioned {
                            onDynastyButtonPositioned(
                                IntOffset(it.positionInRoot().x.roundToInt(), it.positionInRoot().y.roundToInt()),
                                it.size.height,
                            )
                        }
                        .padding(vertical = 4.dp),
                    shape = RoundedCornerShape(designDp(6f)),
                    color = MapTokens.PAPER_CARD.copy(alpha = 0.6f),
                    border = androidx.compose.foundation.BorderStroke(1.dp, MapTokens.VERMILION),
                ) {
                    Text(
                        text = if (dynastyName.isEmpty()) "加载中…" else "$dynastyName ▾",
                        fontFamily = MapFonts.Family,
                        fontSize = designSp(MapTokens.Typography.DYNASTY.size.toFloat()),
                        fontWeight = FontWeight.Bold,
                        letterSpacing = designSp(2f),
                        color = MapTokens.VERMILION,
                        modifier = Modifier.padding(horizontal = designDp(14f), vertical = 6.dp),
                    )
                }
                Spacer(Modifier.width(designDp(10f)))
                // 事件流抽屉开关（矢量菜单图标 + 「事件」文字）
                TextButton(onClick = onLogClick) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            painter = androidx.compose.ui.res.painterResource(R.drawable.ic_menu),
                            contentDescription = null,
                            tint = MapTokens.INK_SECONDARY,
                            modifier = Modifier.size(designDp(18f)),
                        )
                        Spacer(Modifier.width(designDp(6f)))
                        Text(
                            "事件",
                            fontFamily = MapFonts.Family,
                            fontSize = designSp(MapTokens.Typography.MENU.size.toFloat()),
                            letterSpacing = designSp(2f),
                            color = MapTokens.INK_SECONDARY,
                        )
                    }
                }
                // 设置开关（矢量齿轮图标，替代 Unicode ⚙ 的字形不一致问题）
                TextButton(onClick = onSettingsClick) {
                    Icon(
                        painter = androidx.compose.ui.res.painterResource(R.drawable.ic_settings),
                        contentDescription = null,
                        tint = MapTokens.INK_SECONDARY,
                        modifier = Modifier.size(designDp(20f)),
                    )
                }
            }
            InkDivider(alpha = 0.35f)
        }
    }
}
