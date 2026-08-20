package com.historymap.app

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.opengl.GLSurfaceView
import android.graphics.Paint
import android.graphics.Typeface
import android.util.Log
import org.json.JSONObject
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Image
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.layout.ContentScale
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.viewinterop.AndroidView
import kotlin.math.roundToInt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver

/**
 * 朝代加载结果（loadDynasty 一次性获取的数据）。
 */
private data class DynastyLoadResult(
    val model: OverlayModel,
    val events: List<EventEntity>,
    val periods: List<PeriodInfo>,
    val initialPeriod: String,
    val json: String,
)

/**
 * 泡泡点击命中参数快照（组合期由 MapScreen 持续写入，GL touch listener 读取）。
 * 地图手势统一收口在 GLSurfaceView 后，泡泡 tap 检测也走 Android 手势链路。
 */
private data class BubbleHitArgs(
    val events: List<EventEntity>,
    val labels: List<PlacedMapLabel>,
    val selectedId: Long?,
    val safeTop: Float,
    val safeBottom: Float,
    val density: Float,
    val onTap: (EventEntity) -> Unit,
)

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
    // 设置（M5b：分类/速度/图层显隐；SharedPreferences 持久化，重启保持）
    var settingsOpen by remember { mutableStateOf(false) }
    var activeCategories by remember { mutableStateOf(SettingsStore.defaults().categories) }
    var playSpeed by remember { mutableStateOf("normal") }
    var showTerritory by remember { mutableStateOf(true) }
    var showRivers by remember { mutableStateOf(true) }
    var legendCollapsed by remember { mutableStateOf(true) } // 手机端图例默认折叠

    // 设置持久化：初始读 + 变更写（等价 Web 版 settings/store.js）
    LaunchedEffect(Unit) {
        val s = SettingsStore.load(context.applicationContext)
        activeCategories = s.categories
        playSpeed = s.speed
        showTerritory = s.showTerritory
        showRivers = s.showRivers
        renderer.showTerritory = s.showTerritory
        renderer.showWatercolor = s.showTerritory
        renderer.showRivers = s.showRivers
    }
    fun persistSettings() {
        SettingsStore.save(
            context.applicationContext,
            SettingsStore.Settings(activeCategories, playSpeed, showTerritory, showRivers),
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
            dynastyStart = dynasty.startYear
            dynastyEnd = dynasty.endYear
            periods = data.periods
            currentPeriodId = data.initialPeriod
            periodLoading = null
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

    // 时期切换：异步加载 overlay 期间用 periodLoading 去重（年份逐年推进会
    // 反复触发 onYearChange），加载完成后若年份已跨入下一时期则重新评估收敛。
    fun doEnsurePeriod(y: Int) {
        val newPeriod = periods.firstOrNull { y in it.start..it.end } ?: return
        if (newPeriod.id == currentPeriodId || newPeriod.id == periodLoading) return
        val prevId = currentPeriodId
        val gen = dynastyGen
        periodLoading = newPeriod.id
        scope.launch {
            val t0 = System.nanoTime()
            val json = repo.getOverlayJson(currentDynasty, newPeriod.id)
            val model = withContext(Dispatchers.IO) {
                OverlayParser.parse(JSONObject(json))
            }
            // 加载期间朝代已切换：本次结果作废（防止旧朝代时期覆盖新朝代状态）
            if (gen != dynastyGen) return@launch
            renderer.setOverlay(model, calibrate = false, cacheKey = json)
            currentPeriodId = newPeriod.id
            periodLoading = null
            regimeColors = renderer.regimeColors
            layoutRevision++
            // P3：纹理 CPU 生成放 IO 线程
            val density = context.resources.displayMetrics.density
            val (wc, terr) = withContext(Dispatchers.IO) {
                renderer.buildTextures(model, json, density)
            }
            // 朝代已切换：旧时期纹理不再挂接，避免覆盖新朝代图层
            if (gen != dynastyGen) return@launch
            renderer.setTextures(wc, terr)
            val ms = (System.nanoTime() - t0) / 1_000_000
            Log.d("HistoryMap", "period switch: $prevId -> ${newPeriod.id} (${newPeriod.label}), 耗时=${ms}ms")
            // 时期转场横幅（约 2.6s）
            periodBanner = newPeriod.label
            kotlinx.coroutines.delay(2600)
            periodBanner = null
            // 加载期间年份可能已推进到下一时期：重新评估，保证最终收敛到当前年份
            val nowY = timeline?.year ?: return@launch
            ensurePeriod(nowY)
        }
    }

    ensurePeriod = { doEnsurePeriod(it) }

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
            // 确认单击（排除双击第二击）后做泡泡命中测试；未命中则不消费（无地图侧作用）
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

    val placedLabels = remember(
        renderer.labels, layoutRevision, renderer.zoom, renderer.cx, renderer.cy, designScale,
        topBarBottomPx, timelineTopPx, viewH,
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
            val safeTop = if (topBarBottomPx > 0f) topBarBottomPx else 88f * densityPx
            val safeBottom = if (timelineTopPx > 0f) (viewH - timelineTopPx).coerceAtLeast(0f) else 160f * densityPx
            layoutMapLabels(
                labels = screenLabels,
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
                maxAuxLabels = if (isLandscape) 14 else 24,
                maxCityLabels = if (isLandscape) 4 else 7,
                maxPlaceLabels = if (isLandscape) 3 else 5,
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

        // 标注层（政权/城市/地点/山脉/河流名，布局结果含避让与隐藏）
        if (showTerritory) {
            LabelLayer(placedLabels = placedLabels, modifier = Modifier.fillMaxSize())
        }

        // 事件泡泡层（点击命中；按设置分类过滤；地图手势由 GLSurfaceView 自己消费）
        timeline?.let { tl ->
            val visibleEvents = tl.visibleEvents().filter { activeCategories.contains(it.category) }
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

        // 顶栏（设计比例：高度 154px；P1-字体：标题 20px/700、朝代 16px、事件 15px、
        // 设置 20px 图标；按钮触摸区 ≥44dp，保持内嵌菜单避免系统栏闪烁）
        Surface(
            modifier = Modifier.fillMaxWidth().statusBarsPadding()
                .onGloballyPositioned { coords ->
                    // 实测顶栏底边（含状态栏 inset + 154px 行 + 分隔线），供标签/泡泡安全区
                    topBarBottomPx = coords.positionInRoot().y + coords.size.height
                },
            color = MapTokens.PAPER_BAR,
        ) {
            Column {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(designDp(MapTokens.Dimensions.TOP_BAR_HEIGHT.toFloat()))
                        .padding(horizontal = designDp(54f), vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "历史地图",
                        fontFamily = MapFonts.Family,
                        fontWeight = FontWeight.Bold,
                        fontSize = designSp(MapTokens.Typography.TOP_TITLE.size.toFloat()),
                        letterSpacing = designSp(MapTokens.Typography.TOP_TITLE.letterSpacing.toFloat()),
                        color = MapTokens.INK,
                        modifier = Modifier.weight(1f),
                    )
                    // 朝代按钮：朱砂印章式（米白底 + 朱砂描边 + 朱砂字，圆角小方章）
                    Surface(
                        onClick = { menuOpen = true; timeline?.pause() },
                        modifier = Modifier
                            .onGloballyPositioned {
                                dynastyBtnPos = IntOffset(
                                    it.positionInRoot().x.roundToInt(),
                                    it.positionInRoot().y.roundToInt(),
                                )
                                dynastyBtnHeight = it.size.height
                            }
                            .padding(vertical = 4.dp),
                        shape = RoundedCornerShape(designDp(6f)),
                        color = MapTokens.PAPER_CARD.copy(alpha = 0.6f),
                        border = androidx.compose.foundation.BorderStroke(1.dp, MapTokens.VERMILION),
                    ) {
                        Text(
                            text = if (dynastyName.isEmpty()) "加载中…" else "$dynastyName ▾",
                            fontFamily = MapFonts.Family,
                            fontSize = designSp(MapTokens.Typography.DYNASTY.size.toFloat()),
                            fontWeight = FontWeight.Bold,
                            letterSpacing = designSp(2f),
                            color = MapTokens.VERMILION,
                            modifier = Modifier.padding(horizontal = designDp(14f), vertical = 6.dp),
                        )
                    }
                    Spacer(Modifier.width(designDp(10f)))
                    // 事件流抽屉开关（矢量菜单图标 + 「事件」文字）
                    TextButton(onClick = { logOpen = true; timeline?.pause() }) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                painter = androidx.compose.ui.res.painterResource(R.drawable.ic_menu),
                                contentDescription = null,
                                tint = MapTokens.INK_SECONDARY,
                                modifier = Modifier.size(designDp(18f)),
                            )
                            Spacer(Modifier.width(designDp(6f)))
                            Text(
                                "事件",
                                fontFamily = MapFonts.Family,
                                fontSize = designSp(MapTokens.Typography.MENU.size.toFloat()),
                                letterSpacing = designSp(2f),
                                color = MapTokens.INK_SECONDARY,
                            )
                        }
                    }
                    // 设置开关（矢量齿轮图标，替代 Unicode ⚙ 的字形不一致问题）
                    TextButton(onClick = { settingsOpen = true; timeline?.pause() }) {
                        Icon(
                            painter = androidx.compose.ui.res.painterResource(R.drawable.ic_settings),
                            contentDescription = null,
                            tint = MapTokens.INK_SECONDARY,
                            modifier = Modifier.size(designDp(20f)),
                        )
                    }
                }
                InkDivider(alpha = 0.35f)
            }
        }

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

        // 播放完毕提示（自动播放到达 endYear；P1：上移至时间轴卡片上方
        // （底部 168dp ≈ 卡片顶 1775px + 12dp 间距），朱砂边框加强、字号略大）
        if (timeline?.completed == true) {
            Surface(
                onClick = { timeline.play() },
                modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 168.dp),
                shape = RoundedCornerShape(999.dp),
                color = MapTokens.PAPER_PANEL.copy(alpha = 0.92f),
                border = androidx.compose.foundation.BorderStroke(
                    1.dp, MapTokens.VERMILION.copy(alpha = 0.85f),
                ),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 7.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "本朝历史播放完毕",
                        fontFamily = MapFonts.Family,
                        fontSize = designSp(13f),
                        color = MapTokens.VERMILION,
                    )
                    Text(
                        "  点 ▶ 可重新播放",
                        fontFamily = MapFonts.Family,
                        fontSize = designSp(11f),
                        color = MapTokens.INK_SOFT,
                    )
                }
            }
        }

        // 时期转场横幅（跨时期边界时短暂显示；金边线 + 朱砂竖线装饰 + 真实淡入淡出）
        Box(modifier = Modifier.align(Alignment.Center).padding(top = 100.dp)) {
            AnimatedVisibility(
                visible = periodBanner != null,
                enter = fadeIn(tween(300)),
                exit = fadeOut(tween(500)),
            ) {
                Surface(
                    color = MapTokens.PANEL.copy(alpha = 0.9f),
                    shape = RoundedCornerShape(12.dp),
                    border = androidx.compose.foundation.BorderStroke(1.dp, MapTokens.GOLD),
                    shadowElevation = 4.dp,
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(horizontal = 24.dp, vertical = 12.dp),
                    ) {
                        Box(
                            Modifier
                                .width(4.dp)
                                .height(24.dp)
                                .background(MapTokens.VERMILION, RoundedCornerShape(2.dp)),
                        )
                        Spacer(Modifier.width(12.dp))
                        Text(
                            periodBanner ?: "",
                            fontFamily = MapFonts.Family,
                            fontSize = designSp(22f),
                            fontWeight = FontWeight.Bold,
                            letterSpacing = designSp(6f),
                            color = MapTokens.GOLD_DEEP,
                        )
                    }
                }
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
                }, onClose = { selectedEvent = null })
            }
        }

        // 事件流抽屉
        if (logOpen) {
            timeline?.let { tl ->
                EventLogSheet(
                    seenEvents = seenEvents,
                    allEvents = events,
                    currentYear = tl.year,
                    onPick = { ev ->
                        logOpen = false
                        tl.pause()
                        tl.setYear(ev.year)
                        selectedEvent = ev
                    },
                    onDismiss = { logOpen = false },
                )
            }
        }

        // 设置面板
        if (settingsOpen) {
            SettingsSheet(
                categories = activeCategories,
                speed = playSpeed,
                showTerritory = showTerritory,
                showRivers = showRivers,
                onCategoriesChange = {
                    activeCategories = it
                    persistSettings()
                },
                onSpeedChange = {
                    playSpeed = it
                    timeline?.setTickMs(when (it) {
                        "slow" -> 220L
                        "fast" -> 50L
                        else -> 110L
                    })
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
                onDismiss = { settingsOpen = false },
            )
        }

        // 朝代下拉菜单（应用内嵌实现：DropdownMenu 基于 Popup 窗口，会触发
        // 华为系统栏闪现；此处用全屏点击层 + 绝对定位面板，不创建新 window）
        if (menuOpen) {
            // 全屏点击关闭层（在菜单下层）
            Box(
                Modifier
                    .fillMaxSize()
                    .pointerInput(Unit) { detectTapGestures { menuOpen = false } }
            )
            // 菜单面板（定位在朝代按钮下方）
            Surface(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .offset { IntOffset(dynastyBtnPos.x, dynastyBtnPos.y + dynastyBtnHeight) },
                color = MapTokens.PAPER_PANEL,
                shape = RoundedCornerShape(10.dp),
                shadowElevation = 8.dp,
            ) {
                Column {
                    dynasties.forEach { d ->
                        Text(
                            d.name,
                            fontFamily = MapFonts.Family,
                            fontSize = designSp(14f),
                            color = MapTokens.INK,
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    menuOpen = false
                                    if (d.id != currentDynasty) loadDynasty(d.id)
                                }
                                .padding(horizontal = 18.dp, vertical = 12.dp),
                        )
                    }
                }
            }
        }

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

