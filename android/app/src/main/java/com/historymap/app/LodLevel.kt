package com.historymap.app

/**
 * 地图 LOD 档位（docs/requirements/zoom-lod-requirements.md §4.2 矩阵）：
 * 以 s = 可见世界宽 / 世界包围盒宽 为判据（双端通用），档位越低越「全国」。
 *
 * - L0（s ≥ 0.40）：全国取景。主政权名 + 大江大河 + rank≤2 山名 + 四京 + 主地点。
 * - L1（0.24 ≤ s < 0.40）：区域。次要政权 + rank2 河名 + rank3 山名 + rank≤2 治所。
 * - L2（0.13 ≤ s < 0.24）：省域。rank≤3 治所 + 州府边界（alpha ×0.6）。
 * - L3（s < 0.13）：放大到州府级。rank≤5 治所 + 州府边界（alpha ×1.0），视口剔除防低端机卡顿。
 */
enum class LodTier(val level: Int) {
    L0(0), L1(1), L2(2), L3(3);

    companion object {
        fun fromLevel(level: Int): LodTier = when (level) {
            0 -> L0; 1 -> L1; 2 -> L2; else -> L3
        }

        /** 每档「城市/州府治所」标签按 rank 的上限（护低端机；rank5 仅 L3 且最低优先级） */
        val CITY_CAPS: Map<LodTier, Map<Int, Int>> = mapOf(
            L0 to mapOf(1 to 4),
            L1 to mapOf(1 to 4, 2 to 7),
            L2 to mapOf(1 to 4, 2 to 7, 3 to 16),
            L3 to mapOf(1 to 4, 2 to 7, 3 to 16, 4 to 24, 5 to Int.MAX_VALUE),
        )

        /** 每档「地点」标签按 rank 的上限 */
        val PLACE_CAPS: Map<LodTier, Map<Int, Int>> = mapOf(
            L0 to mapOf(1 to 3),
            L1 to mapOf(1 to 3, 2 to 5),
            L2 to mapOf(1 to 3, 2 to 5),
            L3 to mapOf(1 to 3, 2 to 5),
        )
    }
}

/** s 判据 → 无滞回档位 */
fun LodTier.ofScale(s: Float): LodTier = when {
    s >= 0.40f -> LodTier.L0
    s >= 0.24f -> LodTier.L1
    s >= 0.13f -> LodTier.L2
    else -> LodTier.L3
}

/**
 * 滞回换挡：缩放临界抖动时保持当前档位（±0.02 死区）。
 * 升档（放大，s 减小）需越过「新档下限 - 滞回」；降档需越过「原档下限 + 滞回」。
 */
fun nextLod(prev: LodTier, s: Float): LodTier {
    val HYST = 0.02f
    return when (prev) {
        LodTier.L0 -> if (s < 0.40f - HYST) LodTier.L1 else LodTier.L0
        LodTier.L1 -> when {
            s < 0.24f - HYST -> LodTier.L2
            s >= 0.40f + HYST -> LodTier.L0
            else -> LodTier.L1
        }
        LodTier.L2 -> when {
            s < 0.13f - HYST -> LodTier.L3
            s >= 0.24f + HYST -> LodTier.L1
            else -> LodTier.L2
        }
        LodTier.L3 -> if (s >= 0.13f + HYST) LodTier.L2 else LodTier.L3
    }
}

/** s = 可见世界宽 / 世界包围盒宽（可见世界高 = 800×zoom，宽 = 高×宽高比） */
fun mapScale(zoom: Float, aspect: Float, worldWidth: Float): Float {
    if (worldWidth <= 0f) return 1f
    return (800f * zoom * aspect) / worldWidth
}

/**
 * 档位 × rank 准入（§4.2 矩阵）。tier 为 null 时退回旧行为（不限制）。
 * 河流几何淡入由渲染层单独处理（rank2 L0 淡化、rank3 L1 淡入）。
 */
fun admitAtTier(label: MapRenderer.WorldLabel, tier: LodTier?): Boolean {
    if (tier == null) return true
    return when (label.kind) {
        "regime" -> if (label.major) true else tier.level >= 1
        "cities", "prefecture" -> when (label.rank) {
            1 -> true
            2 -> tier.level >= 1
            3 -> tier.level >= 2
            else -> tier.level >= 3 // rank4/5 仅 L3
        }
        "rivers" -> when {
            label.rank <= 1 -> true
            label.rank == 2 -> tier.level >= 1
            else -> tier.level >= 2
        }
        "mountains" -> if (label.rank <= 2) true else tier.level >= 1
        "places" -> when {
            label.rank <= 1 -> true
            else -> tier.level >= 1
        }
        else -> true
    }
}
