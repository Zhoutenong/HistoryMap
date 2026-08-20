package com.historymap.app

import android.graphics.Bitmap
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import java.util.Random
import kotlin.math.max
import kotlin.math.min

/**
 * 山水分层产物（design 图层序：山脉在水彩之下、河流在水彩之上）：
 * [TerrainLayers.mountains] 山脉笔触层，[TerrainLayers.rivers] 河流水痕层，
 * [TerrainLayers.prefectures] 州府边界独立描边层（水彩之上、LOD 调 alpha）。
 */
class TerrainLayers(
    val mountains: WatercolorTexture?,
    val rivers: WatercolorTexture?,
    val prefectures: WatercolorTexture? = null,
)

/**
 * 山水纹理：河流水痕 + 山脉笔触（CPU 离屏生成，与水彩纹理同包围盒叠加）。
 *
 * 设计目标（对齐 design-tokens.json / 效果图）：
 * - 河流：不是单一 1px 线，而是「宽而淡的水痕层 + 窄而深的主体层 + 深主脊线」，
 *   颜色用设计河色（riverWash #7F9BA0 / riverBody #52767D，青蓝而非墨褐），
 *   主次河流按 design alpha 区分（major 46/110/140，minor 30/70），拐角平滑；
 *   整体低对比，不抢政权主体。
 * - 山脉：数据多为 Point，无山脊线时生成确定性的淡墨山形笔触（1-3 峰），
 *   颜色用设计 mountainInk #51483B、alpha 96；有 path 时直接描山脊线 + 皴法；
 *   效果图中山体成组、墨色可辨但不抢政权色块。
 *
 * 与水彩同一纹理坐标系（世界坐标 → 像素），保证与政权色块、事件、标签严格对齐。
 */
object TerrainTextureBuilder {

