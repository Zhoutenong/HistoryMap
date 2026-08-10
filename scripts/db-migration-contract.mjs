#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
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
  assert.deepEqual(first.migrations, [{ version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }, { version: 5 }], `${label}: markers`);
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

console.log('[contract] PASS database migration upgrade, rollback, and repeat-startup cases');
