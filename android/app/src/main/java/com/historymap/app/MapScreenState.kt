// MapScreen state holders (A5 split): dynasty load result + bubble hit args snapshot.
package com.historymap.app

/**
 * 朝代加载结果（loadDynasty 一次性获取的数据）。
 */
internal data class DynastyLoadResult(
    val model: OverlayModel,
    val events: List<EventEntity>,
    val periods: List<PeriodInfo>,
    val initialPeriod: String,
    val json: String,
    /** 人物视角列表（P1；老库无 persons 表时为空） */
    val persons: List<PersonWithCount> = emptyList(),
)

/**
 * 时期切换加载结果（doEnsurePeriod / doEnsureAllPeriod 的 IO 块产出：
 * overlay 读盘 + 解析 + 纹理生成统一放 IO 线程，避免主线程阻塞）。
 */
internal data class PeriodSwitchResult(
    val model: OverlayModel,
    val json: String,
    /** 全时期模式下服务端算好的 _range 稳定区间（doEnsureAllPeriod 使用；单朝代切换为 null） */
    val range: Pair<Int, Int>? = null,
)

/**
 * 泡泡点击命中参数快照（组合期由 MapScreen 持续写入，GL touch listener 读取）。
 * 地图手势统一收口在 GLSurfaceView 后，泡泡 tap 检测也走 Android 手势链路。
 */
internal data class BubbleHitArgs(
    val events: List<EventEntity>,
    val labels: List<PlacedMapLabel>,
    val selectedId: Long?,
    val safeTop: Float,
    val safeBottom: Float,
    val density: Float,
    val onTap: (EventEntity) -> Unit,
    /** 治所标签点击（P4 州府考据卡片），参数为州府名 */
    val onPrefectureTap: (String) -> Unit = {},
)
