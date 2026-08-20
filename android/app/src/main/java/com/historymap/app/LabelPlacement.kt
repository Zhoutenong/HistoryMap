package com.historymap.app

import android.graphics.Paint
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect

/**
 * 屏幕空间地图标签布局（纯函数，绘制与命中共用）：
 * - 政权标签优先放 labelCoord 锚点，其次在锚点周围候选位中选
 *   「位于本政权域内 + 不与其它标签/UI 禁区碰撞 + 离锚点近」的位置
 * - 城市/地点/山脉按 rank 分层：低 rank 在手机紧凑模式隐藏
 * - 被移出锚点超过阈值的标签带细淡指向线（leader），锚点保留
 * - 输出为屏幕矩形 + 是否可见 + 是否需 leader，供 Canvas 与泡泡碰撞共用
 */

/** 放置结果：标签 + 最终屏幕矩形 + 是否可见 + 是否需要指向线 */
data class PlacedMapLabel(
    val label: MapRenderer.WorldLabel,
    val rect: Rect,
    val visible: Boolean,
    val needLeader: Boolean,
    val anchor: Offset,   // 原始锚点（世界坐标投影，leader 起点）
)

/** UI 禁区（屏幕矩形，如顶栏/图例/时间轴区域） */
data class ScreenZone(val rect: Rect, val pad: Float = 0f)

private val LABEL_GAP = 5f

/**
 * 计算全部地图标签的屏幕布局。
 * @param labels 世界坐标标签（renderer.labels）
 * @param screenRegimes 政权屏幕域（政权名 → 外环屏幕顶点，用于域内检查；可为空）
 * @param viewW / viewH 视口（CSS 像素）
 * @param zones UI 禁区（顶栏/图例/时间轴）
 * @param maxAuxLabels 山脉/河流等辅助标签上限（低端机限流）
 * @param maxCityLabels 城市标签上限（移动端紧凑，避免地名堆叠）
 * @param maxPlaceLabels 地点标签上限（移动端计划目标约 5）
 */
