#!/usr/bin/env node
/**
 * P3 州府边界生成（Voronoi 近似面 + 政权轮廓裁剪）
 *
 * 输入：
 *   _generated/song-seats-1080.json      州府治所坐标（P2，CHGIS 派生 + 人工标定）
 *   server/data/geo/song/jiuyuzhi-1080.json  户口/土贡/属县/路（P1）
 *   server/data/geo/song/yudi-guangji.json   沿革摘要（P1）
 *   server/data/geo/historical/regimes-1100.json 宋政权轮廓（GPL-3.0，既有）
 *
 * 输出：
 *   server/data/geo/historical/prefectures.geojson  州府面 + 治所点 + 县治点
 *   _generated/correction-checklist.md              人工校正清单
 *
 * 方法：
 *   1. geoMercator fitSize([1000,800]) 投影（与 Web 版 project() 同款标定）
 *   2. d3-delaunay 在投影平面生成 Voronoi 单元
 *   3. polygon-clipping 将单元与宋政权轮廓求交裁剪（剔除非宋领土）
 *   4. 反投影回经纬度，写 GeoJSON
 *
 * 精度说明：Voronoi 近似面仅作视觉示意（confidence=low/medium），
 * 治所坐标为真实位置；重点州府人工校正见 _generated/correction-checklist.md。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { geoMercator } from 'd3-geo';
import { Delaunay } from 'd3-delaunay';
import polygonClipping from 'polygon-clipping';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const HISTORICAL_DIR = path.join(ROOT, 'server', 'data', 'geo', 'historical');
const GENERATED_DIR = path.join(HISTORICAL_DIR, '_generated');
const SONG_DIR = path.join(ROOT, 'server', 'data', 'geo', 'song');

const SEATS_FILE = path.join(GENERATED_DIR, 'song-seats-1080.json');
const JIYUZHI_FILE = path.join(SONG_DIR, 'jiuyuzhi-1080.json');
const YUDI_FILE = path.join(SONG_DIR, 'yudi-guangji.json');
const REGIMES_FILE = path.join(HISTORICAL_DIR, 'regimes-1100.json');
const OUT_FILE = path.join(HISTORICAL_DIR, 'prefectures.geojson');
const CHECKLIST_FILE = path.join(GENERATED_DIR, 'correction-checklist.md');

const FIT = [1000, 800];

/** 与 Web 版 project() 同款投影（d3-geo geoMercator + fitSize，y 翻转由前端处理） */
function makeProjection() {
  const projection = geoMercator();
  // 用宋政权 + 治所点标定（与 main.js fitProjection 用 overlay 标定一致）
  const seats = JSON.parse(fs.readFileSync(SEATS_FILE, 'utf8')).seats;
  const geojson = { type: 'FeatureCollection', features: seats.map((s) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: s.coord } })) };
  projection.fitSize(FIT, geojson);
  return projection;
}

/** 从 regimes-1100.json 取宋政权多边形（entity=宋） */
function loadSongRegime() {
  const regimes = JSON.parse(fs.readFileSync(REGIMES_FILE, 'utf8'));
  const song = regimes.features.find((f) => (f.properties.entity || '') === '宋');
  if (!song) throw new Error('regimes-1100.json 中未找到 entity=宋 的政权');
  return song.geometry;
}

/** GeoJSON geometry → polygon-clipping 输入格式（[ring, ring, ...]，[lng,lat]） */
function toClippingPolygons(geometry) {
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  throw new Error(`不支持的 geometry: ${geometry.type}`);
}

