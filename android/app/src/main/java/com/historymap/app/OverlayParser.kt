package com.historymap.app

import org.json.JSONArray
import org.json.JSONObject

/**
 * 政权多边形（经纬度环，渲染前由投影转世界坐标）。
 */
data class RegimePolygon(
    val entity: String,
    val color: FloatArray,        // RGBA（color + fillOpacity，0..1）
    val labelCoord: LngLat?,      // 人工标定的政权名位置；null 时用质心兜底
    val rings: List<List<LngLat>>,
)

/**
 * 河流示意线（经纬度路径）。
 * @param rank 主次：1 大江大河（宽水痕），2+ 支流（细线）
 * @param style 数据自带样式（如 ink-blue），暂仅保留
 */
data class RiverPath(val name: String, val path: List<LngLat>, val rank: Int = 1, val style: String = "")

/**
 * 山脉示意（经纬度点或可选山脊 path）。
 * 数据多为 Point 标签，绘制时生成确定性山形笔触；有 path 时直接描山脊。
 */
data class MountainFeature(
    val name: String,
    val coord: LngLat?,
    val path: List<LngLat>?,
    val rank: Int = 1,
)

/**
 * 地图标注（政权/城市/地点/山脉/河流名），供 Compose 标签层定位绘制。
 */
data class OverlayLabel(
    val text: String,
    val coord: LngLat,
    val kind: String,   // regime / cities / places / mountains / rivers
    val major: Boolean, // 主叙事政权（labelMajor）
    val rank: Int,      // 城市/地点重要性（1 最重要），政权固定 0
)

/**
 * 州府多边形（元丰九域志基准，Voronoi 近似边界）：仅描边不填充。
 */
data class PrefecturePolygon(
    val name: String,
    val rings: List<List<LngLat>>,
)

/**
 * OverlayLoader.getOverlay() 输出（与 GET /api/map/overlay 契约一致）的解析模型。
 */
data class OverlayModel(
    val regimes: List<RegimePolygon>,
    val rivers: List<RiverPath>,
    val mountains: List<MountainFeature>,
    val labels: List<OverlayLabel>,
    val prefectures: List<PrefecturePolygon> = emptyList(),
    /** 时期 id（overlay 响应顶层 properties._periodId，如 song-1111）；资源贴图索引用 */
    val periodId: String? = null,
)

/**
 * 把 overlay FeatureCollection JSON 解析为渲染模型。
 * 字段结构与 Web 版（server/routes/overlay.js + client TerritoryOverlay.js）对齐：
 * - features[].properties：entity / color / fillOpacity / labelCoord / labelMajor
 * - properties.cities / places / mountains：legacy 列表 [{name, coord, kind, rank}]
 * - properties.rivers：legacy 列表 [{name, path, ...}]
 */
object OverlayParser {