/** 图例：朱砂「政权」标题小笺 + 纸面卡片（手机端默认折叠，展开后限高滚动） */
@Composable
private fun LegendPanel(
    regimes: List<Pair<String, FloatArray>>,
    collapsed: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (regimes.isEmpty()) return
    Column(modifier = modifier) {
        // 朱砂标题小笺（点击切换折叠；可点击 Surface 自带 ≥44dp 触摸区）
        Surface(
            onClick = onToggle,
            shape = RoundedCornerShape(designDp(6f)),
            color = MapTokens.VERMILION,
        ) {
            Row(
                modifier = Modifier.padding(horizontal = designDp(18f), vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "政权",
                    fontFamily = MapFonts.Family,
                    fontSize = designSp(14f),
                    fontWeight = FontWeight.Bold,
                    letterSpacing = designSp(2f),
                    color = MapTokens.PAPER_CARD,
                )
                if (collapsed) {
                    Spacer(Modifier.width(6.dp))
                    Text("▾", fontSize = designSp(12f), color = MapTokens.PAPER_CARD)
                }
            }
        }
        if (!collapsed) {
            Spacer(Modifier.height(10.dp))
            // 纸面卡片：细描边 + 单层淡墨阴影；政权行 38px 行高、水彩短色条。
            // 主要政权优先（fillOpacity 高者在前，如宋 .38 排首位）。
            Surface(
                modifier = Modifier.width(designDp(MapTokens.Dimensions.LEGEND_WIDTH.toFloat())),
                color = MapTokens.PAPER_CARD.copy(alpha = MapTokens.Alpha.LEGEND_BACKGROUND / 255f),
                shape = RoundedCornerShape(designDp(10f)),
                border = androidx.compose.foundation.BorderStroke(1.dp, Color(0x143A3428)),
                shadowElevation = 2.dp,
            ) {
                Column(
                    modifier = Modifier
                        .heightIn(max = designDp(MapTokens.Dimensions.LEGEND_HEIGHT.toFloat()))
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = designDp(16f), vertical = designDp(12f)),
                ) {
                    regimes.sortedByDescending { it.second[3] }.forEach { (name, color) ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.height(designDp(42f)),
                        ) {
                            // P2-水彩色块：竖向渐变 + 圆角短色条（模拟水彩自然渗色，
                            // 而非纯色矩形；宽度 18dp、上下 alpha 变化）
                            Box(
                                Modifier
                                    .size(width = designDp(18f), height = designDp(12f))
                                    .background(
                                        Brush.verticalGradient(
                                            listOf(
                                                Color(color[0], color[1], color[2]).copy(alpha = 0.9f),
                                                Color(color[0], color[1], color[2]).copy(alpha = 0.4f),
                                            ),
                                        ),
                                        RoundedCornerShape(designDp(3f)),
                                    ),
                            )
                            Spacer(Modifier.width(designDp(12f)))
                            Text(
                                name,
                                fontFamily = MapFonts.Family,
                                fontSize = designSp(MapTokens.Typography.LEGEND_ITEM.size.toFloat()),
                                letterSpacing = designSp(1f),
                                fontWeight = if (color[3] > 0.35f) FontWeight.Bold else FontWeight.Normal,
                                color = MapTokens.INK,
                            )
                        }
                    }
                }
            }
        }
    }
}

