package com.historymap.app

import android.content.Context
import android.graphics.BitmapFactory
import android.graphics.RectF
import android.opengl.GLES20
import android.opengl.GLSurfaceView
import android.opengl.GLUtils
import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.setValue
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10

/**
 * GLES2 渲染器（原生重构 M1-M3：渲染底座 + 数据层 + 水彩效果）。
 *
 * 绘制内容（渲染顺序）：
 * 1. 宣纸底全屏 quad：paper-texture.jpg + paper-grain.png 叠加，
 *    片元着色器加中心提亮 + 暖褐四边暗角（对齐参考图宣纸氛围）
 * 2. 山脉纹理 quad（淡墨笔触，低对比辅助层）
 * 3. 水彩疆域：先画接触阴影 pass（贴图 alpha 勾形、右下偏移、统一左上光向），
 *    再画水彩纹理 quad（政权色块 + 边界渗墨，含 fillOpacity 与孔洞处理）
 * 4. 河道带几何（RiverRibbons：变宽三角带 + 着色器内水痕/主体/脊线三层、
 *    两岸羽化与顺流微动画；借鉴 HoMM3 有机河道的「预绘衔接」思路）
 *
 * 线程模型：setOverlay() 做数据解析与 CPU 纹理生成（不调用 GL API），
 * 可从 UI 线程直接调用；GL 线程每帧读取 @Volatile 引用并懒上传纹理。
 * 投影在首次（或显式 calibrate）时标定一次，与 Web 版 fitProjection 单例语义一致。
 *
 * 相机：正交投影，世界坐标范围约 ±500×±400（Projection.fit 的 1000×800 标定），
 * 手势（平移/缩放）从 UI 线程调用 pan/zoom；相机状态以 Compose 状态暴露，
 * UI 层可直接观察 cx/cy/zoom 变化重算标签，GL 线程读同一份状态画帧。
 */
class MapRenderer(private val context: Context) : GLSurfaceView.Renderer {

    /** 待上传的 CPU 纹理（UI 线程生成，GL 线程首次绘制时上传） */
    private class PendingTexture(val texture: WatercolorTexture, val quad: FloatBuffer)

    /** 水彩 CPU 生成缓存条目（按 overlay JSON + 视口尺寸做 key，进程内 LRU） */
    private class WatercolorCacheEntry(val texture: WatercolorTexture, val quad: FloatBuffer, val key: String)

    /** 地图标注（世界坐标，供 Compose 标签层定位） */
    data class WorldLabel(
        val text: String,
        val wx: Float,
        val wy: Float,
        val kind: String,   // regime / cities / places / mountains / rivers
        val major: Boolean,
        val rank: Int,
    )

    // —— 相机状态（Compose 状态：UI 线程写 / GL 线程读；变化自动触发标签重算）——
    var zoom by mutableFloatStateOf(1f)
        private set
    var cx by mutableFloatStateOf(0f)
        private set
    var cy by mutableFloatStateOf(0f)
        private set

    /** Surface 尺寸变化后回调（UI 线程）：MapScreen 用它刷新标签屏幕坐标 */
    var onSurfaceSizeChanged: (() -> Unit)? = null

    // 宣纸主题色（对齐 Web 版 theme.js：暖黄宣纸底 + 墨色）
    private val paperColor = MapTokens.PAPER_MAP_GL

    @Volatile private var viewportW = 1
    @Volatile private var viewportH = 1
    private var aspect = 1f

    /** 当前叠加层模型（政权/河流/山脉，供屏幕域计算） */
    @Volatile private var overlayModel: OverlayModel? = null

    /** 当前叠加层模型（只读出口；P4 州府考据卡片按名查 PrefecturePolygon 属性） */
    val currentModel: OverlayModel? get() = overlayModel

    /** 待在 GL 线程删除的旧纹理 ID（UI 线程入队，onDrawFrame 出队删除） */
    private val texturesToDelete = java.util.Collections.synchronizedList(mutableListOf<Int>())

    /** 上次加载的水彩/山水缓存 key（GL surface 重建后恢复用） */
    @Volatile private var lastWatercolorKey: String? = null
    @Volatile private var lastMountainKey: String? = null
    @Volatile private var lastPrefectureKey: String? = null

    /** 首次标定的世界包围盒（相机 framing 基准） */
    private var worldBounds: RectF? = null

    /** 当前水彩纹理的世界包围盒（worldToScreen 的 y 镜像轴基准；政权-only + 6% pad） */
    @Volatile private var textureWorldBox: RectF? = null

    /** 中原锚点包围盒（宋政权域；相机水平锚定用，无 pad） */
    @Volatile private var anchorBounds: RectF? = null

    // —— GL 资源 ——
    private var bgProgram = 0    // 全屏 NDC quad：宣纸纹理 + 颗粒 + 暗角
    private var texProgram = 0   // 世界坐标 quad + UV：水彩/山水纹理采样（含阴影 pass）
    private var riverProgram = 0 // 河道带几何：三层河带 + 羽化 + 顺流微动画
    private var quadBuffer: FloatBuffer? = null // 全屏 NDC quad

    // uniform / attribute 位置（onSurfaceCreated 缓存，避免每帧查询）
    private var uPaperTex = -1
    private var uGrainTex = -1
    private var uResolution = -1
    private var uVignetteCenter = -1
    private var uViewProjTex = -1
    private var aPosBg = -1
    private var aPosTex = -1
    private var aUvTex = -1
    private var uTex = -1
    private var uTexAlpha = -1 // 纹理整体 alpha（交叉淡入用：旧纹理淡出/新纹理淡入）
    private var uTexOffset = -1 // 纹理 quad 世界偏移（阴影 pass 用；常规绘制置 0）
    private var uTexShadow = -1 // 1=阴影 pass（贴图 alpha 勾形、墨色平涂）

    // 河道带 uniform / attribute 位置
    private var uViewProjRiver = -1
    private var aPosRiver = -1
    private var aSideRiver = -1
    private var aSRiver = -1
    private var uRiverWash = -1
    private var uRiverBody = -1
    private var uRiverSpine = -1
    private var uRiverFracs = -1
    private var uRiverFlow = -1
    private var uRiverAlpha = -1

    // 宣纸背景纹理（assets/web/paper-texture.jpg + paper-grain.png，一次性上传）
    private var paperTexId = 0
    private var grainTexId = 0

    // —— 图层数据（UI 线程 setOverlay 写入 / GL 线程 onDrawFrame 读取）——
    @Volatile private var projection: MercatorProjection? = null
    @Volatile private var pendingWatercolor: PendingTexture? = null
    @Volatile private var pendingMountains: PendingTexture? = null
    /** 州府边界独立描边纹理（运行时 canvas 生成，许可安全；L2+ 才可见） */
    @Volatile private var pendingPrefectures: PendingTexture? = null

    /** 河道带几何（setOverlay 构建；世界 y 已按纹理 worldBox 镜像，与贴图对齐） */
    @Volatile private var riverRibbons: RiverRibbons? = null

    /** 已上传的纹理（GL 线程）；图层序：山脉（水彩下）→ 水彩（含阴影）→ 河道带 */
    private var watercolorTexId = 0
    private var watercolorQuad: FloatBuffer? = null
    private var mountainTexId = 0
    private var mountainQuad: FloatBuffer? = null
    private var prefectureTexId = 0
    private var prefectureQuad: FloatBuffer? = null

