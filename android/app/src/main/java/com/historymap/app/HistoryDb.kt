package com.historymap.app

import android.content.Context
import androidx.room.ColumnInfo
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Ignore
import androidx.room.Index
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

/**
 * Room 数据层：schema 对齐 server/data/schema.sql（dynasties / events / persons / event_person）。
 * 事件/朝代/人物数据单一来源 = assets/seed/ 目录下的 .sql 文件（与后端 server/data/seed 同一份文件，
 * 由 scripts/prepare-android.mjs 同步），首次建库时重放（upsert 幂等；老 SQLite 见 SeedImporter 兼容层）。
 */

/** 朝代元信息（对齐 dynasties 表） */
@Entity(tableName = "dynasties")
data class DynastyEntity(
    @PrimaryKey val id: String,            // 'song'，API 用的 dynasty 参数
    val name: String,
    @ColumnInfo(name = "start_year") val startYear: Int,
    @ColumnInfo(name = "end_year") val endYear: Int,
)

/** 历史事件（对齐 events 表；coord 拆 lng/lat 两列） */
@Entity(
    tableName = "events",
    indices = [
        Index("dynasty_id", "year"),
        Index("dynasty_id", "category"),
        // seed 文件按 (dynasty_id, year, short) 身份 upsert（对齐 server db.js 的
        // idx_events_seed_identity）；ON CONFLICT 必须命中唯一约束，否则 SQLite 报错。
        Index(name = "idx_events_seed_identity", value = ["dynasty_id", "year", "short"], unique = true),
    ],
)
data class EventEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "dynasty_id") val dynastyId: String,
    val year: Int,
    @ColumnInfo(name = "month", defaultValue = "1") val month: Int = 1,
    @ColumnInfo(name = "year_end") val yearEnd: Int,
    // month_end 兜底 12：无月级数据的跨年事件窗口保持「整年可见」旧语义（与 server schema.sql 同值）
    @ColumnInfo(name = "month_end", defaultValue = "12") val monthEnd: Int = 12,
    val lng: Double,
    val lat: Double,
    val short: String,
    val title: String,
    val detail: String,
    val impact: String = "",
    val place: String = "",
    val category: String = "era",
    /** 史料来源（P4 考据感，等价 /api/events 的 source/confidence/license） */
    val source: String = "",
    val confidence: String = "medium",
    val license: String = "公版古籍",
) {
    /** 事件关联人物（查询期由 event_person/persons JOIN 组装；@Ignore 不入库。
     *  放类体而非构造参数（构造参数 @Ignore 会让 Room 找不到可用构造器）；
     *  注意 data class copy() 不携带本字段——装配只在 MapRepository.getEvents 一处完成。 */
    @Ignore
    var relatedPersons: List<RelatedPerson> = emptyList()
}

/** 事件关联人物（对齐 /api/events 的 relatedPersons 字段：[{id,name,title,role}]） */
data class RelatedPerson(
    val id: Long,
    val name: String,
    val title: String,
    val role: String,   // lead 主导 / involved 牵连
)

/** 人物（对齐 persons 表：P1 人物视角） */
@Entity(
    tableName = "persons",
    indices = [Index(value = ["dynasty_id", "name"], unique = true)],
)
data class PersonEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "dynasty_id") val dynastyId: String,
    val name: String,
    val title: String = "",
    @ColumnInfo(name = "birth_year") val birthYear: Int? = null,
    @ColumnInfo(name = "death_year") val deathYear: Int? = null,
    val note: String = "",
)

/** 事件 ↔ 人物关联（对齐 event_person 表） */
@Entity(
    tableName = "event_person",
    primaryKeys = ["event_id", "person_id"],
    indices = [Index("person_id")],
)
data class EventPersonEntity(
    @ColumnInfo(name = "event_id") val eventId: Long,
    @ColumnInfo(name = "person_id") val personId: Long,
    val role: String = "involved",
)

/** 人物视角列表行（persons + 关联事件数，等价 /api/persons 响应） */
data class PersonWithCount(
    val id: Long,
    val name: String,
    val title: String,
    @ColumnInfo(name = "birth_year") val birthYear: Int?,
    @ColumnInfo(name = "death_year") val deathYear: Int?,
    val note: String,
    @ColumnInfo(name = "event_count") val eventCount: Int,
)

/** event_person ↔ persons JOIN 行（组装 relatedPersons 用） */
data class EventPersonJoin(
    @ColumnInfo(name = "event_id") val eventId: Long,
    @ColumnInfo(name = "person_id") val personId: Long,
    val role: String,
    val name: String,
    val title: String,
)

@Dao
interface HistoryDao {

    @Query("SELECT * FROM dynasties ORDER BY start_year ASC")
    fun getDynasties(): List<DynastyEntity>

    @Query("SELECT * FROM events WHERE dynasty_id = :dynasty ORDER BY year ASC")
    fun getEvents(dynasty: String): List<EventEntity>