/** 详情面板内容：元信息 chip（可换行）+ 标题（≤2 行）+ 地点 + 详情 + 影响卡片 + 相关事件 + 水墨插画 */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun EventDetailContent(
    ev: EventEntity,
    allEvents: List<EventEntity>,
    onPickRelated: (EventEntity) -> Unit,
    onClose: () -> Unit,
) {
    val catLabel = when (ev.category) {
        "era" -> "时代格局"
        "figure" -> "名人轨迹"
        "military" -> "军事·领土"
        "economy" -> "经济变革"
        "invention" -> "重要发明"
        else -> ev.category
    }
    val context = LocalContext.current
    // 相关事件：同分类、按年份远近取 3 条（增强历史浏览连续性）
    val related = allEvents
        .filter { it.id != ev.id && it.category == ev.category }
        .sortedBy { kotlin.math.abs(it.year - ev.year) }
        .take(3)
    // 打开/切换详情时自动滚回顶部（相关事件点击会替换 ev → 重置滚动位置）
    val scrollState = rememberScrollState()
    LaunchedEffect(ev.id) { scrollState.scrollTo(0) }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(scrollState)
            .navigationBarsPadding()
            .padding(horizontal = 20.dp)
            .padding(bottom = 28.dp),
    ) {
        Spacer(Modifier.height(4.dp))
        // 元信息 chip 行（FlowRow 自动换行，布局扩展位：未来可加朝代/地点 chip）
        androidx.compose.foundation.layout.FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            YearBadge("${ev.year} 年")
            CategoryBadge(catLabel)
        }
        // 分享按钮（右对齐；系统分享面板 ACTION_SEND，分享标题+年份+地点+详情）
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            TextButton(onClick = { shareEvent(context, ev) }) {
                Text(
                    "分享",
                    fontFamily = MapFonts.Family,
                    fontSize = scaledSp(12f),
                    color = MapTokens.VERMILION,
                )
            }
        }
        Spacer(Modifier.height(6.dp))
        Text(
            ev.title.ifEmpty { "未命名事件" },
            fontFamily = MapFonts.Family,
            fontSize = designSp(22f),
            fontWeight = FontWeight.Bold,
            color = MapTokens.VERMILION,
            lineHeight = designSp(30f),
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        if (ev.place.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            Text(
                "◆ 地点  ${ev.place}",
                fontFamily = MapFonts.Family,
                fontSize = designSp(12f),
                color = MapTokens.INK_SOFT,
                letterSpacing = designSp(1f),
            )
        }
        Spacer(Modifier.height(10.dp))
        NoteDivider()
        Spacer(Modifier.height(12.dp))
        Text(
            ev.detail.ifEmpty { "暂无详情" },
            fontFamily = MapFonts.Family,
            fontSize = designSp(14f),
            lineHeight = designSp(24f),
            color = MapTokens.INK.copy(alpha = 0.92f),
        )
        if (ev.impact.isNotEmpty()) {
            Spacer(Modifier.height(16.dp))
            PaperCard(color = Color(0x13B03A2E), cornerRadius = 8.dp, shadow = 0.dp) {
                Column(Modifier.padding(14.dp)) {
                    Text(
                        "影 响",
                        fontFamily = MapFonts.Family,
                        fontSize = designSp(13f),
                        fontWeight = FontWeight.Bold,
                        color = MapTokens.VERMILION,
                        letterSpacing = designSp(4f),
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        ev.impact,
                        fontFamily = MapFonts.Family,
                        fontSize = designSp(13f),
                        lineHeight = designSp(22f),
                        color = MapTokens.INK.copy(alpha = 0.9f),
                    )
                }
            }
        }
        // 相关事件（同分类，按年份远近）
        if (related.isNotEmpty()) {
            Spacer(Modifier.height(18.dp))
            Text(
                "相关事件",
                fontFamily = MapFonts.Family,
                fontSize = designSp(13f),
                fontWeight = FontWeight.Bold,
                color = MapTokens.VERMILION,
                letterSpacing = designSp(3f),
            )
            Spacer(Modifier.height(8.dp))
            related.forEach { rel ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 2.dp)
                        .background(Color(0x0B3A3428), RoundedCornerShape(8.dp))
                        .clickable { onPickRelated(rel) }
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        Modifier
                            .width(4.dp)
                            .height(16.dp)
                            .background(MapTokens.categoryColor(rel.category), RoundedCornerShape(2.dp)),
                    )
                    Spacer(Modifier.width(10.dp))
                    Text(
                        "${rel.year} 年",
                        fontFamily = MapFonts.Family,
                        fontSize = scaledSp(12f),
                        fontWeight = FontWeight.Bold,
                        color = MapTokens.VERMILION,
                        modifier = Modifier.width(58.dp),
                    )
                    Text(
                        rel.short.ifEmpty { "未命名事件" },
                        fontFamily = MapFonts.Family,
                        fontSize = scaledSp(13f),
                        color = MapTokens.INK,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
        Spacer(Modifier.height(20.dp))
        // 底部水墨山水插画（assets/web/ink-landscape.png，参考图详情页底部）
        val appContext = LocalContext.current
        val inkLandscape = remember { loadInkLandscape(appContext) }
        if (inkLandscape != null) {
            Spacer(Modifier.height(12.dp))
            Image(
                bitmap = inkLandscape.asImageBitmap(),
                contentDescription = null,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(96.dp)
                    .alpha(0.55f),
                contentScale = ContentScale.Fit,
            )
        }
    }
}