function main() {
  const seatsData = JSON.parse(fs.readFileSync(SEATS_FILE, 'utf8'));
  const seats = seatsData.seats;
  const jiuyuzhi = JSON.parse(fs.readFileSync(JIYUZHI_FILE, 'utf8'));
  const yudi = JSON.parse(fs.readFileSync(YUDI_FILE, 'utf8'));

  const songGeometry = loadSongRegime();
  const projection = makeProjection();

  // 投影平面上的治所点
  const points = seats.map((s) => projection(s.coord));
  const delaunay = Delaunay.from(points);
  const voronoi = delaunay.voronoi([-100, -100, 1100, 900]);

  // 属性索引
  const jyzByName = new Map(jiuyuzhi.prefectures.map((p) => [p.name, p]));
  const yudiByName = new Map(yudi.prefectures.map((p) => [p.name, p]));

  const features = [];
  const unchecked = [];
  let clippedCount = 0;

  /** 治所点 feature（面缺失时 rank 为 null） */
  function outputSeatPoint(seat, rank) {
    const jyz = jyzByName.get(seat.name) || {};
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: seat.coord },
      properties: {
        id: `song-${seat.name}-seat`,
        name: seat.name,
        kind: 'prefecture-seat',
        rank: rank ?? 5,
        style: 'point',
        source: seat.source,
        license: 'see prefecture feature',
        confidence: seat.confidence,
        note: '治所（CHGIS/人工标定）',
        route: seat.route || jyz.route || null,
        type: seat.type || jyz.type || '州',
        grade: jyz.grade || null,
        periods: ['song-1111'],
      },
    });
  }

  for (let i = 0; i < seats.length; i++) {
    const seat = seats[i];
    const cell = voronoi.cellPolygon(i);
    if (!cell) continue;
    const cellRings = [cell.map(([x, y]) => projection.invert([x, y]))];

    // 与宋政权轮廓求交（含孔洞；非宋领土的单元部分被裁掉）
    let result = null;
    try {
      result = polygonClipping.intersection([cellRings], toClippingPolygons(songGeometry));
    } catch (err) {
      console.warn(`[intersection] ${seat.name}: ${err.message}`);
    }
    if (!result || result.length === 0) {
      // 无交集（如海南三军：宋政权轮廓不含海南岛）：跳过面，保留治所点
      unchecked.push({ name: seat.name, reason: '单元与宋政权轮廓无交集（治所在境外？），仅保留治所点' });
      outputSeatPoint(seat, null);
      continue;
    }
    clippedCount++;

    // 简化：保留交点（polygon-clipping 输出已足够细）
    const geometry = result.length === 1 && result[0].length === 1
      ? { type: 'Polygon', coordinates: result[0] }
      : { type: 'MultiPolygon', coordinates: result };

    const jyz = jyzByName.get(seat.name) || {};
    const yudiEntry = yudiByName.get(seat.name);
    const households = jyz.households || {};
    const population = (households.main || 0) + (households.guest || 0);

    // rank：1 京府 / 2 次府 / 3 户口≥5万 / 4 ≥1万 / 5 其他
    let rank = 5;
    if (jyz.grade && /東京|西京|南京|北京/.test(jyz.grade)) rank = 1;
    else if (jyz.grade && /次府/.test(jyz.grade)) rank = 2;
    else if (population >= 50000) rank = 3;
    else if (population >= 10000) rank = 4;

    features.push({
      type: 'Feature',
      geometry,
      properties: {
        id: `song-${seat.name}`,
        name: seat.name,
        kind: 'prefecture',
        rank,
        style: 'stroke-only',
        source: seat.source === 'manual-calibration' ? '元丰九域志+人工标定' : '元丰九域志+CHGIS(本地)',
        license: seat.source === 'manual-calibration' ? 'manual-calibration' : 'CHGIS 非商业学术（本地派生，不分发）',
        confidence: seat.confidence === 'high' ? 'medium' : 'low', // 治所精确，边界为 Voronoi 近似
        note: 'Voronoi 近似边界（以治所为种子），非精确历史政区界线',
        route: seat.route || jyz.route || null,
        type: seat.type || jyz.type || '州',
        grade: jyz.grade || null,
        households: households.main ? { main: households.main, guest: households.guest || 0 } : null,
        tribute: jyz.tribute || null,
        seat: seat.seat || null,
        seatCoord: seat.coord,
        countyCount: jyz.countyCount ?? null,
        counties: (jyz.counties || []).map((c) => c.name),
        evolution: yudiEntry ? yudiEntry.evolution : null,
        sourceFix: jyz.sourceFix || null,
        periods: ['song-1111'],
      },
    });

    outputSeatPoint(seat, rank);
  }

  // 县治点（九域志属县 → 现代县治近似坐标由 P9 扩展期补齐；本期县名随州府面属性输出）
  console.log(`州府面: ${features.length / 2}（含治所点 ${features.length / 2}）`);
  console.log(`成功裁剪: ${clippedCount} / ${seats.length}`);

  const out = {
    type: 'FeatureCollection',
    features,
    properties: {
      note: '元丰九域志（1080）州府级数据：Voronoi 近似边界 + CHGIS/人工治所坐标。数据含 CHGIS 派生坐标，不入 git（见 docs/architecture/data-improvement-plan.md）。',
      year: 1080,
    },
  };
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), 'utf8');
  console.log(`输出: ${OUT_FILE}`);

  // 人工校正清单
  const checklist = [
    '# 州府边界人工校正清单\n',
    `> 生成时间：${new Date().toISOString().slice(0, 10)}\n`,
    '## 校正方法',
    '1. 对照中研院 CCTS 北宋 1111 瓦片（gis.sinica.edu.tw/showwmts/index.php?s=ccts&l=ad1111）与谭图第六册（archive.org/details/20250621_20250621_0102）',
    '2. 治所坐标偏差 >0.3° 的修正 `scripts/manual-seats.song.json` 后重跑 `npm run data:seats && npm run data:prefectures`',
    '3. 边界形状（Voronoi 与真实州界差异明显处）可手工编辑 `server/data/geo/historical/prefectures.geojson` 的对应 polygon，并把该 feature 的 `confidence` 改为 `medium`\n',
    '## 重点核对（四京/次府/路治）\n',
  ];
  const major = features
    .filter((f) => f.properties.kind === 'prefecture' && f.properties.rank <= 2)
    .map((f) => `- [ ] ${f.properties.name}（${f.properties.route}）治所 [${f.properties.seatCoord.join(', ')}]`);
  checklist.push(...major);
  checklist.push('\n## 无交集/异常\n');
  if (unchecked.length) unchecked.forEach((u) => checklist.push(`- ${u.name}: ${u.reason}`));
  else checklist.push('- 无');
  fs.writeFileSync(CHECKLIST_FILE, checklist.join('\n'), 'utf8');
  console.log(`人工校正清单: ${CHECKLIST_FILE}`);
}

main();
