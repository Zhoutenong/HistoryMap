package com.historymap.app

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** OverlayParser 解析测试：颜色/alpha、labelCoord 兜底、rank fallback、河流山脉（实施计划 M6） */
class OverlayParserTest {

    private fun polygonFeature(entity: String, extra: String = ""): String = """
        {"type":"Feature","properties":{"entity":"$entity","color":"#8E2F24","fillOpacity":0.4$extra},
         "geometry":{"type":"Polygon","coordinates":[[[110,35],[112,35],[112,37],[110,37],[110,35]]]}}
    """.trimIndent()

    @Test
    fun `解析政权颜色与 fillOpacity`() {
        val json = JSONObject(
            """{"type":"FeatureCollection","features":[${
                polygonFeature("song", """, "labelCoord":[114.35,34.52], "labelMajor":true""")
            }]}""",
        )
        val model = OverlayParser.parse(json)
        assertEquals(1, model.regimes.size)
        val r = model.regimes[0]
        assertEquals("song", r.entity)
        assertEquals(0.4f, r.color[3], 1e-4f)
        // #8E2F24 → 0.557 / 0.184 / 0.141
        assertEquals(0.557f, r.color[0], 0.01f)
        assertEquals(0.184f, r.color[1], 0.01f)
        assertEquals(0.141f, r.color[2], 0.01f)
    }

    @Test
    fun `labelCoord 缺失时用质心兜底`() {
        val json = JSONObject("""{"type":"FeatureCollection","features":[${polygonFeature("song")}]}""")
        val model = OverlayParser.parse(json)
        // RegimePolygon.labelCoord 保持 null；兜底质心作用于政权名标签。
        // 质心为面积最大环的 shoelace 面积加权质心（对齐 Web geoCentroid）：
        // 矩形 110..112 × 35..37 的面积质心即几何中心 (111, 36)。
        assertEquals(null, model.regimes[0].labelCoord)
        val label = model.labels.first { it.kind == "regime" }
        assertEquals(111.0, label.coord.lng, 0.01)
        assertEquals(36.0, label.coord.lat, 0.01)
    }

    @Test
    fun `同 entity 政权名标签只生成一个`() {
        val json = JSONObject(
            """{"type":"FeatureCollection","features":[
                ${polygonFeature("song", """, "labelCoord":[114,34]""")},
                ${polygonFeature("song", """, "labelCoord":[115,35]""")}
            ]}""",
        )
        val model = OverlayParser.parse(json)
        assertEquals(2, model.regimes.size)
        assertEquals(1, model.labels.count { it.kind == "regime" })
    }

    @Test
    fun `城市 rank 缺失时 fallback 99`() {
        val json = JSONObject(
            """{"type":"FeatureCollection","features":[],
                "properties":{"cities":[{"name":"开封","coord":[114.3,34.8]}]}}""",
        )
        val model = OverlayParser.parse(json)
        val c = model.labels.first { it.kind == "cities" }
        assertEquals("开封", c.text)
        assertEquals(99, c.rank)
    }

    @Test
    fun `河流解析并生成河流名标签`() {
        val json = JSONObject(
            """{"type":"FeatureCollection","features":[],
                "properties":{"rivers":[{"name":"黄河","path":[[110,38],[112,39],[114,38]],"rank":1}]}}""",
        )
        val model = OverlayParser.parse(json)
        assertEquals(1, model.rivers.size)
        assertEquals("黄河", model.rivers[0].name)
        assertEquals(1, model.rivers[0].rank)
        assertTrue(model.labels.any { it.kind == "rivers" && it.text == "黄河" })
    }

    @Test
    fun `山脉 path 与 coord 解析`() {
        val json = JSONObject(
            """{"type":"FeatureCollection","features":[],
                "properties":{"mountains":[
                    {"name":"秦岭","path":[[107,33],[109,34]]},
                    {"name":"华山","coord":[110.1,34.5],"rank":2}
                ]}}""",
        )
        val model = OverlayParser.parse(json)
        assertEquals(2, model.mountains.size)
        val qin = model.mountains.first { it.name == "秦岭" }
        assertEquals(2, qin.path!!.size)
        val hua = model.mountains.first { it.name == "华山" }
        assertEquals(2, hua.rank)
        assertEquals(110.1, hua.coord!!.lng, 1e-4)
    }

    @Test
    fun `MultiPolygon 全部环解析（含孔洞 EVEN_ODD 数据源）`() {
        val json = JSONObject(
            """{"type":"FeatureCollection","features":[{
                "type":"Feature",
                "properties":{"entity":"liao","color":"#5D7F8C","fillOpacity":0.3},
                "geometry":{"type":"MultiPolygon","coordinates":[
                    [[[110,35],[112,35],[112,37],[110,37],[110,35]]],
                    [[[120,40],[122,40],[122,42],[120,42],[120,40]]]
                ]}
            }]}""",
        )
        val model = OverlayParser.parse(json)
        assertEquals(1, model.regimes.size)
        assertEquals(2, model.regimes[0].rings.size)
        assertEquals(5, model.regimes[0].rings[1].size)
    }
}