/** 加载详情页底部水墨插画（失败返回 null，面板不受影响） */
private fun loadInkLandscape(context: android.content.Context): Bitmap? {
    return try {
        val bytes = context.assets.open("web/ink-landscape.png").use { it.readBytes() }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    } catch (e: Exception) {
        null
    }
}

/**
 * 分享事件：弹出系统分享面板（ACTION_SEND 纯文本）。文本包含标题、年份、地点、详情，
 * 让用户分享到微信/QQ/备忘录等。无可用分享应用时静默忽略（不崩）。
 */
private fun shareEvent(context: Context, ev: EventEntity) {
    val title = ev.title.ifEmpty { ev.short }
    val text = buildString {
        append(title)
        append("\n").append(ev.year).append(" 年")
        if (ev.place.isNotEmpty()) append(" · ").append(ev.place)
        if (ev.detail.isNotEmpty()) append("\n\n").append(ev.detail)
    }
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, title)
        putExtra(Intent.EXTRA_TEXT, text)
    }
    try {
        context.startActivity(Intent.createChooser(send, "分享事件"))
    } catch (e: android.content.ActivityNotFoundException) {
        Log.w("HistoryMap", "无可用分享应用", e)
    }
}

/**
 * 标签文字样式（与布局计算共用，保证测量与绘制一致；字体走 MapFonts 统一入口）。
 *
 * P0-2 修复 density 二次放大：Canvas 绘制/测量在屏幕像素空间，字号直接用
 * DesignMetrics.designToPx(设计px, scale)，不再乘 density（旧的 `size * density`
 * 会把 13px 设计字号在 480dpi 上放大成 39px，标签明显偏大、碰撞区膨胀）。
 *
 * P1-标签：评审要求地图地名可读——政权 16px/94%、核心城市 14px/83%、
 * 普通城市与河流/山脉/地点 13px/68%（旧值 13/12/11px + 55% 透明度几乎不可读）。
 */