    /**
     * 生成山（mountains）与河（rivers）两张纹理。
     * @param model 叠加层模型（rivers / mountains）
     * @param projection 已标定投影
     * @param worldBox 水彩纹理的世界包围盒（须与水彩一致，保证 quad 对齐）
     * @param viewW / viewH 视口像素；density 屏幕密度
     */
    fun build(
        model: OverlayModel,
        projection: MercatorProjection,
        worldBox: RectF,
        viewW: Int,
        viewH: Int,
        density: Float,
    ): TerrainLayers {
        // 统一纹理尺寸（与水彩同规则；高度按包围盒宽高比）
        val (W, H) = mapTextureSize(viewW, density, worldBox.height() / worldBox.width())

        val riversBmp = if (model.rivers.isNotEmpty()) Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888) else null
        val mountainsBmp = if (model.mountains.isNotEmpty()) Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888) else null
        val riversCanvas = riversBmp?.let { Canvas(it) }
        val mountainsCanvas = mountainsBmp?.let { Canvas(it) }
        val x0 = worldBox.left.toDouble()
        val y0 = worldBox.top.toDouble()
        val x1 = worldBox.right.toDouble()
        val y1 = worldBox.bottom.toDouble()
        val toPx = { wx: Float, wy: Float ->
            floatArrayOf(
                ((wx - x0) / (x1 - x0) * W).toFloat(),
                ((y1 - wy) / (y1 - y0) * H).toFloat(),
            )
        }

        // 设计河色/山色（design-tokens.json mapAux）
        val washC = MapTokens.Colors.RIVER_WASH
        val bodyC = MapTokens.Colors.RIVER_BODY
        val mountainC = MapTokens.Colors.MOUNTAIN_INK
        val washRGB = intArrayOf((washC.red * 255).toInt(), (washC.green * 255).toInt(), (washC.blue * 255).toInt())
        val bodyRGB = intArrayOf((bodyC.red * 255).toInt(), (bodyC.green * 255).toInt(), (bodyC.blue * 255).toInt())
        val mountainRGB = intArrayOf((mountainC.red * 255).toInt(), (mountainC.green * 255).toInt(), (mountainC.blue * 255).toInt())

        // 河流：宽水痕（羽化）+ 主体河线（模糊）+ 主脊线（细深）
        val mp = MapTokens.MapParams
        if (riversCanvas != null) {
            for (river in model.rivers) {
                if (river.path.size < 2) continue
                val major = river.rank <= 1
                // 稀疏点做两次 Chaikin 平滑（河线更柔，接近毛笔运笔；地理位置不变）
                val raw = river.path.map { p ->
                    val xy = projection.project(p)
                    toPx(xy[0], xy[1])
                }
                val pts = if (raw.size <= 10) smoothPath(smoothPath(raw)) else raw
                val path = Path()
                pts.forEachIndexed { i, p ->
                    if (i == 0) path.moveTo(p[0], p[1]) else path.lineTo(p[0], p[1])
                }
                // 水痕层（宽、淡、羽化；design alpha：major 46 / minor 30）
                riversCanvas.save()
                riversCanvas.drawPath(path, Paint().apply {
                    isAntiAlias = true
                    style = Paint.Style.STROKE
                    strokeWidth = if (major) {
                        max(mp.RIVER_WASH_WIDTH_MIN, W / mp.RIVER_WASH_WIDTH_MAJOR_DIV)
                    } else {
                        max(mp.RIVER_WASH_WIDTH_MIN_MINOR, W / mp.RIVER_WASH_WIDTH_MINOR_DIV)
                    }
                    strokeCap = Paint.Cap.ROUND
                    strokeJoin = Paint.Join.ROUND
                    color = Color.argb(
                        if (major) MapTokens.Alpha.MAJOR_RIVER_WASH else MapTokens.Alpha.MINOR_RIVER_WASH,
                        washRGB[0], washRGB[1], washRGB[2],
                    )
                    maskFilter = BlurMaskFilter(
                        max(mp.RIVER_WASH_BLUR_MIN, W / mp.RIVER_WASH_BLUR_DIV), BlurMaskFilter.Blur.NORMAL,
                    )
                })
                riversCanvas.restore()
                // 主体河线（中等宽度、青蓝半透明；design alpha：major 110 / minor 70）
                riversCanvas.save()
                riversCanvas.drawPath(path, Paint().apply {
                    isAntiAlias = true
                    style = Paint.Style.STROKE
                    strokeWidth = if (major) {
                        max(mp.RIVER_BODY_WIDTH_MIN, W / mp.RIVER_BODY_WIDTH_MAJOR_DIV)
                    } else {
                        max(mp.RIVER_BODY_WIDTH_MIN_MINOR, W / mp.RIVER_BODY_WIDTH_MINOR_DIV)
                    }
                    strokeCap = Paint.Cap.ROUND
                    strokeJoin = Paint.Join.ROUND
                    color = Color.argb(
                        if (major) MapTokens.Alpha.MAJOR_RIVER_BODY else MapTokens.Alpha.MINOR_RIVER_BODY,
                        bodyRGB[0], bodyRGB[1], bodyRGB[2],
                    )
                })
                riversCanvas.restore()
                // 主脊线（细、深，仅大江；design alpha 140）
                if (major) {
                    riversCanvas.save()
                    riversCanvas.drawPath(path, Paint().apply {
                        isAntiAlias = true
                        style = Paint.Style.STROKE
                        strokeWidth = max(mp.RIVER_SPINE_WIDTH_MIN, W / mp.RIVER_SPINE_WIDTH_DIV)
                        strokeCap = Paint.Cap.ROUND
                        strokeJoin = Paint.Join.ROUND
                        color = Color.argb(
                            MapTokens.Alpha.MAJOR_RIVER_SPINE,
                            bodyRGB[0], bodyRGB[1], bodyRGB[2],
                        )
                    })
                    riversCanvas.restore()
                }
            }
        }

        // 山脉：确定性淡墨山形笔触（有 path 画连续山脊 + 皴法，无 path 画 1-3 峰 glyph）
        if (mountainsCanvas != null) {
            for (m in model.mountains) {
                if (m.path != null && m.path.size >= 2) {
                    // 稀疏点做 Chaikin 平滑，山脊拐角自然
                    val raw = m.path.map { p ->
                        val xy = projection.project(p)
                        toPx(xy[0], xy[1])
                    }
                    val pts = if (raw.size <= 12) smoothPath(raw) else raw
                    val path = Path()
                    pts.forEachIndexed { i, p ->
                        if (i == 0) path.moveTo(p[0], p[1]) else path.lineTo(p[0], p[1])
                    }
                    // 山体晕染 halo：宽而淡，让山脊有厚度。干笔断续（长虚线）——
                    // 东西走向山系的连续 halo 会整条横贯屏幕、被读作「纸面色带」，
                    // 断续后视觉上是成组山体而非断层
                    mountainsCanvas.drawPath(path, Paint().apply {
                        isAntiAlias = true
                        style = Paint.Style.STROKE
                        strokeWidth = max(
                            mp.MOUNTAIN_RIDGE_WIDTH_MIN * mp.MOUNTAIN_RIDGE_HALO_MULT,
                            W / (mp.MOUNTAIN_RIDGE_WIDTH_DIV / mp.MOUNTAIN_RIDGE_HALO_MULT),
                        )
                        strokeCap = Paint.Cap.ROUND
                        strokeJoin = Paint.Join.ROUND
                        pathEffect = android.graphics.DashPathEffect(
                            floatArrayOf(max(28f, W / 30f), max(14f, W / 55f)), 0f,
                        )
                        color = Color.argb(
                            (MapTokens.Alpha.MOUNTAIN * mp.MOUNTAIN_HALO_ALPHA_FRAC).toInt(),
                            mountainRGB[0], mountainRGB[1], mountainRGB[2],
                        )
                    })
                    // 山脊淡墨线（design mountain alpha 96 × RIDGE_ALPHA_FRAC）
                    mountainsCanvas.drawPath(path, Paint().apply {
                        isAntiAlias = true
                        style = Paint.Style.STROKE
                        strokeWidth = max(mp.MOUNTAIN_RIDGE_WIDTH_MIN, W / mp.MOUNTAIN_RIDGE_WIDTH_DIV)
                        strokeCap = Paint.Cap.ROUND
                        strokeJoin = Paint.Join.ROUND
                        color = Color.argb(
                            (MapTokens.Alpha.MOUNTAIN * mp.MOUNTAIN_RIDGE_ALPHA_FRAC).toInt(),
                            mountainRGB[0], mountainRGB[1], mountainRGB[2],
                        )
                    })
                    // 皴法短线：沿山脊间隔画垂直于走向的淡墨短线（确定性种子，跨帧稳定）
                    drawCunFa(mountainsCanvas, pts, W, m.name.hashCode(), mountainRGB)
                    // 沿山脊撒山形 glyph：连绵成组的山体造型（效果图的主体山形语言），
                    // 种子掺入段索引，位置确定且峰形各异
                    val glyphBase = max(mp.MOUNTAIN_GLYPH_SIZE_MIN, W / mp.MOUNTAIN_GLYPH_SIZE_DIV)
                    val glyphStep = glyphBase * mp.MOUNTAIN_RIDGE_GLYPH_STEP
                    val rng = Random(m.name.hashCode().toLong())
                    var gd = glyphStep * rng.nextFloat() // 首个错位，避免端头千篇一律
                    for (gi in 0 until pts.size - 1) {
                        val gp0 = pts[gi]
                        val gp1 = pts[gi + 1]
                        val gdx = gp1[0] - gp0[0]
                        val gdy = gp1[1] - gp0[1]
                        val gLen = kotlin.math.hypot(gdx.toDouble(), gdy.toDouble()).toFloat()
                        if (gLen <= 0f) continue
                        var dd = gd
                        while (dd < gLen) {
                            // 随机跳过 ~25%：打破等距节奏，形成疏密带（自然山系感）
                            if (rng.nextFloat() >= 0.25f) {
                                val fx = gp0[0] + gdx * (dd / gLen)
                                val fy = gp0[1] + gdy * (dd / gLen)
                                drawMountainGlyph(
                                    mountainsCanvas, fx, fy, W,
                                    m.name.hashCode() + gi * 31 + (dd.toInt() / 7), mountainRGB,
                                )
                            }
                            dd += glyphStep * (0.6f + rng.nextFloat() * 0.9f)
                        }
                        gd = dd - gLen
                    }
                }
                val coord = m.coord ?: continue
                val xy = projection.project(coord)
                val px = toPx(xy[0], xy[1])
                drawMountainGlyph(mountainsCanvas, px[0], px[1], W, m.name.hashCode(), mountainRGB)
            }
        }

        return TerrainLayers(
            mountainsBmp?.let { WatercolorTexture(it, worldBox) },
            riversBmp?.let { WatercolorTexture(it, worldBox) },
        )
    }

    /** 皴法短线：沿山脊每间隔一段画 1~2 条垂直走向的淡墨短笔触（模拟水墨皴法） */
    private fun drawCunFa(
        canvas: Canvas,
        pts: List<FloatArray>,
        texW: Int,
        seed: Int,
        mountainRGB: IntArray,
    ) {
        val rng = Random(seed.toLong())
        val mp = MapTokens.MapParams
        val len = max(4f, texW / mp.MOUNTAIN_CUNFA_LEN_DIV)  // 短笔长度
        val step = max(12f, texW / 130f)                       // 沿山脊取样间隔（R5 调稀）
        val cunPaint = Paint().apply {
            isAntiAlias = true
            style = Paint.Style.STROKE
            strokeWidth = max(1f, texW / mp.MOUNTAIN_CUNFA_WIDTH_DIV)
            strokeCap = Paint.Cap.ROUND
            color = Color.argb(
                (MapTokens.Alpha.MOUNTAIN * mp.MOUNTAIN_CUNFA_FRAC).toInt().coerceAtLeast(24),
                mountainRGB[0], mountainRGB[1], mountainRGB[2],
            )
        }
        var travelled = 0f
        for (i in 0 until pts.size - 1) {
            val p0 = pts[i]
            val p1 = pts[i + 1]
            val dx = p1[0] - p0[0]
            val dy = p1[1] - p0[1]
            val segLen = kotlin.math.hypot(dx.toDouble(), dy.toDouble()).toFloat()
            if (segLen <= 0f) continue
            val ux = dx / segLen
            val uy = dy / segLen
            val nx = -uy // 垂直方向
            val ny = ux
            var d = 0f
            while (d < segLen) {
                val x = p0[0] + ux * d
                val y = p0[1] + uy * d
                val side = if (rng.nextBoolean()) 1f else -1f
                val l = len * (0.6f + rng.nextFloat() * 0.8f)
                // 角度抖动 ±25°：皴线不完全垂直于山脊，打散规则感（自然笔触）
                val tilt = (rng.nextFloat() - 0.5f) * 0.87f
                val rnx = nx * kotlin.math.cos(tilt) - ny * kotlin.math.sin(tilt)
                val rny = nx * kotlin.math.sin(tilt) + ny * kotlin.math.cos(tilt)
                canvas.drawLine(
                    x - rnx * l * 0.5f * side, y - rny * l * 0.5f * side,
                    x + rnx * l * 0.5f * side, y + rny * l * 0.5f * side,
                    cunPaint,
                )
                d += step * (0.8f + rng.nextFloat() * 0.6f)
                travelled += step
                if (travelled > segLen * 3) break // 防稀疏线段密集
            }
        }
    }

    /** Chaikin 轻量曲线平滑（1 次迭代：每段 1/4、3/4 插两点），保持地理位置不变 */
    private fun smoothPath(pts: List<FloatArray>): List<FloatArray> {
        if (pts.size < 3) return pts
        val out = ArrayList<FloatArray>(pts.size * 2)
        for (i in 0 until pts.size - 1) {
            val p0 = pts[i]
            val p1 = pts[i + 1]
            out.add(floatArrayOf(p0[0] * 0.75f + p1[0] * 0.25f, p0[1] * 0.75f + p1[1] * 0.25f))
            out.add(floatArrayOf(p0[0] * 0.25f + p1[0] * 0.75f, p0[1] * 0.25f + p1[1] * 0.75f))
        }
        return out
    }

    /**
     * 山形笔触：1-2 个三角峰 + 淡墨干笔 + 随机旋转（位置哈希做种子，跨帧稳定）。
     * R3 定位：沿山脊撒点成「连绵山体」的低对比辅助层；主纹理是山脊线 + 皴法
     * （透明度/尺寸参数见 MapTokens，逐轮真机校准记录在其注释中）。
     */
    private fun drawMountainGlyph(
        canvas: Canvas,
        cx: Float,
        cy: Float,
        texW: Int,
        seed: Int,
        mountainRGB: IntArray,
    ) {
        val rng = Random(seed.toLong())
        val m = MapTokens.MapParams
        val base = max(m.MOUNTAIN_GLYPH_SIZE_MIN, texW / m.MOUNTAIN_GLYPH_SIZE_DIV)
        val peaks = 1 + rng.nextInt(2)
        val ink = Paint().apply {
            isAntiAlias = true
            style = Paint.Style.STROKE
            strokeWidth = max(m.MOUNTAIN_GLYPH_WIDTH_MIN, texW / m.MOUNTAIN_GLYPH_WIDTH_DIV)
            strokeCap = Paint.Cap.ROUND
            strokeJoin = Paint.Join.ROUND
            color = Color.argb(
                (MapTokens.Alpha.MOUNTAIN * m.MOUNTAIN_GLYPH_ALPHA_FRAC).toInt(),
                mountainRGB[0], mountainRGB[1], mountainRGB[2],
            )
        }
        val inkLight = Paint(ink).apply {
            color = Color.argb(
                (MapTokens.Alpha.MOUNTAIN * m.MOUNTAIN_LIGHT_FRAC).toInt(),
                mountainRGB[0], mountainRGB[1], mountainRGB[2],
            )
        }
        // 山形整体小幅旋转（-18°..18°），避免全部同角度
        val angle = (rng.nextFloat() - 0.5f) * 36f
        canvas.save()
        canvas.rotate(angle, cx, cy)
        // 主体峰（干笔描边三角）。注意：bitmap 相对屏幕纵向翻转（py=0 的行显示在
        // 屏幕底部），峰顶必须朝 +y（cy+h）方向画，屏幕上才是朝上的「∧」山形
        for (i in 0 until peaks) {
            val dx = (i - (peaks - 1) / 2f) * base * 0.8f
            val w = base * (0.5f + rng.nextFloat() * 0.7f)
            val h = base * (0.9f + rng.nextFloat() * 0.6f)
            val x = cx + dx
            val path = Path().apply {
                moveTo(x - w, cy)
                lineTo(x, cy + h)
                lineTo(x + w, cy)
            }
            canvas.drawPath(path, ink)
        }
        // 前景小峰（更淡，错位半格；仅双峰时保留，减少重复感）
        if (peaks > 1) {
            val dx = base * 0.3f
            val w = base * 0.4f
            val h = base * 0.6f
            val x = cx + dx
            val path = Path().apply {
                moveTo(x - w, cy - base * 0.15f)
                lineTo(x, cy + h * 0.7f)
                lineTo(x + w, cy - base * 0.15f)
            }
            canvas.drawPath(path, inkLight)
        }
        canvas.restore()
    }
}
