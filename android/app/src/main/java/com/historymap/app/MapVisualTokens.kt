package com.historymap.app

import androidx.compose.ui.graphics.Color

/**
 * 古地图视觉 token（对齐 docs/design_optimize/design-tokens.json，唯一设计输入）：
 * 分层组织颜色 / alpha / 尺寸 / 字体 / 地图 / 泡泡 / 时间轴参数，
 * 消除散落在各文件中的相近但不一致的硬编码色值（对齐 Web 版 theme.js）。
 *
 * 约定：
 * - [Alpha] 为 0..255 整数（与 design-tokens.json 的 alpha0to255 一致）
 * - [Dimensions] / [Typography] 均为设计画布（1080×2244 px、480dpi）像素值，
 *   业务代码经 DesignMetrics 换算为 dp / sp / px，禁止直接把设计 px 写为同名 dp。
 * - 文件底部保留旧公开引用（PAPER_MAP / VERMILION / CATEGORY_COLORS 等），避免无关模块回归。
 */
object MapTokens {

    // ===================== 颜色（design-tokens.json → colors）=====================
    object Colors {
        /** 地图底纸（GL 清屏色，暖黄宣纸） */
        val PAPER_MAP = Color(0xFFE6D8B5)
        /** 面板纸面（事件流、详情、设置、顶栏） */
        val PANEL = Color(0xFFF8F4E9)
        /** 卡片纸面（按钮、滑块内芯、泡泡、图例底） */
        val CARD = Color(0xFFFDF8EC)
        /** 主墨（正文） */
        val INK = Color(0xFF3A3428)
        /** 次墨（辅助信息） */
        val INK_SECONDARY = Color(0xFF5B5141)
        /** 淡墨（占位） */
        val INK_FAINT = Color(0xFF807665)
        /** 朱砂（主强调：年份、选中、按钮） */
        val VERMILION = Color(0xFFB03A2E)
        /** 金（次级强调：横幅、渐变尾部、进度） */
        val GOLD = Color(0xFFD6824A)

        /** 政权配色（entity → 色，design-tokens.json regime） */
        val REGIME: Map<String, Color> = mapOf(
            "song" to Color(0xFF8E2F24),
            "liao" to Color(0xFF5D7F8C),
            "westernXia" to Color(0xFFD6C174),
            "jin" to Color(0xFF6F8BA8),
            "dali" to Color(0xFF6A886E),
            "tubo" to Color(0xFFA4886B),
        )

        /** 事件分类色（Web 端 CATEGORIES 语义键 → 设计 eventCategory 配色） */
        val EVENT_CATEGORY: Map<String, Color> = mapOf(
            "era" to Color(0xFFB03A2E),       // politics 政治
            "figure" to Color(0xFF6E5A7E),    // people 人物
            "military" to Color(0xFFA0622D),  // military 军事
            "economy" to Color(0xFF5F7D4F),   // economy 经济
            "invention" to Color(0xFF46647F), // culture 文化
        )

        // —— 地图辅助层（mapAux）——
        /** 河流水痕色 */
        val RIVER_WASH = Color(0xFF7F9BA0)
        /** 河流主体色 */
        val RIVER_BODY = Color(0xFF52767D)
        /** 山脉墨色 */
        val MOUNTAIN_INK = Color(0xFF51483B)
        /** 纸张颗粒色 */
        val PAPER_GRAIN = Color(0xFF8A7658)
        /** 暖色罩（水彩统一罩色） */
        val WARM_WASH = Color(0xFFE0CEA8)
    }

