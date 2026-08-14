package com.historymap.app

import android.content.Context
import android.util.Log
import android.webkit.JavascriptInterface
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors

/**
 * WebView JavaScript bridge：对 window.AndroidAPI 暴露 5 个同步方法，
 * 返回与后端 /api/ 接口完全一致的 JSON 契约（见 server/routes/）。
 *
 * 线程模型：init() 在后台线程预载朝代/事件/元信息到内存缓存；
 * bridge 调用先 awaitReady()（CountDownLatch 提供内存屏障），
 * 再读缓存——bridge 调用零阻塞。现代底图与疆域叠加层懒加载缓存。
 */
object ApiBridge {

    private const val TAG = "HistoryMapBridge"

    private var appContext: Context? = null
    private var db: HistoryDb? = null
    private var geo: OverlayLoader? = null

    private val ready = CountDownLatch(1)

    private val dynastiesJson = JSONArray()
    private val metaJson = ConcurrentHashMap<String, String>()
    private val eventsJson = ConcurrentHashMap<String, String>()
    private val overlayJson = ConcurrentHashMap<String, String>()
    private val mapJson = arrayOfNulls<String>(1)

    private val executor = Executors.newSingleThreadExecutor()

    /** 由 MainActivity 在 loadUrl 前调用；后台线程预载小数据 */
    fun init(context: Context) {
        if (db != null) return
        appContext = context.applicationContext
        db = HistoryDb.get(appContext!!)
        geo = OverlayLoader(appContext!!)
        executor.execute {
            try {
                preload()
            } catch (t: Throwable) {
                Log.e(TAG, "预载失败", t)
            } finally {
                ready.countDown()
            }
        }
    }

    private fun preload() {
        val dao = db!!.dao()
        // 朝代列表 + 各朝代 meta（periods 来自 periods.json）与事件
        dao.getDynasties().forEach { d ->
            dynastiesJson.put(JSONObject().apply {
                put("id", d.id)
                put("name", d.name)
                put("startYear", d.startYear)
                put("endYear", d.endYear)
            })
            metaJson[d.id] = buildMeta(d).toString()
            eventsJson[d.id] = buildEvents(dao.getEvents(d.id)).toString()
        }
    }

    private fun buildMeta(d: DynastyEntity): JSONObject = JSONObject().apply {
        put("dynasty", d.id)
        put("name", d.name)
        put("startYear", d.startYear)
        put("endYear", d.endYear)
        put("periods", geo!!.periodsForDynasty(d.id))
    }

    private fun buildEvents(events: List<EventEntity>): JSONArray {
        val arr = JSONArray()
        events.forEach { e ->
            arr.put(JSONObject().apply {
                put("id", e.id)
                put("dynasty", e.dynastyId)
                put("year", e.year)
                put("yearEnd", e.yearEnd)
                put("coord", JSONArray().apply { put(e.lng); put(e.lat) })
                put("short", e.short)
                put("title", e.title)
                put("detail", e.detail)
                put("impact", e.impact)
                put("place", e.place)
                put("category", e.category)
            })
        }
        return arr
    }

    private fun awaitReady() {
        try {
            ready.await()
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
        }
    }

    @JavascriptInterface
    fun getDynasties(): String {
        awaitReady()
        return dynastiesJson.toString()
    }

    @JavascriptInterface
    fun getMeta(dynasty: String): String {
        awaitReady()
        return metaJson[dynasty] ?: throw RuntimeException("未知名朝代: $dynasty")
    }

    @JavascriptInterface
    fun getEvents(dynasty: String): String {
        awaitReady()
        return eventsJson[dynasty] ?: throw RuntimeException("未知名朝代: $dynasty")
    }

    @JavascriptInterface
    fun getMap(): String {
        awaitReady()
        mapJson[0]?.let { return it }
        return synchronized(mapJson) {
            mapJson[0] ?: run {
                // 懒加载：现代底图 GeoJSON 较大，首次访问时读取并缓存（原样返回）
                val text = try {
                    appContext!!.assets.open("geo/china.json")
                        .bufferedReader(Charsets.UTF_8).use { it.readText() }
                } catch (e: Exception) {
                    Log.e(TAG, "读取底图失败", e)
                    "{\"type\":\"FeatureCollection\",\"features\":[]}"
                }
                mapJson[0] = text
                text
            }
        }
    }

    @JavascriptInterface
    fun getOverlay(dynasty: String, period: String): String {
        awaitReady()
        val key = "$dynasty-$period"
        overlayJson[key]?.let { return it }
        return synchronized(overlayJson) {
            overlayJson[key] ?: run {
                val json = try {
                    geo!!.getOverlay(dynasty, period)
                } catch (e: Exception) {
                    Log.e(TAG, "生成叠加层失败: $key", e)
                    "{\"type\":\"FeatureCollection\",\"features\":[],\"_note\":\"生成失败\"}"
                }
                overlayJson[key] = json
                json
            }
        }
    }
}
