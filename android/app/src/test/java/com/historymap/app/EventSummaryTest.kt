package com.historymap.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** 事件泡泡摘要抽取纯函数测试（实施计划 M6 / M4「摘要文本优先取 detail 首句」） */
class EventSummaryTest {

    @Test
    fun `首句截断`() {
        assertEquals(
            "陈桥兵变，赵匡胤率军北上",
            shortEventSummary("陈桥兵变，赵匡胤率军北上。后周灭亡，北宋建立。"),
        )
    }

    @Test
    fun `超长首句加省略号且不超 18 字`() {
        val s = shortEventSummary("这是一段非常长的摘要文字它超过了十八个字符应该被截断。")
        assertTrue(s.endsWith("…"))
        assertEquals(18, s.length)
    }

    @Test
    fun `空详情返回空`() {
        assertEquals("", shortEventSummary(""))
        assertEquals("", shortEventSummary("   "))
    }

    @Test
    fun `多种句末分隔符均可切句`() {
        assertEquals("第一句", shortEventSummary("第一句！第二句。"))
        assertEquals("第一句", shortEventSummary("第一句？第二句。"))
        assertEquals("第一句", shortEventSummary("第一句；第二句。"))
    }

    @Test
    fun `无分隔符长文按 max 截断`() {
        val s = shortEventSummary("无分隔符的长文本内容没有任何标点符号可以切断它", max = 10)
        assertTrue(s.endsWith("…"))
        assertEquals(10, s.length)
    }
}
