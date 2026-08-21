package com.historymap.app

import android.content.Context
import android.content.SharedPreferences

/**
 * 设置持久化（SharedPreferences，对齐 Web 版 settings/store.js 的 localStorage 语义）。
 * 字段：事件分类 / 播放速度 / 图层显隐。重启后保持。
 */
object SettingsStore {

    private const val PREFS = "historymap.settings.v1"

    /** 事件分类定义（id→全称；数值来自契约 ContractTokens，与 Web 版 store.js 同源） */
    val CATEGORY_DEFS: List<Pair<String, String>> =
        ContractTokens.CATEGORIES.map { it.id to it.label }

    data class Settings(
        val categories: List<String>,
        val speed: String,           // slow / normal / fast
        val showTerritory: Boolean,
        val showRivers: Boolean,
        val showPrefectures: Boolean, // 州府边界描边（独立通道，L2+ 档位才可见）
        val showSeats: Boolean,        // 州府/路治治所标注
    )

    fun defaults() = Settings(
        categories = listOf("era", "military"),
        speed = "normal",
        showTerritory = true,
        showRivers = true,
        showPrefectures = true,
        showSeats = true,
    )

    fun load(context: Context): Settings {
        val prefs = prefs(context)
        val cats = prefs.getString("categories", null)
            ?.split(",")
            ?.filter { id -> CATEGORY_DEFS.any { it.first == id } }
        val speed = prefs.getString("speed", "normal")
        return Settings(
            categories = cats?.takeIf { it.isNotEmpty() } ?: defaults().categories,
            speed = if (speed in ContractTokens.SPEED_IDS) speed!! else "normal",
            showTerritory = prefs.getBoolean("showTerritory", true),
            showRivers = prefs.getBoolean("showRivers", true),
            showPrefectures = prefs.getBoolean("showPrefectures", true),
            showSeats = prefs.getBoolean("showSeats", true),
        )
    }

    fun save(context: Context, settings: Settings) {
        prefs(context).edit()
            .putString("categories", settings.categories.joinToString(","))
            .putString("speed", settings.speed)
            .putBoolean("showTerritory", settings.showTerritory)
            .putBoolean("showRivers", settings.showRivers)
            .putBoolean("showPrefectures", settings.showPrefectures)
            .putBoolean("showSeats", settings.showSeats)
            .apply()
    }

    private fun prefs(context: Context): SharedPreferences =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