    // ===================== alpha（design-tokens.json → alpha0to255，0..255）=====================
    object Alpha {
        /** 顶栏底 */
        const val TOP_BAR = 224
        /** 图例底 */
        const val LEGEND_BACKGROUND = 184
        /** 泡泡底 */
        const val BUBBLE_BACKGROUND = 238
        /** 泡泡描边 */
        const val BUBBLE_BORDER = 170
        /** 泡泡阴影 */
        const val BUBBLE_SHADOW = 35
        /** 年份水印 */
        const val YEAR_WATERMARK = 26
        /**
         * 水彩主体（design 117 → 102：真机截图对照 prompt_1——主体与斑驳叠加后
         * 有效透明度约 0.51，宋屏幕色 (155,135,115) 比参考 (185,146,113) 深；
         * 降至 102 后有效 ~0.47，与参考 0.46 对齐。见 scripts/visual-token-deviations.json）。
         */
        const val WATERCOLOR_BODY = 102
        /** 水彩羽化 */
        const val WATERCOLOR_BLOOM = 82
        /** 水彩斑驳 alpha 区间（min..max） */
        const val WATERCOLOR_MOTTLE_MIN = 13
        const val WATERCOLOR_MOTTLE_MAX = 31
        /** 政权边界 */
        const val BOUNDARY = 122
        /** 干边 */
        const val DRY_EDGE = 71
        // P1-河流：评审要求主/支流水痕、主体、脊线 alpha 整体降 15~25%，
        // 河流是辅助层，不应与政权边界竞争视觉层级
        const val MAJOR_RIVER_WASH = 38
        const val MAJOR_RIVER_BODY = 90
        const val MAJOR_RIVER_SPINE = 115
        const val MINOR_RIVER_WASH = 24
        const val MINOR_RIVER_BODY = 55
        /** 山脉 */
        const val MOUNTAIN = 96
        /** 纸张颗粒 */
        const val PAPER_GRAIN = 26
        /** 暗角 */
        const val VIGNETTE = 97
        /** 中心提亮 */
        const val CENTER_LIGHT = 26
        const val TIMELINE_TRACK = 36
        const val TIMELINE_SHADOW = 38
    }

    // ===================== 尺寸（design-tokens.json → dimensionsPx，设计画布 px）=====================
    object Dimensions {
        const val TOP_BAR_HEIGHT = 154
        const val LEGEND_X = 24
        const val LEGEND_Y = 194
        const val LEGEND_WIDTH = 173
        const val LEGEND_HEIGHT = 292
        const val MAP_TOP = 154
        const val MAP_BOTTOM = 1410
        const val EVENT_BUBBLE_WIDTH = 260
        const val EVENT_BUBBLE_HEIGHT = 112
        const val EVENT_BUBBLE_RADIUS = 8
        const val EVENT_BUBBLE_BORDER = 1
        const val EVENT_CATEGORY_BAR_WIDTH = 6
        const val LEADER_WIDTH = 1.2f
        const val LEADER_DASH_LENGTH = 8
        const val LEADER_GAP = 7
        const val ARROW_LENGTH = 8
        const val ARROW_WIDTH = 5
        const val EVENT_POINT_DIAMETER = 10
        const val TIMELINE_X = 42
        const val TIMELINE_Y = 1410
        const val TIMELINE_WIDTH = 996
        const val TIMELINE_HEIGHT = 280
        const val TIMELINE_RADIUS = 14
        /** P1：底部安全区 28→18，压缩时间轴占屏高度（约 10%） */
        const val TIMELINE_BOTTOM_SAFE_AREA = 18
        const val PLAY_BUTTON_WIDTH = 56
        const val PLAY_BUTTON_HEIGHT = 56
        const val TRACK_HEIGHT = 6
        const val THUMB_DIAMETER = 32
        const val THUMB_STROKE = 3
        const val EVENT_DOT_DIAMETER = 10
    }

    // ===================== 字体（design-tokens.json → typographyPx，设计画布 px）=====================
    object Typography {
        data class TypeSpec(val size: Int, val weight: Int, val letterSpacing: Int, val lineHeight: Int)