    @Query(
        "SELECT p.id AS id, p.name AS name, p.title AS title, p.birth_year AS birth_year, " +
            "p.death_year AS death_year, p.note AS note, COUNT(ep.event_id) AS event_count " +
            "FROM persons p LEFT JOIN event_person ep ON ep.person_id = p.id " +
            "WHERE p.dynasty_id = :dynasty " +
            "GROUP BY p.id ORDER BY event_count DESC, p.id ASC"
    )
    fun getPersonsWithCount(dynasty: String): List<PersonWithCount>

    @Query(
        "SELECT ep.event_id AS event_id, ep.person_id AS person_id, ep.role AS role, " +
            "p.name AS name, p.title AS title " +
            "FROM event_person ep JOIN persons p ON p.id = ep.person_id " +
            "JOIN events e ON e.id = ep.event_id " +
            "WHERE e.dynasty_id = :dynasty"
    )
    fun getEventPersons(dynasty: String): List<EventPersonJoin>
}

@Database(
    entities = [DynastyEntity::class, EventEntity::class, PersonEntity::class, EventPersonEntity::class],
    version = 5,
    exportSchema = false,
)
abstract class HistoryDb : RoomDatabase() {

    abstract fun dao(): HistoryDao

    companion object {
        @Volatile
        private var instance: HistoryDb? = null

        /**
         * v1 → v2（P1 人物视角）：建 persons/event_person 两表。
         * v2 → v3（P4 考据感）：events 补 source/confidence/license 三列，
         *   并重放 seed（upsert 语义）让既有安装同步获得事件/人物/考据数据
         *   （重放放 2→3 而非 1→2：09 号考据 seed 的 UPDATE 引用新列，列须先就位）。
         * v3 → v4（A4 修复）：events 补 (dynasty_id, year, short) 唯一索引——
         *   seed 的 ON CONFLICT 必须命中唯一约束，否则新设备 upsert 重放会直接报错。
         */
        private fun migration1To2(context: Context): Migration = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS `persons` (`id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, " +
                        "`dynasty_id` TEXT NOT NULL, `name` TEXT NOT NULL, `title` TEXT NOT NULL, " +
                        "`birth_year` INTEGER, `death_year` INTEGER, `note` TEXT NOT NULL)"
                )
                db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS `index_persons_dynasty_id_name` ON `persons` (`dynasty_id`, `name`)")
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS `event_person` (`event_id` INTEGER NOT NULL, " +
                        "`person_id` INTEGER NOT NULL, `role` TEXT NOT NULL, " +
                        "PRIMARY KEY(`event_id`, `person_id`))"
                )
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_event_person_person_id` ON `event_person` (`person_id`)")
            }
        }

        private fun migration2To3(context: Context): Migration = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE `events` ADD COLUMN `source` TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE `events` ADD COLUMN `confidence` TEXT NOT NULL DEFAULT 'medium'")
                db.execSQL("ALTER TABLE `events` ADD COLUMN `license` TEXT NOT NULL DEFAULT '公版古籍'")
                // 先补唯一索引再重放 seed：seed 的 ON CONFLICT(dynasty_id, year, short)
                // 依赖该约束，否则 SQLite 直接报错（对齐 v3 全新建库的 schema）。
                db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS `idx_events_seed_identity` ON `events` (`dynasty_id`, `year`, `short`)")
                SeedImporter.import(context, db)
            }
        }

        private fun migration3To4(): Migration = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                // 已建 v3 库补齐唯一索引（未随 v2→v3 创建；不重放 seed——数据已在库内）。
                db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS `idx_events_seed_identity` ON `events` (`dynasty_id`, `year`, `short`)")
            }
        }

        private fun migration4To5(context: Context): Migration = object : Migration(4, 5) {
            override fun migrate(db: SupportSQLiteDatabase) {
                // 月份化：events 补 month/month_end 两列（month 兜底 1、month_end 兜底 12，
                // 与全新建库 schema 一致：无月级数据的跨年事件窗口保持「整年可见」旧语义）。
                db.execSQL("ALTER TABLE `events` ADD COLUMN `month` INTEGER NOT NULL DEFAULT 1")
                db.execSQL("ALTER TABLE `events` ADD COLUMN `month_end` INTEGER NOT NULL DEFAULT 12")
                // 重放 seed（upsert 幂等）让既有安装补齐月级日期：10-event-months.sql 按
                // (dynasty_id, year, short) 身份 UPDATE month/month_end（与 v2→v3 同款自愈语义；
                // 01-09 重放不改动 month，只有 10 号 UPDATE 覆写）。老 SQLite 见 SeedImporter 降级。
                SeedImporter.import(context, db)
            }
        }

        fun get(context: Context): HistoryDb {
            val appContext = context.applicationContext
            return instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(appContext, HistoryDb::class.java, "historymap.db")
                    .addCallback(SeedCallback(appContext))
                    .addMigrations(migration1To2(appContext), migration2To3(appContext), migration3To4(), migration4To5(appContext))
                    .build()
                    .also { instance = it }
            }
        }
    }

    /**
     * 首次建库时重放 assets/seed/ 目录的 .sql 文件（upsert 幂等；老 SQLite 自动降级见 SeedImporter）。
     * 注意：Room 的 onCreate 仅在数据库首次创建时执行；结构性变更走 Migration。
     */
    private class SeedCallback(private val context: Context) : Callback() {
        override fun onCreate(db: SupportSQLiteDatabase) {
            super.onCreate(db)
            SeedImporter.import(context, db)
        }
    }
}