    /**
     * 纹理交叉淡入（时期切换：旧纹理保留并淡出，新纹理淡入，避免硬切「啪」一下）。
     * 仅在「新纹理到达时当前纹理仍存在」时启用——朝代切换（calibrate）会先清空
     * 当前纹理，故无交叉淡入（由时期转场横幅覆盖），符合预期。
     */
    private var prevWatercolorTexId = 0
    private var prevWatercolorQuad: FloatBuffer? = null
    private var prevMountainTexId = 0
    private var prevMountainQuad: FloatBuffer? = null
    /** 交叉淡入起始纳秒；0 表示无进行中的过渡 */
    private var crossfadeStartNanos = 0L
    private val crossfadeDurationMs = 350L

    /** 地图标注（世界坐标），UI 线程直接读 */
    @Volatile var labels: List<WorldLabel> = emptyList()

    /** 政权图例数据（entity → 政权色 RGBA），UI 线程直接读 */
    @Volatile var regimeColors: List<Pair<String, FloatArray>> = emptyList()

    /** 图层显隐开关（设置面板控制，GL 线程每帧读取） */
    @Volatile var showTerritory = true      // 统一控制水彩疆域
    @Volatile var showWatercolor = true     // 水彩疆域纹理（旧设置项兼容）
    @Volatile var showRivers = true         // 山水纹理（河流水痕 + 山脉笔触）
    @Volatile var showPrefectures = true    // 州府边界描边（独立开关；L2+ 档位才可见）

    /**
     * LOD 档位（0=L0 全国 .. 3=L3 州府级；MapScreen 按 s 判据计算后写入，
     * GL 线程每帧读它来调制州府描边 alpha 与山脉纹理 alpha，250ms 平滑过渡）。
     */
    @Volatile var lodTier = 0

    /** GL 侧 LOD alpha 平滑状态（避免档位切换硬切） */
    private var prefectureAlphaSmooth = 0f
    private var mountainAlphaSmooth = 1f
    /** 河流几何 alpha 平滑（index=rank-1：rank1 主流 / rank2 中河 / rank≥3 支流） */
    private val riverAlphaSmooth = FloatArray(3) { 1f }
    private var lastFrameNanos = System.nanoTime()

    /** 帧率统计（性能回归观测） */
    private var frameCount = 0
    private var lastFpsLog = System.nanoTime()

