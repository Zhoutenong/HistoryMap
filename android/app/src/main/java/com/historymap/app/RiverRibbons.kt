package com.historymap.app

import android.graphics.RectF
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import kotlin.math.hypot
import kotlin.math.max

/**
 * 河道带网格（GL 三角带顶点，MapRenderer 每帧绘制）。
 * 顶点交错布局 (x, y, side, s)：side ∈ {-1,+1} 为跨河坐标（|side|=1 即水痕外缘），
 * s 为沿河累计弧长（世界单位，上游=0）。三层河带（水痕/主体/脊线）与两岸羽化、
 * 顺流微动画都在片段着色器内按 side/s 合成（见 MapRenderer.FRAG_RIVER）。
 * @param rank 河级：1 大江（脊线+微动画）/ 2 中河 / 3 支流（几何 alpha 由 LOD 档位调制）
 */
class RiverMesh(
    val buffer: FloatBuffer,
    val vertexCount: Int,
    val rank: Int = 1,
    val fracs: FloatArray = floatArrayOf(1f, 0f),
)

/** 全部河道带（rank 已编码进各 mesh；fracs 为片元着色器分层带用的宽度比
 *  [主体/水痕, 脊线/水痕]，与几何同源计算） */
class RiverRibbons(val meshes: List<RiverMesh>) {
    fun isEmpty() = meshes.isEmpty()
}

/**
 * 河道带几何生成（HoMM3 借鉴 R1：等宽河线 → 有机河道带）：
 * - 变宽：数据 path 首点=上游（西）、末点=入海口（东），宽度随弧长 smoothstep
 *   从 RIVER_TAPER_HEAD 渐变到 RIVER_TAPER_MOUTH——等宽线是「程序感」的最大来源；
 * - 基准宽度与旧纹理管线同源（worldBox / 旧除数），保证默认取景下观感连续；
 * - 坐标系与水彩纹理同一镜像约定（世界 y 以纹理 worldBox 为轴翻转，
 *   推导见 MapRenderer.worldToScreen），保证河道与疆域贴图、事件锚点对齐。
 */
object RiverRibbonBuilder {

    fun build(
        rivers: List<RiverPath>,
        projection: MercatorProjection,
        worldBox: RectF,
        viewW: Int,
        density: Float,
    ): RiverRibbons {
        val mp = MapTokens.MapParams
        val boxW = worldBox.width()
        val texW = mapTextureSize(viewW, density, worldBox.height() / worldBox.width()).first.toFloat()
        // 旧纹理管线的宽度语义（strokeWidth px @ 纹理宽 texW ↔ 世界宽 boxW）换算成世界单位
        fun width(div: Float, minPx: Float) = max(boxW * minPx / texW, boxW / div)

        val mirrorY = worldBox.top + worldBox.bottom
        val meshes = mutableListOf<RiverMesh>()
        // 分层带宽度比（片元着色器用；与几何同源的宽度计算，避免两处口径不一）
        val majorFracs = floatArrayOf(
            width(mp.RIVER_BODY_WIDTH_MAJOR_DIV, mp.RIVER_BODY_WIDTH_MIN) /
                width(mp.RIVER_WASH_WIDTH_MAJOR_DIV, mp.RIVER_WASH_WIDTH_MIN),
            width(mp.RIVER_SPINE_WIDTH_DIV, mp.RIVER_SPINE_WIDTH_MIN) /
                width(mp.RIVER_WASH_WIDTH_MAJOR_DIV, mp.RIVER_WASH_WIDTH_MIN),
        )
        val minorFracs = floatArrayOf(
            width(mp.RIVER_BODY_WIDTH_MINOR_DIV, mp.RIVER_BODY_WIDTH_MIN_MINOR) /
                width(mp.RIVER_WASH_WIDTH_MINOR_DIV, mp.RIVER_WASH_WIDTH_MIN_MINOR),
            0f,
        )
        for (river in rivers) {
            if (river.path.size < 2) continue
            val raw = river.path.map { p ->
                val xy = projection.project(p)
                floatArrayOf(xy[0], mirrorY - xy[1])
            }
            // 稀疏折线（4~11 点）两次 Chaikin 平滑出毛笔运笔的弧度
            val pts = if (raw.size <= 10) chaikin(chaikin(raw)) else chaikin(raw)
            if (pts.size < 2) continue
            val isMajor = river.rank <= 1
            val wash = if (isMajor) width(mp.RIVER_WASH_WIDTH_MAJOR_DIV, mp.RIVER_WASH_WIDTH_MIN)
            else width(mp.RIVER_WASH_WIDTH_MINOR_DIV, mp.RIVER_WASH_WIDTH_MIN_MINOR)
            val mesh = buildMesh(pts, wash) ?: continue
            meshes.add(RiverMesh(mesh.buffer, mesh.vertexCount, river.rank, if (isMajor) majorFracs else minorFracs))
        }
        return RiverRibbons(meshes)
    }

