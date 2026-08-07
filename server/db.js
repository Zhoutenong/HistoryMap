import Database from 'better-sqlite3';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, 'history.db');
const DATA_DIR = join(__dirname, 'data');

/**
 * better-sqlite3（原生同步驱动）的数据库单例。
 *
 * 历史：首期曾用 sql.js（纯 WASM）规避 Windows 无编译工具链的问题；
 * better-sqlite3 提供 Node 预编译二进制，已可直接安装（AGENTS.md 已知坑已解除）。
 * better-sqlite3 同步 API 更简单、性能更好，且持久化由驱动直接落盘，
 * 不再需要手动 export 写文件。
 *
 * 若未来迁移到原生 Android：用 Room/SQLite 替换本文件即可，
 * 路由层与 API 契约完全不变。
 */
let _db = null;

export function getDb() {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  initSchema(_db);
  seedIfNeeded(_db);
  return _db;
}

/** 执行 schema.sql，幂等建表。 */
function initSchema(db) {
  const sql = readFileSync(join(DATA_DIR, 'schema.sql'), 'utf8');
  db.exec(sql);
  migrateEventsColumn(db, 'category', "TEXT NOT NULL DEFAULT 'era'");
  migrateEventsColumn(db, 'impact', "TEXT NOT NULL DEFAULT ''");
  migrateEventsColumn(db, 'place', "TEXT NOT NULL DEFAULT ''");
}

/**
 * 幂等迁移：给已存在的老 history.db 补 events 新列。
 * 新库列已在 schema.sql 里；老库（CREATE TABLE IF NOT EXISTS 命中旧表）则靠这里 ALTER。
 * 用 PRAGMA table_info 查列是否存在，避免重复 ALTER 报错。
 * @param {string} col 列名
 * @param {string} def 列定义（含默认值）
 */
function migrateEventsColumn(db, col, def) {
  const cols = db.prepare('PRAGMA table_info(events)').all().map((c) => c.name);
  if (cols.includes(col)) return;
  db.exec(`ALTER TABLE events ADD COLUMN ${col} ${def}`);
  console.log(`[db] 迁移：events 表已添加 ${col} 列`);
}

/**
 * 若 dynasties 表为空，执行 data/seed/*.sql 灌入初始数据。
 * 用「dynasties 是否有记录」作为 seed 是否跑过的标记，避免重复插入。
 * 新增 seed 数据后需删除 history.db 重启才会重新执行（或手动清空 dynasties）。
 */
function seedIfNeeded(db) {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM dynasties').get();
  if (n > 0) return;

  const seedDir = join(DATA_DIR, 'seed');
  if (!existsSync(seedDir)) return;
  const files = readdirSync(seedDir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = readFileSync(join(seedDir, f), 'utf8');
    db.exec(sql);
  }
  console.log(`[db] 已 seed ${files.length} 个文件`);
}

/** 供路由层用：执行查询返回全部行（对象数组）。同步返回，路由层 await 亦可。 */
export function all(sql, params = []) {
  const db = getDb();
  return db.prepare(sql).all(...params);
}
