package com.historymap.app

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File

/**
 * 双端 overlay 合并 golden（Android 侧，A2 第一步）：OverlayMerge（server 端
 * overlay-merge.js 的 Kotlin 复刻）对 contract/golden/overlay-merge.fixture.json
 * 固定输入的输出，必须与 contract/golden/overlay-merge.expected.json（服务端参考实现
 * 生成，两端共用）一致。服务端侧断言在 scripts/contract-golden.mjs（npm run contract:golden）。
 */
class OverlayMergeGoldenTest {

    private val goldenDir: File = findGoldenDir()

    @Test
    fun `overlay 合并输出与 golden 一致`() {
        val fixture = JSONObject(File(goldenDir, "overlay-merge.fixture.json").readText())
        val expected = JSONObject(File(goldenDir, "overlay-merge.expected.json").readText())
            .getJSONObject("expected")

        val files = fixture.getJSONObject("files")
        val actual = OverlayMerge.buildOverlay(
            periodsIndex = files.optJSONObject("periods.json"),
            dynasty = fixture.getString("dynasty"),
            period = fixture.getString("period"),
            readFile = { name -> files.optJSONObject(name) },
        )
        assertJsonEquals(expected, actual, "$")
    }

    @Test
    fun `索引缺失返回空集带说明`() {
        val out = OverlayMerge.buildOverlay(null, "song", "1111") { null }
        assertEquals("FeatureCollection", out.getString("type"))
        assertEquals(0, out.getJSONArray("features").length())
        assertEquals("索引文件未找到", out.getString("_note"))
    }

    @Test
    fun `未知时期返回空集带说明`() {
        val periodsIndex = JSONObject("""{"periods":[{"id":"song-1111","label":"x","year":1111,"files":[]}]}""")
        val out = OverlayMerge.buildOverlay(periodsIndex, "song", "9999") { null }
        assertEquals(0, out.getJSONArray("features").length())
        assertEquals("未找到时期: song-9999", out.getString("_note"))
    }

    /** 键序无关、数值带容差的递归 JSON 比对（golden 断言核心） */
    private fun assertJsonEquals(e: Any?, a: Any?, path: String) {
        when (e) {
            is JSONObject -> {
                val actual = asObject(a, path)
                val expectedKeys = e.keySet().sorted()
                assertEquals("$path 字段集合不一致：$expectedKeys vs ${actual.keySet().sorted()}", expectedKeys, actual.keySet().sorted())
                expectedKeys.forEach { k -> assertJsonEquals(e.get(k), actual.get(k), "$path.$k") }
            }
            is JSONArray -> {
                val actual = a as? JSONArray
                    ?: throw AssertionError("$path 期望数组，实际 ${typeName(a)}")
                assertEquals("$path 数组长度不一致", e.length(), actual.length())
                for (i in 0 until e.length()) assertJsonEquals(e.get(i), actual.get(i), "$path[$i]")
            }
            is Number -> {
                val an = (a as? Number)?.toDouble()
                    ?: throw AssertionError("$path 期望数值，实际 ${typeName(a)}")
                assertEquals("$path 数值不一致", e.toDouble(), an, 1e-9)
            }
            JSONObject.NULL -> {
                // 显式 null 与字段缺省视为等价（org.json 各版本对 null 的 put 行为不一）
                if (!(a === JSONObject.NULL || a == null)) throw AssertionError("$path 期望 null，实际 ${typeName(a)}")
            }
            else -> assertEquals("$path 值不一致", e, a)
        }
    }

    private fun asObject(a: Any?, path: String): JSONObject =
        a as? JSONObject ?: throw AssertionError("$path 期望对象，实际 ${typeName(a)}")

    private fun typeName(a: Any?): String = when (a) {
        null, JSONObject.NULL -> "null"
        is JSONObject -> "object"
        is JSONArray -> "array"
        is String -> "string(${a.length})"
        is Number -> "number"
        is Boolean -> "boolean"
        else -> a::class.java.simpleName
    }

    companion object {
        private fun findGoldenDir(): File {
            var dir: File? = File(System.getProperty("user.dir"))
            repeat(8) {
                if (dir == null) return@repeat
                val candidate = File(dir, "contract${File.separator}golden")
                if (File(candidate, "overlay-merge.fixture.json").isFile) return candidate
                dir = dir!!.parentFile
            }
            throw IllegalStateException("未找到 contract/golden 目录（请在仓库内运行单测）")
        }
    }
}
