package com.historymap.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

/**
 * 历史疆域叠加层加载器：复刻 server/routes/overlay.js 的合并逻辑，
 * 输出与 GET /api/map/overlay?dynasty=..&period=.. 完全一致的 JSON。
 *
 * 数据源：assets/geo/historical/ 下由 scripts/prepare-android.js 同步的原始文件
 * （periods.json 索引 + regimes-*.json / jin-*.json + 4 个辅助 geojson），
 * 与后端共用同一份数据文件，无重复维护。
 */
class OverlayLoader(private val context: Context) {

    private val fileCache = ConcurrentHashMap<String, JSONObject>()

    private val periodsIndex: JSONObject by lazy {
        readJson("geo/historical/periods.json") ?: JSONObject()
    }

    /** 标准辅助地理文件（河流/山脉/城市/地点） */
    private val standardGeoFiles = listOf(
        "rivers.geojson", "mountains.geojson", "cities.geojson", "places.geojson",
    )

    /** 地点类要素 kind 白名单：都城/战场/书院等归入响应顶层 properties.places */
    private val placeKinds = setOf("capital", "battlefield", "academy")

    fun getOverlay(dynasty: String, period: String): String {
        val periodId = "$dynasty-$period"
        val periods = periodsIndex.optJSONArray("periods")
        val periodDef = if (periods == null) null
        else (0 until periods.length())
            .map { periods.getJSONObject(it) }
            .firstOrNull { it.optString("id") == periodId }
        if (periodDef == null) return emptyCollection("未找到时期: $periodId")

        // entities 配色表：按中文名（entity）兜底查色，统一管理政权颜色
        val entityStyle = mutableMapOf<String, String>()
        periodsIndex.optJSONArray("entities")?.let { entities ->
            for (i in 0 until entities.length()) {
                val e = entities.getJSONObject(i)
                entityStyle[e.optString("name")] = e.optString("color")
            }
        }
        // 政权名标签位：labels 为人工标定的视觉中心；labelMajor 标识主叙事政权
        val labels = periodsIndex.optJSONObject("labels") ?: JSONObject()
        val labelMajorSet = mutableSetOf<String>()
        periodsIndex.optJSONArray("labelMajor")?.let { arr ->
            for (i in 0 until arr.length()) labelMajorSet.add(arr.optString(i))
        }

        // 合并 periodDef.files 中所有政权的 features，注入配色与标签
        val features = JSONArray()
        periodDef.optJSONArray("files")?.let { files ->
            for (f in 0 until files.length()) {
                val data = readJson("geo/historical/${files.getString(f)}") ?: continue
                val dataFeatures = data.optJSONArray("features") ?: continue
                for (i in 0 until dataFeatures.length()) {
                    val feat = dataFeatures.getJSONObject(i)
                    val props = feat.optJSONObject("properties") ?: JSONObject()
                    val entity = props.optString("entity").ifEmpty { "未知政权" }
                    // 构造新对象（深拷贝，避免污染文件缓存——缓存跨请求复用）
                    val outProps = JSONObject(props.toString())
                    outProps.put("entity", entity)
                    outProps.put(
                        "color",
                        if (props.has("color") && !props.isNull("color")) props.getString("color")
                        else entityStyle[entity] ?: "#888888",
                    )
                    outProps.put(
                        "fillOpacity",
                        if (props.has("fillOpacity")) props.getDouble("fillOpacity") else 0.35,
                    )
                    outProps.put(
                        "labelCoord",
                        if (props.has("labelCoord") && !props.isNull("labelCoord")) props.getJSONArray("labelCoord")
                        else labels.optJSONArray(entity),
                    )
                    outProps.put(
                        "labelMajor",
                        if (props.has("labelMajor")) props.getBoolean("labelMajor")
                        else labelMajorSet.contains(entity),
                    )
                    features.put(JSONObject().apply {
                        put("type", feat.optString("type"))
                        put("geometry", feat.optJSONObject("geometry"))
                        put("properties", outProps)
                    })
                }
            }
        }

        // 标准化辅助地理数据优先（按 properties.periods 数组过滤时期）；
        // 缺失时回退 periods.json 内嵌数组（复刻 overlay.js readStandardFeatures）
        val standard = JSONArray()
        for (filename in standardGeoFiles) {
            val data = readJson("geo/historical/$filename") ?: continue
            val fts = data.optJSONArray("features") ?: continue
            for (i in 0 until fts.length()) {
                val f = fts.getJSONObject(i)
                val periodsProp = f.optJSONObject("properties")?.optJSONArray("periods")
                if (periodsProp == null || periodsProp.length() == 0 || contains(periodsProp, periodId)) {
                    standard.put(f)
                }
            }
        }
        // legacy 转换（复刻 geojson.js featureCollectionToLegacy）：
        // river → path=coordinates；其余点位类 kind 统一挂 coord
        val standardList = (0 until standard.length()).map { standard.getJSONObject(it) }
        val byKind = { kind: String ->
            standardList.filter { it.optJSONObject("properties")?.optString("kind") == kind }
        }
        val hasPlace = placeKinds.any { byKind(it).isNotEmpty() }

        val properties = JSONObject().apply {
            put("period", periodDef.optString("label"))
            put("year", periodDef.optInt("year"))
            put("_periodId", periodDef.optString("id"))
            // fallback 链：时期内嵌 → periods.json 顶层（对齐 overlay.js 的读法）
            put("rivers", pick(byKind("river")) { periodDef.optJSONArray("rivers") ?: periodsIndex.optJSONArray("rivers") })
            put("mountains", pick(byKind("mountain")) { periodDef.optJSONArray("mountains") ?: periodsIndex.optJSONArray("mountains") })
            put("cities", pick(byKind("city")) { periodDef.optJSONArray("cities") ?: periodsIndex.optJSONArray("cities") })
            put(
                "places",
                if (hasPlace) JSONArray(standardList.filter { placeKinds.contains(it.optJSONObject("properties")?.optString("kind")) }.map { toLegacy(it) })
                else periodDef.optJSONArray("places") ?: periodsIndex.optJSONArray("places") ?: JSONArray(),
            )
        }

        return JSONObject().apply {
            put("type", "FeatureCollection")
            put("features", features)
            put("properties", properties)
        }.toString()
    }

