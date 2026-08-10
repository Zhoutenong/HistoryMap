import Database from 'better-sqlite3';
import { readFileSync, existsSync } from 'node:fs';
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
  initializeDatabase(_db);
  return _db;
}

/** 初始化 schema 并执行所有尚未记录的数据迁移。供升级测试使用。 */
export function initializeDatabase(db) {
  db.pragma('journal_mode = WAL');
  initSchema(db);
  migrateData(db);
  return db;
}

/** 执行 schema.sql，幂等建表。 */
function initSchema(db) {
  const sql = readFileSync(join(DATA_DIR, 'schema.sql'), 'utf8');
  db.exec(sql);
  migrateEventsColumn(db, 'category', "TEXT NOT NULL DEFAULT 'era'");
  migrateEventsColumn(db, 'impact', "TEXT NOT NULL DEFAULT ''");
  migrateEventsColumn(db, 'place', "TEXT NOT NULL DEFAULT ''");
}

const MIGRATIONS = [
  {
    version: 1,
    apply(db) {
      seedFiles(db, ['01-song-events.sql']);
    },
  },
  {
    version: 2,
    apply(db) {
      seedFiles(db, ['02-jin-events.sql']);
    },
  },
  {
    version: 3,
    apply(db) {
      seedFiles(db, ['03-liao-events.sql']);
    },
  },
  {
    version: 4,
    apply(db) {
      seedFiles(db, ['04-yuan-events.sql']);
    },
  },
];

function migrateData(db) {
  const applied = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all();
  const appliedVersions = new Set(applied.map((row) => row.version));

  // The marker only records that a migration was attempted. Reconcile every seed on
  // startup so a database left partially seeded by an older release is repaired.
  const applyMigrations = db.transaction(() => {
    // Older databases did not enforce a seed identity. Remove only exact
    // identity duplicates before adding the constraint, so recovery is safe.
    db.exec(`
      DELETE FROM events
      WHERE id NOT IN (
        SELECT MIN(id) FROM events GROUP BY dynasty_id, year, short
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_events_seed_identity
      ON events(dynasty_id, year, short);
    `);
    for (const migration of MIGRATIONS) {
      migration.apply(db);
      if (!appliedVersions.has(migration.version)) {
        db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(migration.version);
      }
    }
  });
  applyMigrations();

  const newlyApplied = MIGRATIONS.filter((migration) => !appliedVersions.has(migration.version));
  if (newlyApplied.length > 0) console.log(`[db] 已应用 ${newlyApplied.length} 个数据迁移`);
}

function seedFiles(db, names) {
  const seedDir = join(DATA_DIR, 'seed');
  for (const name of names) {
    const filePath = join(seedDir, name);
    if (!existsSync(filePath)) {
      throw new Error(`缺少 seed 文件: ${filePath}`);
    }
    db.exec(readFileSync(filePath, 'utf8'));
  }
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


/** 供路由层用：执行查询返回全部行（对象数组）。同步返回，路由层 await 亦可。 */
export function all(sql, params = []) {
  const db = getDb();
  return db.prepare(sql).all(...params);
}