/** 解析并重放 assets/seed/ 目录的 .sql 文件，与 server/db.js 的 seed 机制同源 */
object SeedImporter {

    fun import(context: Context, db: SupportSQLiteDatabase) {
        // seed 文件用 ON CONFLICT ... DO UPDATE（SQLite ≥3.24）实现「修偏」自愈；
        // 老设备框架 SQLite（API 28 以下为 3.9–3.22）不支持，降级为 INSERT OR IGNORE
        //（保留「补缺」能力，放弃「修偏」——老设备首次建库时表为空，语义无损）。
        val upsertSupported = probeUpsert(db)
        val names = context.assets.list("seed") ?: return
        names.filter { it.endsWith(".sql") }.sorted().forEach { file ->
            val sql = context.assets.open("seed/$file")
                .bufferedReader(Charsets.UTF_8).use { it.readText() }
            splitStatements(sql).forEach { stmt ->
                if (stmt.isNotBlank()) db.execSQL(if (upsertSupported) stmt else downgradeUpsert(stmt))
            }
        }
    }

    /** 用临时表探测当前 SQLite 是否支持 upsert（探测失败静默视为不支持）。 */
    private fun probeUpsert(db: SupportSQLiteDatabase): Boolean = try {
        db.execSQL("CREATE TEMP TABLE IF NOT EXISTS _upsert_probe(x INTEGER PRIMARY KEY, y TEXT)")
        db.execSQL("DELETE FROM _upsert_probe")
        db.execSQL("INSERT INTO _upsert_probe(x, y) VALUES(1, 'a') ON CONFLICT(x) DO UPDATE SET y = 'b'")
        true
    } catch (e: Exception) {
        false
    }

    /**
     * 把 `INSERT … ON CONFLICT(…) DO UPDATE SET …` 降级为 `INSERT OR IGNORE …`。
     * 覆盖本仓库 seed 的两种形态：`VALUES(…) ` 后接子句、以及 `INSERT … SELECT …
     * WHERE …` 尾接子句（08-song-persons.sql 按身份定位关联）。
     *
     * 2026-08-22 真机验收（P20/EMUI，API 29 框架 SQLite 仍为 3.22）发现旧实现
     * `indexOf(" ON CONFLICT")` 只认空格前缀 → 降级静默失效 → migration2To3 重放
     * seed 直接崩溃；改为 `\bON\s+CONFLICT\s*\(`（seed 中 144 处均为该子句形态，
     * 已验证无字符串内误伤）。
     */
    fun downgradeUpsert(stmt: String): String {
        val m = Regex("""\bON\s+CONFLICT\s*\(""", RegexOption.IGNORE_CASE).find(stmt) ?: return stmt
        return stmt.substring(0, m.range.first)
            .replaceFirst("INSERT INTO", "INSERT OR IGNORE INTO")
            .trimEnd()
    }

    /**
     * 按分号切分 SQL 语句。
     * 处理单引号字符串（含 '' 转义）与 -- 行注释，字符串/注释内的分号不会误切。
     * Android execSQL 一次只能执行一条语句，故需先分割。
     */
    fun splitStatements(sql: String): List<String> {
        val statements = mutableListOf<String>()
        val sb = StringBuilder()
        var i = 0
        var inString = false
        while (i < sql.length) {
            val c = sql[i]
            when {
                inString -> {
                    sb.append(c)
                    if (c == '\'') {
                        if (i + 1 < sql.length && sql[i + 1] == '\'') { // '' 转义
                            sb.append('\'')
                            i++
                        } else {
                            inString = false
                        }
                    }
                }
                c == '\'' -> {
                    inString = true
                    sb.append(c)
                }
                c == '-' && i + 1 < sql.length && sql[i + 1] == '-' -> {
                    // 行注释：跳到行尾（保留换行隔离 token）
                    while (i < sql.length && sql[i] != '\n') i++
                    if (i < sql.length) sb.append('\n')
                }
                c == ';' -> {
                    statements.add(sb.toString())
                    sb.clear()
                }
                else -> sb.append(c)
            }
            i++
        }
        val tail = sb.toString()
        if (tail.isNotBlank()) statements.add(tail)
        return statements
    }
}