fun layoutMapLabels(
    labels: List<MapRenderer.WorldLabel>,
    screenRegimes: Map<String, List<android.graphics.PointF>>,
    textPaints: Map<String, Paint>,
    viewW: Float,
    viewH: Float,
    zones: List<ScreenZone>,
    density: Float = 1f,
    maxAuxLabels: Int = 32,
    maxCityLabels: Int = 8,
    maxPlaceLabels: Int = 5,
    /** 非 null 时按档位×rank 准入矩阵 + 每档数量上限（docs/requirements/zoom-lod-requirements.md §4.2）；
     *  null 退回旧行为（maxCityLabels/maxPlaceLabels/maxAuxLabels + rank 硬限制） */
    tier: LodTier? = null,
): List<PlacedMapLabel> {
    if (labels.isEmpty()) return emptyList()
    // 优先级：政权 > 主政权城市/京府次府 > 普通城市/州府 > 山脉 > 河流名 > 普通地点
    fun priority(l: MapRenderer.WorldLabel): Int = when (l.kind) {
        "regime" -> if (l.major) 0 else 1
        "cities" -> if (l.rank <= 2) 2 else 3
        "prefecture" -> if (l.rank <= 2) 2 else 3 // 与城市同级，靠 rank 排序（京府/次府优先）
        "mountains" -> 4
        "rivers" -> if (l.rank <= 1) 5 else 8
        else -> 7
    }
    val sorted = labels.sortedWith(compareBy({ priority(it) }, { it.rank }))
    val placedRects = mutableListOf<Rect>()
    val result = mutableListOf<PlacedMapLabel>()
    var auxCount = 0
    var cityCount = 0
    var placeCount = 0
    // 档位×rank 上限表（tier 模式）：城市/州府治所 与 地点 各按 rank 计次
    val cityCaps = tier?.let { LodTier.CITY_CAPS[it] }
    val placeCaps = tier?.let { LodTier.PLACE_CAPS[it] }
    val cityCounts = mutableMapOf<Int, Int>()
    val placeCounts = mutableMapOf<Int, Int>()

    for (l in sorted) {
        val paint = textPaints[l.kind] ?: continue
        val w = paint.measureText(l.text)
        val fm = paint.fontMetrics
        val h = fm.descent - fm.ascent
        val pad = when (l.kind) {
            "regime" -> 10f * density
            "cities" -> 7f * density
            else -> 5f * density
        }
        val bw = w + pad * 2
        val bh = h + (if (l.kind == "regime") 8f else 6f) * density

        // 各类标签限流：tier 模式按「档位×rank 矩阵 + 每档数量上限」；旧模式收紧城市/地点上限
        when (l.kind) {
            "regime" -> { /* 政权不限 */ }
            "cities", "prefecture" -> {
                if (cityCaps != null) {
                    val cap = cityCaps[l.rank] ?: continue // rank 未进档位表 = 该档隐藏
                    val used = cityCounts[l.rank] ?: 0
                    if (used >= cap) continue
                    cityCounts[l.rank] = used + 1
                } else {
                    if (cityCount >= maxCityLabels) continue
                    cityCount++
                }
            }
            "places" -> {
                if (placeCaps != null) {
                    val cap = placeCaps[l.rank] ?: continue
                    val used = placeCounts[l.rank] ?: 0
                    if (used >= cap) continue
                    placeCounts[l.rank] = used + 1
                } else {
                    if (l.rank > 2) continue // 手机紧凑：次要地点默认隐藏
                    if (placeCount >= maxPlaceLabels) continue
                    placeCount++
                }
            }
            else -> { // 山脉/河流等辅助
                if (auxCount >= maxAuxLabels) continue
                auxCount++
            }
        }
        // 旧模式下 rank 硬限制；tier 模式由准入矩阵统一控制（admitAtTier 已在调用方过滤）
        if (tier == null) {
            if (l.kind == "rivers" && l.rank > 1) continue
            if (l.kind == "mountains" && l.rank > 2) continue
        }

        // 候选位：锚点 + 上下左右（偏移随 density 缩放，与大字号成比例）
        val cx = l.wx
        val cy = l.wy
        val anchors = if (l.kind == "regime") {
            listOf(Offset(cx, cy), Offset(cx, cy - 26f * density), Offset(cx, cy + 26f * density), Offset(cx - bw / 2f - 30f * density, cy), Offset(cx + bw / 2f + 30f * density, cy))
        } else {
            listOf(Offset(cx, cy - 14f * density), Offset(cx, cy + 14f * density), Offset(cx - 22f * density, cy), Offset(cx + 22f * density, cy), Offset(cx, cy))
        }
        val region: List<android.graphics.PointF>? = screenRegimes[l.text]

        var best: Offset? = null
        var bestScore = Float.MAX_VALUE
        for (a in anchors) {
            val rect = Rect(a.x - bw / 2f, a.y - bh / 2f, a.x + bw / 2f, a.y + bh / 2f)
            // 出屏/撞 UI 禁区
            if (rect.left < 2f || rect.right > viewW - 2f || rect.top < 2f || rect.bottom > viewH - 2f) continue
            if (zones.any { overlaps(rect, it) }) continue
            // 与已放置标签碰撞
            if (placedRects.any { rectsOverlap(rect, it) }) continue
            // 政权标签要求位于本政权域内（域未知时跳过该约束；射线法点包含）
            if (l.kind == "regime" && region != null) {
                if (!pointInPolygon(a.x, a.y, region)) continue
            }
            val dist = (a.x - cx) * (a.x - cx) + (a.y - cy) * (a.y - cy)
            val score = dist + (if (a == anchors[0]) 0f else 800f) // 锚点优先
            if (score < bestScore) {
                bestScore = score
                best = a
            }
        }
        val anchor = Offset(cx, cy)
        val final = best ?: anchor
        val rect = Rect(final.x - bw / 2f, final.y - bh / 2f, final.x + bw / 2f, final.y + bh / 2f)
        val visible = best != null
        if (visible) placedRects.add(rect)
        val needLeader = visible && (kotlin.math.abs(final.x - cx) + kotlin.math.abs(final.y - cy)) > 8f
        result.add(PlacedMapLabel(l, rect, visible, needLeader, anchor))
    }
    return result
}

private fun overlaps(rect: Rect, zone: ScreenZone): Boolean {
    val z = zone.rect
    return rect.left < z.right + zone.pad && rect.right > z.left - zone.pad &&
        rect.top < z.bottom + zone.pad && rect.bottom > z.top - zone.pad
}

/** 射线法点包含（屏幕坐标外环顶点） */
private fun pointInPolygon(x: Float, y: Float, poly: List<android.graphics.PointF>): Boolean {
    var inside = false
    var j = poly.size - 1
    for (i in poly.indices) {
        val xi = poly[i].x
        val yi = poly[i].y
        val xj = poly[j].x
        val yj = poly[j].y
        val intersect = (yi > y) != (yj > y) &&
            x < (xj - xi) * (y - yi) / ((yj - yi).takeIf { it != 0f } ?: 1f) + xi
        if (intersect) inside = !inside
        j = i
    }
    return inside
}

private fun rectsOverlap(a: Rect, b: Rect): Boolean =
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
