#!/usr/bin/env node
// 一次性工具（A4）：把 server/data/seed/*.sql 的 INSERT OR IGNORE 改写为
// 按 seed 身份的 upsert（A4 落地时执行过一次，已入 git；此后新增 seed 直接写 upsert 形式）。
// 用法：node scripts/convert-seeds-upsert.mjs [--check]（--check 只校验不改写）

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SEED_DIR = join(ROOT, 'server', 'data', 'seed');

const EVENTS_CONFLICT = `
ON CONFLICT(dynasty_id, year, short) DO UPDATE SET
  year_end = excluded.year_end,
  lng = excluded.lng,
  lat = excluded.lat,
  title = excluded.title,
  detail = excluded.detail,
  impact = excluded.impact,
  place = excluded.place,
  category = excluded.category
`;

const DYNASTY_CONFLICT = `
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  start_year = excluded.start_year,
  end_year = excluded.end_year
`;

const checkOnly = process.argv.includes('--check');
let changed = 0;
for (const name of readdirSync(SEED_DIR).filter((n) => n.endsWith('.sql')).sort()) {
  const path = join(SEED_DIR, name);
  let sql = readFileSync(path, 'utf8');
  const before = sql;

  sql = sql.replace(
    /INSERT OR IGNORE INTO dynasties \(([^)]*)\) VALUES (\([^;]*\));/,
    `INSERT INTO dynasties ($1) VALUES $2${DYNASTY_CONFLICT};`,
  );
  // events 语句以最后一个 ); 结束（正文中的 ASCII 括号只出现在坐标与VALUES行尾）
  sql = sql.replace(
    /INSERT OR IGNORE INTO events \(([^)]*)\)/,
    'INSERT INTO events ($1)',
  );
  sql = sql.replace(/\);\s*$/, `)${EVENTS_CONFLICT};\n`);

  if (sql !== before) {
    if (!checkOnly) writeFileSync(path, sql, 'utf8');
    changed += 1;
    console.log(`${checkOnly ? '[check] 需改写' : '已改写'}: ${name}`);
  }
}
console.log(checkOnly ? `校验完成：${changed} 个文件需改写` : `完成：${changed} 个文件已改写为 upsert`);
process.exit(checkOnly && changed > 0 ? 1 : 0);
