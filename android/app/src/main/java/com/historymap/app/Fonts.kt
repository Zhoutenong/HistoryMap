package com.historymap.app

import android.content.Context
import android.graphics.Typeface
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.core.content.res.ResourcesCompat

/**
 * 字体统一入口：Compose Text 与 Canvas Paint 全部从这里取。
 *
 * P2-字体：打包 Noto Serif SC（OFL-1.1）按应用字符集子集化的 400/700 两个字重
 * （res/font/noto_serif_sc_regular|bold.ttf，由 scripts/subset 流程生成，
 * 覆盖 UI 文案 + seed 事件 + 地理标签的 1400+ CJK 字符），保证 P20/模拟器/
 * 其它设备使用同一套字形、字宽与字距。
 *
 * 注意：自定义 FontFamily 只提供单一字重时，其它字重会整体回落到系统字体
 * （中英文混排不统一），因此同时提供 400 与 700 两个字重。
 */
object MapFonts {
    /** Compose FontFamily（Text 组件用） */
    val Family: FontFamily = FontFamily(
        Font(R.font.noto_serif_sc_regular, FontWeight.Normal),
        Font(R.font.noto_serif_sc_bold, FontWeight.Bold),
    )

    @Volatile private var serif: Typeface? = null
    @Volatile private var serifBold: Typeface? = null

    /** 初始化 Canvas Typeface（应用入口或首次绘制前调用一次；失败回退系统衬线） */
    fun init(context: Context) {
        if (serif != null) return
        serif = ResourcesCompat.getFont(context, R.font.noto_serif_sc_regular) ?: Typeface.SERIF
        serifBold = ResourcesCompat.getFont(context, R.font.noto_serif_sc_bold)
            ?: Typeface.create(Typeface.SERIF, Typeface.BOLD)
    }

    /** Canvas Paint 用 Typeface（normal） */
    val Serif: Typeface get() = serif ?: Typeface.SERIF

    /** Canvas Paint 用 Typeface（bold） */
    val SerifBold: Typeface get() = serifBold ?: Typeface.create(Typeface.SERIF, Typeface.BOLD)

    /** 按字重取 Typeface（LabelPlacement 测量与 Canvas 绘制共用） */
    fun of(bold: Boolean): Typeface = if (bold) SerifBold else Serif
}
