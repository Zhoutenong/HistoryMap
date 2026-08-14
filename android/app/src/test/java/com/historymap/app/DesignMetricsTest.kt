package com.historymap.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** 设计画布（1080×2244 px、480dpi）→ 当前设备换算的纯函数测试（实施计划 M6） */
class DesignMetricsTest {

    @Test
    fun `等宽视口 scale 为 1`() {
        assertEquals(1f, DesignMetrics.widthScale(1080f), 0.001f)
    }

    @Test
    fun `设计 px 转 dp 在 P20 等比`() {
        // P20：1080px 宽、density 3、scale 1 → 996px 设计时间轴 ≈ 332dp
        assertEquals(332f, DesignMetrics.designToDp(996f, 3f, 1f), 0.001f)
    }

    @Test
    fun `设计 px 转 sp 在 P20 等比`() {
        // 42px 设计年份 → 14sp（density 3 下渲染回 42px）
        assertEquals(14f, DesignMetrics.designToSp(42f, 1f), 0.001f)
    }

    @Test
    fun `窄屏按宽度比例缩放`() {
        // 720px 宽（scale 0.667）：260px 设计泡泡 → ≈173px 屏幕
        val scale = DesignMetrics.widthScale(720f)
        assertEquals(0.667f, scale, 0.001f)
        assertEquals(173.3f, DesignMetrics.designToPx(260f, scale), 0.1f)
    }

    @Test
    fun `触摸区不小于 44dp`() {
        // 窄屏下设计值折算后远小于 44dp，必须被钳到最小触摸区
        assertEquals(44f, DesignMetrics.designToTouchDp(56f, 3f, 0.5f), 0.001f)
        assertTrue(DesignMetrics.designToTouchDp(56f, 3f, 1f) >= 44f)
    }

    @Test
    fun `高度比例独立于宽度`() {
        assertEquals(0.5f, DesignMetrics.heightScale(1122f), 0.001f)
    }

    @Test
    fun `零宽视口 scale 为 0 不崩溃`() {
        assertEquals(0f, DesignMetrics.widthScale(0f), 0.001f)
        assertEquals(0f, DesignMetrics.designToDp(100f, 3f, 0f), 0.001f)
    }
}
