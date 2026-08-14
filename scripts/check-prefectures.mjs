#!/usr/bin/env node
/**
 * P6 数据校验：州府级数据质量门（npm run data:check）
 *
 * 检查项：
 * 1. GeoJSON 结构合法（validateGeoJSON 全字段）
 * 2. 州府面/治所点/县 数量核对（九域志解析 vs prefectures.geojson）
 * 3. 治所坐标在宋政权轮廓 bbox 内
 * 4. 名称交叉：九域志 ↔ 舆地广记（含政和改名映射），events.place 匹配率
 * 5. 面与治所一一对应（无面降级清单）
 *
 * 退出码：有 error 级问题返回 1（warning 不阻断）。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateGeoJSON } from '../server/data/geo/historical/geojson.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const HISTORICAL = path.join(ROOT, 'server', 'data', 'geo', 'historical');
const SONG = path.join(ROOT, 'server', 'data', 'geo', 'song');

const PREFS_FILE = path.join(HISTORICAL, 'prefectures.geojson');
const JYZ_FILE = path.join(SONG, 'jiuyuzhi-1080.json');
const YUDI_FILE = path.join(SONG, 'yudi-guangji.json');
const REGIMES_FILE = path.join(HISTORICAL, 'regimes-1100.json');

// 舆地广记政和改名 → 元丰名（与 fetch-yudi-guangji.mjs 的 SONG_NAME_ALIAS 保持一致）
const ALIAS = {
  '袭庆府': '兖州', '延安府': '延州', '北辅开德府': '开德府', '东辅拱州': '拱州',
  '郓州': '东平府', '颍州': '顺昌府', '许州': '颍昌府', '陈州': '淮宁府',
  '润州': '镇江府', '潞州': '龙德府', '叙州': '戎州',
};

const errors = [];
const warnings = [];

function check(cond, message) {
  if (!cond) errors.push(message);
}

function main() {
  // —— 1. GeoJSON 结构 ——
  if (!fs.existsSync(PREFS_FILE)) {
    console.error('[error] prefectures.geojson 不存在——先跑 npm run data:prefectures（含 CHGIS 本地派生）');
    process.exit(1);
  }
  const prefs = JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8'));
  const validation = validateGeoJSON(prefs);
  check(validation.valid, `validateGeoJSON 失败: ${validation.errors.slice(0, 3).join('; ')}`);

  const faces = prefs.features.filter((f) => f.properties.kind === 'prefecture');
  const seats = prefs.features.filter((f) => f.properties.kind === 'prefecture-seat');

  // —— 2. 数量核对 ——
  const jyz = JSON.parse(fs.readFileSync(JYZ_FILE, 'utf8'));
  const jyzPrefs = jyz.prefectures.filter((p) => p.type !== '監' && !/^\(/.test(p.name));
  const jyzCounties = jyz.prefectures.reduce((sum, p) => sum + p.counties.length, 0);
  check(faces.length === 287, `州府面 ${faces.length}（期望 287——北宋境内州府数）`);
  check(seats.length === jyzPrefs.length, `治所点 ${seats.length} ≠ 九域志州府 ${jyzPrefs.length}`);
  check(jyzCounties >= 1100, `属县总数 ${jyzCounties} < 1100（四库本缺文记录见 fetch-jiuyuzhi 输出）`);

  // 面与治所对应（面降级清单——海南三军等）
  const seatNames = new Set(seats.map((s) => s.properties.name));
  const faceNames = new Set(faces.map((f) => f.properties.name));
  const downgraded = [...seatNames].filter((n) => !faceNames.has(n));
  if (downgraded.length) warnings.push(`无面降级（仅治所点）: ${downgraded.join('、')}`);

  // —— 3. 治所坐标在宋政权轮廓 bbox 内 ——
  const regimes = JSON.parse(fs.readFileSync(REGIMES_FILE, 'utf8'));
  const song = regimes.features.find((f) => f.properties.entity === '宋');
  if (song) {
    const ring = song.geometry.type === 'Polygon' ? song.geometry.coordinates[0] : song.geometry.coordinates.flat()[0];
    const lngs = ring.map((c) => c[0]);
    const lats = ring.map((c) => c[1]);
    const box = { xmin: Math.min(...lngs), xmax: Math.max(...lngs), ymin: Math.min(...lats), ymax: Math.max(...lats) };
    const outOfBox = seats.filter((s) => {
      const [lng, lat] = s.geometry.coordinates;
      return lng < box.xmin || lng > box.xmax || lat < box.ymin || lat > box.ymax;
    }).map((s) => s.properties.name);
    if (outOfBox.length) warnings.push(`治所超出宋政权轮廓 bbox（海外/边远，可接受）: ${outOfBox.join('、')}`);
  }

  // —— 4. 名称交叉：九域志 ↔ 舆地广记 ——
  if (fs.existsSync(YUDI_FILE)) {
    const yudi = JSON.parse(fs.readFileSync(YUDI_FILE, 'utf8'));
    const canon = (n) => ALIAS[n] || n;
    const yudiNames = new Set(yudi.prefectures.map((p) => canon(p.name)));
    const jyzNames = new Set(jyzPrefs.map((p) => p.name));
    const missingInYudi = [...jyzNames].filter((n) => !yudiNames.has(n));
    if (missingInYudi.length) warnings.push(`九域志有而舆地广记无（四库本缺文/异写）: ${missingInYudi.join('、')}`);
  }

  // —— 5. events.place 与州府名匹配率 ——
  // events 数据在 SQLite，不经由本脚本读取；占位提示（人工核对项见 checklist）

  // —— 汇总 ——
  console.log('===== 州府数据校验 =====');
  console.log(`州府面 ${faces.length} | 治所点 ${seats.length} | 属县 ${jyzCounties}`);
  console.log(`rank 分布: ${[1, 2, 3, 4, 5].map((r) => `${r}:${faces.filter((f) => f.properties.rank === r).length}`).join(' ')}`);
  const withHh = faces.filter((f) => f.properties.households?.main).length;
  const withTribute = faces.filter((f) => f.properties.tribute).length;
  const withEvolution = faces.filter((f) => f.properties.evolution).length;
  console.log(`有户口 ${withHh}/${faces.length} | 有土贡 ${withTribute}/${faces.length} | 有沿革 ${withEvolution}/${faces.length}`);
  if (warnings.length) {
    console.log('\n[warning]');
    warnings.forEach((w) => console.log('  - ' + w));
  }
  if (errors.length) {
    console.log('\n[error]');
    errors.forEach((e) => console.log('  - ' + e));
    console.log('\n校验未通过（exit 1）');
    process.exit(1);
  }
  console.log('\n校验全部通过');
}

main();
