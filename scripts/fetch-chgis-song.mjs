#!/usr/bin/env node
/**
 * P2 治所坐标派生：复旦 TGaz（中国历史地理信息系统 CHGIS 的时空地名查询接口）
 *
 * 用《元丰九域志》解析出的每州府「治所县名」查询 TGaz（yr=1080），获取治所坐标。
 * 输出 _generated/song-seats-1080.json（含 CHGIS 派生坐标，gitignore，不入库）。
 *
 * 使用：
 *   node scripts/fetch-chgis-song.mjs
 *
 * 许可：TGaz 为 CHGIS 在线查询接口（复旦/哈佛，非商业学术用途）。派生坐标表
 * 仅本地使用，不随仓库分发（见 docs/data-improvement-plan.md 许可矩阵）。
 *
 * 数据流：
 *   jiuyuzhi-1080.json（古籍解析）→ TGaz 查询 → song-seats-1080.json
 *   + scripts/manual-seats.song.json（TGaz 查不到/多义时的补充坐标，人工标定）
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const JIYUZHI_FILE = path.join(ROOT, 'server', 'data', 'geo', 'song', 'jiuyuzhi-1080.json');
const MANUAL_FILE = path.join(ROOT, 'scripts', 'manual-seats.song.json');
const OUT_DIR = path.join(ROOT, 'server', 'data', 'geo', 'historical', '_generated');
const OUT_FILE = path.join(OUT_DIR, 'song-seats-1080.json');

const TGaz = 'https://tgaz.fudan.edu.cn/tgaz/placename';
const QUERY_YEAR = 1080;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 查询 TGaz：县名 → 候选治所（years 覆盖查询年份的优先） */
async function querySeat(countyName) {
  const url = `${TGaz}?fmt=json&n=${encodeURIComponent(countyName)}&yr=${QUERY_YEAR}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (HistoryMap data pipeline)' } });
  if (!res.ok) throw new Error(`TGaz HTTP ${res.status}`);
  const data = await res.json();
  const places = data.placenames || [];
  return places
    .filter((p) => p['object type'] === 'POINT')
    .map((p) => ({
      name: p.name,
      coord: (p['xy coordinates'] || '').split(',').map(Number),
      years: p.years || '',
      parent: p['parent name'] || '',
    }));
}

async function main() {
  const jiuyuzhi = JSON.parse(fs.readFileSync(JIYUZHI_FILE, 'utf8'));
  const prefectures = jiuyuzhi.prefectures.filter((p) => p.type !== '監' && !/^\(/.test(p.name));
  console.log(`州府数（不含監）: ${prefectures.length}`);

  // 人工标定补充表（TGaz 查不到/多义时的坐标）
  const manual = {};
  if (fs.existsSync(MANUAL_FILE)) {
    const m = JSON.parse(fs.readFileSync(MANUAL_FILE, 'utf8'));
    for (const [k, v] of Object.entries(m)) manual[k] = v;
    console.log(`人工标定表: ${Object.keys(manual).length} 条`);
  }

  const seats = [];
  const unmatched = [];
  let tgazHits = 0;

  for (const p of prefectures) {
    const seat = p.seat;
    if (manual[p.name]) {
      seats.push({ id: `song-${p.name}`, name: p.name, route: p.route, type: p.type, grade: p.grade,
        seat, coord: manual[p.name].coord, confidence: 'medium', source: 'manual-calibration',
        note: manual[p.name].note || '' });
      continue;
    }
    if (!seat) {
      unmatched.push({ name: p.name, reason: `无治所县（原文缺）` });
      continue;
    }
    let hits;
    try {
      hits = await querySeat(seat.replace(/县$/, ''));
    } catch (err) {
      unmatched.push({ name: p.name, seat, reason: `TGaz 查询失败: ${err.message}` });
      await sleep(2000);
      continue;
    }
    // 过滤：years 覆盖 1080 的优先；无年份信息的（如 -223~1264）也接受
    const viable = hits.filter((h) => {
      if (!h.years) return true;
      const m = h.years.match(/(-?\d+)\s*~\s*(-?\d+)/);
      if (!m) return true;
      return Number(m[1]) <= QUERY_YEAR && Number(m[2]) >= QUERY_YEAR;
    });
    // 同名多义消歧：parent 名含州府名 优先，其次 name 本身含州府名
    // （如 TGaz 直接返回「郢州()」「安州()」这类州级记录）
    const parentHits = viable.filter((h) => h.parent && h.parent.includes(p.name));
    const nameHits = viable.filter((h) => h.name && h.name.includes(p.name));
    const chosen = parentHits.length === 1 ? parentHits : nameHits.length === 1 ? nameHits : viable;
    if (chosen.length === 1) {
      const h = chosen[0];
      if (Number.isFinite(h.coord[0]) && Number.isFinite(h.coord[1])) {
        seats.push({ id: `song-${p.name}`, name: p.name, route: p.route, type: p.type, grade: p.grade,
          seat, coord: h.coord, confidence: 'high', source: 'CHGIS-TGaz',
          tgazName: h.name, years: h.years, parent: h.parent });
        tgazHits++;
      } else {
        unmatched.push({ name: p.name, seat, reason: `坐标非法: ${JSON.stringify(h.coord)}` });
      }
    } else if (chosen.length > 1) {
      unmatched.push({ name: p.name, seat, reason: `同名县 ${chosen.length} 个: ${chosen.map((v) => `${v.name}(${v.parent})`).join('、')}` });
    } else {
      unmatched.push({ name: p.name, seat, reason: `TGaz 无结果（yr=${QUERY_YEAR}）` });
    }
    await sleep(350); // TGaz 限流
  }

  console.log(`\nTGaz 命中: ${tgazHits}/${prefectures.length}`);
  console.log(`未匹配: ${unmatched.length}`);
  unmatched.forEach((u) => console.log(`  - ${u.name}（治所 ${u.seat || '?'}）: ${u.reason}`));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = {
    meta: {
      source: 'CHGIS via 复旦 TGaz 时空地名查询接口（非商业学术用途，本地派生，不随仓库分发）',
      year: QUERY_YEAR,
      note: '坐标以元丰九域志治所县名为键查询 TGaz；同名多义/无记录处由 manual-seats.song.json 人工标定补充',
      counts: { total: seats.length, tgaz: tgazHits, manual: seats.length - tgazHits, unmatched: unmatched.length },
    },
    seats,
    unmatched,
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), 'utf8');
  console.log(`\n输出: ${OUT_FILE}`);
  if (unmatched.length) {
    console.log(`\n建议：将未匹配州府坐标补入 ${MANUAL_FILE} 后重跑`);
  }
}

main().catch((err) => {
  console.error('[fetch-chgis-song] 失败:', err);
  process.exit(1);
});
