package com.historymap.app

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

/**
 * 事件流抽屉（应用内底部抽屉）：已出现事件列表 + 搜索过滤 + 历史浏览器状态。
 *
 * P2-事件流补全：
 * - 标题副文本「当前 XXXX 年 · 已出现 N / 总数」；
 * - 当前年份窗口内的事件自动定位（列表滚动跟随），用户手动滚动后暂停自动定位；
 * - 「回到当前」按钮：滚回当前年份事件并恢复自动定位；
 * - 未出现事件（year > 当前年份）灰显；点击条目跳转到事件年份并打开详情。
 * - 搜索行为不变：空查询显示已出现事件；有搜索词搜索全部事件。
 */
@Composable
fun EventLogSheet(
    seenEvents: List<EventEntity>,
    allEvents: List<EventEntity>,
    currentYear: Int,
    onPick: (EventEntity) -> Unit,
    onDismiss: () -> Unit,
) {
    var query by remember { mutableStateOf("") }
    val q = query.trim()
    val filtered = if (q.isEmpty()) {
        seenEvents
    } else {
        allEvents.filter { ev ->
            listOf(ev.short, ev.title, ev.place, ev.detail, ev.year.toString())
                .filter { it.isNotEmpty() }
                .any { it.contains(q, ignoreCase = true) }
        }
    }
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    // 自动定位开关：初始开启；用户手动滚动后关闭
    var autoScroll by remember { mutableStateOf(true) }
    // 程序滚动标志：animateScrollToItem 期间为 true，避免把自动定位误判为用户滚动而关闭 autoScroll
    var programmaticScroll by remember { mutableStateOf(false) }
    val isScrolling by remember { derivedStateOf { listState.isScrollInProgress } }
    LaunchedEffect(isScrolling) {
        // 只在「非程序触发的滚动」时判定为用户手动滚动 → 关闭自动定位
        if (isScrolling && autoScroll && !programmaticScroll) autoScroll = false
    }
    // 当前年份事件在列表中的下标（自动定位目标）
    val currentIndex = filtered.indexOfFirst { currentYear in it.year..it.yearEnd }
    // 年份推进：自动滚动到当前事件（仅当自动定位开启）。滚动期间置 programmaticScroll，
    // 使上面的 isScrolling effect 不会把这次自动定位误判为用户滚动。
    LaunchedEffect(currentIndex, currentYear) {
        if (autoScroll && currentIndex >= 0) {
            programmaticScroll = true
            listState.animateScrollToItem(currentIndex)
            programmaticScroll = false
        }
    }
    fun scrollToCurrent() {
        autoScroll = true
        if (currentIndex >= 0) {
            scope.launch {
                programmaticScroll = true
                listState.animateScrollToItem(currentIndex)
                programmaticScroll = false
            }
        }
    }

    AppBottomSheet(onDismiss = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(bottom = 12.dp),
        ) {
            // P2-标题两行：第一行「历史事件 + 关闭」，第二行「当前年份 · 已出现统计」，
            // 避免单行拥挤、统计数字变长时溢出
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                VermilionTitle("历史事件")
                Spacer(Modifier.weight(1f))
                CloseButton(onDismiss)
            }
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp),
            ) {
                Text(
                    "当前 $currentYear 年 · 已出现 ${seenEvents.size} / ${allEvents.size} 个",
                    fontFamily = MapFonts.Family,
                    fontSize = scaledSp(12f),
                    color = MapTokens.INK_SOFT,
                )
            }
            // 搜索框（纸面圆角胶囊）
            TextField(
                value = query,
                onValueChange = { query = it },
                placeholder = { Text("搜索事件…", fontFamily = MapFonts.Family, fontSize = scaledSp(13f)) },
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 8.dp),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = MapTokens.PAPER_CARD,
                    unfocusedContainerColor = MapTokens.PAPER_CARD,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                ),
                shape = RoundedCornerShape(999.dp),
            )
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (q.isNotEmpty()) {
                    Text(
                        "找到 ${filtered.size} 个匹配",
                        fontFamily = MapFonts.Family,
                        fontSize = scaledSp(11f),
                        color = MapTokens.INK_SOFT,
                    )
                }
                Spacer(Modifier.weight(1f))
                // 回到当前：滚回当前年份事件并恢复自动定位
                if (!autoScroll || currentIndex > 0) {
                    Surface(
                        onClick = { scrollToCurrent() },
                        shape = RoundedCornerShape(999.dp),
                        color = MapTokens.PAPER_CARD,
                        border = androidx.compose.foundation.BorderStroke(1.dp, MapTokens.VERMILION),
                    ) {
                        Text(
                            "回到当前 ▾",
                            fontFamily = MapFonts.Family,
                            fontSize = scaledSp(11f),
                            color = MapTokens.VERMILION,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 5.dp),
                        )
                    }
                }
            }
            // 事件列表（已出现 → 按年份升序；当前年份窗口内高亮，未出现灰显）
            LazyColumn(
                state = listState,
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
            ) {
                items(filtered, key = { it.id }) { ev ->
                    val isCurrent = currentYear in ev.year..ev.yearEnd
                    val isFuture = ev.year > currentYear
                    EventLogEntry(ev, isCurrent, isFuture, onClick = { onPick(ev) })
                }
            }
        }
    }
}

@Composable
private fun EventLogEntry(ev: EventEntity, isCurrent: Boolean, isFuture: Boolean, onClick: () -> Unit) {
    val cat = CATEGORY_COLORS[ev.category] ?: CATEGORY_COLORS["era"]!!
    val bg = when {
        isCurrent -> Color(0x24B03A2E)
        isFuture -> Color(0x053A3428)
        else -> Color(0x0B3A3428)
    }
    val textColor = if (isFuture) MapTokens.INK.copy(alpha = 0.35f) else MapTokens.INK
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 3.dp)
            .background(bg, RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // 分类色条
        Box(
            Modifier
                .width(4.dp)
                .height(22.dp)
                .background(if (isFuture) cat.copy(alpha = 0.3f) else cat, RoundedCornerShape(2.dp)),
        )
        Spacer(Modifier.width(10.dp))
        Text(
            "${ev.year} 年",
            fontFamily = MapFonts.Family,
            fontSize = scaledSp(12f),
            fontWeight = FontWeight.Bold,
            color = if (isFuture) MapTokens.VERMILION.copy(alpha = 0.4f) else MapTokens.VERMILION,
            modifier = Modifier.width(58.dp),
        )
        Text(
            ev.short.ifEmpty { "未命名事件" },
            fontFamily = MapFonts.Family,
            fontSize = scaledSp(13f),
            color = textColor,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