        // P1-字体：评审要求放大顶栏/地图辅助文字并加重标题字重（Medium/Bold，
        // 打包字体仅 400/700，取 700）；设计 px 与 P20 物理 px 1:1，评审的 sp 数值即设计 px。
        val TOP_TITLE = TypeSpec(20, 700, 4, 28)
        val DYNASTY = TypeSpec(16, 700, 2, 24)
        val MENU = TypeSpec(15, 400, 2, 22)
        val LEGEND_TITLE = TypeSpec(14, 700, 2, 20)
        val LEGEND_ITEM = TypeSpec(14, 400, 1, 26)
        val MAP_LABEL = TypeSpec(16, 400, 1, 24)
        val BUBBLE_TITLE = TypeSpec(15, 700, 1, 22)
        val BUBBLE_BODY = TypeSpec(12, 400, 0, 20)
        val WATERMARK = TypeSpec(120, 400, 8, 130)
        val TIMELINE_YEAR = TypeSpec(42, 400, 3, 52)
        val TIMELINE_RANGE = TypeSpec(14, 400, 1, 20)
        val TIMELINE_CATEGORY = TypeSpec(12, 400, 1, 18)
    }

    // ===================== 地图渲染参数（GL shader + 纹理管线）=====================
    object MapParams {
        /** 宣纸底 RGB（GL 清屏，0..1） */
        val PAPER_RGB = floatArrayOf(0.902f, 0.847f, 0.710f)
        /** 墨色 GL（河流等辅助线 RGBA） */
        val INK_GL = floatArrayOf(0.227f, 0.204f, 0.157f, 0.38f)

        // —— 背景 shader（宣纸 + 颗粒 + 中心提亮 + 暗角）——
        /** 暗角强度（0..1；alpha0to255.vignette 97/255。P20 实测偏重，0.38→0.28） */
        const val VIGNETTE_STRENGTH = 0.28f
        /** 暗角起止（离中心距离；起点外推，减少中部压暗面积） */
        const val VIGNETTE_START = 0.45f
        const val VIGNETTE_END = 0.86f
        /**
         * 中心提亮强度（0..1；真机截图对照：0.12 + GL_BRIGHTNESS 1.08 叠加后
         * 地图中心被推到 255 白并偏蓝（B≈218），宣纸失去暖调。降至 0.09 保留
         * 设计 centerLight 26/255≈0.10 的语义，避免白点裁剪）。
         */
        const val CENTER_LIGHT_STRENGTH = 0.09f
        /** 中心提亮作用半径 */
        const val CENTER_LIGHT_RADIUS = 0.62f
        /** 纸张颗粒叠加强度（shader 内 grain * 该值） */
        const val PAPER_GRAIN_STRENGTH = 0.10f
        /**
         * 宣纸纹理混合强度（0..1）：0 = 纯暖纸色，1 = 完全采用纹理。
         * P20 实测 paper-texture.jpg 偏冷灰（RGB≈225,219,204 vs 目标 230,216,181），
         * 完全采用纹理会让底纸变灰褐；二次调优降至 0.35 恢复暖黄。
         * 三次调优（截图对照）：0.25 → 0.20，冷灰纹理影响进一步收窄。
         */
        const val PAPER_TEXTURE_STRENGTH = 0.20f
        /**
         * GL 全场景亮度补偿（>1 提亮）。P20 实测：GLSurfaceView 无 sRGB 色彩管理，
         * 同样颜色 GL 渲染比 Compose 层暗约 12%（顶栏 244,238,226 正常，地图暗）；
         * 在 paper 与 texture 两个片元着色器统一乘该系数对齐 Compose。
         * 三次调优：1.12 时纸面 R 达标但 G/B 过曝（纹理冷调被放大），降至 1.08。
         * 四次调优（真机截图对照 prompt_1）：1.08 仍把地图中心推到 (255,255,218)
         * 且领土色被整体提亮变灰；降回 1.0——宣纸底（设计 #E6D8B5）本就比
         * Compose 面板（#F8F4E9）更深，GL 无需追平面板亮度。
         */
        const val GL_BRIGHTNESS = 1.0f

