package com.historymap.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * SeedImporter 纯函数测试。2026-08-22 真机验收（P20/EMUI，API 29 框架 SQLite 3.22）
 * 发现 migration2To3 重放 seed 崩溃：seed 语句 VALUES(...) 后是**换行**接 ON CONFLICT，
 * 旧实现只认空格前缀 → 降级失效 → 老 SQLite 抛 near "ON" 语法错误。
 */
class SeedImporterTest {

    @Test
    fun `换行前缀的 upsert 正确降级（P20 崩溃场景）`() {
        val stmt = """
            INSERT INTO dynasties (id, name, start_year, end_year) VALUES ('song', '宋朝', 960, 1279)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              start_year = excluded.start_year,
              end_year = excluded.end_year
        """.trimIndent()
        assertEquals(
            "INSERT OR IGNORE INTO dynasties (id, name, start_year, end_year) VALUES ('song', '宋朝', 960, 1279)",
            SeedImporter.downgradeUpsert(stmt),
        )
    }

    @Test
    fun `空格前缀的 upsert 正确降级`() {
        val stmt = "INSERT INTO events (id) VALUES (1) ON CONFLICT(id) DO UPDATE SET id = excluded.id"
        assertEquals(
            "INSERT OR IGNORE INTO events (id) VALUES (1)",
            SeedImporter.downgradeUpsert(stmt),
        )
    }

    @Test
    fun `CRLF 前缀的 upsert 正确降级`() {
        val stmt = "INSERT INTO t (a) VALUES (1)\r\nON CONFLICT(a) DO UPDATE SET a = excluded.a"
        assertEquals("INSERT OR IGNORE INTO t (a) VALUES (1)", SeedImporter.downgradeUpsert(stmt))
    }

    @Test
    fun `INSERT SELECT WHERE 尾接 upsert 正确降级（08-persons 形态）`() {
        val stmt = """
            INSERT INTO event_person (event_id, person_id, role)
            SELECT e.id, p.id, 'lead'
            FROM events e JOIN persons p ON p.dynasty_id = 'song' AND p.name = '赵匡胤'
            WHERE e.dynasty_id = 'song' AND e.year = 960 AND e.short = '陈桥兵变'
            ON CONFLICT(event_id, person_id) DO UPDATE SET role = excluded.role
        """.trimIndent()
        val downgraded = SeedImporter.downgradeUpsert(stmt)
        assertTrue(downgraded.startsWith("INSERT OR IGNORE INTO event_person"))
        assertTrue(downgraded.contains("WHERE e.dynasty_id = 'song' AND e.year = 960 AND e.short = '陈桥兵变'"))
        assertTrue(!downgraded.contains("ON CONFLICT"))
    }

    @Test
    fun `无 upsert 子句的语句原样返回`() {
        val stmt = "INSERT INTO t (a) VALUES (1)"
        assertEquals(stmt, SeedImporter.downgradeUpsert(stmt))
        assertEquals("CREATE TABLE x (a INTEGER)", SeedImporter.downgradeUpsert("CREATE TABLE x (a INTEGER)"))
    }

    @Test
    fun `splitStatements 按分号切分且字符串内分号不误切`() {
        val sql = "INSERT INTO t (a) VALUES ('含;分号');\nINSERT INTO t (a) VALUES (2);\n-- 注释; 也不切\n"
        val stmts = SeedImporter.splitStatements(sql)
        // 注释尾块只剩空白（isNotBlank=false）不产出空语句
        assertEquals(2, stmts.size)
        assertTrue(stmts[0].contains("含;分号"))
        assertEquals("INSERT INTO t (a) VALUES (2)", stmts[1].trim())
    }
}
