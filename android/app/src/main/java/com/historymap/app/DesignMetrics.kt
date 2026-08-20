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
 * ⚠ 两类「设计 px」语义不同，勿混用换算：
 * - [DesignMetrics.designToDp]（Dimensions/布局类 token）：1080 物理画布 px → ÷3。
 * - 字体类 token（Typography/Canvas 文本）：与 Web 版 CSS px 同值（viewport=width=device-width
 *   下 1 CSS px ≈ 1dp），是逻辑单位，**不除** BASE_DENSITY。
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
     * 1.0 = 与 Web 版（viewport=width=device-width，1 CSS px ≈ 1sp）一致。
     * 历史：曾用 1.25 补偿 designToSp 误除 BASE_DENSITY 导致的字小；换算修正后归 1。
     * 如需整体微调只改这一处。
     */
    const val FONT_SCALE = 1.0f
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
     * 字体设计 px → sp（字体 token 与 Web CSS px 同值，逻辑单位：×宽度比例，不÷基准密度）。
     * P20（360dp 宽，scale=1）上 TOP_TITLE 18 → 18sp ≈ Web 手机端 19px。
     *
     * @param scale 宽度比例（[widthScale]）
     */
    fun designToSp(designPx: Float, scale: Float): Float =
        designPx * scale * FONT_SCALE

    /**
     * 字体设计 px → 屏幕 px（Compose/Android Canvas 原生绘制；逻辑单位 × density）。
     * 用于 Canvas 文本（地图标签/泡泡）与 CSS px 语义的控件尺寸（轨道/滑块）。
     */
    fun designToTextPx(designPx: Float, density: Float, scale: Float): Float =
        designPx * density * scale * FONT_SCALE

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