private fun labelTextPaints(scale: Float, density: Float): Map<String, Paint> {
    fun make(designPx: Float, bold: Boolean, color: Int): Paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        // 字体 token 为 CSS px 逻辑单位（同 Web）：×density 换成屏幕物理 px
        textSize = DesignMetrics.designToTextPx(designPx, density, scale)
        typeface = MapFonts.of(bold)
        this.color = color
    }
    return mapOf(
        "regime" to make(16f, true, 0xF03A3428.toInt()),
        "cities" to make(14f, false, 0xE03A3428.toInt()),
        "prefecture" to make(13.5f, false, 0xBF3A3428.toInt()), // 州府治所（元丰九域志基准）
        "mountains" to make(13f, false, 0xB83A3428.toInt()),
        "rivers" to make(13f, false, 0xB83A3428.toInt()),
        "places" to make(13f, false, 0xB83A3428.toInt()),
    )
}

/**
 * 地图标注层：绘制 layoutMapLabels 的放置结果（文字/指向线/城市点，垂直居中）。
 *
 * R6-标签（对齐效果图）：政权/城市名撤掉米白卡片+朱砂描边（UI 感强、遮挡色块），
 * 改为深墨文字直书 + 极细纸色 halo 描边保证在水彩色块上的可读性；
 * 城市标签在锚点画「墨点 + 纸色细环」的靶心标记。
 */