        // —— 水彩（WatercolorBuilder）——
        /** 水彩主体 alpha 分数（与 fillOpacity 联动） */
        const val WATERCOLOR_BODY_FRAC = 0.459f
        /** 水彩羽化 alpha 分数 */
        const val WATERCOLOR_BLOOM_FRAC = 0.322f
        /** 斑驳 alpha 区间分数 */
        const val WATERCOLOR_MOTTLE_MIN_FRAC = 0.051f
        const val WATERCOLOR_MOTTLE_MAX_FRAC = 0.122f
        /**
         * P1-边界：评审要求「水彩主体 → 边缘羽化 → 淡墨干边」而不是矢量描边。
         * 主边界 alpha 0.478→0.36（降低 25%），宽度 3.0→2.2；
         * 干边 alpha 0.278→0.22；羽化晕染模糊加宽（base 12→16），
         * 让边界从「清晰描边」变为「渗墨晕染」。
         */
        const val BOUNDARY_FRAC = 0.36f
        const val DRY_EDGE_FRAC = 0.22f
        /** 暖色罩 alpha（0..255；110→60→40→10：真机截图对照 prompt_1——40 的
         *  SRC_ATOP 暖罩把领土色整体提亮 ~20/通道、向米褐靠拢，色相被压平；
         *  10 保留「色块与宣纸融合」的意图但不再抹掉政权色）。 */
        const val WARM_WASH_ALPHA = 10
        /** 水彩羽化层模糊半径（相对纹理宽度的比例基数；max(基, W/除数)） */
        const val WATERCOLOR_BLOOM_BLUR_BASE = 16f
        const val WATERCOLOR_BLOOM_BLUR_DIV = 85f
        /** 水彩主体层模糊半径 */
        const val WATERCOLOR_BODY_BLUR_BASE = 6f
        const val WATERCOLOR_BODY_BLUR_DIV = 260f
        /** 斑驳数量（min + rng(range)，主政权 ×2） */
        const val WATERCOLOR_MOTTLE_COUNT_MIN = 45
        const val WATERCOLOR_MOTTLE_COUNT_RANGE = 25
        /** 斑驳半径（px，底 + rng×范围） */
        const val WATERCOLOR_MOTTLE_RADIUS_BASE = 14f
        const val WATERCOLOR_MOTTLE_RADIUS_RANGE = 48f
        /** 政权边界/干边描边宽度（px；P1 减细 + 干边加断续虚线见 WatercolorBuilder） */
        const val WATERCOLOR_BOUNDARY_WIDTH = 2.2f
        const val WATERCOLOR_DRY_EDGE_WIDTH = 1.3f

        /**
         * fillOpacity → 生效 alpha 系数：下限 0.95 强化政权色相在暖纸上的可辨度
         * （五次调优：0.74→0.84→0.90→0.95；截图对照后确认 0.90 仍偏淡）。
         */
        fun watercolorOpacity(fillOpacity: Float): Float =
            (0.95f + 0.05f * fillOpacity).coerceIn(0f, 1f)