    /** 单条河的三角带：逐点沿法线外扩 ±halfWidth(s)（含上游→下游变宽） */
    private fun buildMesh(pts: List<FloatArray>, washWidth: Float): RiverMesh? {
        val n = pts.size
        if (n < 2) return null
        // 累计弧长（s[0]=0 上游）
        val s = FloatArray(n)
        for (i in 1 until n) {
            s[i] = s[i - 1] + hypot(
                (pts[i][0] - pts[i - 1][0]).toDouble(),
                (pts[i][1] - pts[i - 1][1]).toDouble(),
            ).toFloat()
        }
        val total = s[n - 1]
        if (total <= 0f) return null
        val mp = MapTokens.MapParams
        val verts = FloatArray(n * 2 * 4)
        var v = 0
        for (i in 0 until n) {
            val prev = pts[maxOf(i - 1, 0)]
            val next = pts[minOf(i + 1, n - 1)]
            var dx = next[0] - prev[0]
            var dy = next[1] - prev[1]
            var len = hypot(dx.toDouble(), dy.toDouble()).toFloat()
            if (len <= 0f) {
                dx = 1f; dy = 0f; len = 1f
            }
            dx /= len; dy /= len
            val nx = -dy
            val ny = dx
            // 变宽：t=s/total 做 smoothstep（上游缓收、入海口缓放）
            val t = (s[i] / total).coerceIn(0f, 1f)
            val k = mp.RIVER_TAPER_HEAD + (mp.RIVER_TAPER_MOUTH - mp.RIVER_TAPER_HEAD) * (t * t * (3f - 2f * t))
            val h = washWidth * 0.5f * k
            val x = pts[i][0]
            val y = pts[i][1]
            verts[v++] = x + nx * h; verts[v++] = y + ny * h; verts[v++] = 1f; verts[v++] = s[i]
            verts[v++] = x - nx * h; verts[v++] = y - ny * h; verts[v++] = -1f; verts[v++] = s[i]
        }
        val buf = ByteBuffer.allocateDirect(verts.size * 4).order(ByteOrder.nativeOrder()).asFloatBuffer()
        buf.put(verts)
        buf.position(0)
        return RiverMesh(buf, n * 2)
    }

    /** Chaikin 轻量平滑（每段 1/4、3/4 各插一点），保持端点 */
    private fun chaikin(pts: List<FloatArray>): List<FloatArray> {
        if (pts.size < 3) return pts
        val out = ArrayList<FloatArray>(pts.size * 2)
        out.add(pts.first())
        for (i in 0 until pts.size - 1) {
            val p0 = pts[i]
            val p1 = pts[i + 1]
            out.add(floatArrayOf(p0[0] * 0.75f + p1[0] * 0.25f, p0[1] * 0.75f + p1[1] * 0.25f))
            out.add(floatArrayOf(p0[0] * 0.25f + p1[0] * 0.75f, p0[1] * 0.25f + p1[1] * 0.75f))
        }
        out.add(pts.last())
        return out
    }
}