@Composable
fun LabelLayer(
    placedLabels: List<PlacedMapLabel>,
    modifier: Modifier = Modifier,
) {
    val designScale = rememberDesignScale()
    val density = LocalDensity.current.density
    // 统一左上光向的文字投影（右下偏移软影）：与政权贴图接触阴影（GL 侧）、
    // 泡泡阴影同一光向——HoMM3「焙烧阴影」的手机端移植，让元素有「贴在纸上」的厚度
    val paints = remember(designScale, density) {
        labelTextPaints(designScale, density).mapValues { (_, p) ->
            p.setShadowLayer(2.4f * density, 1.2f * density, 1.8f * density, 0x2E3A3428)
            p
        }
    }
    // 纸色 halo：与文字同字号描边（先描边后填充的双 pass 画法）
    val haloPaints = remember(designScale, density) {
        labelTextPaints(designScale, density).mapValues { (_, p) ->
            Paint(p).apply {
                style = Paint.Style.STROKE
                strokeWidth = 1.2f * density
                strokeJoin = android.graphics.Paint.Join.ROUND
                color = 0xCCF8F4E9.toInt()
            }
        }
    }
    val leaderInk = remember {
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 1.2f
            color = 0x663A3428.toInt()
            pathEffect = android.graphics.DashPathEffect(floatArrayOf(6f, 5f), 0f)
        }
    }
    // 城市靶心点：墨点 + 纸色细环（效果图的城市标记语言）
    val cityDot = remember { Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xCC3A3428.toInt() } }
    val cityDotRing = remember {
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 1f
            color = 0xCCF8F4E9.toInt()
        }
    }

    Canvas(modifier = modifier) {
        drawIntoCanvas { canvas ->
            val native = canvas.nativeCanvas
            for (pl in placedLabels) {
                if (!pl.visible) continue
                val l = pl.label
                val paint = paints[l.kind] ?: continue
                val halo = haloPaints[l.kind] ?: continue
                val cx = pl.rect.center.x
                val cy = pl.rect.center.y
                // 指向线：锚点 → 文字（仅被移开时）
                if (pl.needLeader) {
                    native.drawLine(pl.anchor.x, pl.anchor.y, cx, cy, leaderInk)
                }
                // 城市靶心点（锚点即城市位置）
                if (l.kind == "cities") {
                    val r = 3.8f * density
                    native.drawCircle(pl.anchor.x, pl.anchor.y, r + 1.6f * density, cityDotRing)
                    native.drawCircle(pl.anchor.x, pl.anchor.y, r, cityDot)
                }
                // 文字垂直居中：基线 = 中心 - (ascent+descent)/2（与泡泡一致）
                val fm = paint.fontMetrics
                val baseline = cy - (fm.ascent + fm.descent) / 2f
                native.drawText(l.text, pl.rect.left + 10f * density, baseline, halo)
                native.drawText(l.text, pl.rect.left + 10f * density, baseline, paint)
            }
        }
    }
}
