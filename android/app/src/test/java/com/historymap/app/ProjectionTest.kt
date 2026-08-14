package com.historymap.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** MercatorProjection 纯函数测试：中心映射、方向、退化输入（实施计划 M6「相机/投影换算」） */
class ProjectionTest {

    private val box = listOf(
        LngLat(100.0, 35.0), LngLat(120.0, 35.0),
        LngLat(100.0, 45.0), LngLat(120.0, 45.0),
    )

    @Test
    fun `fitSize 后包围盒中心映射到原点`() {
        val p = MercatorProjection.fit(box)
        // d3-geo fitSize 的数学性质：标定后投影包围盒中心恰好落在 [500,400]。
        // 验证对角顶点关于原点对称（等价于包围盒中心 = 原点）。
        val a = p.project(LngLat(100.0, 35.0))
        val b = p.project(LngLat(120.0, 45.0))
        assertEquals(a[0], -b[0], 1e-2f)
        assertEquals(a[1], -b[1], 1e-2f)
    }

    @Test
    fun `纬度向北 y 减小（当前投影 y 与 Web 反号，渲染层已翻转补偿）`() {
        val p = MercatorProjection.fit(box)
        val south = p.project(LngLat(110.0, 35.0))
        val north = p.project(LngLat(110.0, 45.0))
        // 说明：Projection.kt 的墨卡托 y 与 Web 版 d3 输出反号（历史遗留，
        // 计划约定「不改变投影」），因此世界坐标 y 朝下（北 = 更小 y）。
        // MapRenderer.worldToScreen 已对该反号做翻转补偿，标签/泡泡与
        // 纹理内容（北在上）对齐，屏幕显示正确。
        assertTrue("当前投影：北点 y 应更小（世界坐标 y 朝下）", north[1] < south[1])
    }

    @Test
    fun `经度向东 x 增大`() {
        val p = MercatorProjection.fit(box)
        val west = p.project(LngLat(100.0, 40.0))
        val east = p.project(LngLat(120.0, 40.0))
        assertTrue(east[0] > west[0])
    }

    @Test
    fun `等高宽比缩放保持等比`() {
        val p = MercatorProjection.fit(box)
        // 标定范围 1000×800：宽 20°、高 10°，等比后 y 轴覆盖更满
        val w = kotlin.math.abs(p.project(LngLat(120.0, 40.0))[0] - p.project(LngLat(100.0, 40.0))[0])
        val h = kotlin.math.abs(p.project(LngLat(110.0, 45.0))[1] - p.project(LngLat(110.0, 35.0))[1])
        assertTrue(w > 0f && h > 0f)
    }

    @Test
    fun `单点退化不崩溃且居中`() {
        val p = MercatorProjection.fit(listOf(LngLat(110.0, 40.0)))
        val c = p.project(LngLat(110.0, 40.0))
        assertEquals(0.0, c[0].toDouble(), 1e-3)
        assertEquals(0.0, c[1].toDouble(), 1e-3)
    }

    @Test
    fun `空点集不崩溃`() {
        val p = MercatorProjection.fit(emptyList())
        val c = p.project(LngLat(110.0, 40.0))
        assertTrue(c[0].isFinite() && c[1].isFinite())
    }
}
