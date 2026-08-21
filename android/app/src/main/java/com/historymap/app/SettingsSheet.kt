package com.historymap.app

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.ui.unit.dp

/**
 * 设置面板（应用内底部抽屉）：事件分类多选 / 人物视角 / 播放速度 / 图层显隐。
 * 对齐 Web 版 SettingsMenu 的设置项，状态由 MapScreen 持有（人物过滤为会话级，不持久化）。
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
    showPrefectures: Boolean,
    showSeats: Boolean,
    persons: List<PersonWithCount>,
    personFilterId: Long?,
    onCategoriesChange: (List<String>) -> Unit,
    onSpeedChange: (String) -> Unit,
    onTerritoryChange: (Boolean) -> Unit,
    onRiversChange: (Boolean) -> Unit,
    onPrefecturesChange: (Boolean) -> Unit,
    onSeatsChange: (Boolean) -> Unit,
    onPersonChange: (Long?) -> Unit,
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

            // 事件分类（id/label 来自契约 ContractTokens，与 Web 版 store.js CATEGORIES 一致）
            InkSectionTitle("事件分类")
            val catDefs = ContractTokens.CATEGORY_LABELS.toList()
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

            // 人物视角（P1）：横滑人物条，选中后只显示该人物关联的事件泡泡
            if (persons.isNotEmpty()) {
                InkSectionTitle("人物视角")
                Row(
                    Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp),
                ) {
                    PersonChip(
                        label = "全部",
                        selected = personFilterId == null,
                        onClick = { onPersonChange(null) },
                    )
                    persons.forEach { p ->
                        PersonChip(
                            label = "${p.name}·${p.eventCount}",
                            selected = personFilterId == p.id,
                            onClick = { onPersonChange(p.id) },
                        )
                    }
                }
                persons.firstOrNull { it.id == personFilterId }?.note?.takeIf { it.isNotBlank() }?.let {
                    Text(
                        it,
                        fontFamily = MapFonts.Family,
                        fontSize = scaledSp(12f),
                        color = MapTokens.INK_SOFT,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
            }

            // 播放速度（档位顺序与 id 来自契约，label 为视觉文案）
            InkSectionTitle("播放速度")
            val speedLabels = mapOf("slow" to "慢", "normal" to "中", "fast" to "快")
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                ContractTokens.SPEED_TICK_MS.keys.forEach { id ->
                    val label = speedLabels[id] ?: id
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
            SettingRow("州府边界", showPrefectures, MapTokens.INK, onToggle = { onPrefecturesChange(!showPrefectures) })
            SettingRow("治所标注", showSeats, MapTokens.INK_SOFT, onToggle = { onSeatsChange(!showSeats) })
        }
    }
}

/** 人物视角芯片（P1）：选中的朱砂底反白，未选中纸笺底墨字 */
@Composable
private fun PersonChip(label: String, selected: Boolean, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(999.dp),
        color = if (selected) MapTokens.VERMILION else MapTokens.PAPER_CARD,
        modifier = Modifier.height(34.dp),
    ) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.padding(horizontal = 14.dp)) {
            Text(
                label,
                fontFamily = MapFonts.Family,
                fontSize = scaledSp(13f),
                color = if (selected) MapTokens.PAPER_CARD else MapTokens.INK,
            )
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
