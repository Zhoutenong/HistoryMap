package com.historymap.app

import android.opengl.GLSurfaceView
import android.graphics.Typeface
import android.util.Log
import org.json.JSONObject
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.draw.alpha
import androidx.activity.compose.BackHandler
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.viewinterop.AndroidView
import kotlin.math.roundToInt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver

/**
 * 地图主界面：顶栏（朝代下拉） + 地图（GLSurfaceView） + 标注层 +
 * 事件泡泡层 + 底部时间轴 + 图例 + 详情面板（应用内底部抽屉）。
 *
 * 数据流：MapRepository → OverlayParser → MapRenderer（渲染/标注）；
 * TimelineController 是「当前年份」唯一状态源，泡泡层/水印/时期切换订阅它。
 */
@Composable
fun MapScreen() {
    val context = LocalContext.current
    // 横屏判定（顶栏/图例/标签密度按朝向适配，见后续 isLandscape 分支）
    val configuration = LocalConfiguration.current
    val isLandscape = configuration.screenWidthDp > configuration.screenHeightDp
    // P2-字体：初始化打包的 Noto Serif SC Canvas Typeface（Compose 侧 FontFamily 直接引用 res/font）
    remember { MapFonts.init(context.applicationContext) }
    val repo = remember { MapRepository(context.applicationContext) }
    val renderer = remember { MapRenderer(context.applicationContext) }
    val scope = rememberCoroutineScope()

    // —— 状态 ——
    var dynasties by remember { mutableStateOf(emptyList<DynastyEntity>()) }
    // currentDynasty 用普通 remember（每次 Activity 重建回到 ""，让 timeline 延迟到
    // events 加载后才创建，避免空 events）；要跨进程恢复的朝代 id 用独立的 restoredDynasty
    var currentDynasty by remember { mutableStateOf("") }
    // 跨进程/Activity 重建恢复的朝代 id（rememberSaveable；首次为 null → 默认 song）
    var restoredDynasty by rememberSaveable { mutableStateOf<String?>(null) }
    // 跨进程恢复的年份（持续写入；timeline 重建后 setYear 回它）。-1 表示无恢复值
    var restoreYear by rememberSaveable { mutableStateOf(-1) }
    var dynastyName by remember { mutableStateOf("") }
    var menuOpen by remember { mutableStateOf(false) }
    // 朝代按钮的屏幕位置（内嵌下拉菜单定位用；Popup 会触发系统栏闪现，故不用 DropdownMenu）
    var dynastyBtnPos by remember { mutableStateOf(IntOffset(0, 0)) }
    var dynastyBtnHeight by remember { mutableStateOf(0) }
    // 当前朝代的时间轴实例引用（朝代切换时 dispose 旧协程，避免后台继续播放）
    var timelineRef by remember { mutableStateOf<TimelineController?>(null) }
    // 朝代代际计数：朝代切换后，旧朝代发起的时期切换协程作废（防止覆盖新朝代状态）
    var dynastyGen by remember { mutableStateOf(0) }
    var events by remember { mutableStateOf(emptyList<EventEntity>()) }
    var dynastyStart by remember { mutableStateOf(960) }
    var dynastyEnd by remember { mutableStateOf(1279) }
    var selectedEvent by remember { mutableStateOf<EventEntity?>(null) }
    // 时期（跨年重载疆域）与事件流
    var periods by remember { mutableStateOf(emptyList<PeriodInfo>()) }
    var currentPeriodId by remember { mutableStateOf("") }
    var periodBanner by remember { mutableStateOf<String?>(null) }
    // 正在加载的时期 id：异步加载完成前阻止重复触发同一时期切换（竞态防护）
    var periodLoading by remember { mutableStateOf<String?>(null) }
    var seenEvents by remember { mutableStateOf(emptyList<EventEntity>()) }
    var logOpen by remember { mutableStateOf(false) }
    var prevYear by remember { mutableStateOf<Int?>(null) }
    // 人物视角（P1）：当前朝代人物列表 + 选中过滤（会话级，不持久化；朝代切换重置）
    var persons by remember { mutableStateOf(emptyList<PersonWithCount>()) }
    var personFilterId by remember { mutableStateOf<Long?>(null) }
    // 州府考据卡片（P4）：治所标签点击打开，数据随 GeoJSON 要素属性走（不依赖时空库）
    var selectedPrefecture by remember { mutableStateOf<PrefecturePolygon?>(null) }
    // 设置（M5b：分类/速度/图层显隐；SharedPreferences 持久化，重启保持）
    var settingsOpen by remember { mutableStateOf(false) }
    var activeCategories by remember { mutableStateOf(SettingsStore.defaults().categories) }
    var playSpeed by remember { mutableStateOf("normal") }
    var showTerritory by remember { mutableStateOf(true) }
    var showRivers by remember { mutableStateOf(true) }
    var showPrefectures by remember { mutableStateOf(true) }
    var showSeats by remember { mutableStateOf(true) }
    var legendCollapsed by remember { mutableStateOf(true) } // 手机端图例默认折叠

    // 设置持久化：初始读 + 变更写（等价 Web 版 settings/store.js）
    LaunchedEffect(Unit) {
        val s = SettingsStore.load(context.applicationContext)
        activeCategories = s.categories
        playSpeed = s.speed
        showTerritory = s.showTerritory
        showRivers = s.showRivers
        showPrefectures = s.showPrefectures
        showSeats = s.showSeats
        renderer.showTerritory = s.showTerritory
        renderer.showWatercolor = s.showTerritory
        renderer.showRivers = s.showRivers
        renderer.showPrefectures = s.showPrefectures
    }
    fun persistSettings() {
        SettingsStore.save(
            context.applicationContext,
            SettingsStore.Settings(activeCategories, playSpeed, showTerritory, showRivers, showPrefectures, showSeats),
        )
    }

    // 地图内容/相机变化计数：驱动标签屏幕布局重算（renderer.labels 是普通属性，
    // 需以 revision 形式进入 Compose 观察）
    var layoutRevision by remember { mutableIntStateOf(0) }

    // 图例数据（政权配色）：renderer.regimeColors 是普通属性，setOverlay 后
    // 不会触发 Compose 重组，需镜像为状态驱动 LegendPanel 刷新。
    var regimeColors by remember { mutableStateOf(emptyList<Pair<String, FloatArray>>()) }

    fun loadDynasty(id: String) {
        val dynasty = dynasties.firstOrNull { it.id == id } ?: return
        // 朝代代际 +1：旧朝代发起的时期切换协程在完成后将被丢弃
        dynastyGen++
        val gen = dynastyGen
        scope.launch {
            val t0 = System.nanoTime()
            val data = withContext(Dispatchers.IO) {
                val period = repo.initialPeriod(id, dynasty.startYear) ?: "1111"
                val json = repo.getOverlayJson(id, period)
                DynastyLoadResult(
                    model = OverlayParser.parse(JSONObject(json)),
                    events = repo.getEvents(id),
                    persons = repo.getPersons(id),
                    periods = repo.getPeriods(id),
                    initialPeriod = period,
                    json = json,
                )
            }
            // 朝代已切换：本次 IO 结果作废（防止旧朝代 overlay 覆盖新朝代状态）
            if (gen != dynastyGen) return@launch
            // 数据装配（投影/标签/图例/取景，主线程状态）
            renderer.setOverlay(data.model, calibrate = true, cacheKey = data.json)
            currentDynasty = id
            restoredDynasty = id // 持久化当前朝代 id（进程恢复/Activity 重建后回到本朝代）
            dynastyName = dynasty.name
            events = data.events
            persons = data.persons
            personFilterId = null
            dynastyStart = dynasty.startYear
            dynastyEnd = dynasty.endYear
            periods = data.periods
            currentPeriodId = data.initialPeriod
            periodLoading = null
            periodBanner = null // 朝代切换：清掉旧朝代时期横幅，由新流程按需重建
            regimeColors = renderer.regimeColors
            layoutRevision++
            seenEvents = emptyList()
            prevYear = null
            // P3：水彩/山水纹理 CPU 生成放 IO 线程，不阻塞主线程
            val density = context.resources.displayMetrics.density
            val (wc, terr) = withContext(Dispatchers.IO) {
                renderer.buildTextures(data.model, data.json, density)
            }
            // 纹理生成期间朝代可能再次切换：旧朝代纹理不再挂接
            if (gen != dynastyGen) return@launch
            renderer.setTextures(wc, terr)
            val ms = (System.nanoTime() - t0) / 1_000_000
            Log.d("HistoryMap", "loadDynasty $id: ${data.events.size} events, ${data.model.regimes.size} regimes, period=${data.initialPeriod}, 耗时=${ms}ms")
        }
    }

    LaunchedEffect(Unit) {
        dynasties = withContext(Dispatchers.IO) { repo.getDynasties() }
        // 优先恢复 rememberSaveable 保存的朝代（进程被杀/Activity 重建后）；否则默认 song
        val initial = dynasties.firstOrNull { it.id == restoredDynasty }
            ?: dynasties.firstOrNull { it.id == "song" }
            ?: dynasties.firstOrNull()
        if (initial != null) loadDynasty(initial.id)
    }

    // 时期切换函数引用：timeline 的 onYearChange 回调延迟执行，此处先占位，
    // 重组时绑定到 doEnsurePeriod（后者需要读取 timeline.year 做收敛重评估）。
    var ensurePeriod: (Int) -> Unit = {}

    // —— 时间轴（当前年份唯一状态源；朝代切换时重建）——
    val timeline = remember(currentDynasty) {
        // 朝代切换：丢弃旧 timeline 前先取消其播放协程（scope 共享，
        // 否则旧朝代在后台继续推进年份，还会误触发新朝代的时期切换）
        timelineRef?.dispose()
        if (currentDynasty.isEmpty()) null
        else TimelineController(
            startYear = dynastyStart,
            endYear = dynastyEnd,
            events = events,
            scope = scope,
            // 恢复路径（restoreYear 有效）不自动播放，由下方 firstTimelineDone 设年份并保持暂停；
            // 全新冷启动（restoreYear==-1）自动播放
            autoplay = (restoreYear < 0),
            // 跨时期边界时重载疆域（投影保持首次标定，与 Web 版一致）
            onYearChange = { y -> ensurePeriod(y) },
            onComplete = { },
        ).also { timelineRef = it }
    }

    // 进程恢复：仅在「首个 timeline 创建时」把年份回到保存值并保持暂停，避免后台被杀
    // 后冷启动又从起始年自动播放；后续手动切朝代不再触发（firstTimelineDone 守卫）
    var firstTimelineDone by remember { mutableStateOf(false) }
    LaunchedEffect(timeline) {
        if (timeline != null && !firstTimelineDone) {
            firstTimelineDone = true
            val y = restoreYear
            if (y in timeline.startYear..timeline.endYear) {
                timeline.pause()
                timeline.setYear(y)
            }
        }
    }

    // 持续保存当前年份（供进程恢复后 timeline 回到原年份）
    LaunchedEffect(timeline?.year) {
        if (timeline?.year != null) restoreYear = timeline.year
    }

    // Activity 级后台恢复：退后台（ON_PAUSE）暂停自动播放，避免后台空跑/回来后年份突跳；
    // 不自动恢复播放（与「点泡泡自动暂停、关详情保持暂停」语义一致，由用户点播放恢复）
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner, timeline) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_PAUSE) timeline?.pause()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    // —— 全时期模式（P2）：给定年份展示当时全部政权（宋/辽/西夏/金等同屏）——
    // _range 为服务端计算的「命中集合稳定区间」，年份未出区间则跳过重取
    //（自动播放逐年推进，节流必需；与 Web 版 reloadAllOverlay 同语义）。
    var allPeriodMode by remember { mutableStateOf(false) }
    var allOverlayRange by remember { mutableStateOf<Pair<Int, Int>?>(null) }

    fun doEnsureAllPeriod(y: Int) {
        val range = allOverlayRange
        if (range != null && y in range.first..range.second) return
        val gen = dynastyGen
        val loadingKey = "all-$y"
        if (periodLoading == loadingKey) return
        periodLoading = loadingKey
        scope.launch {
            // overlay 读盘 + 解析 + _range 提取放 IO 线程，不阻塞主线程（与 loadDynasty 同款写法）
            val data = withContext(Dispatchers.IO) {
                val json = repo.getAllOverlayJson(y)
                val rangeArr = JSONObject(json).optJSONObject("properties")?.optJSONArray("_range")
                val range = if (rangeArr != null && rangeArr.length() == 2) {
                    rangeArr.optInt(0) to rangeArr.optInt(1)
                } else null
                PeriodSwitchResult(
                    model = OverlayParser.parse(JSONObject(json)),
                    json = json,
                    range = range,
                )
            }
            // 模式已退出或朝代已切换：本次结果作废（清空自己的 loading 标记，
            // 避免退出全时期模式后残留 "all-y" 挂起，挡住后续时期切换）
            if (!allPeriodMode || gen != dynastyGen) {
                if (periodLoading == loadingKey) periodLoading = null
                return@launch
            }
            renderer.setOverlay(data.model, calibrate = false, cacheKey = data.json)
            currentPeriodId = "all"
            periodLoading = null
            regimeColors = renderer.regimeColors
            layoutRevision++
            val density = context.resources.displayMetrics.density
            val (wc, terr) = withContext(Dispatchers.IO) {
                renderer.buildTextures(data.model, data.json, density)
            }
            if (!allPeriodMode || gen != dynastyGen) return@launch
            renderer.setTextures(wc, terr)
            if (data.range != null) allOverlayRange = data.range
            Log.d("HistoryMap", "all-period overlay year=$y regimes=${data.model.regimes.size}")
        }
    }

    // 时期切换：异步加载 overlay 期间用 periodLoading 去重（年份逐年推进会
    // 反复触发 onYearChange），加载完成后若年份已跨入下一时期则重新评估收敛。
    // 全时期模式（P2）：改走 doEnsureAllPeriod（按年取全部政权，_range 区间内节流）。
    fun doEnsurePeriod(y: Int) {
        if (allPeriodMode) {
            doEnsureAllPeriod(y)
            return
        }
        val newPeriod = periods.firstOrNull { y in it.start..it.end } ?: return
        if (newPeriod.id == currentPeriodId || newPeriod.id == periodLoading) return
        val prevId = currentPeriodId
        val gen = dynastyGen
        periodLoading = newPeriod.id
        scope.launch {
            val t0 = System.nanoTime()
            // overlay 读盘 + 解析放 IO 线程，不阻塞主线程（与 loadDynasty 同款写法）
            val data = withContext(Dispatchers.IO) {
                val json = repo.getOverlayJson(currentDynasty, newPeriod.id)
                PeriodSwitchResult(model = OverlayParser.parse(JSONObject(json)), json = json)
            }
            // 加载期间朝代已切换：本次结果作废（防止旧朝代时期覆盖新朝代状态）
            if (gen != dynastyGen) return@launch
            // 加载期间全时期模式已开启：本次单朝代结果作废（防止旧朝代 overlay 覆盖全时期状态）
            if (allPeriodMode) {
                if (periodLoading == newPeriod.id) periodLoading = null
                return@launch
            }
            renderer.setOverlay(data.model, calibrate = false, cacheKey = data.json)
            currentPeriodId = newPeriod.id
            periodLoading = null
            regimeColors = renderer.regimeColors
            layoutRevision++
            // P3：纹理 CPU 生成放 IO 线程
            val density = context.resources.displayMetrics.density
            val (wc, terr) = withContext(Dispatchers.IO) {
                renderer.buildTextures(data.model, data.json, density)
            }
            // 朝代已切换或全时期模式已开启：旧时期纹理不再挂接，避免覆盖新状态
            if (gen != dynastyGen || allPeriodMode) return@launch
            renderer.setTextures(wc, terr)
            val ms = (System.nanoTime() - t0) / 1_000_000
            Log.d("HistoryMap", "period switch: $prevId -> ${newPeriod.id} (${newPeriod.label}), 耗时=${ms}ms")
            // 时期转场横幅（约 2.6s）
            periodBanner = newPeriod.label
            kotlinx.coroutines.delay(2600)
            // 显示期间朝代已切换：不清 banner（由新朝代装配流程接管）
            if (gen != dynastyGen) return@launch
            // 显示期间 banner 已被更新的时期覆盖（快速跨时期）：不再清除
            if (periodBanner == newPeriod.label) periodBanner = null
            // 加载期间年份可能已推进到下一时期：重新评估，保证最终收敛到当前年份
            val nowY = timeline?.year ?: return@launch
            ensurePeriod(nowY)
        }
    }

    ensurePeriod = { doEnsurePeriod(it) }

    fun toggleAllPeriodMode() {
        allPeriodMode = !allPeriodMode
        if (allPeriodMode) {
            allOverlayRange = null
            // 时间轴范围 → 全部朝代并集
            val start = dynasties.minOfOrNull { it.startYear } ?: dynastyStart
            val end = dynasties.maxOfOrNull { it.endYear } ?: dynastyEnd
            timeline?.setRange(start, end)
            doEnsureAllPeriod(timeline?.year ?: start)
        } else {
            allOverlayRange = null
            // 回到朝代模式：恢复当前朝代范围与疆域（同朝代不触发 timeline 重建，手动复位）
            timeline?.setRange(dynastyStart, dynastyEnd)
            doEnsurePeriod(timeline?.year ?: dynastyStart)
        }
    }

    // —— 已出现事件追踪：年份推进时，首次进入时间窗口的事件加入列表 ——
    LaunchedEffect(timeline?.year) {
        val y = timeline?.year ?: return@LaunchedEffect
        val prev = prevYear
        if (prev == null || y < prev) {
            // 首次（或重播/回退：年份倒退）：清空旧记录，按当前年份重新累积
            seenEvents = events.filter { y >= it.year && y <= it.yearEnd }.sortedBy { it.year }
        } else {
            val appeared = events.filter { ev ->
                y >= ev.year && y <= ev.yearEnd && prev < ev.year
            }
            if (appeared.isNotEmpty()) {
                seenEvents = (seenEvents + appeared).distinctBy { it.id }.sortedBy { it.year }
            }
        }
        prevYear = y
    }

    // 泡泡点击命中参数（组合期持续更新的快照；GL touch listener 单例闭包读取，
    // 事件收口方案见 scrollDetector.onSingleTapConfirmed 注释）
    var bubbleHitArgs by remember { mutableStateOf<BubbleHitArgs?>(null) }

    // —— GLSurfaceView（手势：平移/缩放/双击复位）——
    val glView = remember {
        GLSurfaceView(context).apply {
            setEGLContextClientVersion(2)
            setEGLConfigChooser(8, 8, 8, 8, 16, 8)
            setRenderer(renderer)
            renderMode = GLSurfaceView.RENDERMODE_CONTINUOUSLY
        }
    }

    // 地图手势统一收口在 GLSurfaceView 的 touch listener（泡泡点击/拖动/缩放/双击复位）。
    // 原因：AndroidView 之上只要存在任何 Compose pointerInput modifier（哪怕不消费事件），
    // Compose 就会接管整个手势流，GLSurfaceView 收不到 down——实测地图拖动/缩放/双击
    // 全部失效。泡泡命中（hitTestBubble 纯函数）因此并入本 listener 的 tap 检测。
    val scrollDetector = remember {
        android.view.GestureDetector(context, object : android.view.GestureDetector.SimpleOnGestureListener() {
            override fun onDown(e: android.view.MotionEvent): Boolean = true
            // 确认单击（排除双击第二击）后做泡泡命中测试；未命中再测治所标签（P4 考据卡片）
            override fun onSingleTapConfirmed(e: android.view.MotionEvent): Boolean {
                val args = bubbleHitArgs ?: return false
                val ev = hitTestBubble(
                    args.events, args.labels, renderer, args.density, args.selectedId,
                    e.x, e.y, args.safeTop, args.safeBottom,
                )
                if (ev != null) {
                    args.onTap(ev)
                    return true
                }
                val pref = args.labels.lastOrNull { pl ->
                    pl.visible && pl.label.kind == "prefecture" &&
                        pl.rect.contains(androidx.compose.ui.geometry.Offset(e.x, e.y))
                }
                if (pref != null) {
                    args.onPrefectureTap(pref.label.text)
                    return true
                }
                return false
            }
            override fun onScroll(e1: android.view.MotionEvent?, e2: android.view.MotionEvent, dx: Float, dy: Float): Boolean {
                renderer.pan(dx, dy)
                return true
            }
            override fun onDoubleTap(e: android.view.MotionEvent): Boolean {
                renderer.resetCamera()
                return true
            }
        })
    }
    val scaleDetector = remember {
        android.view.ScaleGestureDetector(context, object : android.view.ScaleGestureDetector.SimpleOnScaleGestureListener() {
            override fun onScale(detector: android.view.ScaleGestureDetector): Boolean {
                renderer.zoom(detector.scaleFactor, detector.focusX, detector.focusY)
                return true
            }
        })
    }
    // 缩放进行中不让 scroll 检测器同时响应（双指移动也会触发 onScroll，
    // 两个手势叠加会让地图在 pinch 时漂移——官方文档推荐的标准守卫）
    val touchListener = remember {
        android.view.View.OnTouchListener { _, event ->
            scaleDetector.onTouchEvent(event)
            if (!scaleDetector.isInProgress) {
                scrollDetector.onTouchEvent(event)
            }
            true
        }
    }

    // 派生标签布局：相机/内容变化时重算（zoom/cx/cy 是 Compose 状态，变化即重算）
    val densityPx = LocalDensity.current.density
    val designScale = rememberDesignScale()
    val viewW = renderer.viewportWidth().toFloat()
    val viewH = renderer.viewportHeight().toFloat()
    // 顶栏底边 / 时间轴顶边的实际屏幕像素（onGloballyPositioned 测量），用于标签/泡泡安全区。
    // 用实测值取代旧的 88dp/160dp 硬编码：设计顶栏 154px、时间轴 280px，在 P20(density=3)
    // 上 88dp=264px、160dp=480px 远大于实际，导致泡泡被过度向地图中部回收。
    var topBarBottomPx by remember { mutableStateOf(0f) }
    var timelineTopPx by remember { mutableStateOf(0f) }
    val bubbleSafeTop = if (topBarBottomPx > 0f) topBarBottomPx else 88f * densityPx
    val bubbleSafeBottom = if (timelineTopPx > 0f) (viewH - timelineTopPx).coerceAtLeast(0f) else 160f * densityPx

    // —— LOD 档位（docs/requirements/zoom-lod-requirements.md §4.2：s = 可见世界宽 / 世界包围盒宽，
    // 滞回 ±0.02 防缩放临界抖动；档位变化时标签层做 250ms 淡入过渡）——
    var lodTierLevel by remember { mutableIntStateOf(LodTier.L0.level) }
    LaunchedEffect(
        renderer.zoom, renderer.cx, renderer.cy,
        renderer.viewportWidth(), renderer.viewportHeight(), layoutRevision,
    ) {
        val w = renderer.worldWidth()
        val vpW = renderer.viewportWidth().toFloat()
        val vpH = renderer.viewportHeight().toFloat()
        val aspect = if (vpH > 0f) vpW / vpH else 1f
        val s = mapScale(renderer.zoom, aspect, w)
        val next = nextLod(LodTier.fromLevel(lodTierLevel), s)
        if (next.level != lodTierLevel) lodTierLevel = next.level
        renderer.lodTier = next.level
    }
    val lodTier = LodTier.fromLevel(lodTierLevel)
    // 标签层档位切换过渡（250ms 淡入；首帧 L0 不淡入，
    // 之后任意档位变化含「降回 L0」都过渡，与升档对称）
    val labelAlpha = remember { androidx.compose.animation.core.Animatable(1f) }
    var prevLodLevel by remember { mutableIntStateOf(-1) }
    LaunchedEffect(lodTierLevel) {
        if (prevLodLevel >= 0 && lodTierLevel != prevLodLevel) {
            labelAlpha.snapTo(0f)
            labelAlpha.animateTo(1f, tween(250))
        }
        prevLodLevel = lodTierLevel
    }

    val placedLabels = remember(
        renderer.labels, layoutRevision, renderer.zoom, renderer.cx, renderer.cy, designScale,
        topBarBottomPx, timelineTopPx, viewH, lodTierLevel, showSeats,
    ) {
        if (renderer.viewportWidth() <= 0) emptyList()
        else {
            // 标签世界坐标 → 屏幕坐标：layoutMapLabels 在屏幕空间做避让/碰撞，
            // 锚点必须与屏幕域（screenRegimePolygons）和禁区一致；
            // 否则世界坐标（±500 范围）被当作屏幕坐标，标签会错位并被顶栏/图例禁区误隐藏。
            val screenLabels = renderer.labels.map { l ->
                val (sx, sy) = renderer.worldToScreen(l.wx, l.wy)
                MapRenderer.WorldLabel(l.text, sx, sy, l.kind, l.major, l.rank)
            }
            // 治所标注开关（settings.showSeats）：隐藏州府/路治治所标签
            val base = if (showSeats) screenLabels else screenLabels.filter { it.kind != "prefecture" }
            // LOD 档位准入（§4.2 矩阵：rank 决定各档显隐）
            val admitted = base.filter { admitAtTier(it, lodTier) }
            // L3 视口剔除：290 个治所全量布局是 O(n²) 碰撞，P20 会掉帧；
            // 只布局「锚点在视口 +15% 缓冲内」的标签，视口外随相机平移自然换入
            val layoutInput = if (lodTierLevel == 3) {
                admitted.filter { l ->
                    l.wx >= -0.15f * viewW && l.wx <= 1.15f * viewW &&
                        l.wy >= -0.15f * viewH && l.wy <= 1.15f * viewH
                }
            } else admitted
            val safeTop = if (topBarBottomPx > 0f) topBarBottomPx else 88f * densityPx
            val safeBottom = if (timelineTopPx > 0f) (viewH - timelineTopPx).coerceAtLeast(0f) else 160f * densityPx
            layoutMapLabels(
                labels = layoutInput,
                screenRegimes = renderer.screenRegimePolygons(),
                textPaints = labelTextPaints(designScale, densityPx),
                viewW = viewW,
                viewH = viewH,
                density = densityPx,
                zones = listOf(
                    // 顶栏（实测底边；图例小笺落在顶栏下方，单独 zone）
                    ScreenZone(Rect(0f, 0f, 10000f, safeTop)),
                    // 图例（朱砂小笺 + 展开卡）：顶栏底 ~ 顶栏底+130px
                    ScreenZone(Rect(0f, safeTop, 130f * densityPx, safeTop + 140f * densityPx)),
                    // 时间轴（实测顶边）
                    ScreenZone(Rect(0f, viewH - safeBottom, 10000f, viewH)),
                    // 年份水印区域（右缘 4vw、垂直 42% 居中线、字号≈28% 屏宽，避让大字号水印）
                    ScreenZone(Rect(0.55f * viewW, 0.42f * viewH - 0.30f * viewW, viewW, 0.42f * viewH + 0.20f * viewW)),
                ),
                // 移动端紧凑：辅助/城市/地点标签收紧（政权不限），避免中下部文字堆叠。
                // 横屏纵向地图区更窄，进一步收紧标签上限，防止地名堆叠压住事件泡泡。
                // LOD 档位模式下 maxCityLabels/maxPlaceLabels 让位于档位×rank 上限表。
                maxAuxLabels = if (isLandscape) 14 else 24,
                maxCityLabels = if (isLandscape) 4 else 7,
                maxPlaceLabels = if (isLandscape) 3 else 5,
                tier = lodTier,
            )
        }
    }

    // Surface 尺寸变化：重算标签布局（GL 线程回调，UI 线程 bump revision）
    val updateLayout by rememberUpdatedState({ layoutRevision++ })
    LaunchedEffect(renderer) { renderer.onSurfaceSizeChanged = { updateLayout() } }

    Box(modifier = Modifier.fillMaxSize()) {
        // 地图层
        AndroidView(
            factory = {
                glView.apply { setOnTouchListener(touchListener) }
            },
            modifier = Modifier.fillMaxSize(),
        )

        // 大年份水印（地图背景层：位于标签/泡泡之下，不遮挡叙事）。
        // 对齐 Web 版 #year-watermark：右缘 4vw、垂直 42% 居中线、字号≈28% 屏宽
        // （Web clamp(160px,28vw,380px) 的窄屏下限会溢出，取 28vw 上限语义）、淡墨 10%。
        // 旧实现 top=105px 固定值落在顶栏（~75dp+）之下被纸面顶栏盖住。
        val wmFontPx = 0.28f * viewW
        Text(
            text = "${timeline?.year ?: dynastyStart} 年",
            modifier = Modifier
                .align(Alignment.TopEnd)
                .offset {
                    IntOffset(
                        -(0.04f * viewW).roundToInt(),
                        (0.42f * viewH - wmFontPx * 0.5f).roundToInt(),
                    )
                },
            fontFamily = MapFonts.Family,
            fontWeight = FontWeight.Normal,
            fontSize = with(LocalDensity.current) { wmFontPx.toSp() },
            color = MapTokens.INK.copy(alpha = MapTokens.Alpha.YEAR_WATERMARK / 255f),
            letterSpacing = with(LocalDensity.current) { 8.dp.toSp() },
        )

        // 标注层（政权/城市/地点/山脉/河流名，布局结果含避让与隐藏；
        // LOD 档位切换时整体 250ms 淡入过渡）
        if (showTerritory) {
            LabelLayer(
                placedLabels = placedLabels,
                modifier = Modifier.fillMaxSize().alpha(labelAlpha.value),
            )
        }

        // 事件泡泡层（点击命中；按设置分类 + 人物视角过滤；地图手势由 GLSurfaceView 自己消费）
        timeline?.let { tl ->
            val visibleEvents = tl.visibleEvents().filter { ev ->
                activeCategories.contains(ev.category) &&
                    (personFilterId == null || ev.relatedPersons.any { it.id == personFilterId })
            }
            // 泡泡纵向安全区：实测顶栏底 / 时间轴顶（见上方 topBarBottomPx/timelineTopPx）
            // 泡泡点击命中数据（最新值快照；GL touch listener 单例闭包经此读取，
            // 避免 stale capture——见 scrollDetector.onSingleTapConfirmed。
            // SideEffect：组合完成后再写状态，不在组合期间产生副作用写）
            SideEffect {
                bubbleHitArgs = BubbleHitArgs(
                    events = visibleEvents,
                    labels = placedLabels,
                    selectedId = selectedEvent?.id,
                    safeTop = bubbleSafeTop,
                    safeBottom = bubbleSafeBottom,
                    density = densityPx,
                    onTap = { ev ->
                        tl.pause()
                        selectedEvent = ev
                    },
                    onPrefectureTap = { name ->
                        tl.pause()
                        selectedPrefecture = renderer.currentModel?.prefectures?.firstOrNull { it.name == name }
                    },
                )
            }
            Box(modifier = Modifier.fillMaxSize()) {
                EventBubblesLayer(
                    events = visibleEvents,
                    placedLabels = placedLabels,
                    renderer = renderer,
                    selectedEventId = selectedEvent?.id,
                    modifier = Modifier.fillMaxSize(),
                    safeTop = bubbleSafeTop,
                    safeBottom = bubbleSafeBottom,
                )
            }
        }

        // TopBar extracted to MapTopBar.kt (A5)
        MapTopBar(
            dynastyName = dynastyName,
            allPeriodMode = allPeriodMode,
            onToggleAllPeriod = { toggleAllPeriodMode() },
            onDynastyClick = { menuOpen = true; timeline?.pause() },
            onDynastyButtonPositioned = { pos, h ->
                dynastyBtnPos = pos
                dynastyBtnHeight = h
            },
            onLogClick = { logOpen = true; timeline?.pause() },
            onSettingsClick = { settingsOpen = true; timeline?.pause() },
            onBottomEdgeChanged = { y -> topBarBottomPx = y },
        )

        // 图例（左上角政权色块，手机端默认折叠为朱砂小笺）
        if (showTerritory) {
            // y 坐标：状态栏 + 设计 legendY(194px)×scale（顶栏 154px 下 40px 间隙），
            // 不用固定 88.dp 直接替代设计 y
            val statusBarTopPx = WindowInsets.statusBars.getTop(LocalDensity.current)
            val legendTop = with(LocalDensity.current) { statusBarTopPx.toDp() } +
                designDp(MapTokens.Dimensions.LEGEND_Y.toFloat())
            LegendPanel(
                regimes = regimeColors,
                collapsed = legendCollapsed,
                onToggle = { legendCollapsed = !legendCollapsed },
                modifier = Modifier.align(Alignment.TopStart)
                    .padding(top = legendTop, start = designDp(MapTokens.Dimensions.LEGEND_X.toFloat())),
            )
        }

        // 底部时间轴（刻度点按设置分类过滤）
        timeline?.let { tl ->
            TimelineBar(
                timeline = tl,
                events = events.filter { activeCategories.contains(it.category) },
                onEventClick = { ev ->
                    tl.pause()
                    // P0-修复：事件刻度点点击需跳转到事件年份（原代码漏掉 setYear，
                    // 只暂停+打开详情，水印/泡泡仍停留在旧年份）
                    tl.setYear(ev.year)
                    selectedEvent = ev
                },
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .onGloballyPositioned { coords ->
                        // 实测时间轴顶边（含导航栏 padding），供标签/泡泡安全区
                        timelineTopPx = coords.positionInRoot().y
                    },
            )
        }

        // 播放完毕提示（A5 拆分至 MapUiBlocks.kt）
        CompletedReplayChip(timeline = timeline, modifier = Modifier)

        // 时期转场横幅（A5 拆分至 MapUiBlocks.kt）
        PeriodBannerOverlay(periodBanner)

        // 州府考据卡片（P4）：治所标签点击打开；数据来自 overlay GeoJSON 要素属性
        //（元丰九域志/舆地广记，source/license/confidence/sourceFix），不依赖时空库
        selectedPrefecture?.let { pref ->
            AppBottomSheet(
                onDismiss = { selectedPrefecture = null },
                onClose = { selectedPrefecture = null },
            ) {
                PrefectureProvenanceContent(pref)
            }
        }

        // 详情面板（应用内底部抽屉；右上角独立关闭按钮 ≥44dp）
        selectedEvent?.let { ev ->
            AppBottomSheet(
                onDismiss = { selectedEvent = null },
                onClose = { selectedEvent = null },
            ) {
                EventDetailContent(ev, allEvents = events, onPickRelated = { related ->
                    // 相关事件点击：与事件流点击一致——暂停时间轴 + 跳到相关事件年份，
                    // 触发时期切换/年份水印/泡泡同步，再切换详情内容
                    timeline?.let { tl ->
                        tl.pause()
                        tl.setYear(related.year)
                    }
                    selectedEvent = related
                }, onPickPerson = { p ->
                    // 人物徽章点击：进入该人物的事件轨迹过滤（人物视角）
                    personFilterId = p.id
                    selectedEvent = null
                }, onClose = { selectedEvent = null })
            }
        }

        // 事件流抽屉（A5 拆分至 MapUiBlocks.kt）
        EventLogSheetBlock(
            logOpen = logOpen,
            timeline = timeline,
            seenEvents = seenEvents,
            allEvents = events,
            onOpenChange = { logOpen = it },
            onPick = { ev ->
                logOpen = false
                timeline?.pause()
                timeline?.setYear(ev.year)
                selectedEvent = ev
            },
        )

        // 设置面板
        if (settingsOpen) {
            SettingsSheet(
                categories = activeCategories,
                speed = playSpeed,
                showTerritory = showTerritory,
                showRivers = showRivers,
                showPrefectures = showPrefectures,
                showSeats = showSeats,
                persons = persons,
                personFilterId = personFilterId,
                onCategoriesChange = {
                    activeCategories = it
                    persistSettings()
                },
                onPersonChange = { pid ->
                    personFilterId = pid
                },
                onSpeedChange = {
                    playSpeed = it
                    timeline?.setTickMs(ContractTokens.SPEED_TICK_MS[it] ?: ContractTokens.SPEED_TICK_NORMAL)
                    persistSettings()
                },
                onTerritoryChange = {
                    showTerritory = it
                    renderer.showTerritory = it
                    renderer.showWatercolor = it
                    persistSettings()
                },
                onRiversChange = {
                    showRivers = it
                    renderer.showRivers = it
                    persistSettings()
                },
                onPrefecturesChange = {
                    showPrefectures = it
                    renderer.showPrefectures = it
                    persistSettings()
                },
                onSeatsChange = {
                    showSeats = it
                    persistSettings()
                },
                onDismiss = { settingsOpen = false },
            )
        }

        // 朝代下拉菜单（A5 拆分至 MapUiBlocks.kt）
        DynastyDropdownMenu(
            visible = menuOpen,
            dynasties = dynasties,
            currentDynasty = currentDynasty,
            anchor = dynastyBtnPos,
            anchorHeight = dynastyBtnHeight,
            onDismiss = { menuOpen = false },
            onPick = { id -> menuOpen = false; if (id != currentDynasty) loadDynasty(id) },
        )


        // 统一返回键控制（P2）：详情 → 设置 → 事件流 → 菜单 → 退出。
        // 不依赖各 sheet 的局部 BackHandler 组合顺序；全部 sheet 关闭后交由系统退出。
        BackHandler(enabled = selectedEvent != null || settingsOpen || logOpen || menuOpen) {
            when {
                selectedEvent != null -> selectedEvent = null
                settingsOpen -> settingsOpen = false
                logOpen -> logOpen = false
                menuOpen -> menuOpen = false
            }
        }
    }
}
