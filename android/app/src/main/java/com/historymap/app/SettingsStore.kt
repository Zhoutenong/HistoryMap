package com.historymap.app

import android.content.Context
import android.content.SharedPreferences

/**
 * 设置持久化（SharedPreferences，对齐 Web 版 settings/store.js 的 localStorage 语义）。
 * 字段：事件分类 / 播放速度 / 图层显隐。重启后保持。
 */
object SettingsStore {

    private const val PREFS = "historymap.settings.v1"

    /** 事件分类定义（与 Web 版 store.js CATEGORIES 一致） */
    val CATEGORY_DEFS = listOf(
        "era" to "时代格局",
        "figure" to "名人轨迹",
        "military" to "军事·领土",
        "economy" to "经济变革",
        "invention" to "重要发明",
    )

    data class Settings(
        val categories: List<String>,
        val speed: String,           // slow / normal / fast
        val showTerritory: Boolean,
        val showRivers: Boolean,
    )

    fun defaults() = Settings(
        categories = listOf("era", "military"),
        speed = "normal",
        showTerritory = true,
        showRivers = true,
    )

    fun load(context: Context): Settings {
        val prefs = prefs(context)
        val cats = prefs.getString("categories", null)
            ?.split(",")
            ?.filter { id -> CATEGORY_DEFS.any { it.first == id } }
        val speed = prefs.getString("speed", "normal")
        return Settings(
            categories = cats?.takeIf { it.isNotEmpty() } ?: defaults().categories,
            speed = if (speed in listOf("slow", "normal", "fast")) speed!! else "normal",
            showTerritory = prefs.getBoolean("showTerritory", true),
            showRivers = prefs.getBoolean("showRivers", true),
        )
    }

    fun save(context: Context, settings: Settings) {
        prefs(context).edit()
            .putString("categories", settings.categories.joinToString(","))
            .putString("speed", settings.speed)
            .putBoolean("showTerritory", settings.showTerritory)
            .putBoolean("showRivers", settings.showRivers)
            .apply()
    }

    private fun prefs(context: Context): SharedPreferences =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