    fun parse(overlay: JSONObject): OverlayModel {
        val regimes = mutableListOf<RegimePolygon>()
        val labels = mutableListOf<OverlayLabel>()
        // 政权名标签按 entity 去重（对齐 Web 版 TerritoryOverlay 的 seen 集合）：
        // 同一政权的多个 feature（如按省份拆分）只生成一个标签，避免地图上叠字。
        val seenRegimeLabels = mutableSetOf<String>()

        val features = overlay.optJSONArray("features") ?: JSONArrayOf()
        for (i in 0 until features.length()) {
            val feat = features.optJSONObject(i) ?: continue
            val props = feat.optJSONObject("properties") ?: continue
            val entity = props.optString("entity")
            if (entity.isEmpty()) continue
            val rings = extractRings(feat.optJSONObject("geometry"))
            if (rings.isEmpty()) continue

            val color = parseColor(props.optString("color", "#888888"))
            val fillOpacity = props.optDouble("fillOpacity", 0.35).toFloat()
            val labelCoord = props.optJSONArray("labelCoord")?.let {
                if (it.length() >= 2) LngLat(it.getDouble(0), it.getDouble(1)) else null
            }
            val major = props.optBoolean("labelMajor", false)

            regimes.add(
                RegimePolygon(
                    entity = entity,
                    color = floatArrayOf(color[0], color[1], color[2], fillOpacity),
                    labelCoord = labelCoord,
                    rings = rings,
                )
            )
            // 政权名标签：labelCoord 优先，缺省用顶点平均作质心兜底；同 entity 只取首个
            if (seenRegimeLabels.add(entity)) {
                val labelPos = labelCoord ?: centroidOf(rings)
                labels.add(OverlayLabel(entity, labelPos, "regime", major, rank = 0))
            }
        }

        // 辅助层（legacy 列表，结构对齐 overlay.js 的 properties.* 输出）
        val props = overlay.optJSONObject("properties") ?: JSONObject()
        val cities = parseLabels(props, "cities")
        val places = parseLabels(props, "places")
        val mountainLabels = parseLabels(props, "mountains")
        val mountains = parseMountains(props)
        val rivers = parseRivers(props)
        // 河流名作为低对比度标签（rank 高的显示，低 rank 的在手机端隐藏）
        labels.addAll(cities)
        labels.addAll(places)
        labels.addAll(mountainLabels)
        rivers.forEach { r ->
            if (r.name.isNotEmpty()) labels.add(OverlayLabel(r.name, r.path.first(), "rivers", major = false, rank = r.rank))
        }

        // 州府级（元丰九域志基准）：
        // - properties.prefectures：面（保留完整 feature，对齐 overlay.js 新通道）→ 仅描边
        // - properties.prefectureSeats：治所点（legacy）→ Compose 标签（kind=prefecture，
        //   rank<=2 时 major 大字——与 Web 版 prefecture-label.major 语义一致）
        val prefectures = parsePrefectures(props.optJSONArray("prefectures"))
        val prefectureLabels = parseLabels(props, "prefectureSeats").map {
            it.copy(kind = "prefecture", major = it.rank <= 2)
        }
        labels.addAll(prefectureLabels)

        val periodId = props.optString("_periodId").takeIf { it.isNotEmpty() }
        return OverlayModel(regimes, rivers, mountains, labels, prefectures, periodId)
    }

    /** 州府面：properties.prefectures 的完整 feature（Polygon/MultiPolygon）→ 环列表 */
    private fun parsePrefectures(arr: JSONArray?): List<PrefecturePolygon> {
        if (arr == null) return emptyList()
        val out = mutableListOf<PrefecturePolygon>()
        for (i in 0 until arr.length()) {
            val feat = arr.optJSONObject(i) ?: continue
            val props = feat.optJSONObject("properties")
            val name = props?.optString("name").orEmpty()
            val rings = extractRings(feat.optJSONObject("geometry"))
            if (rings.isNotEmpty()) out.add(PrefecturePolygon(name, rings))
        }
        return out
    }

    /** 提取几何的所有环（Polygon → 每 polygon 的环；MultiPolygon → 全部环） */
    fun extractRings(geometry: JSONObject?): List<List<LngLat>> {
        val result = mutableListOf<List<LngLat>>()
        if (geometry == null) return result
        val type = geometry.optString("type")
        val coords = geometry.optJSONArray("coordinates") ?: return result
        val polygons = if (type == "MultiPolygon") {
            (0 until coords.length()).map { coords.optJSONArray(it) ?: JSONArrayOf() }
        } else {
            listOf(coords)
        }
        for (polygon in polygons) {
            for (r in 0 until polygon.length()) {
                val ring = polygon.optJSONArray(r) ?: continue
                val points = (0 until ring.length()).mapNotNull { i ->
                    val c = ring.optJSONArray(i) ?: return@mapNotNull null
                    if (c.length() < 2) null else LngLat(c.getDouble(0), c.getDouble(1))
                }
                if (points.size >= 3) result.add(points)
            }
        }
        return result
    }

    /** 收集全部经纬度点（投影标定基准）：政权环 + 河流 + 山脉，避免边远点越界 */
    fun allPoints(model: OverlayModel): List<LngLat> {
        val out = mutableListOf<LngLat>()
        model.regimes.forEach { r -> r.rings.forEach { out.addAll(it) } }
        model.rivers.forEach { out.addAll(it.path) }
        model.mountains.forEach {
            if (it.path != null) out.addAll(it.path) else it.coord?.let { c -> out.add(c) }
        }
        return out
    }