    /** 标准文件有该 kind 要素时用 legacy 列表，否则回退 periods.json 内嵌数组 */
    private inline fun pick(features: List<JSONObject>, fallback: () -> JSONArray?): JSONArray =
        if (features.isNotEmpty()) JSONArray(features.map { toLegacy(it) })
        else fallback() ?: JSONArray()

    /** legacy 转换（复刻 geojson.js featureCollectionToLegacy）：
     * river → path=coordinates；Point 类 → coord；LineString 山脊 → path + coord（首点标签） */
    private fun toLegacy(f: JSONObject): JSONObject {
        val props = JSONObject((f.optJSONObject("properties") ?: JSONObject()).toString())
        val geo = f.optJSONObject("geometry")
        val coords = geo?.opt("coordinates")
        if (props.optString("kind") == "river") props.put("path", coords)
        else if (geo?.optString("type") == "Point") props.put("coord", coords)
        else if (props.optString("kind") == "mountain" && geo?.optString("type") == "LineString") {
            props.put("path", coords)
            (coords as? JSONArray)?.let { if (it.length() > 0) props.put("coord", it.getJSONArray(0)) }
        }
        return props
    }

    /**
     * 由 periods.json 生成朝代 meta 的 periods 数组
     * （复刻 server/routes/meta.js：按 id 前缀过滤且须有 start/end，id 去掉朝代前缀）。
     */
    fun periodsForDynasty(dynasty: String): JSONArray {
        val out = JSONArray()
        periodsIndex.optJSONArray("periods")?.let { periods ->
            val prefix = "$dynasty-"
            for (i in 0 until periods.length()) {
                val p = periods.getJSONObject(i)
                val id = p.optString("id")
                if (id.startsWith(prefix) && p.has("start") && p.has("end")) {
                    out.put(JSONObject().apply {
                        put("id", id.removePrefix(prefix))
                        put("label", p.optString("label"))
                        put("start", p.optInt("start"))
                        put("end", p.optInt("end"))
                    })
                }
            }
        }
        return out
    }

    private fun contains(arr: JSONArray, value: String): Boolean {
        for (i in 0 until arr.length()) if (arr.optString(i) == value) return true
        return false
    }

    private fun readJson(assetPath: String): JSONObject? {
        fileCache[assetPath]?.let { return it }
        return try {
            val text = context.assets.open(assetPath)
                .bufferedReader(Charsets.UTF_8).use { it.readText() }
            JSONObject(text).also { fileCache[assetPath] = it }
        } catch (e: Exception) {
            null
        }
    }

    private fun emptyCollection(note: String): String = JSONObject().apply {
        put("type", "FeatureCollection")
        put("features", JSONArray())
        put("_note", note)
    }.toString()
}