        // —— 山水（TerrainTextureBuilder）——
        /** 河流水痕 alpha 分数（design 46/110 × 系数；P1 再降一档，评审要求降 15~20%） */
        const val MAJOR_RIVER_WASH_FRAC = 0.16f
        const val MAJOR_RIVER_BODY_FRAC = 0.37f
        const val MAJOR_RIVER_SPINE_FRAC = 0.47f
        const val MINOR_RIVER_WASH_FRAC = 0.10f
        const val MINOR_RIVER_BODY_FRAC = 0.24f
        /** 河流水痕/主体/脊线 alpha 系数（P1 继续降档，河流为辅助层） */
        const val RIVER_WASH_ALPHA_FRAC = 0.7f
        const val RIVER_BODY_ALPHA_FRAC = 0.62f
        /** 河流水痕/主体/脊线宽度（相对纹理宽度的除数；越小越宽）。
         *  P1 再减细 8~17%，避免与政权边界竞争视觉层级。 */
        const val RIVER_WASH_WIDTH_MAJOR_DIV = 185f
        const val RIVER_WASH_WIDTH_MINOR_DIV = 270f
        const val RIVER_WASH_WIDTH_MIN = 8f
        const val RIVER_WASH_WIDTH_MIN_MINOR = 4f
        const val RIVER_BODY_WIDTH_MAJOR_DIV = 400f
        const val RIVER_BODY_WIDTH_MINOR_DIV = 500f
        const val RIVER_BODY_WIDTH_MIN = 2.6f
        const val RIVER_BODY_WIDTH_MIN_MINOR = 1.6f
        const val RIVER_SPINE_WIDTH_DIV = 1400f
        const val RIVER_SPINE_WIDTH_MIN = 0.9f
        /** 主脊线 alpha 系数（design 140 × 0.5，进一步减淡深色主轴） */
        const val RIVER_SPINE_ALPHA_FRAC = 0.5f
        /** 河流水痕模糊半径 */
        const val RIVER_WASH_BLUR_DIV = 260f
        const val RIVER_WASH_BLUR_MIN = 4f
        /** 山脉 alpha 分数 */
        const val MOUNTAIN_FRAC = 0.32f
        /** 山脊线 alpha 系数（design 96 × 0.62；P1 再降一档） */
        const val MOUNTAIN_RIDGE_ALPHA_FRAC = 0.62f
        /** 山脉次级（前景小峰）alpha 分数 */
        const val MOUNTAIN_LIGHT_FRAC = 0.16f
        /** 山脉山脊/笔触宽度（相对纹理宽度的除数；P1 略减细） */
        const val MOUNTAIN_RIDGE_WIDTH_DIV = 1100f
        const val MOUNTAIN_RIDGE_WIDTH_MIN = 1.0f
        const val MOUNTAIN_GLYPH_WIDTH_DIV = 1100f
        const val MOUNTAIN_GLYPH_WIDTH_MIN = 0.9f
        /** 山脊晕染 halo 宽度系数（山脊线宽 × 该值；2.5×→2.0×→1.8×） */
        const val MOUNTAIN_RIDGE_HALO_MULT = 1.8f
        /** 皴法短线 alpha 分数（山脉主线的 1/3，弱化笔触堆叠） */
        const val MOUNTAIN_CUNFA_FRAC = 0.28f
        /** 山形 glyph 基准尺寸（相对纹理宽度；P1 略缩小 + 峰数减少 + 随机旋转） */
        const val MOUNTAIN_GLYPH_SIZE_DIV = 130f
        const val MOUNTAIN_GLYPH_SIZE_MIN = 9f

        // —— 纹理尺寸（mapTextureSize）——
        const val TEXTURE_DPR_MAX = 2f
        const val TEXTURE_WIDTH_MIN = 1024
        const val TEXTURE_WIDTH_MAX = 2048
        const val TEXTURE_SCALE = 1.2f
        const val TEXTURE_HEIGHT_MIN = 256
        /**
         * 水彩/山水纹理是否生成 mipmap（A/B 实验开关）。
         * 背景透明的 RGBA 纹理做 mipmap 时，透明黑 texel 会渗入政权色区，
         * 导致整幅疆域观感变暗（经典 black halo）。true 修缩放闪烁，false 保颜色。
         */
        const val TEXTURE_MIPMAP = false
    }

