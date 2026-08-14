package com.historymap.app

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * 设置面板（应用内底部抽屉）：事件分类多选 / 播放速度 / 图层显隐。
 * 对齐 Web 版 SettingsMenu 的设置项，状态由 MapScreen 持有。
 *
 * 视觉对齐：统一 SheetHeader、纸笺分类点 + 速度按钮 + 勾选样式；
 * 不改变设置持久化与分类过滤逻辑。
 */
@Composable
fun SettingsSheet(
    categories: List<String>,
    speed: String,
    showTerritory: Boolean,
    showRivers: Boolean,
    onCategoriesChange: (List<String>) -> Unit,
    onSpeedChange: (String) -> Unit,
    onTerritoryChange: (Boolean) -> Unit,
    onRiversChange: (Boolean) -> Unit,
    onDismiss: () -> Unit,
) {
    AppBottomSheet(onDismiss = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .navigationBarsPadding()
                .padding(horizontal = 20.dp)
                .padding(bottom = 24.dp),
        ) {
            SheetHeader(title = "设置", onClose = onDismiss)

            // 事件分类（与 Web 版 CATEGORIES 一致）
            InkSectionTitle("事件分类")
            val catDefs = listOf(
                "era" to "时代格局",
                "figure" to "名人轨迹",
                "military" to "军事·领土",
                "economy" to "经济变革",
                "invention" to "重要发明",
            )
            catDefs.forEach { (id, label) ->
                val checked = categories.contains(id)
                SettingRow(
                    label = label,
                    checked = checked,
                    dotColor = CATEGORY_COLORS[id] ?: CATEGORY_COLORS["era"]!!,
                    onToggle = {
                        val next = if (checked) categories.filter { it != id } else categories + id
                        onCategoriesChange(if (next.isEmpty()) listOf("era") else next)
                    },
                )
            }

            // 播放速度
            InkSectionTitle("播放速度")
            Row(Modifier.fillMaxWidth(), horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(10.dp)) {
                listOf("slow" to "慢", "normal" to "中", "fast" to "快").forEach { (id, label) ->
                    val selected = speed == id
                    Surface(
                        onClick = { onSpeedChange(id) },
                        modifier = Modifier.weight(1f).height(44.dp),
                        shape = RoundedCornerShape(999.dp),
                        color = if (selected) MapTokens.VERMILION else MapTokens.PAPER_CARD,
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text(
                                label,
                                fontFamily = MapFonts.Family,
                                fontSize = scaledSp(13f),
                                color = if (selected) MapTokens.PAPER_CARD else MapTokens.INK,
                            )
                        }
                    }
                }
            }

            // 图层显隐
            InkSectionTitle("显示")
            SettingRow("水彩疆域", showTerritory, MapTokens.VERMILION, onToggle = { onTerritoryChange(!showTerritory) })
            SettingRow("河流与山脉", showRivers, CATEGORY_COLORS["invention"] ?: CATEGORY_COLORS["era"]!!, onToggle = { onRiversChange(!showRivers) })
        }
    }
}

@Composable
private fun SettingRow(
    label: String,
    checked: Boolean,
    dotColor: Color,
    onToggle: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 44.dp)
            .clickable(onClick = onToggle)
            .padding(vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(9.dp)
                .background(dotColor, CircleShape),
        )
        Spacer(Modifier.width(10.dp))
        Text(
            label,
            fontFamily = MapFonts.Family,
            fontSize = scaledSp(14f),
            color = MapTokens.INK,
            modifier = Modifier.weight(1f),
        )
        // 勾选/未勾选（朱砂圆形开关）
        Box(
            Modifier
                .size(22.dp)
                .background(if (checked) MapTokens.VERMILION else Color(0x333A3428), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            if (checked) {
                Text("✓", fontFamily = MapFonts.Family, fontSize = scaledSp(13f), color = MapTokens.PAPER_CARD)
            }
        }
    }
}
