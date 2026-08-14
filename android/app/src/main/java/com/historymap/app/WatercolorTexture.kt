package com.historymap.app

import android.graphics.Bitmap
import android.graphics.BlendMode
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.os.Build
import java.util.Random
import kotlin.math.max
import kotlin.math.min

/**
 * 水彩晕染纹理：复刻 Web 版 client/src/map/TerritoryOverlay.js 的 OffscreenCanvas
 * 水彩管线到 Android（android.graphics 软件渲染，一次性生成后作为 GL 纹理使用）。
 *
 * 绘制顺序（对齐 Web 版，并针对移动端观感校准）：
 * 1. 羽化晕染层（大模糊、高透明，alpha 与 fillOpacity 联动）
 * 2. 主体色层（轻微模糊，alpha 与 fillOpacity 联动，让宣纸透出）
 * 3. 水彩斑驳（clip 路径内撒低透明径向色斑，模拟颜料不均）
 * 4. 淡墨边界（同色系描边）+ 干边（更深细描边）
 * 5. 暖色罩 + 纸张颗粒（仅在已有 alpha 区域生效，避免矩形脏块）
 *
 * 所有 alpha / 颜色 / 模糊 / 斑驳 / 宽度参数来自 MapTokens（design-tokens.json 唯一输入）。
 * P1-1：fillOpacity 经 MapParams.watercolorOpacity() 提高下限，低透明度政权的颜色
 * 不再被宣纸纹理完全压掉，宋/辽/西夏/吐蕃/大理等可区分。
 * 生成一次后缓存为 GL 纹理（MapRenderer 内 LRU），之后每帧只需一个 quad 采样。
 */
class WatercolorTexture(var bitmap: Bitmap?, val worldBox: RectF) {
    /** 是否来自缓存副本（缓存条目由 LRU 淘汰时统一回收，避免重复 recycle） */
    var cached: Boolean = false
}

/** 统一地图纹理尺寸（水彩/山水共用）：dpr 上限、宽度 1024..2048、高度按包围盒宽高比 */
fun mapTextureSize(viewW: Int, density: Float, boxAspect: Float): Pair<Int, Int> {
    val m = MapTokens.MapParams
    val dpr = min(m.TEXTURE_DPR_MAX, max(1f, density))
    val w = min(m.TEXTURE_WIDTH_MAX, max(m.TEXTURE_WIDTH_MIN, (viewW * dpr * m.TEXTURE_SCALE).toInt()))
    val h = max(m.TEXTURE_HEIGHT_MIN, (w * boxAspect).toInt())
    return w to h
}

object WatercolorBuilder {

    /**
     * 生成水彩纹理。
     * @param model 疆域叠加层模型（政权多边形）
     * @param projection 已标定投影（世界坐标）
     * @param viewW / viewH 视口像素（决定纹理分辨率）
     * @param density 屏幕密度（dpr 上限 2，低端机省内存）
     */
    fun build(model: OverlayModel, projection: MercatorProjection, viewW: Int, viewH: Int, density: Float): WatercolorTexture? {
        if (model.regimes.isEmpty()) return null
        val m = MapTokens.MapParams

        // 1. 世界坐标包围盒（+6% 边距，水彩晕染会超出多边形）
        var x0 = Double.POSITIVE_INFINITY
        var y0 = Double.POSITIVE_INFINITY
        var x1 = Double.NEGATIVE_INFINITY
        var y1 = Double.NEGATIVE_INFINITY
        for (regime in model.regimes) {
            for (ring in regime.rings) {
                for (p in ring) {
                    val xy = projection.project(p)
                    if (xy[0] < x0) x0 = xy[0].toDouble()
                    if (xy[0] > x1) x1 = xy[0].toDouble()
                    if (xy[1] < y0) y0 = xy[1].toDouble()
                    if (xy[1] > y1) y1 = xy[1].toDouble()
                }
            }
        }
        if (!(x0.isFinite() && y0.isFinite() && x1.isFinite() && y1.isFinite()) || x1 <= x0 || y1 <= y0) return null
        val padX = (x1 - x0) * 0.06
        val padY = (y1 - y0) * 0.06
        x0 -= padX; x1 += padX
        y0 -= padY; y1 += padY
        val worldBox = RectF(x0.toFloat(), y0.toFloat(), x1.toFloat(), y1.toFloat())

        // 2. 纹理尺寸（统一计算，与山水纹理同规则）
        val (W, H) = mapTextureSize(viewW, density, ((y1 - y0) / (x1 - x0)).toFloat())

        val bitmap = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap) // 软件渲染：BlurMaskFilter / Xfermode 全支持