    override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
        GLES20.glClearColor(paperColor[0], paperColor[1], paperColor[2], 1f)
        GLES20.glEnable(GLES20.GL_BLEND)
        GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA, GLES20.GL_ONE_MINUS_SRC_ALPHA)

        bgProgram = createProgram(VERT_NDC, buildFragBg())
        texProgram = createProgram(VERT_TEX, buildFragTex())
        riverProgram = createProgram(VERT_RIVER, FRAG_RIVER)
        uPaperTex = GLES20.glGetUniformLocation(bgProgram, "uPaper")
        uGrainTex = GLES20.glGetUniformLocation(bgProgram, "uGrain")
        uResolution = GLES20.glGetUniformLocation(bgProgram, "uResolution")
        uVignetteCenter = GLES20.glGetUniformLocation(bgProgram, "uCenter")
        uViewProjTex = GLES20.glGetUniformLocation(texProgram, "uViewProj")
        aPosBg = GLES20.glGetAttribLocation(bgProgram, "aPos")
        aPosTex = GLES20.glGetAttribLocation(texProgram, "aPos")
        aUvTex = GLES20.glGetAttribLocation(texProgram, "aUv")
        uTex = GLES20.glGetUniformLocation(texProgram, "uTex")
        uTexAlpha = GLES20.glGetUniformLocation(texProgram, "uAlpha")
        uTexOffset = GLES20.glGetUniformLocation(texProgram, "uOffset")
        uTexShadow = GLES20.glGetUniformLocation(texProgram, "uShadow")
        uViewProjRiver = GLES20.glGetUniformLocation(riverProgram, "uViewProj")
        aPosRiver = GLES20.glGetAttribLocation(riverProgram, "aPos")
        aSideRiver = GLES20.glGetAttribLocation(riverProgram, "aSide")
        aSRiver = GLES20.glGetAttribLocation(riverProgram, "aS")
        uRiverWash = GLES20.glGetUniformLocation(riverProgram, "uWash")
        uRiverBody = GLES20.glGetUniformLocation(riverProgram, "uBody")
        uRiverSpine = GLES20.glGetUniformLocation(riverProgram, "uSpine")
        uRiverFracs = GLES20.glGetUniformLocation(riverProgram, "uFracs")
        uRiverFlow = GLES20.glGetUniformLocation(riverProgram, "uFlow")
        uRiverAlpha = GLES20.glGetUniformLocation(riverProgram, "uAlpha")

        quadBuffer = floatBufferOf(-1f, -1f, 1f, -1f, -1f, 1f, 1f, 1f)

        // 宣纸背景纹理（assets 由 prepare-android.mjs 同步，缺失时退化为纯色）。
        // grain 用 REPEAT：shader 以 uv×1.2 采样（>1 越界），CLAMP_TO_EDGE 会把
        // 边缘一行噪点拉伸成顶部/右侧 17% 的横向色阶条带；POT 纹理方可 REPEAT。
        paperTexId = uploadAssetTexture("web/paper-texture.jpg")
        grainTexId = uploadAssetTexture("web/paper-grain.png", wrapRepeat = true)

        // GL context 重建（退后台再切回）：旧纹理 ID 已失效，需从缓存重新挂 pending
        watercolorTexId = 0
        watercolorQuad = null
        mountainTexId = 0
        mountainQuad = null
        prefectureTexId = 0
        prefectureQuad = null
        // 交叉淡入的 prev 纹理 ID 同样失效，重置（避免引用已失效纹理）
        prevWatercolorTexId = 0
        prevWatercolorQuad = null
        prevMountainTexId = 0
        prevMountainQuad = null
        crossfadeStartNanos = 0L
        restoreCachedTexture(lastWatercolorKey) { tex, quad ->
            pendingWatercolor = PendingTexture(tex, quad)
        }
        restoreCachedTexture(lastMountainKey) { tex, quad ->
            pendingMountains = PendingTexture(tex, quad)
        }
        restoreCachedTexture(lastPrefectureKey) { tex, quad ->
            pendingPrefectures = PendingTexture(tex, quad)
        }
    }

    /** 从水彩 LRU 缓存恢复待上传纹理（surface 重建后纹理 ID 失效） */
    private fun restoreCachedTexture(key: String?, assign: (WatercolorTexture, FloatBuffer) -> Unit) {
        if (key == null) return
        val entry = synchronized(watercolorCache) { watercolorCache[key] } ?: return
        if (entry.texture.bitmap == null) return // 缓存副本已被淘汰回收
        assign(entry.texture, entry.quad)
    }

    override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) {
        val prevW = viewportW
        val prevH = viewportH
        viewportW = width
        viewportH = height
        aspect = if (height > 0) width.toFloat() / height else 1f
        GLES20.glViewport(0, 0, width, height)
        // 仅在「大变化」时重置相机（旋转/首次创建）；系统栏显隐（±128px 抖动）
        // 不应打断用户的平移/缩放视图
        val smallChange = prevW > 0 && prevH > 0 &&
            kotlin.math.abs(width - prevW) < 200 && kotlin.math.abs(height - prevH) < 200
        if (!smallChange) resetCamera()
        onSurfaceSizeChanged?.invoke()
    }

    override fun onDrawFrame(gl: GL10?) {
        // 释放上轮 calibrate/切换时入队的旧纹理 ID（glDeleteTextures 必须在 GL 线程调用）
        if (texturesToDelete.isNotEmpty()) {
            val ids = synchronized(texturesToDelete) {
                if (texturesToDelete.isEmpty()) IntArray(0)
                else { val c = texturesToDelete.toIntArray(); texturesToDelete.clear(); c }
            }
            if (ids.isNotEmpty()) GLES20.glDeleteTextures(ids.size, ids, 0)
        }
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)

        // 性能回归：每 5 秒输出一次 FPS（P20 低端机帧率观测）
        frameCount++
        val now = System.nanoTime()
        if (now - lastFpsLog > 5_000_000_000L) {
            val fps = frameCount * 1_000_000_000.0 / (now - lastFpsLog)
            Log.d("HistoryMap", "fps=%.1f".format(fps))
            frameCount = 0
            lastFpsLog = now
        }

        // 1. 宣纸底 + 纹理 + 颗粒 + 暗角（NDC 全屏）
        drawPaperBackground()

        // 2. 上传待处理纹理；若已有当前纹理则启动交叉淡入（旧→prev 淡出，新→current 淡入）
        uploadPendingWatercolor()
        uploadPendingTerrain()
        uploadPendingPrefectures()

        // 2.5 LOD alpha 平滑（州府描边 L2 ×0.6 / L3 ×1.0；山脉纹理 L3 ~0.3，250ms 过渡）
        val frameNow = System.nanoTime()
        val dtSec = ((frameNow - lastFrameNanos) / 1_000_000_000f).coerceIn(0f, 0.25f)
        lastFrameNanos = frameNow
        smoothLodAlpha(dtSec)

        // 3. 交叉淡入进度（0=刚开始，1=稳定；无过渡时为 1）
        val t = crossfadeAlpha()
        val crossfading = crossfadeStartNanos != 0L && t < 1f

        // 4. 山脉层（design 图层序 5：画在水彩之下；LOD 档位调制整体透明度）
        if (showRivers) {
            if (crossfading && prevMountainTexId != 0 && prevMountainQuad != null) {
                drawTextureQuad(prevMountainTexId, prevMountainQuad!!, (1f - t) * mountainAlphaSmooth)
            }
            val mQuad = mountainQuad
            if (mountainTexId != 0 && mQuad != null) {
                drawTextureQuad(mountainTexId, mQuad, (if (crossfading) t else 1f) * mountainAlphaSmooth)
            }
        }
        // 5. 水彩疆域（design 图层序 6-10）：每张先画接触阴影 pass（右下偏移、
        //    贴图 alpha 勾形——政权从纸上「浮起」一层）再画本体；
        //    过渡中先画旧（1-t）再画新（t），稳定后只画新
        if (showTerritory && showWatercolor) {
            if (crossfading && prevWatercolorTexId != 0 && prevWatercolorQuad != null) {
                drawTextureQuad(prevWatercolorTexId, prevWatercolorQuad!!, 1f - t, shadow = true)
                drawTextureQuad(prevWatercolorTexId, prevWatercolorQuad!!, 1f - t)
            }
            val wcQuad = watercolorQuad
            if (watercolorTexId != 0 && wcQuad != null) {
                val a = if (crossfading) t else 1f
                drawTextureQuad(watercolorTexId, wcQuad, a, shadow = true)
                drawTextureQuad(watercolorTexId, wcQuad, a)
            }
        }
        // 5.5 州府边界描边（水彩之上、河道之下；独立开关 + LOD alpha，等价 Web z=7.02）
        if (showPrefectures) {
            val pQuad = prefectureQuad
            if (prefectureTexId != 0 && pQuad != null && prefectureAlphaSmooth > 0.003f) {
                drawTextureQuad(prefectureTexId, pQuad, prefectureAlphaSmooth)
            }
        }
        // 6. 河道带（design 图层序 11-13：画在水彩之上；变宽/羽化/顺流微动画）
        if (showRivers) {
            riverRibbons?.let { drawRiverRibbons(it) }
        }

        // 7. 交叉淡入完成：回收旧纹理（prev），结束过渡
        if (!crossfading &&
            (prevWatercolorTexId != 0 || prevMountainTexId != 0)
        ) finishCrossfade()
    }

    /**
     * 上传待处理水彩纹理：若当前已有纹理则把它移到 prev 并启动交叉淡入；
     * 否则（首次加载 / 朝代切换清空后）直接作为当前纹理，无过渡。
     */
    private fun uploadPendingWatercolor() {
        val pending = pendingWatercolor ?: return
        pendingWatercolor = null
        val quad = pending.quad
        if (watercolorTexId != 0 && watercolorQuad != null) {
            if (prevWatercolorTexId != 0) texturesToDelete.add(prevWatercolorTexId)
            prevWatercolorTexId = watercolorTexId
            prevWatercolorQuad = watercolorQuad
            crossfadeStartNanos = System.nanoTime()
        } else if (watercolorTexId != 0) {
            texturesToDelete.add(watercolorTexId)
        }
        uploadTexture(pending.texture, quad) { id ->
            watercolorTexId = id
            watercolorQuad = quad
        }
    }

    /** 上传待处理山水纹理（山脉槽；河流已改为几何渲染，不再走纹理） */
    private fun uploadPendingTerrain() {
        uploadPendingMountains()
    }

    /** 上传待处理山脉纹理（逻辑同 [uploadPendingWatercolor]） */
    private fun uploadPendingMountains() {
        val pending = pendingMountains ?: return
        pendingMountains = null
        val quad = pending.quad
        if (mountainTexId != 0 && mountainQuad != null) {
            if (prevMountainTexId != 0) texturesToDelete.add(prevMountainTexId)
            prevMountainTexId = mountainTexId
            prevMountainQuad = mountainQuad
            crossfadeStartNanos = System.nanoTime()
        } else if (mountainTexId != 0) {
            texturesToDelete.add(mountainTexId)
        }
        uploadTexture(pending.texture, quad) { id ->
            mountainTexId = id
            mountainQuad = quad
        }
    }

    /** 上传待处理州府描边纹理（直接替换当前，无交叉淡入——可见性由 LOD alpha 平滑控制） */
    private fun uploadPendingPrefectures() {
        val pending = pendingPrefectures ?: return
        pendingPrefectures = null
        val quad = pending.quad
        if (prefectureTexId != 0) texturesToDelete.add(prefectureTexId)
        uploadTexture(pending.texture, quad) { id ->
            prefectureTexId = id
            prefectureQuad = quad
        }
    }

    /**
     * LOD alpha 平滑（指数趋近：时间常数 ≈ 过渡时长/3，250ms 内到达 ~95%）。
     * 州府描边：L0/L1 隐藏，L2 ×0.6，L3 ×1.0（线色 0.36 已烘焙在 canvas）；
     * 山脉纹理：L3 降至 ~30%，避免放大后纹理过粗。
     */
    private fun smoothLodAlpha(dtSec: Float) {
        val m = MapTokens.MapParams
        val prefTarget = when {
            !showPrefectures || lodTier < 2 -> 0f
            lodTier == 2 -> m.LOD_PREFECTURE_L2_ALPHA
            else -> 1f
        }
        val mtnTarget = if (lodTier == 3) m.LOD_MOUNTAIN_L3_ALPHA else 1f
        // 河流几何 alpha（§4.2 矩阵）：rank2 L0 ×0.4、rank3 L0 隐藏/L1 ×0.4
        val riverTargets = floatArrayOf(
            1f,
            if (lodTier == 0) 0.4f else 1f,
            when (lodTier) { 0 -> 0f; 1 -> 0.4f; else -> 1f },
        )
        val factor = 1f - kotlin.math.exp(-dtSec / (m.LOD_TRANSITION_MS / 1000f / 3f))
        prefectureAlphaSmooth += (prefTarget - prefectureAlphaSmooth) * factor
        mountainAlphaSmooth += (mtnTarget - mountainAlphaSmooth) * factor
        for (i in riverAlphaSmooth.indices) {
            riverAlphaSmooth[i] += (riverTargets[i] - riverAlphaSmooth[i]) * factor
        }
    }

    /** 交叉淡入进度（0..1）；无进行中的过渡返回 1 */
    private fun crossfadeAlpha(): Float {
        if (crossfadeStartNanos == 0L) return 1f
        val elapsedMs = (System.nanoTime() - crossfadeStartNanos) / 1_000_000f
        return (elapsedMs / crossfadeDurationMs).coerceIn(0f, 1f)
    }

    /** 结束交叉淡入：把 prev 纹理排入删除队列并清空过渡状态 */
    private fun finishCrossfade() {
        if (prevWatercolorTexId != 0) texturesToDelete.add(prevWatercolorTexId)
        if (prevMountainTexId != 0) texturesToDelete.add(prevMountainTexId)
        prevWatercolorTexId = 0
        prevWatercolorQuad = null
        prevMountainTexId = 0
        prevMountainQuad = null
        crossfadeStartNanos = 0L
    }

    /** 删除 GL 纹理（GL 线程；id 为 0 时无操作） */
    private fun deleteTexture(texId: Int) {
        if (texId == 0) return
        GLES20.glDeleteTextures(1, intArrayOf(texId), 0)
    }

    // ================= 数据接入（UI 线程调用，纯数据准备） =================

    /**
     * 加载一个时期/朝代的疆域叠加层（OverlayParser 解析后的模型）。
     * @param model OverlayParser.getOverlay 的解析结果
     * @param calibrate 是否重新标定投影（首次加载传 true，之后传 false——
     *                  与 Web 版 fitProjection 单例语义一致，保证切朝代后坐标不变）
     * @param cacheKey 叠加层 JSON 原文（水彩 CPU 缓存 key；传 null 不缓存）
     */
    fun setOverlay(model: OverlayModel, calibrate: Boolean, cacheKey: String? = null) {
        overlayModel = model
        // 切朝代（重新标定投影）：新投影坐标系与旧纹理 worldBox 不一致，
        // 立即摘除旧水彩/山水纹理，避免「旧疆域被新相机缩放/错位」的瞬态画面。
        // 旧 GL 纹理 ID 不能在 UI 线程 glDeleteTextures，入队由 GL 线程删除，避免泄漏。
        if (calibrate) {
            if (watercolorTexId != 0) texturesToDelete.add(watercolorTexId)
            if (mountainTexId != 0) texturesToDelete.add(mountainTexId)
            if (prefectureTexId != 0) texturesToDelete.add(prefectureTexId)
            watercolorTexId = 0
            watercolorQuad = null
            mountainTexId = 0
            mountainQuad = null
            prefectureTexId = 0
            prefectureQuad = null
        }
        // 时期切换：新时期无州府面时立即摘除旧描边纹理（避免旧州府线残留在新时期画面上）
        if (model.prefectures.isEmpty()) {
            if (prefectureTexId != 0) texturesToDelete.add(prefectureTexId)
            prefectureTexId = 0
            prefectureQuad = null
        }
        val p = if (calibrate || projection == null) {
            MercatorProjection.fit(OverlayParser.allPoints(model)).also { projection = it }
        } else {
            projection!!
        }
        labels = model.labels.map { l ->
            val xy = p.project(l.coord)
            WorldLabel(l.text, xy[0], xy[1], l.kind, l.major, l.rank)
        }
        // 图例配色按 entity 去重：同一政权的多个 feature（按省份拆分）只保留一行
        regimeColors = model.regimes.map { it.entity to it.color }.distinctBy { it.first }
        // 世界包围盒（水彩/山水共用）：由模型全体要素计算
        val bounds = boundsOf(model, p)
        worldBounds = bounds
        // 中原锚点（宋政权域包围盒）：resetCamera 水平锚定用
        anchorBounds = anchorBoundsOf(model, p)

        // 河道带几何：与水彩贴图共用 watercolorWorldBox 的镜像轴（推导见 worldToScreen），
        // 保证河与世界坐标锚点（标签/事件）对齐；3 条河 ×~40 平滑点，主线程亚毫秒级
        riverRibbons = if (model.rivers.isEmpty()) null else RiverRibbonBuilder.build(
            model.rivers, p,
            watercolorWorldBox(model, p) ?: bounds,
            viewportW, context.resources.displayMetrics.density,
        )

        val density = context.resources.displayMetrics.density
        // 首次/朝代切换（calibrate）：数据就绪后立即取全图视野，
        // 避免 surface 先创建（worldBounds 未就绪）时停留在 fallback 放大视图
        if (calibrate) resetCamera()
        Log.d(
            "HistoryMap",
            "setOverlay: ${model.regimes.size} regimes, ${model.rivers.size} rivers, ${model.mountains.size} mountains, ${labels.size} labels (cacheKey=${cacheKey != null})"
        )
    }

    /**
     * 在后台线程生成水彩/山水纹理（P3：纯 CPU，不碰 GL 与 Compose 状态，
     * 由调用方放到 Dispatchers.IO，避免阻塞主线程）。结果经 [setTextures] 挂接。
     * 山水只剩山脉层入 LRU（河流改为几何渲染 RiverRibbons，不走纹理）。
     */
    fun buildTextures(
        model: OverlayModel,
        cacheKey: String?,
        density: Float,
    ): Pair<WatercolorTexture?, TerrainLayers?> {
        val p = projection ?: MercatorProjection.fit(OverlayParser.allPoints(model))
        val key = if (cacheKey == null) null else "$cacheKey|${viewportW}x${viewportH}|$density"
        lastWatercolorKey = key
        // 水彩疆域：资源贴图优先（assets 烘焙贴图，双端共用）；缺失/失败回退
        // 程序化离屏生成（羽化 + 斑驳 + 边界 + fillOpacity）。GL 上传延后。
        val watercolor = buildCachedWatercolor(key) {
            BakedWatercolorLoader.load(context, model, p)
                ?: WatercolorBuilder.build(model, p, viewportW, viewportH, density)
        }
        // 山脉层：与水彩同包围盒，保证叠加对齐；河流槽恒空（几何渲染）
        val box = watercolor?.worldBox ?: boundsOf(model, p)
        val mountainsKey = key?.let { "$it|terrain|mountains" }
        lastMountainKey = mountainsKey
        val terrain = peekCache(mountainsKey)?.let { TerrainLayers(it, null) }
            ?: TerrainTextureBuilder.build(
                // 河流由 RiverRibbonBuilder 几何渲染，纹理侧跳过（省 CPU 与显存）
                model.copy(rivers = emptyList()), p, box, viewportW, viewportH, density,
            ).also { layers -> putCache(mountainsKey, layers.mountains) }
        // 州府边界独立描边层（运行时生成、许可安全；与水彩同 worldBox 叠加）
        val prefecturesKey = key?.let { "$it|terrain|prefectures" }
        lastPrefectureKey = prefecturesKey
        val prefectureLayer = peekCache(prefecturesKey)
            ?: PrefectureStrokeBuilder.build(model, p, box, viewportW, viewportH, density)
                ?.also { putCache(prefecturesKey, it) }
        return watercolor to TerrainLayers(terrain.mountains, terrain.rivers, prefectureLayer)
    }

    /** 挂接后台生成的纹理（主线程调用；GL 线程懒上传） */
    fun setTextures(watercolor: WatercolorTexture?, terrain: TerrainLayers?) {
        // 替换前若旧 pending 仍存在（尚未上传）且非缓存，回收其 bitmap，避免快速切换泄漏
        recyclePendingIfNotCached(pendingWatercolor)
        recyclePendingIfNotCached(pendingMountains)
        recyclePendingIfNotCached(pendingPrefectures)
        // worldToScreen 的 y 镜像轴基准（水彩/山水共用同一 worldBox）
        if (watercolor != null) {
            textureWorldBox = watercolor.worldBox
            pendingWatercolor = PendingTexture(watercolor, buildTexQuad(watercolor.worldBox))
        }
        terrain?.mountains?.let { pendingMountains = PendingTexture(it, buildTexQuad(it.worldBox)) }
        terrain?.prefectures?.let { pendingPrefectures = PendingTexture(it, buildTexQuad(it.worldBox)) }
    }

    /** 非缓存 pending 纹理被覆盖前回收 bitmap（缓存副本由 LRU 统一回收） */
    private fun recyclePendingIfNotCached(pending: PendingTexture?) {
        val tex = pending?.texture ?: return
        if (!isCached(tex)) tex.bitmap?.recycle()
    }

    /** 事件经纬度 → 世界坐标（UI 线程用；投影未标定时返回原点） */
    fun projectEvent(lng: Double, lat: Double): Pair<Float, Float> {
        val p = projection ?: return 0f to 0f
        val xy = p.project(LngLat(lng, lat))
        return xy[0] to xy[1]
    }

    /** 视口尺寸（UI 线程用：命中测试等） */
    fun viewportWidth(): Int = viewportW

    fun viewportHeight(): Int = viewportH

    /** 世界包围盒宽（LOD s 判据分母；无数据返回 0） */
    fun worldWidth(): Float = worldBounds?.width() ?: 0f

    /** 可见世界宽（= 800 × zoom × viewport 宽高比；LOD s 判据分子） */
    fun visibleWorldWidth(): Float = 800f * zoom * (if (viewportH > 0) viewportW.toFloat() / viewportH else 1f)

    /**
     * 政权屏幕域（政权名 → 外环屏幕顶点）：标签布局用「位于本政权域内」约束。
     * 用当前相机状态投影，平移/缩放后调用方需重新获取。
     *
     * 修复：必须先把经纬度经投影转为世界坐标，再转屏幕坐标；
     * 直接把 lng/lat 当世界坐标会得到缩在地图一角的错误小多边形，
     * 导致 pointInPolygon 全部失败、政权名标签被整体隐藏。
     */
    fun screenRegimePolygons(): Map<String, List<android.graphics.PointF>> {
        val model = overlayModel ?: return emptyMap()
        val p = projection ?: return emptyMap()
        val out = HashMap<String, List<android.graphics.PointF>>()
        for (r in model.regimes) {
            if (out.containsKey(r.entity)) continue
            // 取面积最大的环作域约束：多块政权（1200 高丽 18 块 / 1279 元 20 块 /
            // 蒙古 / 宋 3 块）的 rings[0] 可能只是边角小岛，质心在主块——旧实现
            // 用 firstOrNull 会把主块质心误判域外，标签被按到贴边候选位或消失
            val outer = largestRing(r.rings) ?: continue
            if (outer.size < 3) continue
            val pts = outer.map { pt ->
                val xy = p.project(pt.lng, pt.lat)
                val (sx, sy) = worldToScreen(xy[0], xy[1])
                android.graphics.PointF(sx, sy)
            }
            out[r.entity] = pts
        }
        return out
    }

    /** 面积最大的环（shoelace；政权主体） */
    private fun largestRing(rings: List<List<LngLat>>): List<LngLat>? {
        var best: List<LngLat>? = null
        var bestArea = -1.0
        for (ring in rings) {
            var a = 0.0
            for (i in ring.indices) {
                val p1 = ring[i]
                val p2 = ring[(i + 1) % ring.size]
                a += p1.lng * p2.lat - p2.lng * p1.lat
            }
            a = kotlin.math.abs(a)
            if (a > bestArea) {
                bestArea = a
                best = ring
            }
        }
        return best
    }

    // ================= 水彩/山水缓存 =================

    private fun boundsOf(model: OverlayModel, p: MercatorProjection): RectF {
        var x0 = Float.POSITIVE_INFINITY
        var y0 = Float.POSITIVE_INFINITY
        var x1 = Float.NEGATIVE_INFINITY
        var y1 = Float.NEGATIVE_INFINITY
        fun acc(pt: LngLat) {
            val xy = p.project(pt)
            x0 = minOf(x0, xy[0]); x1 = maxOf(x1, xy[0])
            y0 = minOf(y0, xy[1]); y1 = maxOf(y1, xy[1])
        }
        model.regimes.forEach { r -> r.rings.forEach { ring -> ring.forEach { acc(it) } } }
        model.rivers.forEach { r -> r.path.forEach { acc(it) } }
        model.mountains.forEach {
            if (it.path != null) it.path.forEach { acc(it) } else it.coord?.let { acc(it) }
        }
        if (!(x0.isFinite() && y0.isFinite() && x1 > x0 && y1 > y0)) return RectF(-500f, -400f, 500f, 400f)
        // 6% 边距（水彩晕染会超出多边形）
        val padX = (x1 - x0) * 0.06f
        val padY = (y1 - y0) * 0.06f
        return RectF(x0 - padX, y0 - padY, x1 + padX, y1 + padY)
    }

    /** 宋政权域包围盒（中原锚点；无匹配政权返回 null） */
    private fun anchorBoundsOf(model: OverlayModel, p: MercatorProjection): RectF? {
        var x0 = Float.POSITIVE_INFINITY
        var y0 = Float.POSITIVE_INFINITY
        var x1 = Float.NEGATIVE_INFINITY
        var y1 = Float.NEGATIVE_INFINITY
        for (r in model.regimes) {
            if (!r.entity.contains("宋")) continue
            for (ring in r.rings) for (pt in ring) {
                val xy = p.project(pt)
                x0 = minOf(x0, xy[0]); x1 = maxOf(x1, xy[0])
                y0 = minOf(y0, xy[1]); y1 = maxOf(y1, xy[1])
            }
        }
        return if (x0.isFinite() && y0.isFinite() && x1 > x0 && y1 > y0) RectF(x0, y0, x1, y1) else null
    }

    private fun buildCachedWatercolor(key: String?, build: () -> WatercolorTexture?): WatercolorTexture? {
        if (key == null) return build()
        synchronized(watercolorCache) {
            watercolorCache[key]?.let { return it.texture }
        }
        val tex = build() ?: return null
        synchronized(watercolorCache) {
            watercolorCache[key]?.let { return it.texture }
            watercolorCache[key] = WatercolorCacheEntry(tex, buildTexQuad(tex.worldBox), key)
        }
        return tex
    }

    /** 查缓存（命中返回纹理；未命中/无 key 返回 null） */
    private fun peekCache(key: String?): WatercolorTexture? {
        if (key == null) return null
        return synchronized(watercolorCache) { watercolorCache[key]?.texture }
    }

    /** 纹理入缓存（键冲突时保留既有项，避免覆盖 LRU 访问序） */
    private fun putCache(key: String?, tex: WatercolorTexture?) {
        if (key == null || tex == null) return
        synchronized(watercolorCache) {
            if (watercolorCache[key] == null) {
                watercolorCache[key] = WatercolorCacheEntry(tex, buildTexQuad(tex.worldBox), key)
            }
        }
    }

    private fun uploadTexture(tex: WatercolorTexture, quad: FloatBuffer, assignId: (Int) -> Unit) {
        val bmp = tex.bitmap ?: return // 缓存副本已被上传并回收
        val ids = IntArray(1)
        GLES20.glGenTextures(1, ids, 0)
        assignId(ids[0])
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, ids[0])
        // P3：mipmap 改善缩放时水彩颗粒闪烁（GLES2 支持 GL_LINEAR_MIPMAP_LINEAR）。
        // 但透明背景纹理做 mipmap 会渗入透明黑 → 疆域变暗；由 TEXTURE_MIPMAP 开关控制。
        if (MapTokens.MapParams.TEXTURE_MIPMAP) {
            GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR_MIPMAP_LINEAR)
        } else {
            GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
        }
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
        GLUtils.texImage2D(GLES20.GL_TEXTURE_2D, 0, bmp, 0)
        if (MapTokens.MapParams.TEXTURE_MIPMAP) GLES20.glGenerateMipmap(GLES20.GL_TEXTURE_2D)
        // 非缓存纹理（临时生成）：上传后回收；缓存副本保留 bitmap，
        // 供 GL surface 重建（退后台再切回）后重新上传，LRU 淘汰时才回收
        if (!isCached(tex)) bmp.recycle()
    }

    /** 纹理是否来自缓存（缓存副本由 LRU 淘汰时统一回收，避免重复 recycle） */
    private fun isCached(tex: WatercolorTexture): Boolean {
        synchronized(watercolorCache) {
            return watercolorCache.values.any { it.texture === tex }
        }
    }

    // ================= GL 绘制 =================

    /** 上传 assets 位图为 GL 纹理（宣纸背景用，一次性）；wrapRepeat 仅 POT 纹理可用 */
    private fun uploadAssetTexture(assetPath: String, wrapRepeat: Boolean = false): Int {
        return try {
            val bytes = context.assets.open(assetPath).use { it.readBytes() }
            val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return 0
            val ids = IntArray(1)
            GLES20.glGenTextures(1, ids, 0)
            GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, ids[0])
            GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
            GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
            GLES20.glTexParameteri(
                GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S,
                if (wrapRepeat) GLES20.GL_REPEAT else GLES20.GL_CLAMP_TO_EDGE,
            )
            GLES20.glTexParameteri(
                GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T,
                if (wrapRepeat) GLES20.GL_REPEAT else GLES20.GL_CLAMP_TO_EDGE,
            )
            GLUtils.texImage2D(GLES20.GL_TEXTURE_2D, 0, bmp, 0)
            bmp.recycle()
            ids[0]
        } catch (e: Exception) {
            Log.w("HistoryMap", "load bg texture failed: $assetPath", e)
            0
        }
    }

    private fun drawPaperBackground() {
        GLES20.glUseProgram(bgProgram)
        GLES20.glUniform2f(uResolution, viewportW.toFloat(), viewportH.toFloat())
        // 暗角/提亮径向中心：竖屏 = 地图区中心（uv.y 自底向上，屏幕 y 分数需翻转）
        val mp = MapTokens.MapParams
        val centerV = if (viewportH >= viewportW) {
            1f - (mp.CAMERA_MAP_AREA_TOP_FRAC + mp.CAMERA_MAP_AREA_BOTTOM_FRAC) / 2f
        } else {
            0.5f
        }
        GLES20.glUniform2f(uVignetteCenter, 0.5f, centerV)
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, paperTexId)
        GLES20.glUniform1i(uPaperTex, 0)
        GLES20.glActiveTexture(GLES20.GL_TEXTURE1)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, grainTexId)
        GLES20.glUniform1i(uGrainTex, 1)
        GLES20.glEnableVertexAttribArray(aPosBg)
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, 0)
        quadBuffer?.position(0)
        GLES20.glVertexAttribPointer(aPosBg, 2, GLES20.GL_FLOAT, false, 8, quadBuffer)
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
        GLES20.glDisableVertexAttribArray(aPosBg)
    }

    /** 世界坐标纹理 quad 采样（水彩/山水共用；位置已缓存，避免每帧查询）。
     *  @param alpha 整体透明度（交叉淡入：旧纹理淡出/新纹理淡入）
     *  @param shadow true=接触阴影 pass：贴图 alpha 勾形、墨色平涂、右下偏移
     *                （统一左上 45° 光向，政权色块从宣纸上「浮起」；见 REGIME_SHADOW_* token） */
    private fun drawTextureQuad(texId: Int, quad: FloatBuffer, alpha: Float = 1f, shadow: Boolean = false) {
        GLES20.glUseProgram(texProgram)
        GLES20.glUniformMatrix4fv(uViewProjTex, 1, false, buildViewProjMatrix(), 0)
        GLES20.glUniform1f(uTexAlpha, alpha)
        GLES20.glUniform1f(uTexShadow, if (shadow) 1f else 0f)
        if (shadow) {
            // 世界 y 经镜像后向下为 -y（viewProj 的 NDC y 向上），影向屏幕右下 = (+d, -d)
            val d = (worldBounds?.width() ?: 1000f) * MapTokens.MapParams.REGIME_SHADOW_OFFSET
            GLES20.glUniform2f(uTexOffset, d, -d)
        } else {
            GLES20.glUniform2f(uTexOffset, 0f, 0f)
        }
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, texId)
        GLES20.glUniform1i(uTex, 0)
        GLES20.glEnableVertexAttribArray(aPosTex)
        GLES20.glEnableVertexAttribArray(aUvTex)
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, 0)
        quad.position(0)
        GLES20.glVertexAttribPointer(aPosTex, 2, GLES20.GL_FLOAT, false, 16, quad)
        quad.position(2)
        GLES20.glVertexAttribPointer(aUvTex, 2, GLES20.GL_FLOAT, false, 16, quad)
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
        GLES20.glDisableVertexAttribArray(aPosTex)
        GLES20.glDisableVertexAttribArray(aUvTex)
    }

    /**
     * 河道带绘制：主流/支流各一组三角带，颜色与 alpha 用 design 河色 token，
     * 片元按 |side| 合成 水痕→主体→脊线 三层（宽度比由 uFracs 给出）+ 两岸羽化，
     * uFlow 驱动一段亮度沿河向下游缓慢移动（HoMM3 palette-cycling 式稀疏动画，
     * 只让河「活」、不动整幅地图）。时间取模 1h 保证 float 精度。
     */
    private fun drawRiverRibbons(ribbons: RiverRibbons) {
        val mp = MapTokens.MapParams
        val washC = MapTokens.Colors.RIVER_WASH
        val bodyC = MapTokens.Colors.RIVER_BODY
        GLES20.glUseProgram(riverProgram)
        GLES20.glUniformMatrix4fv(uViewProjRiver, 1, false, buildViewProjMatrix(), 0)
        GLES20.glUniform3f(
            uRiverFlow, mp.RIVER_FLOW_WAVE, mp.RIVER_FLOW_SPEED,
            (System.nanoTime() / 1_000_000_000f) % 3600f,
        )
        GLES20.glEnableVertexAttribArray(aPosRiver)
        GLES20.glEnableVertexAttribArray(aSideRiver)
        GLES20.glEnableVertexAttribArray(aSRiver)
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, 0)

        for (mesh in ribbons.meshes) {
            val majorRiver = mesh.rank <= 1
            val alpha = riverAlphaSmooth[(mesh.rank - 1).coerceIn(0, 2)]
            if (alpha <= 0.003f) continue
            GLES20.glUniform1f(uRiverAlpha, alpha)
            GLES20.glUniform4f(uRiverWash, washC.red, washC.green, washC.blue,
                (if (majorRiver) MapTokens.Alpha.MAJOR_RIVER_WASH else MapTokens.Alpha.MINOR_RIVER_WASH) / 255f)
            GLES20.glUniform4f(uRiverBody, bodyC.red, bodyC.green, bodyC.blue,
                (if (majorRiver) MapTokens.Alpha.MAJOR_RIVER_BODY else MapTokens.Alpha.MINOR_RIVER_BODY) / 255f)
            GLES20.glUniform4f(uRiverSpine, bodyC.red, bodyC.green, bodyC.blue,
                MapTokens.Alpha.MAJOR_RIVER_SPINE / 255f)
            GLES20.glUniform4f(uRiverFracs, mesh.fracs[0], mesh.fracs[1], if (majorRiver) 1f else 0f, mp.RIVER_FLOW_AMP)
            mesh.buffer.position(0)
            GLES20.glVertexAttribPointer(aPosRiver, 2, GLES20.GL_FLOAT, false, 16, mesh.buffer)
            mesh.buffer.position(2)
            GLES20.glVertexAttribPointer(aSideRiver, 1, GLES20.GL_FLOAT, false, 16, mesh.buffer)
            mesh.buffer.position(3)
            GLES20.glVertexAttribPointer(aSRiver, 1, GLES20.GL_FLOAT, false, 16, mesh.buffer)
            GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, mesh.vertexCount)
        }
        GLES20.glDisableVertexAttribArray(aPosRiver)
        GLES20.glDisableVertexAttribArray(aSideRiver)
        GLES20.glDisableVertexAttribArray(aSRiver)
    }

    /** 纹理 quad：世界坐标 4 角 + UV（x,y,u,v 交错） */
    private fun buildTexQuad(box: RectF): FloatBuffer {
        val x0 = box.left
        val y0 = box.top
        val x1 = box.right
        val y1 = box.bottom
        return floatBufferOf(
            x0, y0, 0f, 0f,
            x1, y0, 1f, 0f,
            x0, y1, 0f, 1f,
            x1, y1, 1f, 1f,
        )
    }

    // ================= 相机（UI 线程调用） =================

    /** 平移（屏幕像素 → 世界单位；地图跟随手指方向） */
    fun pan(dxPx: Float, dyPx: Float) {
        if (viewportH <= 0) return
        val worldPerPx = (2f * 400f * zoom) / viewportH
        cx += dxPx * worldPerPx
        cy -= dyPx * worldPerPx
    }

    /**
     * 缩放：围绕屏幕焦点 (fx, fy)（viewport 内 CSS 像素）。
     * factor 为 ScaleGestureDetector 的捏合系数（>1 = 两指张开）。
     * 注意本相机的 [zoom] 是「可见世界范围倍率」（越大视野越广、画面越小，
     * 见 resetCamera 注释），与视觉放大率互为倒数——两指张开（放大画面）要
     * 缩小可见范围，故用除法；曾误用乘法导致捏合方向反转（张开缩小、合拢放大）。
     */
    fun zoom(factor: Float, fx: Float, fy: Float) {
        if (viewportH <= 0 || factor <= 0f) return
        val old = zoom
        val new = (old / factor).coerceIn(0.25f, 24f)
        if (new == old) return
        // 焦点世界坐标保持不变：world = center + (focus - screenCenter) * worldPerPx
        val worldPerPx = (2f * 400f * old) / viewportH
        val wx = cx + (fx - viewportW / 2f) * worldPerPx
        val wy = cy - (fy - viewportH / 2f) * worldPerPx
        zoom = new
        val newPerPx = (2f * 400f * new) / viewportH
        cx = wx - (fx - viewportW / 2f) * newPerPx
        cy = wy + (fy - viewportH / 2f) * newPerPx
    }

    /**
     * 回到默认取景（对齐效果图 prompt_1：地图纵向充满顶栏与时间轴之间的地图区，
     * 左右两侧适度裁切、水平锚定中原）。
     *
     * zoom 是「可见世界范围倍率」（越大视野越广、画面越小，与视觉放大率互为倒数）：
     * 视口可见世界范围 = 宽 800×zoom×aspect、高 800×zoom。竖屏先 contain-fit 到**地图区**
     * （设计 token mapTop/mapBottom，而非整屏），再除以 [MapTokens.MapParams.CAMERA_FIT_BOOST]
     * 放大——真实疆域投影后约 2:1 宽扁，contain 时地图呈横条带、上下留白大；
     * 放大后纵向填满地图区、东西边缘政权（吐蕃西缘/金东缘）允许部分出屏。
     * 横屏地图区即整屏，保持 contain 不裁切。
     */
    fun resetCamera() {
        val box = worldBounds
        if (box == null || box.width() <= 0f || box.height() <= 0f) {
            zoom = viewportH / 800f
            cx = 0f
            cy = 0f
            Log.d("HistoryMap", "resetCamera(fallback) zoom=$zoom vp=${viewportW}x${viewportH}")
            return
        }
        val m = MapTokens.MapParams
        val portrait = viewportH >= viewportW
        val areaTopFrac = if (portrait) m.CAMERA_MAP_AREA_TOP_FRAC else 0f
        val areaBottomFrac = if (portrait) m.CAMERA_MAP_AREA_BOTTOM_FRAC else 1f
        val areaH = viewportH * (areaBottomFrac - areaTopFrac)
        val areaCenterY = viewportH * (areaTopFrac + areaBottomFrac) / 2f
        // contain-fit 到地图区：宽度受整屏视口约束，高度受地图区约束
        val zW = (box.width() * viewportH) / (viewportW * 800f)
        val zH = (box.height() * viewportH) / (areaH * 800f)
        val boost = if (portrait) m.CAMERA_FIT_BOOST else 1f
        zoom = (maxOf(zW, zH) / boost).coerceIn(0.25f, 24f)
        // 垂直：包围盒中心对齐地图区中心（世界 y 越大越靠南，相机南移则地图上移）
        cy = box.centerY() - (areaCenterY - viewportH / 2f) * (2f * 400f * zoom) / viewportH
        // 水平：锚定中原（宋域中心），钳制不出包围盒
        val visibleW = 2f * 400f * zoom * aspect
        val anchorX = anchorBounds?.centerX() ?: box.centerX()
        cx = if (visibleW < box.width()) {
            anchorX.coerceIn(box.left + visibleW / 2f, box.right - visibleW / 2f)
        } else {
            box.centerX()
        }
        Log.d("HistoryMap", "resetCamera zoom=$zoom cx=$cx cy=$cy vp=${viewportW}x${viewportH} box=$box anchor=${anchorBounds != null}")
    }

    /**
     * 世界坐标 → 屏幕像素（UI 线程用：Compose 标签/泡泡/区域层定位）。
     *
     * y 方向推导（R6-对齐修复）：水彩纹理管线中 bitmap 行序相对世界 y 有一次翻转
     * （toPx: py=(y1-wy)/…），quad UV 再映射——世界点 wy 的内容实际出现在
     * 「镜像四边形坐标」yg = (texBox.top+texBox.bottom) - wy 处。代入相机变换后：
     * sy = vpH/2 + (wy - (2·B' - cy)) / halfH · vpH/2，B' 为**纹理 worldBox 中心**。
     * 旧实现直接用 cy 作中心，仅在 cy=B'（旧 resetCamera 的隐含前提）时对齐；
     * 相机改为地图区取景后 cy≠B'，标签/泡泡整体纵向漂移数百像素。
     * 另：纹理 worldBox 只含政权，而 worldBounds 含河流+山脉（天山北缘超出政权），
     * 两者中心本就有差，统一改用纹理 worldBox 消除历史偏差。
     */
    fun worldToScreen(wx: Float, wy: Float): Pair<Float, Float> {
        val halfH = 400f * zoom
        val halfW = halfH * aspect
        val sx = (wx - cx) / halfW * (viewportW / 2f) + viewportW / 2f
        // 镜像轴：纹理 worldBox 中心（无纹理时退回 worldBounds，再退回 cy）
        val mirrorCenterY = textureWorldBox?.let { it.top + it.bottom - cy }
            ?: worldBounds?.let { it.top + it.bottom - cy }
            ?: cy
        val sy = viewportH / 2f + (wy - mirrorCenterY) / halfH * (viewportH / 2f)
        return sx to sy
    }

    // ================= 矩阵与着色器 =================

    private fun buildViewProjMatrix(): FloatArray {
        val halfH = 400f * zoom
        val halfW = halfH * aspect
        // NDC.x = (v.x - cx) / halfW，NDC.y = (v.y - cy) / halfH（y 向上）
        // 与 worldToScreen() 同一套 (v - cameraCenter) 变换，平移符号保持一致
        val m = FloatArray(16)
        m[0] = 1f / halfW
        m[5] = 1f / halfH
        m[10] = -1f
        m[12] = -cx / halfW
        m[13] = -cy / halfH
        m[15] = 1f
        return m
    }

    private fun floatBufferOf(vararg values: Float): FloatBuffer {
        val buf = ByteBuffer.allocateDirect(values.size * 4).order(ByteOrder.nativeOrder())
        val fb = buf.asFloatBuffer()
        fb.put(values)
        fb.position(0)
        return fb
    }

    private fun createProgram(vertexSrc: String, fragmentSrc: String): Int {
        val vs = compileShader(GLES20.GL_VERTEX_SHADER, vertexSrc)
        val fs = compileShader(GLES20.GL_FRAGMENT_SHADER, fragmentSrc)
        val program = GLES20.glCreateProgram()
        GLES20.glAttachShader(program, vs)
        GLES20.glAttachShader(program, fs)
        GLES20.glLinkProgram(program)
        val status = IntArray(1)
        GLES20.glGetProgramiv(program, GLES20.GL_LINK_STATUS, status, 0)
        if (status[0] == 0) {
            Log.e("HistoryMap", "program link failed: ${GLES20.glGetProgramInfoLog(program)}")
        }
        GLES20.glDeleteShader(vs)
        GLES20.glDeleteShader(fs)
        return program
    }

    private fun compileShader(type: Int, src: String): Int {
        val shader = GLES20.glCreateShader(type)
        GLES20.glShaderSource(shader, src)
        GLES20.glCompileShader(shader)
        val status = IntArray(1)
        GLES20.glGetShaderiv(shader, GLES20.GL_COMPILE_STATUS, status, 0)
        if (status[0] == 0) {
            Log.e("HistoryMap", "shader compile failed: ${GLES20.glGetShaderInfoLog(shader)}")
        }
        return shader
    }

    companion object {
        /**
         * 水彩 CPU 缓存上限。山水拆层后每时期 3 张纹理（水彩 + 山脉 + 河流），
         * 6 项 ≈ 两个时期；低于此则 GL surface 重建（后台恢复）时山水层可能被淘汰。
         */
        private const val MAX_CACHE = 6
        private val watercolorCache = object : LinkedHashMap<String, WatercolorCacheEntry>(MAX_CACHE, 0.75f, true) {
            override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, WatercolorCacheEntry>?): Boolean {
                if (size > MAX_CACHE) {
                    val bmp = eldest?.value?.texture?.bitmap
                    if (bmp != null) {
                        bmp.recycle()
                        eldest.value.texture.bitmap = null
                    }
                    return true
                }
                return false
            }
        }

        
        /**
         * 宣纸背景片元着色器：paper 纹理 + grain 颗粒 + 中心提亮 + 暖褐暗角。
         * 所有视觉参数来自 MapTokens.Map（design-tokens.json），只改 token 无需动 shader。
         * - uPaper：纸张纹理（白噪声纤维感，sample 后乘暖色；缺失时 hasPaper=0 退化为纯色）
         * - uGrain：颗粒纹理（screen 叠加，让纸面有颗粒感）
         * - uCenter：暗角/提亮的径向中心（uv 空间；竖屏为地图区中心，横屏为屏幕中心）
         * - 暗角用暖褐而非纯黑，参考图边缘向棕褐色渐暗
         */
        private fun buildFragBg(): String {
            val paper = MapTokens.MapParams.PAPER_RGB
            return """
                precision mediump float;
                uniform sampler2D uPaper;
                uniform sampler2D uGrain;
                uniform vec2 uResolution;
                uniform vec2 uCenter;
                void main() {
                    vec2 uv = gl_FragCoord.xy / uResolution;
                    // 纸张纹理作为纤维细节调制暖纸色，而不是完全取代：
                    // 纯色 base 占 (1-STRENGTH)，纹理占 STRENGTH；纹理先暖化（去冷蓝）再混合
                    vec3 paper = texture2D(uPaper, uv).rgb * vec3(1.03, 1.0, 0.90);
                    float hasPaper = step(0.001, length(paper));
                    vec3 base = mix(vec3(${paper[0]}, ${paper[1]}, ${paper[2]}), paper, hasPaper * ${MapTokens.MapParams.PAPER_TEXTURE_STRENGTH});
                    // 颗粒层（screen 近似）
                    float grain = texture2D(uGrain, uv * 1.2).r;
                    base = mix(base, vec3(1.0), grain * ${MapTokens.MapParams.PAPER_GRAIN_STRENGTH});
                    // 中心提亮 + 暖褐暗角：径向距离做纵横比校正
                    // （uv 空间等距圈在竖屏上是纵向拉扁的椭圆，边界横穿屏幕产生横向色阶；
                    //  x 除以宽高比后等距圈为屏幕空间的圆，暗角自然包裹地图区）
                    float d = length((uv - uCenter) * vec2(uResolution.x / uResolution.y, 1.0));
                    base *= 1.0 + (1.0 - smoothstep(0.0, ${MapTokens.MapParams.CENTER_LIGHT_RADIUS}, d)) * ${MapTokens.MapParams.CENTER_LIGHT_STRENGTH};
                    // 暖褐暗角
                    base *= 1.0 - smoothstep(${MapTokens.MapParams.VIGNETTE_START}, ${MapTokens.MapParams.VIGNETTE_END}, d) * ${MapTokens.MapParams.VIGNETTE_STRENGTH};
                    // GL/Compose 亮度对齐（GLSurfaceView 无 sRGB 管理，整体提亮）
                    base *= ${MapTokens.MapParams.GL_BRIGHTNESS};
                    gl_FragColor = vec4(base, 1.0);
                }
            """
        }

        
        /** 纹理 quad：世界坐标 + UV（水彩/山水；同样乘 GL_BRIGHTNESS 对齐 Compose 亮度；
         *  uAlpha 用于交叉淡入，整体调制透明度。uShadow=1 时为接触阴影 pass：
         *  用贴图自身 alpha 勾形、墨色平涂——水彩羽化的软边天然成为软影边） */
        private fun buildFragTex(): String {
            val shadowAlpha = MapTokens.MapParams.REGIME_SHADOW_ALPHA
            return """
                precision mediump float;
                uniform sampler2D uTex;
                uniform float uAlpha;
                uniform float uShadow;
                varying vec2 vUv;
                void main() {
                    vec4 c = texture2D(uTex, vUv);
                    if (uShadow > 0.5) {
                        c = vec4(0.227, 0.204, 0.157, c.a * $shadowAlpha);
                    } else {
                        c.rgb *= ${MapTokens.MapParams.GL_BRIGHTNESS};
                    }
                    c.a *= uAlpha;
                    gl_FragColor = c;
                }
            """
        }

        
        /**
         * 河道带着色：按 |side| 从外到内叠 水痕→主体→脊线 三层（src-over 合成），
         * 外缘 smoothstep 羽化代替硬边（两岸渗纸感）。uFlow(x=波长, y=速度, z=时间)
         * 驱动一段亮度沿河向下游缓慢移动——对齐 HoMM3 的 palette-cycling 思路：
         * 让 5% 的画面动起来，其余保持「纸上的画」。
         * uFracs = (主体/水痕宽度比, 脊线/水痕宽度比, 是否主流, 流动幅度)。
         */    }
}
