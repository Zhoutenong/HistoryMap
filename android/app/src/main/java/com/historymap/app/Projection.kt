package com.historymap.app

import kotlin.math.PI
import kotlin.math.ln
import kotlin.math.tan

/**
 * 经纬度点（经度在前，与 GeoJSON 坐标顺序一致）。
 */
data class LngLat(val lng: Double, val lat: Double)

/**
 * 墨卡托投影：复刻 Web 版 client/src/map/ChinaMap.js 的 d3-geo 投影链路
 * （geoMercator + fitSize([1000, 800])），保证原生端与 Web 端坐标完全一致。
 *
 * d3-geo 算法要点（源码翻译）：
 * 1. raw 投影：x = λ，y = ln(tan(π/4 + φ/2))（λ、φ 为弧度，球面墨卡托）
 * 2. fitExtent 先用 scale=150 / translate=[0,0] 计算全部点的投影包围盒，
 *    再 k = min(w/boxW, h/boxH) 等比缩放居中（本项目固定 1000×800）
 * 3. fitSize 之后投影包围盒中心恰好落在 extent 中心 [500, 400]（数学性质），
 *    故 project() 减去该中心即可让地图天然居中于原点；y 轴翻转为数学坐标（向上），
 *    与 Web 版 project() 的 `[px - cx, cy - py]` 完全一致。
 */
class MercatorProjection private constructor(
    private val scale: Double,
    private val tx: Double,
    private val ty: Double,
) {
    /** 投影并居中：[lng, lat] → [x, y]（y 向上，地图中心为原点，单位与 Web 版一致） */
    fun project(lng: Double, lat: Double): FloatArray {
        val rawX = Math.toRadians(lng)
        val rawY = ln(tan(PI / 4 + Math.toRadians(lat) / 2))
        val px = scale * rawX + tx
        val py = scale * rawY + ty
        return floatArrayOf((px - CENTER_X).toFloat(), (CENTER_Y - py).toFloat())
    }

    fun project(p: LngLat): FloatArray = project(p.lng, p.lat)

    companion object {
        /** fitSize 的标定范围（与 Web 版 ChinaMap.js 的 fitProjection 一致；数值来自契约
         *  ContractTokens，勿本地另写一份——联动的 golden 测试 ProjectionGoldenTest 锚定） */
        const val FIT_WIDTH: Double = ContractTokens.PROJECTION_FIT_WIDTH
        const val FIT_HEIGHT: Double = ContractTokens.PROJECTION_FIT_HEIGHT
        private const val CENTER_X = FIT_WIDTH / 2
        private const val CENTER_Y = FIT_HEIGHT / 2

        /**
         * 用全部坐标点标定投影（等价 d3-geo 的 projection.fitSize([1000, 800], geojson)）。
         * 推荐用历史疆域 GeoJSON（覆盖中国及周边）的所有点做标定，与 Web 版一致。
         * @param points 全部多边形顶点（标定基准）
         */
        fun fit(points: List<LngLat>, width: Double = FIT_WIDTH, height: Double = FIT_HEIGHT): MercatorProjection {
            if (points.isEmpty()) return MercatorProjection(1.0, 0.0, 0.0)
            var x0 = Double.POSITIVE_INFINITY
            var y0 = Double.POSITIVE_INFINITY
            var x1 = Double.NEGATIVE_INFINITY
            var y1 = Double.NEGATIVE_INFINITY
            for (p in points) {
                val x = 150.0 * Math.toRadians(p.lng)
                val y = 150.0 * ln(tan(PI / 4 + Math.toRadians(p.lat) / 2))
                if (x < x0) x0 = x
                if (x > x1) x1 = x
                if (y < y0) y0 = y
                if (y > y1) y1 = y
            }
            val boxW = x1 - x0
            val boxH = y1 - y0
            val k = if (boxW <= 0.0 || boxH <= 0.0) 1.0 else minOf(width / boxW, height / boxH)
            val scale = 150.0 * k
            val tx = (width - k * (x0 + x1)) / 2
            val ty = (height - k * (y0 + y1)) / 2
            return MercatorProjection(scale, tx, ty)
        }
    }
}