        // 世界坐标 → 像素（y 翻转）
        val toPx = { wx: Float, wy: Float ->
            floatArrayOf(
                ((wx - x0) / (x1 - x0) * W).toFloat(),
                ((y1 - wy) / (y1 - y0) * H).toFloat(),
            )
        }

        // 3. 预建 Paint（各层复用，减少纹理生成期间的对象分配）
        val rng = Random(20260808)
        // 羽化晕染层：大模糊 fill → 软晕环。内部被 body(SRC) 覆盖，仅边缘晕环保留
        val bloomPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            maskFilter = BlurMaskFilter(
                max(m.WATERCOLOR_BLOOM_BLUR_BASE, W / m.WATERCOLOR_BLOOM_BLUR_DIV),
                BlurMaskFilter.Blur.NORMAL,
            )
        }
        val bodyPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            maskFilter = BlurMaskFilter(
                max(m.WATERCOLOR_BODY_BLUR_BASE, W / m.WATERCOLOR_BODY_BLUR_DIV),
                BlurMaskFilter.Blur.NORMAL,
            )
        }
        val boundaryPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            isAntiAlias = true
            style = Paint.Style.STROKE
            strokeWidth = m.WATERCOLOR_BOUNDARY_WIDTH
            strokeJoin = Paint.Join.ROUND
        }
        // P1-干边：加断续虚线（淡墨干笔感），消除「矢量描边」的连续锐利感
        val dryEdgePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            isAntiAlias = true
            style = Paint.Style.STROKE
            strokeWidth = m.WATERCOLOR_DRY_EDGE_WIDTH
            strokeJoin = Paint.Join.ROUND
            pathEffect = android.graphics.DashPathEffect(
                floatArrayOf(max(6f, W / 240f), max(5f, W / 320f)), 0f,
            )
        }
        val mottlePaint = Paint(Paint.ANTI_ALIAS_FLAG)

        // 4. 逐政权分层绘制（每政权一个组合 Path：所有 ring，EVEN_ODD 处理孔洞）
        val mottleMinF = m.WATERCOLOR_MOTTLE_MIN_FRAC
        val mottleMaxF = m.WATERCOLOR_MOTTLE_MAX_FRAC
        // 墨色边界（design boundary/dryEdge 色 rgba(58,52,40)）
        val inkC = MapTokens.Colors.INK
        val INK_RGB = intArrayOf((inkC.red * 255).toInt(), (inkC.green * 255).toInt(), (inkC.blue * 255).toInt())
        for (regime in model.regimes) {
            val tint = watercolorTint(regime.color)
            val rawOpacity = regime.color[3].coerceIn(0.1f, 1f) // 数据 fillOpacity（如宋 .40、周边 .30）
            val opacity = m.watercolorOpacity(rawOpacity)        // 提高下限，保留主/次差异

            // 组合路径：外环按正向，内环（孔洞）反向缠绕，EVEN_ODD 自动挖洞
            val path = Path()
            for (ring in regime.rings) {
                if (ring.size < 3) continue
                var first = true
                for (p in ring) {
                    val xy = projection.project(p)
                    val px = toPx(xy[0], xy[1])
                    if (first) {
                        path.moveTo(px[0], px[1])
                        first = false
                    } else {
                        path.lineTo(px[0], px[1])
                    }
                }
                path.close()
            }
            if (path.isEmpty) continue
            path.fillType = Path.FillType.EVEN_ODD

            // 4a. 羽化晕染层：大模糊 fill（软晕环；内部随后被 body SRC 覆盖）
            bloomPaint.color = Color.argb(
                (MapTokens.Alpha.WATERCOLOR_BLOOM * opacity).toInt(), tint[0], tint[1], tint[2],
            )
            canvas.drawPath(path, bloomPaint)

            // 4b. 主体色层：轻微模糊 fill，SRC 模式直接覆盖内部 bloom——
            // 内部 alpha = body（design 117×opacity），避免 bloom+body 叠加变暗（P20 实测根因）
            bodyPaint.color = Color.argb(
                (MapTokens.Alpha.WATERCOLOR_BODY * opacity).toInt(), tint[0], tint[1], tint[2],
            )
            bodyPaint.xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC)
            canvas.drawPath(path, bodyPaint)
            bodyPaint.xfermode = null

            // 4c. 水彩斑驳：clip 组合路径内撒低透明径向色斑（孔洞不撒）
            val bounds = RectF()
            path.computeBounds(bounds, true)
            canvas.save()
            canvas.clipPath(path)
            val blobCount = (m.WATERCOLOR_MOTTLE_COUNT_MIN + rng.nextInt(m.WATERCOLOR_MOTTLE_COUNT_RANGE)) *
                if (rawOpacity >= 0.36f) 2 else 1 // 主政权斑驳更丰富
            for (k in 0 until blobCount) {
                val cx = bounds.left + rng.nextFloat() * bounds.width()
                val cy = bounds.top + rng.nextFloat() * bounds.height()
                val r = m.WATERCOLOR_MOTTLE_RADIUS_BASE + rng.nextFloat() * m.WATERCOLOR_MOTTLE_RADIUS_RANGE
                val g = RadialGradient(
                    cx, cy, r,
                    intArrayOf(
                        Color.argb(
                            (mottleMinF + rng.nextFloat() * (mottleMaxF - mottleMinF)).times(255).toInt(),
                            tint[0], tint[1], tint[2],
                        ),
                        0,
                    ),
                    floatArrayOf(0f, 1f),
                    Shader.TileMode.CLAMP,
                )
                mottlePaint.shader = g
                canvas.drawCircle(cx, cy, r, mottlePaint)
            }
            canvas.restore()

            // 4d. 淡墨边界 + 干边（design 为墨色 rgba(58,52,40,0.478/0.278)，
            // 非政权 tint——墨色边界让相邻政权块清晰分隔）
            boundaryPaint.color = Color.argb(
                (MapTokens.Alpha.BOUNDARY * opacity).toInt(), INK_RGB[0], INK_RGB[1], INK_RGB[2],
            )
            canvas.drawPath(path, boundaryPaint)
            dryEdgePaint.color = Color.argb(
                (MapTokens.Alpha.DRY_EDGE * opacity).toInt(), INK_RGB[0], INK_RGB[1], INK_RGB[2],
            )
            canvas.drawPath(path, dryEdgePaint)
        }

        // 4e. 暖色罩：soft-light 低透明暖褐罩层（只作用于已有 alpha 区域，避免矩形脏块）
        val warm = MapTokens.Colors.WARM_WASH
        softLightFill(canvas, Color.argb(m.WARM_WASH_ALPHA, (warm.red * 255).toInt(), (warm.green * 255).toInt(), (warm.blue * 255).toInt()))

        // 4f. 纸张颗粒：纸棕色噪声 tile soft-light 叠加（design paperGrain；只作用于政权区域）
        canvas.drawBitmap(noiseTile, null, RectF(0f, 0f, W.toFloat(), H.toFloat()), Paint().apply {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                blendMode = BlendMode.SOFT_LIGHT
            } else {
                xfermode = PorterDuffXfermode(PorterDuff.Mode.OVERLAY)
            }
        })

        return WatercolorTexture(bitmap, worldBox)
    }

    /**
     * soft-light 混合（暖色罩）：API 29+ 用 BlendMode（PorterDuff.Mode.SOFT_LIGHT
     * 已在 compileSdk 34 移除），旧设备用 OVERLAY 近似。
     */
    private fun softLightFill(canvas: Canvas, color: Int) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            canvas.drawColor(color, BlendMode.SRC_ATOP) // 只作用在已有 alpha 区域
        } else {
            canvas.drawColor(color, PorterDuff.Mode.SRC_ATOP)
        }
    }

    /**
     * 政权色 → 水彩颜料色：降饱和、压明度（对齐 Web 版 TerritoryOverlay.js 的
     * watercolorTint：HSL 亮度钳制 [0.32, 0.46]、饱和度保留 78%）。
     *
     * P5-修复（真机截图对照 prompt_1）：旧实现把 HSL 亮度换算成 HSV 的 V 再钳到
     * [0.38, 0.60]，暗色政权（宋 #b03a2e）的 V 被压到 0.38，比 Web 版 tint
     * 深 20%+，且饱和度换算路径不同导致灰感；现直接按 Web 公式输出，
     * 宋 (176,58,46) → (133,57,49)，与参考图领土色一致。
     */
    private fun watercolorTint(rgba: FloatArray): IntArray {
        val r = rgba[0]; val g = rgba[1]; val b = rgba[2]
        val maxC = maxOf(r, g, b)
        val minC = minOf(r, g, b)
        val l = (maxC + minC) / 2f
        var h = 0f
        var s = 0f
        if (maxC != minC) {
            val d = maxC - minC
            s = if (l > 0.5f) d / (2f - maxC - minC) else d / (maxC + minC)
            h = when (maxC) {
                r -> (g - b) / d + (if (g < b) 6f else 0f)
                g -> (b - r) / d + 2f
                else -> (r - g) / d + 4f
            }
            h /= 6f
        }
        val ns = max(0f, s * 0.78f)
        val nl = min(0.46f, max(0.32f, l * 0.82f))
        // HSL → RGB（标准公式，与 Web 版 THREE.Color.setHSL 一致）
        val c = (1f - kotlin.math.abs(2f * nl - 1f)) * ns
        val hp = h * 6f
        val x = c * (1f - kotlin.math.abs(hp % 2f - 1f))
        val m = nl - c / 2f
        val (rr, gg, bb) = when {
            hp < 1f -> Triple(c, x, 0f)
            hp < 2f -> Triple(x, c, 0f)
            hp < 3f -> Triple(0f, c, x)
            hp < 4f -> Triple(0f, x, c)
            hp < 5f -> Triple(x, 0f, c)
            else -> Triple(c, 0f, x)
        }
        return intArrayOf(
            ((rr + m) * 255f).toInt().coerceIn(0, 255),
            ((gg + m) * 255f).toInt().coerceIn(0, 255),
            ((bb + m) * 255f).toInt().coerceIn(0, 255),
        )
    }

    /** 纸张颗粒噪声 tile（256×256，纸棕色低透明噪点，design paperGrain；进程内缓存） */
    private val noiseTile: Bitmap by lazy {
        val size = 256
        val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val rng = Random(20260807)
        val pixels = IntArray(size * size)
        val g = MapTokens.Colors.PAPER_GRAIN
        val gr = (g.red * 255).toInt()
        val gg = (g.green * 255).toInt()
        val gb = (g.blue * 255).toInt()
        val base = MapTokens.Alpha.PAPER_GRAIN
        for (i in pixels.indices) {
            val v = (base - 8 + rng.nextInt(12)).coerceAtLeast(10) // 18..29（减淡，防米褐滤镜）
            pixels[i] = Color.argb(v, gr, gg, gb)
        }
        bmp.setPixels(pixels, 0, size, 0, 0, size, size)
        bmp
    }
}
