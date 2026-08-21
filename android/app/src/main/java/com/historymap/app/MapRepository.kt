package com.historymap.app

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * 历史地图数据仓储：原生端唯一数据入口（等价 Web 版 client/src/api.js 的职责）。
 * 数据源：
 * - 朝代/事件：Room（HistoryDb，首次建库重放 assets/seed 目录的 .sql 文件，与后端同源）
 * - 疆域叠加层/时期元信息：OverlayLoader（复刻 server/routes/overlay.js + meta.js）
 *
 * 输出与后端 /api 接口契约一致，渲染层与 UI 层只消费本类提供的数据模型。
 * 数据库查询一律走 IO 线程（Room 禁止主线程访问）。
 */
class MapRepository(private val context: Context) {

    private val db by lazy { HistoryDb.get(context) }
    private val overlayLoader by lazy { OverlayLoader(context) }

    /** 全部朝代（顶栏下拉数据源，按 start_year 升序） */
    suspend fun getDynasties(): List<DynastyEntity> = withContext(Dispatchers.IO) {
        db.dao().getDynasties()
    }

    /** 朝代全部事件（按年份升序；含 relatedPersons，等价 /api/events 契约） */
    suspend fun getEvents(dynasty: String): List<EventEntity> = withContext(Dispatchers.IO) {
        val events = db.dao().getEvents(dynasty)
        val byEvent = db.dao().getEventPersons(dynasty)
            .groupBy({ it.eventId }, { RelatedPerson(it.personId, it.name, it.title, it.role) })
        if (byEvent.isEmpty()) events
        else events.map { it.also { e -> e.relatedPersons = byEvent[e.id] ?: emptyList() } }
    }

    /** 朝代人物列表（人物视角，按关联事件数降序；等价 /api/persons 契约） */
    suspend fun getPersons(dynasty: String): List<PersonWithCount> = withContext(Dispatchers.IO) {
        db.dao().getPersonsWithCount(dynasty)
    }

    /** 朝代时期边界（来自 periods.json，等价 /api/meta 的 periods 字段） */
    fun getPeriods(dynasty: String): List<PeriodInfo> {
        val out = mutableListOf<PeriodInfo>()
        val arr = overlayLoader.periodsForDynasty(dynasty)
        for (i in 0 until arr.length()) {
            val p = arr.optJSONObject(i) ?: continue
            out.add(
                PeriodInfo(
                    id = p.optString("id"),
                    label = p.optString("label"),
                    start = p.optInt("start"),
                    end = p.optInt("end"),
                )
            )
        }
        return out
    }

    /** 朝代起始年份对应的初始时期（等价 Web 版 loadDynasty 的 initialPeriod 计算） */
    fun initialPeriod(dynasty: String, startYear: Int): String? {
        val periods = getPeriods(dynasty)
        return periods.firstOrNull { startYear in it.start..it.end }?.id
            ?: periods.firstOrNull()?.id
    }

    /** 疆域叠加层（等价 GET /api/map/overlay?dynasty=..&period=..） */
    fun getOverlay(dynasty: String, period: String): JSONObject =
        JSONObject(overlayLoader.getOverlay(dynasty, period))

    /** 全时期模式叠加层（P2，等价 GET /api/map/overlay/all?year=..） */
    fun getAllOverlay(year: Int): JSONObject =
        JSONObject(overlayLoader.getAllOverlay(year))

    /** 全时期叠加层 JSON 原文（水彩 CPU 缓存 key；与 getAllOverlay 同源） */
    fun getAllOverlayJson(year: Int): String =
        overlayLoader.getAllOverlay(year)

    /** 叠加层 JSON 原文（水彩 CPU 缓存 key；与 getOverlay 同源，避免重复解析） */
    fun getOverlayJson(dynasty: String, period: String): String =
        overlayLoader.getOverlay(dynasty, period)
}

/** 时期边界（id 已去朝代前缀，如 "1111"，与 Web 版 meta.periods 一致） */
data class PeriodInfo(
    val id: String,
    val label: String,
    val start: Int,
    val end: Int,
)
