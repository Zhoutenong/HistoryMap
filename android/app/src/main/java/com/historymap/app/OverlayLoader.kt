package com.historymap.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

/**
 * 历史疆域叠加层合并纯函数：逐行复刻 server/data/geo/historical/overlay-merge.js
 * （GET /api/map/overlay 的响应构造逻辑），输出 JSON 与服务端完全一致。
 *
 * 双端一致性由 golden 契约测试守护（docs/architecture/codebase-review-plan.md A2 第一步）：
 * OverlayMergeGoldenTest 用 contract/golden/overlay-merge.{fixture,expected}.json
 * 与服务端参考实现共用的同一份期望值做断言——本文件语义漂移测试即红。
 * 本对象不触碰 Context/fs，可做纯 JVM 单测。
 */
object OverlayMerge {

    /** 标准辅助地理文件清单（与 overlay-merge.js STANDARD_GEO_FILES 一致，含南宋路治点文件） */
    val STANDARD_GEO_FILES = listOf(
        "rivers.geojson", "mountains.geojson", "cities.geojson", "places.geojson",
        "prefectures.geojson", "southern-song-routes.geojson",
    )

    /** 地点类要素 kind 白名单：都城/战场/书院等归入响应顶层 properties.places。
     *  数值来自契约 ContractTokens（与 Web TerritoryOverlay.js / server overlay-merge.js 同源）。 */
    val PLACE_KINDS: Set<String> = ContractTokens.PLACE_KINDS

