package com.historymap.app

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import kotlin.math.max

/**
 * 州府边界描边纹理（docs/zoom-lod-requirements.md §3.2 裁决）：
 * - 独立离屏 Canvas → GL 纹理 quad，**不烘焙**进可再分发水彩贴图
 *   （州府坐标为 CHGIS 派生，入贴图即触碰许可红线——运行时生成不落盘，许可安全）；
 * - z 序在水彩层之上（等价 Web 版 z=7.02），由「州府边界」开关独立控制；
 * - 线色 rgba(58,52,40,0.36)、线宽 1.1 设计 px（对齐 Web buildPrefectureCanvas）；
 * - LOD 调光在 GL 侧做：L2 alpha ×0.6，L3 ×1.0（GL uniform 过渡）。
 *
 * 与水彩同包围盒（政权-only + 6% 边距）与同纹理尺寸，保证 quad 叠加对齐。
 */
object PrefectureStrokeBuilder {

    /**
     * @param model 叠加层模型（prefectures 为空返回 null）
     * @param projection 已标定投影
     * @param worldBox 水彩纹理的世界包围盒（须与水彩一致）
     */
    fun build(
        model: OverlayModel,
        projection: MercatorProjection,
        worldBox: RectF,
        viewW: Int,
        viewH: Int,
        density: Float,
    ): WatercolorTexture? {
        if (model.prefectures.isEmpty()) return null
        val (W, H) = mapTextureSize(viewW, density, worldBox.height() / worldBox.width())
        val bitmap = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
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
        // 线色 rgba(58,52,40,0.36) / 线宽 1.1 设计 px（对齐 Web buildPrefectureCanvas）
        val ink = MapTokens.Colors.INK
        val inkR = (ink.red * 255).toInt()
        val inkG = (ink.green * 255).toInt()
        val inkB = (ink.blue * 255).toInt()
        val lineAlpha = (MapTokens.MapParams.PREFECTURE_LINE_ALPHA_FRAC * 255f).toInt()
        // 设计画布 1080px 宽 → 纹理像素：1.1 设计 px ≈ 1.1 × W/1080
        val lineWidth = max(1f, W * MapTokens.MapParams.PREFECTURE_LINE_WIDTH_DESIGN / DesignMetrics.CANVAS_WIDTH)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            isAntiAlias = true
            style = Paint.Style.STROKE
            strokeWidth = lineWidth
            strokeJoin = Paint.Join.ROUND
            color = Color.argb(lineAlpha, inkR, inkG, inkB)
        }
        for (pref in model.prefectures) {
            val path = Path()
            for (ring in pref.rings) {
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
            if (!path.isEmpty) canvas.drawPath(path, paint)
        }
        return WatercolorTexture(bitmap, worldBox)
    }
}
