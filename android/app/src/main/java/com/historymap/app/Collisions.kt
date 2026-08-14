package com.historymap.app

/**
 * 屏幕空间碰撞推挤（纯函数，翻译 Web 版 client/src/events/collisions.js）。
 *
 * 规则与 Web 版保持一致：
 * - 按年份排序，早出现者优先不动，晚出现者被推挤
 * - fixed 节点（如地图政权标签）不可被推挤，只作为固定障碍
 * - 优先向下推（视觉自然）；垂直将超限时改水平推挤
 */

/** 屏幕空间矩形（CSS 像素） */
data class RectF2(val x: Float, val y: Float, val w: Float, val h: Float)

/** 推挤量（dx 向右、dy 向下为正） */
data class Shift(val dx: Float, val dy: Float)

/** 碰撞节点：年份越小越优先不动；fixed 为不可移动障碍 */
data class CollisionNode(
    val year: Int,
    val rect: RectF2,
    val fixed: Boolean = false,
)

/**
 * @param nodes 参与推挤的节点
 * @param gap 节点间留白（px）
 * @param maxPush 单方向最大推挤量（px）
 * @return 与入参顺序一致的推挤量列表
 */
fun resolveCollisions(nodes: List<CollisionNode>, gap: Float = 6f, maxPush: Float = 64f): List<Shift> {
    val result = MutableList(nodes.size) { Shift(0f, 0f) }
    // 年份升序；固定障碍（year = Int.MIN_VALUE）自然排最前
    val order = nodes.mapIndexed { i, nd -> nd to i }
        .sortedBy { it.first.year }

    for (oi in order.indices) {
        val (a, ai) = order[oi]
        for (oj in oi + 1 until order.size) {
            val (b, bi) = order[oj]
            if (b.fixed) continue // 障碍物不可被推挤
            val ax = a.rect.x + result[ai].dx
            val ay = a.rect.y + result[ai].dy
            val bx = b.rect.x + result[bi].dx
            val by = b.rect.y + result[bi].dy
            val ox = minOf(ax + a.rect.w, bx + b.rect.w) - maxOf(ax, bx)
            val oy = minOf(ay + a.rect.h, by + b.rect.h) - maxOf(ay, by)
            if (ox <= 0f || oy <= 0f) continue

            val verticalRoom = maxPush - kotlin.math.abs(result[bi].dy)
            if (oy + gap <= verticalRoom) {
                result[bi] = Shift(result[bi].dx, result[bi].dy + oy + gap)
            } else {
                val dir = if (result[bi].dx <= 0f) 1f else -1f // 优先向右，已右偏则向左
                val need = minOf(ox + gap, maxPush)
                result[bi] = Shift(result[bi].dx + need * dir, result[bi].dy)
            }
        }
    }
    return result
}

/**
 * 出屏回收：把已推挤的矩形拉回视口内（纯函数，翻译 collisions.js clampNodeToViewport）。
 * @param minY / maxY 纵向安全区（顶栏底 / 时间轴顶），保证泡泡不进入 UI 铬区。
 */
fun clampToViewport(
    rect: RectF2,
    dx: Float,
    dy: Float,
    viewportW: Float,
    viewportH: Float,
    pad: Float = 6f,
    minY: Float = pad,
    maxY: Float = viewportH - pad,
): Shift {
    if (viewportW <= 0f || viewportH <= 0f) return Shift(dx, dy)
    var nx = dx
    var ny = dy
    val x = rect.x + dx
    val y = rect.y + dy
    if (x < pad) nx += pad - x
    else if (x + rect.w > viewportW - pad) nx += viewportW - pad - (x + rect.w)
    if (y < minY) ny += minY - y
    else if (y + rect.h > maxY) ny += maxY - (y + rect.h)
    return Shift(nx, ny)
}
