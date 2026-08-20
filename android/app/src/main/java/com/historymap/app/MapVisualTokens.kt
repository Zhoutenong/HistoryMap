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
         * 水彩主体（design 117。两轮真机对照效果图：117 在暖纸上有效覆盖仅 ~46%，
         * 六政权呈粉彩态、色相区分不足；137 后宋砖红/辽灰蓝/西夏土黄可分。
         * 登记于 scripts/visual-token-deviations.json）。
         */
        const val WATERCOLOR_BODY = 137
        /** 水彩羽化 */
        const val WATERCOLOR_BLOOM = 82
        /** 水彩斑驳 alpha 区间（min..max） */
        const val WATERCOLOR_MOTTLE_MIN = 13
        const val WATERCOLOR_MOTTLE_MAX = 31
        /** 政权边界 */
        const val BOUNDARY = 122
        /** 干边 */
        const val DRY_EDGE = 71
        // M1-河流：在 R4 偏硬偏深调优与整体色彩饱和之间取中间值，
        // body/spine 温和回调（wash 保持设计值），政权色块保持第一视觉层级
        const val MAJOR_RIVER_WASH = 46
        const val MAJOR_RIVER_BODY = 96
        const val MAJOR_RIVER_SPINE = 124
        const val MINOR_RIVER_WASH = 30
        const val MINOR_RIVER_BODY = 60
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
        /** P1→M1：底部安全区原 28→18 压缩后分类行被底部导航栏遮挡，折中回 24 */
        const val TIMELINE_BOTTOM_SAFE_AREA = 24
        const val PLAY_BUTTON_WIDTH = 56
        const val PLAY_BUTTON_HEIGHT = 56
        const val TRACK_HEIGHT = 6
        const val THUMB_DIAMETER = 32
        const val THUMB_STROKE = 3
        const val EVENT_DOT_DIAMETER = 10
    }

    // ===================== 字体（design-tokens.json → typographyPx）=====================
    object Typography {
        data class TypeSpec(val size: Int, val weight: Int, val letterSpacing: Int, val lineHeight: Int)

        // 注意：typographyPx 与 Web 版 CSS px 同值（逻辑单位，viewport=width=device-width
        // 下 1 CSS px ≈ 1sp），Android 端经 DesignMetrics.designToSp 直接 ×宽度比例换算，
        // 不除 BASE_DENSITY（那是 1080 物理画布布局尺寸的换算，勿混用）。
        // TIMELINE_YEAR/RANGE 取 Web 手机端媒体查询值（22px/11px，styles.css @640px）。
        val TOP_TITLE = TypeSpec(18, 400, 4, 26)
        val DYNASTY = TypeSpec(15, 700, 2, 22)
        val MENU = TypeSpec(14, 400, 2, 20)
        val LEGEND_TITLE = TypeSpec(14, 700, 2, 20)
        val LEGEND_ITEM = TypeSpec(13, 400, 1, 22)
        val MAP_LABEL = TypeSpec(13, 400, 1, 20)
        val BUBBLE_TITLE = TypeSpec(13, 400, 1, 18)
        val BUBBLE_BODY = TypeSpec(11, 400, 0, 18)
        val WATERMARK = TypeSpec(120, 400, 8, 130)
        val TIMELINE_YEAR = TypeSpec(22, 700, 3, 26)
        val TIMELINE_RANGE = TypeSpec(11, 400, 1, 16)
        val TIMELINE_CATEGORY = TypeSpec(11, 400, 1, 16)
    }

    // ===================== 地图渲染参数（GL shader + 纹理管线）=====================
    object MapParams {
        /** 宣纸底 RGB（GL 清屏，0..1） */
        val PAPER_RGB = floatArrayOf(0.902f, 0.847f, 0.710f)
        /** 墨色 GL（河流等辅助线 RGBA） */
        val INK_GL = floatArrayOf(0.227f, 0.204f, 0.157f, 0.38f)

        // —— 背景 shader（宣纸 + 颗粒 + 中心提亮 + 暗角）——
        /**
         * 暗角强度（0..1；design vignette 97/255≈0.38。M1：0.34→0.38 对齐设计值）。
         */
        const val VIGNETTE_STRENGTH = 0.38f
        /** 暗角起止（离中心距离；R5：起点回收到 design 0.40 附近） */
        const val VIGNETTE_START = 0.40f
        const val VIGNETTE_END = 0.86f
        /**
         * 中心提亮强度（0..1；R5：0.09→0.06——真机对照效果图中心发白、
         * 旧纸感不足，弱化提亮）。
         */
        const val CENTER_LIGHT_STRENGTH = 0.06f
        /** 中心提亮作用半径 */
        const val CENTER_LIGHT_RADIUS = 0.62f
        /** 纸张颗粒叠加强度（shader 内 grain * 该值） */
        const val PAPER_GRAIN_STRENGTH = 0.10f
        /**
         * 宣纸纹理混合强度（0..1）：0 = 纯暖纸色，1 = 完全采用纹理。
         * R5 两轮：0.20→0.30 旧纸感提升但纹理图自身的大尺度横向结构显形
         * （真机出现横向色阶）；回落 0.24 + 暖化系数加强（见 buildFragBg）。
         */
        const val PAPER_TEXTURE_STRENGTH = 0.24f
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

        // —— 相机取景（resetCamera；效果图 prompt_1：地图纵向充满顶栏与时间轴之间）——
        /** 竖屏 contain 基础上的放大倍数（>1 = 地图放大、左右两侧适度裁切） */
        const val CAMERA_FIT_BOOST = 1.4f
        /** 地图区上下边界（占屏高比例；设计画布 mapTop 154 / mapBottom 1410 @ 1080×2244） */
        const val CAMERA_MAP_AREA_TOP_FRAC = Dimensions.MAP_TOP / DesignMetrics.CANVAS_HEIGHT
        const val CAMERA_MAP_AREA_BOTTOM_FRAC = Dimensions.MAP_BOTTOM / DesignMetrics.CANVAS_HEIGHT

        // —— 水彩（WatercolorBuilder）——
        /** 水彩主体 alpha 分数（与 fillOpacity 联动） */
        const val WATERCOLOR_BODY_FRAC = 0.459f
        /** 水彩羽化 alpha 分数 */
        const val WATERCOLOR_BLOOM_FRAC = 0.322f
        /** 斑驳 alpha 区间分数（design 13..31/255；两轮对照后上调，粉彩态下斑驳几乎不可见） */
        const val WATERCOLOR_MOTTLE_MIN_FRAC = 0.10f
        const val WATERCOLOR_MOTTLE_MAX_FRAC = 0.20f
        /**
         * P1-边界：评审要求「水彩主体 → 边缘羽化 → 淡墨干边」而不是矢量描边。
         * 主边界 alpha 0.478→0.36（降低 25%），宽度 3.0→2.2；
         * 干边 alpha 0.278→0.22；羽化晕染模糊加宽（base 12→16），
         * 让边界从「清晰描边」变为「渗墨晕染」。
         */
        const val BOUNDARY_FRAC = 0.36f
        const val DRY_EDGE_FRAC = 0.22f
        /**
         * 暖色罩 alpha（0..255；110→60→40→10→0：真机截图对照效果图——任何强度的
         * SRC_ATOP 暖罩都会把政权色向米褐拉平；效果图六政权色相分明，移除）。
         */
        const val WARM_WASH_ALPHA = 0
        /** 水彩 tint 饱和度保留（0.78 会把辽/金/大理的灰蓝灰绿压成土色；0.95 → 1.00 来自 M2
         *  实测：宋域中心 #9e4b3d vs 设计 #b03a2e 色相 +3° 正常、饱和度 -15%（消除 tint 去饱和，暖纸 alpha 混合柔化保留）） */
        const val WATERCOLOR_TINT_SAT = 1.0f
        /** 水彩 tint 亮度系数与钳制（保留政权明暗层级，不过度压暗；旧 0.82/[0.32,0.46]） */
        const val WATERCOLOR_TINT_LUM = 0.92f
        const val WATERCOLOR_TINT_LUM_MIN = 0.28f
        const val WATERCOLOR_TINT_LUM_MAX = 0.55f
        /** 边缘积色（水彩渗化 pooling）：政权内侧沿边界的加深晕（效果图谱系的渗化感） */
        const val WATERCOLOR_POOLING_WIDTH = 6f
        const val WATERCOLOR_POOLING_BLUR = 3f
        const val WATERCOLOR_POOLING_ALPHA = 38
        /** 积色/斑驳暗 variant = tint × 该系数 */
        const val WATERCOLOR_POOLING_DARK = 0.78f
        /** 斑驳明 variant：tint 向纸色 #E6D8B5 混合比例 */
        const val WATERCOLOR_MOTTLE_LIGHT_MIX = 0.35f
        /** 州府边界（Voronoi 近似面）细描边：alpha 与宽度除数（默认视图中不抢政权色；
         *  R3 第五轮 46→26→16 + 干笔虚线：规则网格在大色块内仍被感知为数据网格，仅作隐约肌理） */
        const val PREFECTURE_STROKE_ALPHA = 16
        const val PREFECTURE_STROKE_WIDTH_DIV = 1300f
        /** 水彩羽化层模糊半径（相对纹理宽度的比例基数；max(基, W/除数)） */
        const val WATERCOLOR_BLOOM_BLUR_BASE = 16f
        const val WATERCOLOR_BLOOM_BLUR_DIV = 85f
        /** 水彩主体层模糊半径 */
        const val WATERCOLOR_BODY_BLUR_BASE = 6f
        const val WATERCOLOR_BODY_BLUR_DIV = 260f
        /** 斑驳数量（min + rng(range)，主政权 ×2；design mottleCount 60） */
        const val WATERCOLOR_MOTTLE_COUNT_MIN = 55
        const val WATERCOLOR_MOTTLE_COUNT_RANGE = 15
        /** 斑驳半径（px，底 + rng×范围） */
        const val WATERCOLOR_MOTTLE_RADIUS_BASE = 14f
        const val WATERCOLOR_MOTTLE_RADIUS_RANGE = 60f
        /** 政权边界/干边描边宽度（px；design watercolor.edgeWidth 1.8） */
        const val WATERCOLOR_BOUNDARY_WIDTH = 1.8f
        const val WATERCOLOR_DRY_EDGE_WIDTH = 1.3f

        /**
         * fillOpacity → 生效 alpha 系数：下限 0.95 强化政权色相在暖纸上的可辨度
         * （五次调优：0.74→0.84→0.90→0.95；截图对照后确认 0.90 仍偏淡）。
         */
        fun watercolorOpacity(fillOpacity: Float): Float =
            (0.95f + 0.05f * fillOpacity).coerceIn(0f, 1f)

        // —— 山水（TerrainTextureBuilder）——
        /**
         * 河流水痕/主体/脊线宽度（相对纹理宽度的除数；越小越宽）。
         * R4 校准基准：默认取景下纹理 W≈2048 对应屏幕宽约 1520px，
         * 设计宽度（major wash 12 / body 3.2 / spine 1.1、minor 6/2 设计px）
         * 换算为除数：wash 130/250、body 450/700、spine 1400。
         */
        const val RIVER_WASH_WIDTH_MAJOR_DIV = 130f
        const val RIVER_WASH_WIDTH_MINOR_DIV = 250f
        const val RIVER_WASH_WIDTH_MIN = 10f
        const val RIVER_WASH_WIDTH_MIN_MINOR = 6f
        const val RIVER_BODY_WIDTH_MAJOR_DIV = 500f
        const val RIVER_BODY_WIDTH_MINOR_DIV = 700f
        const val RIVER_BODY_WIDTH_MIN = 3.4f
        const val RIVER_BODY_WIDTH_MIN_MINOR = 2.2f
        const val RIVER_SPINE_WIDTH_DIV = 1400f
        const val RIVER_SPINE_WIDTH_MIN = 1.1f
        /** 河流水痕模糊半径 */
        const val RIVER_WASH_BLUR_DIV = 260f
        const val RIVER_WASH_BLUR_MIN = 4f

        // —— 河道带（GL 几何渲染；借鉴 HoMM3 有机河道：变宽 / 两岸羽化 / 顺流微动画）——
        /** 变宽系数：上游（path 首点）宽 = 基准宽 × HEAD */
        const val RIVER_TAPER_HEAD = 0.55f
        /** 变宽系数：入海口（path 末点）宽 = 基准宽 × MOUTH */
        const val RIVER_TAPER_MOUTH = 1.30f
        /** 顺流微动画波长（世界单位，一段亮部沿河向下游移动） */
        const val RIVER_FLOW_WAVE = 46f
        /** 顺流微动画速度（周期/秒；0.05 ≈ 20s 一段流过，克制的「活」） */
        const val RIVER_FLOW_SPEED = 0.05f
        /** 顺流微动画亮度起伏幅度（0..1；小幅度，只做呼吸感不做闪烁） */
        const val RIVER_FLOW_AMP = 0.07f

        // —— 政权贴图接触阴影（统一光向：左上 45° 来光 → 右下投影）——
        /** 阴影 alpha（0..1；水彩贴图整体 alpha × 该值，软影不压政权色） */
        const val REGIME_SHADOW_ALPHA = 0.15f
        /** 阴影偏移（世界宽比例；与 RIVER_TAPER 同源的世界单位，跟随地图缩放） */
        const val REGIME_SHADOW_OFFSET = 0.0075f
        /** 山脉 alpha 分数 */
        const val MOUNTAIN_FRAC = 0.32f
        /** 山脊线 alpha 系数（design 96 × 0.8；山形 glyph 是主体，脊线作骨架） */
        const val MOUNTAIN_RIDGE_ALPHA_FRAC = 0.8f
        /** 山体晕染 halo alpha 系数（design 96 × 0.40；连续 halo 横贯屏幕会被读作纸面色带） */
        const val MOUNTAIN_HALO_ALPHA_FRAC = 0.40f
        /** 山脉次级（前景小峰）alpha 分数（R3：0.16→0.30） */
        const val MOUNTAIN_LIGHT_FRAC = 0.30f
        /** 山脉山脊/笔触宽度（相对纹理宽度的除数；R3：1100→850） */
        const val MOUNTAIN_RIDGE_WIDTH_DIV = 850f
        const val MOUNTAIN_RIDGE_WIDTH_MIN = 1.2f
        const val MOUNTAIN_GLYPH_WIDTH_DIV = 900f
        const val MOUNTAIN_GLYPH_WIDTH_MIN = 1.1f
        /** 山脊晕染 halo 宽度系数（山脊线宽 × 该值） */
        const val MOUNTAIN_RIDGE_HALO_MULT = 1.8f
        /** 皴法短线 alpha 分数（R3：0.28→0.55，第三轮回调 0.45——与山形 glyph 叠加过重） */
        const val MOUNTAIN_CUNFA_FRAC = 0.38f
        /** 皴法短线长度/线宽（相对纹理宽度的除数） */
        const val MOUNTAIN_CUNFA_LEN_DIV = 170f
        const val MOUNTAIN_CUNFA_WIDTH_DIV = 700f
        /** 山形 glyph 基准尺寸（相对纹理宽度；R3 迭代：W/130→…→W/80 低对比辅助） */
        const val MOUNTAIN_GLYPH_SIZE_DIV = 80f
        const val MOUNTAIN_GLYPH_SIZE_MIN = 9f
        /** 山形 glyph 主峰 alpha 分数（R3 第四轮 0.5：山脊线/皴法为主纹理，glyph 低对比辅助） */
        const val MOUNTAIN_GLYPH_ALPHA_FRAC = 0.5f
        /** 沿山脊撒山形 glyph 的间隔（glyph 基准尺寸 × 该值；第四轮 1.7 加大留白） */
        const val MOUNTAIN_RIDGE_GLYPH_STEP = 1.7f

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
        /**
         * 泡泡尺寸（CSS px 语义，对齐 Web 版 .bubble-inner 单行胶囊形态：
         * 印章竖条 + 事件简称一行，13px 字、padding 2px 8px 2px 3px、
         * 边框 1px、圆角左 2 右 10、总高 ≈24px——不是设计稿的大卡片）。
         * 旧值（260×112）是 1080 设计画布 3x 值被误当 CSS px，泡泡占满半屏。
         */
        /** 泡泡最大宽度 */
        const val MAX_WIDTH = 200f
        /** 泡泡最小宽度 */
        const val MIN_WIDTH = 60f
        /** 泡泡高度（单行文字 + 上下 padding） */
        const val HEIGHT = 24f
        /** 选中泡泡高度（同普通——选中只变色不展开，对齐 Web is-focus） */
        const val HEIGHT_SELECTED = 24f
        /** 聚合泡泡高度（「简称 +N」同样单行） */
        const val HEIGHT_COMPACT = 24f
        /** 文字起点：左侧留白 3 + 印章条 5 + 间距 5 + margin 2 ≈ 15px */
        const val TEXT_LEFT = 15f
        /** 右侧内边距（Web padding-right 8px） */
        const val PAD_X = 8f
        /** 印章竖条宽（Web .bubble-seal 5px） */
        const val SEAL_WIDTH = 5f
        /** 圆角（Web border-radius: 2px 10px 10px 2px——左小右大书签感） */
        const val RADIUS_LEFT = 2f
        const val RADIUS_RIGHT = 10f
        /** 聚合折叠阈值（屏幕距离，dp） */
        const val CLUSTER_DIST_DP = 80
        /** 指向线/描边等细线基础宽度 */
        const val STROKE_PX = 1.2f
    }

    // ===================== 时间轴（Timeline）=====================
    object Timeline {
        // 以下均为 CSS px 语义（对齐 Web 版 styles.css），经 designToTextPx ×density 换屏幕 px：
        // 轨道 5px、滑块 14px/描边 2.5px、刻度点 8px（Web #tl-track/#tl-thumb/.tl-marker）
        /** 轨道视觉高度 */
        const val TRACK_PX = 5f
        /** 滑块直径 */
        const val THUMB_PX = 14f
        /** 滑块朱砂描边 */
        const val THUMB_STROKE_PX = 2.5f
        /** 事件刻度点直径（画在轨道中心线上，对齐 Web top:50% 居中） */
        const val EVENT_DOT_PX = 8f
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