    // ================= 内部解析 =================

    private fun parseLabels(props: JSONObject, kind: String): List<OverlayLabel> {
        val arr = props.optJSONArray(kind) ?: return emptyList()
        val out = mutableListOf<OverlayLabel>()
        for (i in 0 until arr.length()) {
            val item = arr.optJSONObject(i) ?: continue
            val coord = item.optJSONArray("coord")
            val path = item.optJSONArray("path")
            val text = item.optString("name")
            if (text.isEmpty()) continue
            val c = if (coord != null && coord.length() >= 2) {
                LngLat(coord.getDouble(0), coord.getDouble(1))
            } else if (path != null && path.length() >= 1) {
                val p = path.optJSONArray(0) ?: continue
                if (p.length() < 2) continue
                LngLat(p.getDouble(0), p.getDouble(1))
            } else {
                continue
            }
            out.add(OverlayLabel(text, c, kind, major = false, rank = item.optInt("rank", 99)))
        }
        return out
    }

    private fun parseRivers(props: JSONObject): List<RiverPath> {
        val arr = props.optJSONArray("rivers") ?: return emptyList()
        val out = mutableListOf<RiverPath>()
        for (i in 0 until arr.length()) {
            val item = arr.optJSONObject(i) ?: continue
            val path = item.optJSONArray("path") ?: continue
            val points = (0 until path.length()).mapNotNull { j ->
                val c = path.optJSONArray(j) ?: return@mapNotNull null
                if (c.length() < 2) null else LngLat(c.getDouble(0), c.getDouble(1))
            }
            if (points.size >= 2) out.add(
                RiverPath(
                    name = item.optString("name", ""),
                    path = points,
                    rank = item.optInt("rank", 1),
                    style = item.optString("style", ""),
                )
            )
        }
        return out
    }

    /** 山脉要素：优先 path（山脊线），无 path 时用 coord（点位） */
    private fun parseMountains(props: JSONObject): List<MountainFeature> {
        val arr = props.optJSONArray("mountains") ?: return emptyList()
        val out = mutableListOf<MountainFeature>()
        for (i in 0 until arr.length()) {
            val item = arr.optJSONObject(i) ?: continue
            val name = item.optString("name")
            if (name.isEmpty()) continue
            val pathArr = item.optJSONArray("path")
            val path = if (pathArr != null && pathArr.length() >= 2) {
                (0 until pathArr.length()).mapNotNull { j ->
                    val c = pathArr.optJSONArray(j) ?: return@mapNotNull null
                    if (c.length() < 2) null else LngLat(c.getDouble(0), c.getDouble(1))
                }.takeIf { it.size >= 2 }
            } else null
            val coord = item.optJSONArray("coord")?.let {
                if (it.length() >= 2) LngLat(it.getDouble(0), it.getDouble(1)) else null
            } ?: path?.first()
            if (coord == null && path == null) continue
            out.add(MountainFeature(name, coord, path, rank = item.optInt("rank", 1)))
        }
        return out
    }

    /**
     * 政权名标签兜底位置：用最大环的顶点平均（近似视觉重心）。
     * 简单全顶点平均会被小岛/远方飞地拉偏，最大环代表主体疆域。
     */
    private fun centroidOf(rings: List<List<LngLat>>): LngLat {
        var best = rings.maxByOrNull { it.size } ?: return LngLat(0.0, 0.0)
        var sumLng = 0.0
        var sumLat = 0.0
        for (p in best) {
            sumLng += p.lng
            sumLat += p.lat
        }
        return LngLat(sumLng / best.size, sumLat / best.size)
    }

    private fun parseColor(hex: String): FloatArray {
        return try {
            val v = hex.removePrefix("#").toLong(16)
            floatArrayOf(
                ((v shr 16) and 0xFF) / 255f,
                ((v shr 8) and 0xFF) / 255f,
                (v and 0xFF) / 255f,
            )
        } catch (e: Exception) {
            floatArrayOf(0.5f, 0.5f, 0.5f)
        }
    }

    private fun JSONArrayOf() = org.json.JSONArray()
}