    /**
     * 构造 overlay 响应。
     * @param periodsIndex periods.json 解析结果（null = 索引缺失）
     * @param readFile 读取 historical 目录下指定文件的解析结果；缺失/损坏返回 null
     */
    fun buildOverlay(
        periodsIndex: JSONObject?,
        dynasty: String,
        period: String,
        readFile: (String) -> JSONObject?,
    ): JSONObject {
        if (periodsIndex == null) return emptyCollection("索引文件未找到")
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
        // 政权名标签位：labels 全局人工标定；labelsByPeriod 按时期覆写（优先于全局）；
        // labelMajor 标识主叙事政权。优先级：feature 自带 > 时期覆写 > 全局 > NULL。
        val labels = periodsIndex.optJSONObject("labels") ?: JSONObject()
        val labelsByPeriod = periodsIndex.optJSONObject("labelsByPeriod")
            ?.optJSONObject(periodDef.optString("id")) ?: JSONObject()
        val labelMajorSet = mutableSetOf<String>()
        periodsIndex.optJSONArray("labelMajor")?.let { arr ->
            for (i in 0 until arr.length()) labelMajorSet.add(arr.optString(i))
        }

        // 合并 periodDef.files 中所有政权的 features，注入配色与标签
        val features = JSONArray()
        periodDef.optJSONArray("files")?.let { files ->
            for (f in 0 until files.length()) {
                val data = readFile(files.getString(f)) ?: continue
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
                        if (props.has("fillOpacity") && !props.isNull("fillOpacity")) props.getDouble("fillOpacity") else 0.35,
                    )
                    outProps.put(
                        "labelCoord",
                        if (props.has("labelCoord") && !props.isNull("labelCoord")) props.getJSONArray("labelCoord")
                        else labelsByPeriod.optJSONArray(entity) ?: labels.optJSONArray(entity) ?: JSONObject.NULL,
                    )
                    outProps.put(
                        "labelMajor",
                        if (props.has("labelMajor") && !props.isNull("labelMajor")) props.getBoolean("labelMajor")
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
        // 缺失时回退 periods.json 内嵌数组（复刻 overlay-merge.js readStandardFeatures）
        val standard = JSONArray()
        for (filename in STANDARD_GEO_FILES) {
            val data = readFile(filename) ?: continue
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
        val hasPlace = PLACE_KINDS.any { byKind(it).isNotEmpty() }

        val properties = JSONObject().apply {
            put("period", periodDef.optString("label"))
            put("year", periodDef.optInt("year"))
            put("_periodId", periodDef.optString("id"))
            // fallback 链：时期内嵌 → periods.json 顶层；回退条目补 kind（对齐 overlay-merge.js）
            put("rivers", pick(byKind("river"), "river") { periodDef.optJSONArray("rivers") ?: periodsIndex.optJSONArray("rivers") })
            put("mountains", pick(byKind("mountain"), "mountain") { periodDef.optJSONArray("mountains") ?: periodsIndex.optJSONArray("mountains") })
            put("cities", pick(byKind("city"), "city") { periodDef.optJSONArray("cities") ?: periodsIndex.optJSONArray("cities") })
            put(
                "places",
                if (hasPlace) JSONArray(standardList.filter { PLACE_KINDS.contains(it.optJSONObject("properties")?.optString("kind")) }.map { toLegacy(it) })
                else fallbackArray({ periodDef.optJSONArray("places") ?: periodsIndex.optJSONArray("places") }, "capital"),
            )
            // 州府级（元丰九域志基准，对齐 overlay-merge.js）：
            // prefectures 面**保留完整 feature**（geometry 供渲染，不走 toLegacy 剥 geometry 通道）；
            // prefectureSeats 治所点走 legacy（coord 供 Compose 标签层）
            put("prefectures", JSONArray(byKind("prefecture")))
            put(
                "prefectureSeats",
                if (byKind("prefecture-seat").isNotEmpty()) JSONArray(byKind("prefecture-seat").map { toLegacy(it) })
                else JSONArray(),
            )
        }

        return JSONObject().apply {
            put("type", "FeatureCollection")
            put("features", features)
            put("properties", properties)
        }
    }

    /**
     * 构造「全时期模式」响应（P2，复刻 overlay-merge.js buildAllPeriodsOverlay）：
     * 给定年份返回当时全部政权。文件去重合并、labelsByPeriod 按命中时期顺序合并、
     * 辅助层按命中集合交集过滤；properties 额外带 _matchedPeriods 与 _range
     * （命中集合稳定区间，客户端据此节流重取）。
     */
    fun buildAllPeriodsOverlay(
        periodsIndex: JSONObject?,
        year: Int,
        readFile: (String) -> JSONObject?,
    ): JSONObject {
        if (periodsIndex == null) return emptyCollection("索引文件未找到")
        val allPeriods = periodsIndex.optJSONArray("periods") ?: JSONArray()
        val matched = (0 until allPeriods.length())
            .map { allPeriods.getJSONObject(it) }
            .filter { it.has("start") && it.has("end") && year in it.optInt("start")..it.optInt("end") }

        // 命中集合稳定的年份区间：所有时期边界点（start 与 end+1）中，包含 year 的相邻段
        val boundaries = sortedSetOf<Int>()
        for (i in 0 until allPeriods.length()) {
            val p = allPeriods.getJSONObject(i)
            if (p.has("start") && p.has("end")) {
                boundaries.add(p.optInt("start"))
                boundaries.add(p.optInt("end") + 1)
            }
        }
        var rangeStart = Int.MIN_VALUE
        var rangeEnd = Int.MAX_VALUE
        boundaries.forEach { b ->
            if (b <= year) rangeStart = maxOf(rangeStart, b)
            else rangeEnd = minOf(rangeEnd, b - 1)
        }

        val entityStyle = mutableMapOf<String, String>()
        periodsIndex.optJSONArray("entities")?.let { entities ->
            for (i in 0 until entities.length()) {
                val e = entities.getJSONObject(i)
                entityStyle[e.optString("name")] = e.optString("color")
            }
        }
        val labels = periodsIndex.optJSONObject("labels") ?: JSONObject()
        // labelsByPeriod：按命中时期顺序合并（先命中者优先）
        val labelsByPeriod = JSONObject()
        matched.forEach { p ->
            periodsIndex.optJSONObject("labelsByPeriod")?.optJSONObject(p.optString("id"))?.let { per ->
                for (key in per.keys()) if (!labelsByPeriod.has(key)) labelsByPeriod.put(key, per.get(key))
            }
        }
        val labelMajorSet = mutableSetOf<String>()
        periodsIndex.optJSONArray("labelMajor")?.let { arr ->
            for (i in 0 until arr.length()) labelMajorSet.add(arr.optString(i))
        }

        // 文件去重：同一文件可能被多个命中时期引用，只装载一次
        val files = mutableListOf<String>()
        val seen = mutableSetOf<String>()
        matched.forEach { p ->
            p.optJSONArray("files")?.let { fs ->
                for (i in 0 until fs.length()) {
                    val f = fs.getString(i)
                    if (seen.add(f)) files.add(f)
                }
            }
        }

        val features = JSONArray()
        files.forEach { filename ->
            val data = readFile(filename) ?: return@forEach
            val dataFeatures = data.optJSONArray("features") ?: return@forEach
            for (i in 0 until dataFeatures.length()) {
                val feat = dataFeatures.getJSONObject(i)
                val props = feat.optJSONObject("properties") ?: JSONObject()
                val entity = props.optString("entity").ifEmpty { "未知政权" }
                val outProps = JSONObject(props.toString())
                outProps.put("entity", entity)
                outProps.put(
                    "color",
                    if (props.has("color") && !props.isNull("color")) props.getString("color")
                    else entityStyle[entity] ?: "#888888",
                )
                outProps.put(
                    "fillOpacity",
                    if (props.has("fillOpacity") && !props.isNull("fillOpacity")) props.getDouble("fillOpacity") else 0.35,
                )
                outProps.put(
                    "labelCoord",
                    if (props.has("labelCoord") && !props.isNull("labelCoord")) props.getJSONArray("labelCoord")
                    else labelsByPeriod.optJSONArray(entity) ?: labels.optJSONArray(entity) ?: JSONObject.NULL,
                )
                outProps.put(
                    "labelMajor",
                    if (props.has("labelMajor") && !props.isNull("labelMajor")) props.getBoolean("labelMajor")
                    else labelMajorSet.contains(entity),
                )
                features.put(JSONObject().apply {
                    put("type", feat.optString("type"))
                    put("geometry", feat.optJSONObject("geometry"))
                    put("properties", outProps)
                })
            }
        }

        // 辅助层：periods 数组与命中集合有交集（或为空）即保留
        val matchedIds = matched.map { it.optString("id") }.toSet()
        val standard = JSONArray()
        for (filename in STANDARD_GEO_FILES) {
            val data = readFile(filename) ?: continue
            val fts = data.optJSONArray("features") ?: continue
            for (i in 0 until fts.length()) {
                val f = fts.getJSONObject(i)
                val periodsProp = f.optJSONObject("properties")?.optJSONArray("periods")
                val keep = periodsProp == null || periodsProp.length() == 0 ||
                    (0 until periodsProp.length()).any { matchedIds.contains(periodsProp.optString(it)) }
                if (keep) standard.put(f)
            }
        }
        val standardList = (0 until standard.length()).map { standard.getJSONObject(it) }
        val byKind = { kind: String ->
            standardList.filter { it.optJSONObject("properties")?.optString("kind") == kind }
        }

        val properties = JSONObject().apply {
            put("period", "$year 年 · 全时期")
            put("year", year)
            put("_periodId", "all-$year")
            put("_matchedPeriods", JSONArray(matched.map { it.optString("id") }))
            put("_range", JSONArray().put(if (rangeStart != Int.MIN_VALUE) rangeStart else year)
                .put(if (rangeEnd != Int.MAX_VALUE) rangeEnd else year))
            put("rivers", JSONArray(byKind("river").map { toLegacy(it) }))
            put("mountains", JSONArray(byKind("mountain").map { toLegacy(it) }))
            put("cities", JSONArray(byKind("city").map { toLegacy(it) }))
            put("places", JSONArray(standardList.filter { PLACE_KINDS.contains(it.optJSONObject("properties")?.optString("kind")) }.map { toLegacy(it) }))
            put("prefectures", JSONArray(byKind("prefecture")))
            put("prefectureSeats", JSONArray(byKind("prefecture-seat").map { toLegacy(it) }))
        }

        return JSONObject().apply {
            put("type", "FeatureCollection")
            put("features", features)
            put("properties", properties)
        }
    }

    /**
     * 由 periods.json 生成朝代 meta 的 periods 数组
     * （复刻 server/routes/meta.js：按 id 前缀过滤且须有 start/end，id 去掉朝代前缀）。
     */
    fun periodsForDynasty(periodsIndex: JSONObject?, dynasty: String): JSONArray {
        val out = JSONArray()
        periodsIndex?.optJSONArray("periods")?.let { periods ->
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

    /** 标准文件有该 kind 要素时用 legacy 列表，否则回退 periods.json 内嵌数组并补 kind
     *  （JS 侧写法 `{kind, ...entry}`：entry 自带 kind 时以 entry 为准） */
    private fun pick(features: List<JSONObject>, kind: String, fallback: () -> JSONArray?): JSONArray =
        if (features.isNotEmpty()) JSONArray(features.map { toLegacy(it) })
        else fallbackArray(fallback, kind)

    private fun fallbackArray(fallback: () -> JSONArray?, kind: String): JSONArray {
        val src = fallback() ?: return JSONArray()
        val out = JSONArray()
        for (i in 0 until src.length()) {
            val entry = src.getJSONObject(i)
            out.put(JSONObject(entry.toString()).apply { if (!has("kind")) put("kind", kind) })
        }
        return out
    }

    /** legacy 转换（复刻 geojson.js featureCollectionToLegacy）：
     * river → path=coordinates；Point 类 → coord；LineString 山脊 → path + coord（首点标签） */
    private fun toLegacy(f: JSONObject): JSONObject {
        val props = JSONObject((f.optJSONObject("properties") ?: JSONObject()).toString())
        val geo = f.optJSONObject("geometry")
        val coords = geo?.opt("coordinates")
        if (props.optString("kind") == "river") props.put("path", coords ?: JSONObject.NULL)
        else if (geo?.optString("type") == "Point") props.put("coord", coords ?: JSONObject.NULL)
        else if (props.optString("kind") == "mountain" && geo?.optString("type") == "LineString") {
            props.put("path", coords ?: JSONObject.NULL)
            (coords as? JSONArray)?.let { if (it.length() > 0) props.put("coord", it.getJSONArray(0)) }
        }
        return props
    }

    private fun contains(arr: JSONArray, value: String): Boolean {
        for (i in 0 until arr.length()) if (arr.optString(i) == value) return true
        return false
    }

    private fun emptyCollection(note: String): JSONObject = JSONObject().apply {
        put("type", "FeatureCollection")
        put("features", JSONArray())
        put("_note", note)
    }
}

/**
 * assets 版加载器：OverlayMerge 纯逻辑 + assets 文件缓存。
 * 数据源：assets/geo/historical/ 下由 scripts/prepare-android.mjs 同步的原始文件
 * （periods.json 索引 + regimes-*.json 等 + 辅助 geojson），与后端共用同一份数据文件。
 */
class OverlayLoader(private val context: Context) {

    private val fileCache = ConcurrentHashMap<String, JSONObject>()

    private val periodsIndex: JSONObject by lazy {
        readJson("geo/historical/periods.json") ?: JSONObject()
    }

    fun getOverlay(dynasty: String, period: String): String =
        OverlayMerge.buildOverlay(periodsIndex, dynasty, period) { name ->
            readJson("geo/historical/$name")
        }.toString()

    /** 全时期模式叠加层（P2）：给定年份返回当时全部政权 */
    fun getAllOverlay(year: Int): String =
        OverlayMerge.buildAllPeriodsOverlay(periodsIndex, year) { name ->
            readJson("geo/historical/$name")
        }.toString()

    fun periodsForDynasty(dynasty: String): JSONArray =
        OverlayMerge.periodsForDynasty(periodsIndex, dynasty)

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
}
