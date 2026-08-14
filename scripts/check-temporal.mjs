#!/usr/bin/env node
/**
 * T4 时空库校验：时间线一致性 + 覆盖率
 *
 * 检查（读 PG，DATABASE_URL 必填）：
 * 1. 版本区间合法：valid_from <= valid_to（null 视为宋亡 1279）
 * 2. 版本不重叠（同一实体区间互斥）
 * 3. 快照覆盖：year=1080 查询应命中全部九域志州府（290 个）
 * 4. 事件年份合理：960 <= year <= 1279（或 year_approx 标记）
 * 5. 几何覆盖：有 geom 的版本占比
 *
 * 用法：DATABASE_URL=postgres://postgres@localhost:5432/historymap node scripts/check-temporal.mjs
 * 退出码：error 级问题返回 1。
 */
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const JYZ_FILE = path.join(ROOT, 'server', 'data', 'geo', 'song', 'jiuyuzhi-1080.json');

// 手动读 server/.env（dotenv 依赖在 server 侧，根脚本不引入）
function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envFile = path.join(ROOT, 'server', '.env');
  if (fs.existsSync(envFile)) {
    const m = fs.readFileSync(envFile, 'utf8').match(/^DATABASE_URL=(.+)$/m);
    if (m) return m[1].trim();
  }
  return null;
}

const SONG_END = 1279;
const errors = [];
const warnings = [];

function check(cond, message) {
  if (!cond) errors.push(message);
}

async function main() {
  const dbUrl = loadDatabaseUrl();
  if (!dbUrl) {
    console.error('[check-temporal] 需要 DATABASE_URL（server/.env）——先跑 npm run data:classics && data:seats && data:prefectures && build-temporal-db');
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    // —— 1. 版本区间合法 + 2. 不重叠 ——
    const versions = await client.query(`
      SELECT v.place_id, v.valid_from, v.valid_to
      FROM place_versions v ORDER BY v.place_id, v.valid_from`);
    const byPlace = new Map();
    for (const v of versions.rows) {
      const list = byPlace.get(v.place_id) || [];
      list.push(v);
      byPlace.set(v.place_id, list);
      if (v.valid_to !== null && v.valid_to < v.valid_from) {
        check(false, `版本区间非法: ${v.place_id} [${v.valid_from}, ${v.valid_to}]`);
      }
    }
    for (const [placeId, list] of byPlace) {
      for (let i = 0; i < list.length - 1; i++) {
        const a = list[i];
        const b = list[i + 1];
        const aTo = a.valid_to ?? SONG_END;
        if (aTo >= b.valid_from) {
          check(false, `版本重叠: ${placeId} [${a.valid_from}, ${a.valid_to}] 与 [${b.valid_from}, ${b.valid_to}]`);
        }
      }
    }

    // —— 3. 快照覆盖：1080 年全部九域志州府 ——
    const jyz = JSON.parse(fs.readFileSync(JYZ_FILE, 'utf8'));
    const jyzNames = jyz.prefectures.filter((p) => p.type !== '監' && !/^\(/.test(p.name)).map((p) => p.name);
    const at1080 = await client.query(`
      SELECT p.name FROM place_versions v JOIN places p ON p.id = v.place_id
      WHERE v.valid_from <= 1080 AND (v.valid_to IS NULL OR v.valid_to >= 1080)`);
    const at1080Names = new Set(at1080.rows.map((r) => r.name));
    const missing = jyzNames.filter((n) => !at1080Names.has(n));
    check(missing.length === 0, `1080 年缺失九域志州府 ${missing.length} 个: ${missing.join('、')}`);

    // —— 4. 事件年份合理 ——
    const events = await client.query('SELECT year, year_approx FROM place_events');
    const badYear = events.rows.filter((e) => e.year !== null && !e.year_approx && (e.year < 960 || e.year > SONG_END));
    check(badYear.length === 0, `事件年份越界 ${badYear.length} 条（960-1279 之外）: ${badYear.slice(0, 5).map((e) => e.year).join(',')}…`);

    // —— 5. 几何覆盖 ——
    const geo = await client.query('SELECT count(*) FILTER (WHERE geom IS NOT NULL) AS with_geom, count(*) AS total FROM place_versions');

    // —— 汇总 ——
    const counts = await client.query(`SELECT (SELECT count(*) FROM places) AS places, (SELECT count(*) FROM place_versions) AS versions, (SELECT count(*) FROM place_events) AS events`);
    console.log('===== 时空库校验 =====');
    console.log(`实体 ${counts.rows[0].places} | 版本 ${counts.rows[0].versions} | 事件 ${counts.rows[0].events}`);
    console.log(`1080 年命中州府 ${at1080Names.size}/${jyzNames.length}`);
    console.log(`几何覆盖: ${geo.rows[0].with_geom}/${geo.rows[0].total} (${((geo.rows[0].with_geom / geo.rows[0].total) * 100).toFixed(1)}%)`);
    console.log(`多版本实体: ${[...byPlace.values()].filter((l) => l.length > 1).length}`);

    if (warnings.length) {
      console.log('\n[warning]');
      warnings.forEach((w) => console.log('  - ' + w));
    }
    if (errors.length) {
      console.log('\n[error]');
      errors.slice(0, 15).forEach((e) => console.log('  - ' + e));
      if (errors.length > 15) console.log(`  …共 ${errors.length} 条`);
      console.log('\n校验未通过（exit 1）');
      process.exit(1);
    }
    console.log('\n校验全部通过');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[check-temporal] 失败:', err.message);
  process.exit(1);
});
