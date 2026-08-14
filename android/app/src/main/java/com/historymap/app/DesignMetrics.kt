package com.historymap.app

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * 设计画布（1080×2244 px、480dpi）→ 当前设备的尺寸换算。
 *
 * 原则（对齐实施计划 M1「明确尺寸转换策略」）：
 * - 布局宽度/高度用屏幕比例（fillMaxWidth / widthScale），不把 996px、280px 等
 *   设计值直接写成同名 dp；
 * - 触摸区域用 dp 且 ≥ [TOUCH_MIN_DP]（44dp）；
 * - 文字用 sp（[designSp]）；
 * - 地图纹理用独立像素参数（MapRenderer 内直接用设计 px × dpr，不经过本工具）。
 *
 * 纯函数部分不依赖 Android 框架，可直接做 JVM 单测。
 */
object DesignMetrics {
    /** 设计画布宽（px） */
    const val CANVAS_WIDTH = 1080f
    /** 设计画布高（px） */
    const val CANVAS_HEIGHT = 2244f
    /** 设计画布密度（480dpi = 3x；设计 px → dp/sp 的基准换算） */
    const val BASE_DENSITY = 3f
    /**
     * 全局字体放大系数：所有文字（designSp / scaledSp / Canvas 文本）统一放大。
     * 1.0 = 设计画布 1:1（P20 上设计 px 即物理 px）；用户反馈安卓端字偏小，
     * 1.0 → 1.25（整体放大约 25%）。如需微调只改这一处。
     */
    const val FONT_SCALE = 1.25f
    /** 最小触摸区（dp） */
    const val TOUCH_MIN_DP = 44f

    /** 当前视口宽度相对设计画布的比例（<1 表示窄于设计画布，等宽为 1） */
    fun widthScale(viewportWidthPx: Float): Float = viewportWidthPx / CANVAS_WIDTH

    /** 当前视口高度相对设计画布的比例 */
    fun heightScale(viewportHeightPx: Float): Float = viewportHeightPx / CANVAS_HEIGHT

    /**
     * 设计 px → dp（布局/触摸区；按屏幕宽度比例缩放）。
     * @param designPx 设计画布上的像素值（如 Dimensions.TIMELINE_WIDTH = 996）
     * @param density 当前设备 density（如 480dpi → 3f）
     * @param scale 宽度比例（[widthScale]）
     */
    fun designToDp(designPx: Float, density: Float, scale: Float): Float =
        designPx / BASE_DENSITY * scale

    /**
     * 设计 px → sp（字体；按屏幕宽度比例缩放，再乘 [FONT_SCALE] 全局放大）。
     * @param scale 宽度比例（[widthScale]）
     */
    fun designToSp(designPx: Float, scale: Float): Float =
        designPx / BASE_DENSITY * scale * FONT_SCALE

    /**
     * 设计 px → 屏幕 px（Canvas 原生绘制；按屏幕宽度比例缩放）。
     * 用于 Compose Canvas 中需要按设计画布对齐的线宽/圆点等像素值。
     */
    fun designToPx(designPx: Float, scale: Float): Float = designPx * scale

    /** 设计 px → dp 的受约束版本：保证结果 ≥ 最小触摸区（触摸目标用） */
    fun designToTouchDp(designPx: Float, density: Float, scale: Float): Float =
        maxOf(TOUCH_MIN_DP, designToDp(designPx, density, scale))
}

/** Compose 便捷入口：当前屏幕宽度比例（设计画布相对换算用） */
@Composable
fun rememberDesignScale(): Float {
    val density = LocalDensity.current
    val cfg = LocalConfiguration.current
    val screenWpx = with(density) { cfg.screenWidthDp.dp.toPx() }
    return DesignMetrics.widthScale(screenWpx)
}

/** Compose 便捷入口：设计 px → dp（布局/触摸区） */
@Composable
fun designDp(designPx: Float): Dp {
    val density = LocalDensity.current
    val cfg = LocalConfiguration.current
    val screenWpx = with(density) { cfg.screenWidthDp.dp.toPx() }
    return DesignMetrics.designToDp(designPx, density.density, DesignMetrics.widthScale(screenWpx)).dp
}

/** Compose 便捷入口：设计 px → sp（字体） */
@Composable
fun designSp(designPx: Float): TextUnit {
    val density = LocalDensity.current
    val cfg = LocalConfiguration.current
    val screenWpx = with(density) { cfg.screenWidthDp.dp.toPx() }
    return DesignMetrics.designToSp(designPx, DesignMetrics.widthScale(screenWpx)).sp
}

/** 直接写死的 sp 值统一经此放大（与 designSp 共用同一 [DesignMetrics.FONT_SCALE]） */
fun scaledSp(rawSp: Float): TextUnit = (rawSp * DesignMetrics.FONT_SCALE).sp

/** Compose 便捷入口：设计 px → dp，保证 ≥ 44dp 最小触摸区 */
@Composable
fun designTouchDp(designPx: Float): Dp {
    val density = LocalDensity.current
    val cfg = LocalConfiguration.current
    val screenWpx = with(density) { cfg.screenWidthDp.dp.toPx() }
    return DesignMetrics.designToTouchDp(
        designPx, density.density, DesignMetrics.widthScale(screenWpx),
    ).dp
}
