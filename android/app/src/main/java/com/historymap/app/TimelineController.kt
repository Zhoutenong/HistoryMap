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
 * 时间轴控制器：当前年份的唯一状态源（对齐 Web 版 Timeline.js 职责）。
 * - 自动播放：协程按 tickMs 逐年推进，到达 endYear 进入「播放完毕」状态
 * - 拖动/跳年：setYear 更新年份并退出「播放完毕」状态
 * - 事件窗口：可见事件由年份驱动（event.year <= year <= event.yearEnd）
 *
 * 用 remember + rememberCoroutineScope 在 Compose 内持有（Activity 已声明
 * configChanges，旋转不重建，无需 ViewModel 生命周期）。
 */
class TimelineController(
    val startYear: Int,
    val endYear: Int,
    private val events: List<EventEntity>,
    private val scope: CoroutineScope,
    tickMs: Long = 110,
    autoplay: Boolean = true,
    private val onYearChange: ((Int) -> Unit)? = null,
    private val onComplete: (() -> Unit)? = null,
) {
    // 私有状态 + 公开只读 getter：避免与 setYear() 的 JVM 签名冲突
    private var yearState by mutableStateOf(startYear)
    val year: Int get() = yearState
    var playing by mutableStateOf(false)
        private set
    var completed by mutableStateOf(false)
        private set

    private var job: Job? = null
    var tickMs: Long = tickMs
        private set

    init {
        if (autoplay) play()
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
        if (yearState >= endYear) {
            completed = false
            setYear(startYear)
        }
        playing = true
        job = scope.launch {
            while (isActive) {
                delay(tickMs)
                if (yearState >= endYear) {
                    playing = false
                    completed = true
                    onComplete?.invoke()
                    break
                }
                setYear(yearState + 1)
            }
        }
    }

    fun pause() {
        playing = false
        job?.cancel()
        job = null
    }

    fun toggle() = if (playing) pause() else play()

    fun setYear(y: Int) {
        val clamped = y.coerceIn(startYear, endYear)
        if (clamped == yearState) return
        completed = false // 手动拖动/跳年退出「播放完毕」状态
        yearState = clamped
        onYearChange?.invoke(yearState)
    }
    /** 当前年份窗口内的可见事件（按年份升序） */
    fun visibleEvents(): List<EventEntity> =
        events.filter { year in it.year..it.yearEnd }

    fun dispose() {
        job?.cancel()
        job = null
    }
}
