import initSqlJs from 'sql.js';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, 'history.db');
const DATA_DIR = join(__dirname, 'data');

/**
 * sql.js（纯 WASM SQLite）的数据库单例。
 *
 * 为什么不用 better-sqlite3：它是原生模块，需要 node-gyp 编译，
 * 在无 VS 构建工具的 Windows 上安装失败（AGENTS.md 已知坑）。
 * sql.js 是纯 JS/WASM，零编译，跨平台一键装。代价是数据在内存里、
 * 需手动持久化到文件；首期数据量小（数十条事件），性能影响可忽略。
 *
 * 未来若迁移到原生 Android：用 Room/SQLite 替换本文件即可，
 * 路由层与 API 契约完全不变。
 */
let _db = null;
let _initPromise = null;

export function getDb() {
  if (_db) return Promise.resolve(_db);
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const SQL = await initSqlJs();
    // 已有持久化文件则载入，否则新建
    if (existsSync(DB_PATH)) {
      const buf = readFileSync(DB_PATH);
      _db = new SQL.Database(new Uint8Array(buf));
    } else {
      _db = new SQL.Database();
    }
    initSchema(_db);
    seedIfNeeded(_db);
    persist(_db);
    return _db;
  })();
  return _initPromise;
}

/** 执行 schema.sql，幂等建表。 */
function initSchema(db) {
  const sql = readFileSync(join(DATA_DIR, 'schema.sql'), 'utf8');
  db.run(sql);
  migrateEventsColumn(db, 'category', "TEXT NOT NULL DEFAULT 'era'");
  migrateEventsColumn(db, 'impact', "TEXT NOT NULL DEFAULT ''");
}

/**
 * 幂等迁移：给已存在的老 history.db 补 events 新列。
 * 新库列已在 schema.sql 里；老库（CREATE TABLE IF NOT EXISTS 命中旧表）则靠这里 ALTER。
 * 用 PRAGMA table_info 查列是否存在，避免重复 ALTER 报错。
 * @param {string} col 列名
 * @param {string} def 列定义（含默认值）
 */
function migrateEventsColumn(db, col, def) {
  const stmt = db.prepare('PRAGMA table_info(events)');
  const cols = [];
  while (stmt.step()) cols.push(stmt.getAsObject().name);
  stmt.free();
  if (cols.includes(col)) return;
  db.run(`ALTER TABLE events ADD COLUMN ${col} ${def}`);
  console.log(`[db] 迁移：events 表已添加 ${col} 列`);
}

/**
 * 若 dynasties 表为空，执行 data/seed/*.sql 灌入初始数据。
 * 用「dynasties 是否有记录」作为 seed 是否跑过的标记，避免重复插入。
 */
function seedIfNeeded(db) {
  const stmt = db.prepare('SELECT COUNT(*) AS n FROM dynasties');
  stmt.step();
  const count = stmt.getAsObject().n;
  stmt.free();
  if (count > 0) return;

  const seedDir = join(DATA_DIR, 'seed');
  if (!existsSync(seedDir)) return;
  const files = readdirSync(seedDir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = readFileSync(join(seedDir, f), 'utf8');
    db.run(sql);
  }
  console.log(`[db] 已 seed ${files.length} 个文件`);
}

/** 把内存数据库写回文件持久化（首期数据写一次即可，不频繁变更）。 */
function persist(db) {
  const data = db.export();
  writeFileSync(DB_PATH, Buffer.from(data));
}

/** 供路由层用：执行查询返回全部行（对象数组）。 */
export async function all(sql, params = []) {
  const db = await getDb();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}
