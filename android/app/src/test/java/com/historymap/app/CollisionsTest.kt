package com.historymap.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** 碰撞推挤 / 出屏回收纯函数测试（翻译 Web 版 collisions.js；实施计划 M6） */
class CollisionsTest {

    @Test
    fun `两个重叠节点后者被向下推开`() {
        val nodes = listOf(
            CollisionNode(1, RectF2(0f, 0f, 100f, 40f)),
            CollisionNode(2, RectF2(0f, 0f, 100f, 40f)),
        )
        val shifts = resolveCollisions(nodes)
        assertEquals(0f, shifts[0].dx); assertEquals(0f, shifts[0].dy) // 早事件不动
        assertTrue("晚事件应被推挤", shifts[1].dy > 0f || shifts[1].dx != 0f)
    }

    @Test
    fun `fixed 障碍不可被推挤`() {
        val nodes = listOf(
            CollisionNode(Int.MIN_VALUE, RectF2(0f, 0f, 100f, 40f), fixed = true),
            CollisionNode(2, RectF2(0f, 0f, 100f, 40f)),
        )
        val shifts = resolveCollisions(nodes)
        assertEquals(0f, shifts[0].dx); assertEquals(0f, shifts[0].dy) // 障碍不动
        assertTrue(shifts[1].dy > 0f || shifts[1].dx != 0f)             // 普通节点被推开
    }

    @Test
    fun `垂直空间不足时改水平推挤`() {
        // maxPush 默认 64：两个并排的 100 宽节点，垂直方向推到极限后转水平
        val nodes = listOf(
            CollisionNode(1, RectF2(0f, 0f, 100f, 100f)),
            CollisionNode(2, RectF2(0f, 0f, 100f, 100f)),
        )
        val shifts = resolveCollisions(nodes, maxPush = 20f)
        assertTrue("垂直受限应水平推开", kotlin.math.abs(shifts[1].dx) > 0f)
    }

    @Test
    fun `不相交节点无推挤`() {
        val nodes = listOf(
            CollisionNode(1, RectF2(0f, 0f, 50f, 40f)),
            CollisionNode(2, RectF2(100f, 0f, 50f, 40f)),
        )
        val shifts = resolveCollisions(nodes)
        assertEquals(0f, shifts[1].dx); assertEquals(0f, shifts[1].dy)
    }

    @Test
    fun `clampToViewport 拉回右侧越界`() {
        val s = clampToViewport(RectF2(900f, 100f, 200f, 40f), 0f, 0f, 1000f, 800f)
        assertTrue("应向左拉回", s.dx < 0f)
        assertTrue(900f + s.dx + 200f <= 1000f - 6f)
    }

    @Test
    fun `clampToViewport 拉回左侧越界`() {
        val s = clampToViewport(RectF2(-20f, 100f, 200f, 40f), 0f, 0f, 1000f, 800f)
        assertTrue("应向右拉回", s.dx > 0f)
        assertTrue(-20f + s.dx >= 6f)
    }

    @Test
    fun `clampToViewport 零视口不崩溃`() {
        val s = clampToViewport(RectF2(0f, 0f, 100f, 40f), 5f, 5f, 0f, 0f)
        assertEquals(5f, s.dx); assertEquals(5f, s.dy)
    }
}
