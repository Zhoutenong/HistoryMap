package com.historymap.app

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * 时间轴控制器：当前「年·月」的唯一状态源（对齐 Web 版 Timeline.js 职责）。
 * - 自动播放：协程按 tickMs 逐月推进，到达 endYear·12 进入「播放完毕」状态
 * - 拖动/跳时：setTime 更新年份月份并退出「播放完毕」状态
 * - 事件窗口：可见事件由月粒度窗口驱动
 *   （mine(year,month) ∈ [mine(ev.year,ev.month), mine(ev.yearEnd,ev.monthEnd)]）
 *
 * 用 remember + rememberCoroutineScope 在 Compose 内持有（Activity 已声明
 * configChanges，旋转不重建，无需 ViewModel 生命周期）。
 */
class TimelineController(
    startYear: Int,
    endYear: Int,
    private val events: List<EventEntity>,
    private val scope: CoroutineScope,
    tickMs: Long = ContractTokens.SPEED_TICK_NORMAL,
    autoplay: Boolean = true,
    private val onTimeChange: ((Int, Int) -> Unit)? = null,
    private val onComplete: (() -> Unit)? = null,
) {
    // 私有状态 + 公开只读 getter：避免与 setYear()/setTime() 的 JVM 签名冲突
    private var yearState by mutableStateOf(startYear)
    private var monthState by mutableStateOf(1)
    val year: Int get() = yearState
    val month: Int get() = monthState
    var playing by mutableStateOf(false)
        private set
    var completed by mutableStateOf(false)
        private set

    // 边界改为可变状态（P2 全时期模式：时间轴范围在朝代并集 ↔ 单朝代间切换）
    var startYear by mutableStateOf(startYear)
        private set
    var endYear by mutableStateOf(endYear)
        private set

    private var job: Job? = null
    var tickMs: Long = tickMs
        private set

    init {
        if (autoplay) play()
    }

    /** 年+月 → 连续月份序号（换算收敛到 TimeIndex，与各 UI 层共用同一口径）。 */
    private fun mi(y: Int, m: Int) = TimeIndex.of(y, m)

    /** 结束时刻 = 结束年 12 月。 */
    private fun endIndex() = mi(endYear, 12)

    /** (year, month) clamp 到 [startYear·1, endYear·12]。 */
    private fun clamp(y: Int, m: Int): Pair<Int, Int> {
        val idx = mi(y, m).coerceIn(mi(startYear, 1), endIndex())
        return TimeIndex.yearOf(idx) to TimeIndex.monthOf(idx)
    }

    /** 更新时间轴范围（全时期模式切换用）：clamp 当前时间并退出「播放完毕」态 */
    fun setRange(start: Int, end: Int) {
        startYear = start
        endYear = end
        val cur = clamp(yearState, monthState)
        val currentIdx = mi(yearState, monthState)
        if (currentIdx !in mi(start, 1)..endIndex()) {
            completed = false
            yearState = cur.first
            monthState = cur.second
            onTimeChange?.invoke(yearState, monthState)
        } else if (currentIdx >= endIndex()) {
            completed = true
        }
    }

    /** 调整播放速度（播放中重建定时器，等价 Web 版 setTickMs） */
    fun setTickMs(ms: Long) {
        if (ms == tickMs) return
        tickMs = ms
        if (playing) {
            pause()
            play()
        }
    }

    /** 播放/重新播放（播放完毕时从头开始） */
    fun play() {
        if (playing) return
        if (mi(yearState, monthState) >= endIndex() && endYear > startYear) {
            completed = false
            setTime(startYear, 1)
        }
        playing = true
        job = scope.launch {
            while (isActive) {
                delay(tickMs)
                if (mi(yearState, monthState) >= endIndex()) {
                    playing = false
                    completed = true
                    onComplete?.invoke()
                    break
                }
                val next = if (monthState >= 12) (yearState + 1) to 1 else yearState to (monthState + 1)
                setTime(next.first, next.second)
            }
        }
    }

    fun pause() {
        playing = false
        job?.cancel()
        job = null
    }

    fun toggle() = if (playing) pause() else play()

    /** 兼容旧签名：只跳转到某年（1 月）。内部优先 setTime(year, month)。 */
    fun setYear(y: Int) = setTime(y, 1)

    /** 设置当前时间到 (year, month)，clamp 到 [start·1, end·12]。 */
    fun setTime(y: Int, m: Int) {
        val cl = clamp(y, m)
        if (mi(cl.first, cl.second) == mi(yearState, monthState)) return
        completed = false // 手动拖动/跳时退出「播放完毕」状态
        yearState = cl.first
        monthState = cl.second
        onTimeChange?.invoke(yearState, monthState)
    }

    /** 当前时间窗口内的可见事件（按时间升序） */
    fun visibleEvents(): List<EventEntity> =
        events.filter {
            val t = mi(yearState, monthState)
            t in mi(it.year, it.month)..mi(it.yearEnd, it.monthEnd)
        }.sortedBy { mi(it.year, it.month) }

    fun dispose() {
        job?.cancel()
        job = null
    }
}
