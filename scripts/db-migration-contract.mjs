#!/usr/bin/env node
// 数据库迁移契约测试（A4 后覆盖）：
//   - 空库 / 部分库 / marker 缺失等启动路径：全部 seed 就位且二次启动幂等；
//   - 失败迁移整体回滚；
//   - seed 修订（upsert）对既有库生效：改一行 detail 重启后 API 侧可查到新值，
//     且不被旧值挡住（自愈覆盖「偏」而不止「缺」）。

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeDatabase } from '../server/db.js';

const require = createRequire(new URL('../server/db.js', import.meta.url));
const Database = require('better-sqlite3');

const schema = `
  CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE dynasties (id TEXT PRIMARY KEY, name TEXT NOT NULL, start_year INTEGER NOT NULL, end_year INTEGER NOT NULL);
  CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, dynasty_id TEXT NOT NULL, year INTEGER NOT NULL,
    year_end INTEGER NOT NULL, lng REAL NOT NULL, lat REAL NOT NULL, short TEXT NOT NULL,
    title TEXT NOT NULL, detail TEXT NOT NULL, impact TEXT NOT NULL DEFAULT '',
    place TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT 'era'
  );
`;

function createLegacyDb(seed = []) {
  const db = new Database(':memory:');
  db.exec(schema);
  for (const statement of seed) db.exec(statement);
  return db;
}

function snapshot(db) {
  return {
    dynasties: db.prepare('SELECT id FROM dynasties ORDER BY id').all(),
    events: db.prepare('SELECT dynasty_id, year, short FROM events ORDER BY dynasty_id, year, short').all(),
    migrations: db.prepare('SELECT version FROM schema_migrations ORDER BY version').all(),
  };
}

function assertCompleteAndIdempotent(db, label) {
  initializeDatabase(db);
  const first = snapshot(db);
  assert.deepEqual(first.migrations, [{ version: 0 }, { version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }, { version: 5 }, { version: 6 }, { version: 7 }, { version: 8 }, { version: 9 }, { version: 10 }], `${label}: markers`);
  assert.deepEqual(first.dynasties, [{ id: 'jin' }, { id: 'liao' }, { id: 'song' }, { id: 'tang' }, { id: 'yuan' }], `${label}: dynasties`);
  assert.ok(first.events.filter((event) => event.dynasty_id === 'song').length > 0, `${label}: Song events`);
  assert.ok(first.events.filter((event) => event.dynasty_id === 'jin').length > 0, `${label}: Jin events`);
  assert.ok(first.events.filter((event) => event.dynasty_id === 'liao').length > 0, `${label}: Liao events`);
  assert.ok(first.events.filter((event) => event.dynasty_id === 'yuan').length > 0, `${label}: Yuan events`);
  assert.ok(first.events.filter((event) => event.dynasty_id === 'tang').length > 0, `${label}: Tang events`);
  initializeDatabase(db);
  assert.deepEqual(snapshot(db), first, `${label}: second startup changed data`);
  db.close();
}

assertCompleteAndIdempotent(createLegacyDb(), 'empty legacy schema');
assertCompleteAndIdempotent(createLegacyDb([
  "INSERT INTO dynasties VALUES ('song', '宋朝', 960, 1279)",
  "INSERT INTO events (dynasty_id, year, year_end, lng, lat, short, title, detail) VALUES ('song', 960, 975, 114.35, 34.52, '陈桥兵变', '陈桥兵变', 'existing')",
]), 'complete/partial Song with empty markers');
assertCompleteAndIdempotent(createLegacyDb([
  "INSERT INTO schema_migrations (version) VALUES (1)",
  "INSERT INTO schema_migrations (version) VALUES (2)",
  "INSERT INTO dynasties VALUES ('song', '宋朝', 960, 1279)",
]), 'markers present but data missing');
assertCompleteAndIdempotent(createLegacyDb([
  "INSERT INTO schema_migrations (version) VALUES (1)",
]), 'partial markers');

const rollbackDb = createLegacyDb();
rollbackDb.exec(`
  CREATE TRIGGER reject_jin_seed BEFORE INSERT ON dynasties
  WHEN NEW.id = 'jin'
  BEGIN SELECT RAISE(ABORT, 'contract failure'); END;
`);
assert.throws(() => initializeDatabase(rollbackDb), /contract failure/);
assert.deepEqual(snapshot(rollbackDb), { dynasties: [], events: [], migrations: [] }, 'failed migration must roll back');
rollbackDb.close();

// ---- A4：seed 修订（upsert）对既有库生效 ----
// 流程：先用正式 seed 目录建库 → 复制一份 seed 目录并修订「陈桥兵变」detail →
// 用修订目录再次启动（等价于改 seed 文件后重启）→ 断言行被更新；
// 再用原目录第三次启动 → 断言值被「修回」，证明 seed 文件是事实来源。
{
  const seedDir = new URL('../server/data/seed/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const db = createLegacyDb();
  initializeDatabase(db);
  const readDetail = () => db.prepare(
    "SELECT detail FROM events WHERE dynasty_id='song' AND year=960 AND short='陈桥兵变'",
  ).get()?.detail;

  const original = readDetail();
  assert.ok(original && original.length > 0, 'A4: 基线 seed 已写入陈桥兵变');

  const revisedDir = mkdtempSync(join(tmpdir(), 'hm-seed-'));
  try {
    cpSync(seedDir, revisedDir, { recursive: true });
    const seedPath = join(revisedDir, '01-song-events.sql');
    const revised = readFileSync(seedPath, 'utf8').replace(
      '后周大将赵匡胤在陈桥驿被部下黄袍加身',
      '【修订】后周大将赵匡胤在陈桥驿被部下黄袍加身',
    );
    assert.notEqual(revised, readFileSync(seedPath, 'utf8'), 'A4: 修订内容确实改变了 seed');
    writeFileSync(seedPath, revised, 'utf8');

    initializeDatabase(db, { seedDir: revisedDir });
    assert.ok(readDetail().startsWith('【修订】'), 'A4: 既有库重启后 seed 修订生效（upsert 覆盖「偏」）');

    initializeDatabase(db); // 恢复正式 seed 目录启动：值随事实来源回滚
    assert.equal(readDetail(), original, 'A4: seed 目录回退后值复原（seed 即事实来源）');
  } finally {
    rmSync(revisedDir, { recursive: true, force: true });
  }
  db.close();
}

console.log('[contract] PASS database migration upgrade, rollback, repeat-startup, and seed-revision cases');
