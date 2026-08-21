package com.historymap.app

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 双端投影 golden（Android 侧，A2 第一步）：用 contract/golden/projection.fixture.json
 * 的固定标定点集走 MercatorProjection.fit/project（d3-geo 的 Kotlin 手工翻译，漂移风险
 * 最高），输出必须与 contract/golden/projection.expected.json（Web 参考实现 d3-geo 生成）
 * 一致。Web 侧同数据集断言在 client/src/map/__tests__/projection.golden.test.js。
 *
 * 标定输入为 MultiPoint（点集语义）：d3 对 Polygon 做 fitSize 量的是整个墨卡托世界方块
 * （球面流副作用），只有点集才与 Kotlin 版公式语义一致——详见夹具文件 description。
 */
class ProjectionGoldenTest {

    private val goldenDir: File = findGoldenDir()

    @Test
    fun `固定标定点集投影与 golden 一致`() {
        val fixture = JSONObject(File(goldenDir, "projection.fixture.json").readText())
        val expected = JSONObject(File(goldenDir, "projection.expected.json").readText())
        assertEquals("fitSize 标定参数", "[1000,800]", fixture.getJSONArray("fitSize").toString())

        // MultiPoint 标定点 → 全部顶点做 fit（与生产端 OverlayParser.allPoints 同语义）
        val calibrationPoints = mutableListOf<LngLat>()
        fixture.getJSONObject("calibration")
            .getJSONArray("features")
            .getJSONObject(0)
            .getJSONObject("geometry")
            .getJSONArray("coordinates")
            .let { coords ->
                for (i in 0 until coords.length()) {
                    val pt = coords.getJSONArray(i)
                    calibrationPoints.add(LngLat(pt.getDouble(0), pt.getDouble(1)))
                }
            }
        assertTrue("标定点集非空", calibrationPoints.isNotEmpty())

        val projection = MercatorProjection.fit(calibrationPoints)
        val probes = fixture.getJSONArray("probes")
        val expectedXY = expected.getJSONArray("expected")
        assertEquals("探针点与期望数量一致", probes.length(), expectedXY.length())
        for (i in 0 until probes.length()) {
            val lngLat = probes.getJSONArray(i)
            val xy = projection.project(lngLat.getDouble(0), lngLat.getDouble(1))
            val ex = expectedXY.getJSONArray(i)
            // FloatArray 输出（float32）+ 双端 double 中间量：1e-3 容差足够窄以抓漂移。
            // y 符号约定：Projection.kt 的墨卡托 y 与 Web 版反号（历史遗留、渲染层
            // worldToScreen 已翻转补偿，见 ProjectionTest「纬度向北 y 减小」），故断言 -y。
            assertEquals("探针[$i] ${lngLat} x", ex.getDouble(0), xy[0].toDouble(), 1e-3)
            assertEquals("探针[$i] ${lngLat} y（与 Web 反号约定）", -ex.getDouble(1), xy[1].toDouble(), 1e-3)
        }
    }

    @Test
    fun `标定包围盒对角点关于原点对称（居中不变式）`() {
        val fixture = JSONObject(File(goldenDir, "projection.fixture.json").readText())
        val points = mutableListOf<LngLat>()
        fixture.getJSONObject("calibration").getJSONArray("features").getJSONObject(0)
            .getJSONObject("geometry").getJSONArray("coordinates")
            .let { coords ->
                for (i in 0 until coords.length()) {
                    val pt = coords.getJSONArray(i)
                    points.add(LngLat(pt.getDouble(0), pt.getDouble(1)))
                }
            }
        val projection = MercatorProjection.fit(points)
        val sw = projection.project(points[0])
        val ne = projection.project(points[2])
        assertEquals(-ne[0], sw[0], 1e-3f)
        assertEquals(-ne[1], sw[1], 1e-3f)
    }

    companion object {
        /** 定位仓库根的 contract/golden 目录（Gradle 单测工作目录随版本/嵌套调用变化，向上回溯最稳） */
        private fun findGoldenDir(): File {
            var dir: File? = File(System.getProperty("user.dir"))
            repeat(8) {
                if (dir == null) return@repeat
                val candidate = File(dir, "contract${File.separator}golden")
                if (File(candidate, "projection.fixture.json").isFile) return candidate
                dir = dir!!.parentFile
            }
            throw IllegalStateException("未找到 contract/golden 目录（请在仓库内运行单测）")
        }
    }
}
