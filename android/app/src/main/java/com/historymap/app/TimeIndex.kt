package com.historymap.app

/**
 * 月粒度时间序号（对齐 Web client/src/timeline/calc.js 的 monthIndex / yearMonthFromIndex）。
 * 时间轴推进、事件显示窗口、事件流定位、泡泡碰撞优先级统一经它换算：
 * idx = year*12 + (month-1)，month ∈ 1..12（非法值兜底 1）。
 */
object TimeIndex {

    /** 年+月 → 连续月份序号（0 起）。 */
    fun of(year: Int, month: Int): Int = year * 12 + (month - 1).coerceIn(0, 11)

    /** 序号 → 年。 */
    fun yearOf(idx: Int): Int = idx / 12

    /** 序号 → 月（1-12）。 */
    fun monthOf(idx: Int): Int = idx % 12 + 1
}
