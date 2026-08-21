package com.historymap.app

/**
 * 事件摘要抽取纯函数（实施计划 M6 / M4「摘要文本优先取 detail 首句」）：
 * 泡泡/事件流等处展示 detail 过长时的统一截断规则。
 */
internal fun shortEventSummary(detail: String?, max: Int = 18): String {
    val text = detail?.trim().orEmpty()
    if (text.isEmpty()) return ""
    // 首句优先：取**位置最早**的句末分隔符（。！？；）截断
    val firstSentence = listOf('。', '！', '？', '；')
        .mapNotNull { sep -> text.indexOf(sep).takeIf { it > 0 } }
        .minOrNull()
        ?.let { text.substring(0, it).trim() }
        ?: text
    return if (firstSentence.length > max) firstSentence.take(max - 1) + "…" else firstSentence
}
