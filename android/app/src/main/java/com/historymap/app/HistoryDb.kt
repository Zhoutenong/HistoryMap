package com.historymap.app

import android.content.Context
import androidx.room.ColumnInfo
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.sqlite.db.SupportSQLiteDatabase

/**
 * Room 数据层：schema 对齐 server/data/schema.sql（dynasties / events 两表）。
 * 事件/朝代数据单一来源 = assets/seed/ 目录下的 .sql 文件（与后端 server/data/seed 同一份文件，
 * 由 scripts/prepare-android.js 同步），首次建库时重放（INSERT OR IGNORE 幂等）。
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
    ],
)
data class EventEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "dynasty_id") val dynastyId: String,
    val year: Int,
    @ColumnInfo(name = "year_end") val yearEnd: Int,
    val lng: Double,
    val lat: Double,
    val short: String,
    val title: String,
    val detail: String,
    val impact: String = "",
    val place: String = "",
    val category: String = "era",
)

@Dao
interface HistoryDao {

    @Query("SELECT * FROM dynasties ORDER BY start_year ASC")
    fun getDynasties(): List<DynastyEntity>

    @Query("SELECT * FROM events WHERE dynasty_id = :dynasty ORDER BY year ASC")
    fun getEvents(dynasty: String): List<EventEntity>
}

@Database(
    entities = [DynastyEntity::class, EventEntity::class],
    version = 1,
    exportSchema = false,
)
abstract class HistoryDb : RoomDatabase() {

    abstract fun dao(): HistoryDao

    companion object {
        @Volatile
        private var instance: HistoryDb? = null

        fun get(context: Context): HistoryDb {
            val appContext = context.applicationContext
            return instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(appContext, HistoryDb::class.java, "historymap.db")
                    .addCallback(SeedCallback(appContext))
                    .build()
                    .also { instance = it }
            }
        }
    }

    /**
     * 首次建库时重放 assets/seed/ 目录的 .sql 文件（INSERT OR IGNORE 幂等）。
     * 注意：Room 的 onCreate 仅在数据库首次创建时执行；日后若 seed 数据变更，
     * 需 bump version + 提供 Migration（或卸载重装）。
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
        val names = context.assets.list("seed") ?: return
        names.filter { it.endsWith(".sql") }.sorted().forEach { file ->
            val sql = context.assets.open("seed/$file")
                .bufferedReader(Charsets.UTF_8).use { it.readText() }
            splitStatements(sql).forEach { stmt ->
                if (stmt.isNotBlank()) db.execSQL(stmt)
            }
        }
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