    // ===================== 事件泡泡（Bubble）=====================
    object Bubble {
        /** 泡泡最大宽度（设计 px） */
        const val MAX_WIDTH = 260
        /**
         * 普通泡泡高度（设计 px，标题+年份+一行短摘要——对齐验收 README 的
         * 260×112 目标：标题 + 年份 + 首句摘要，让当前事件在地图上自带语境）。
         */
        const val HEIGHT = 96
        /** 选中泡泡高度（设计 px，标题+年份+两行摘要） */
        const val HEIGHT_SELECTED = 116
        /** 聚合泡泡高度（设计 px，紧凑「简称 +N」） */
        const val HEIGHT_COMPACT = 44
        /** 普通泡泡最小宽度（设计 px） */
        const val MIN_WIDTH = 120
        /** 文字起点：左侧分类条(11) + 间距 → 30px */
        const val TEXT_LEFT = 30
        /** 右侧内边距（设计 px） */
        const val PAD_X = 14
        /** 顶部内边距（设计 px） */
        const val PAD_TOP = 14
        /** 底部内边距（设计 px） */
        const val PAD_BOTTOM = 12
        /** 标题行高（设计 px，15px/700） */
        const val TITLE_LINE = 22
        /** 年份行高（设计 px，12px） */
        const val YEAR_LINE = 16
        /** 摘要行高（设计 px，12px） */
        const val BODY_LINE = 20
        /** 行间间隙（设计 px） */
        const val LINE_GAP = 2
        /** 选中泡泡摘要最大行数（移动端方案：两行摘要） */
        const val BODY_MAX_LINES = 2
        /** 聚合折叠阈值（屏幕距离，dp） */
        const val CLUSTER_DIST_DP = 80
        /** 指向线/描边等细线基础宽度（设计 px） */
        const val STROKE_PX = 1.2f
    }

    // ===================== 时间轴（Timeline）=====================
    object Timeline {
        /** 轨道视觉高度（设计 px） */
        const val TRACK_PX = 6
        /** 滑块直径（设计 px） */
        const val THUMB_PX = 32
        /** 滑块朱砂描边（设计 px） */
        const val THUMB_STROKE_PX = 3
        /** 事件分类点直径（设计 px） */
        const val EVENT_DOT_PX = 10
    }

    // ===================== 兼容旧引用（避免无关模块回归）=====================
    val PAPER_MAP get() = Colors.PAPER_MAP
    val PAPER_PANEL get() = Colors.PANEL
    val PANEL get() = Colors.PANEL
    /** 顶栏/时间轴纸面（面板纸 + 0.878 alpha，对齐 design topbar） */
    val PAPER_BAR get() = Color(0xE0F8F4E9)
    val PAPER_CARD get() = Colors.CARD
    /** 政权标签小笺卡（半透明米白） */
    val PAPER_LABEL get() = Color(0xD9FDF8EC)

    val INK get() = Colors.INK
    /** 次墨（辅助信息，0.6 alpha） */
    val INK_SOFT get() = Color(0x993A3428)
    /** 次墨纯色（设计 inkSecondary，顶栏辅助按钮等） */
    val INK_SECONDARY get() = Colors.INK_SECONDARY
    /** 淡墨（轨道、占位） */
    val INK_FAINT get() = Color(0x263A3428)

    val VERMILION get() = Colors.VERMILION
    val GOLD get() = Colors.GOLD
    /** 赭金（渐变尾部深色） */
    val GOLD_DEEP get() = Color(0xFFA8873A)
    /** 标题下渐变线（朱砂→透明） */
    val RULE_GRADIENT get() = listOf(Color(0xA6B03A2E), Color(0x0DB03A2E))

    /** 事件分类色板（对齐 Web 版 store.js CATEGORIES） */
    val CATEGORY_COLORS get(): Map<String, Color> = Colors.EVENT_CATEGORY

    fun categoryColor(id: String?): Color = Colors.EVENT_CATEGORY[id] ?: VERMILION

    // —— GL 侧色（FloatArray，供 MapRenderer/水彩管线使用）——
    val PAPER_MAP_GL get() = MapParams.PAPER_RGB
    val INK_GL get() = MapParams.INK_GL

    // —— 布局/控件尺寸 ——
    /** 最小触摸目标（移动端计划要求 ≥44dp） */
    const val TOUCH_MIN = 44
}

/** 事件分类色板（兼容旧引用，统一指向 MapTokens 单源） */
val CATEGORY_COLORS: Map<String, Color>
    get() = MapTokens.CATEGORY_COLORS
