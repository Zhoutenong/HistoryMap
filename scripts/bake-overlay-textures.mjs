/**
 * 烘焙历史疆域水彩层贴图（资源贴图优先策略的生成器）。
 *
 * 目标：把「每个时期的疆域水彩层」从运行时程序化绘制（TerritoryOverlay.js
 * OffscreenCanvas）改为预生成的图片资源，双端（Web / Android）共用同一份贴图。
 *
 * 本脚本只做【纯色占位版】：每个政权多边形按 properties.color + fillOpacity
 * 纯色填充 + 同色系描边，不做羽化/斑驳/颗粒（那是美术重做阶段的职责）。
 * 输出 PNG 顶部 = 北、尺寸按 worldBox 宽高比、宽 2048（与 Web 端程序化
 * 纹理上限一致，Android 端 2048 上限相同）。
 *
 * 同时生成：
 *   - fit-geojson.json  全时期包围盒矩形 FeatureCollection——浏览器端用它统一
 *     fitProjection 标定（与脚本渲染贴图用同一投影，保证贴图精确对齐）；
 *   - manifest.json      periodId → 贴图文件映射 + 状态标注（placeholder-rework
 *                          = 占位待美术重做）。
 *
 * 用法：npm run bake:textures [-- --width 2048]
 * 幂等：数据/配色变更后重跑即可；输出目录直接覆盖。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { geoMercator, geoPath } from 'd3-geo';
import { createCanvas } from '@napi-rs/canvas';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const HISTORICAL_DIR = path.join(ROOT, 'server', 'data', 'geo', 'historical');
const OUT_DIR = path.join(ROOT, 'client', 'public', 'textures', 'overlay');

const widthArgIdx = process.argv.indexOf('--width');
const TEX_WIDTH = widthArgIdx >= 0 ? Number(process.argv[widthArgIdx + 1]) : 2048;
const PAD_RATIO = 0.06; // 与 TerritoryOverlay.js buildWatercolorCanvas 的边距一致

const periodsIndex = JSON.parse(fs.readFileSync(path.join(HISTORICAL_DIR, 'periods.json'), 'utf8'));

// 1. 与 server/routes/overlay.js 相同的政权配色兜底逻辑
const entityStyle = {};
(periodsIndex.entities || []).forEach((e) => { entityStyle[e.name] = { color: e.color }; });

/** 构造与 overlay 路由一致的 Feature（entity/color/fillOpacity 兜底）。 */
function normalizeFeature(feat) {
  const props = feat.properties || {};
  const fallback = entityStyle[props.entity] || {};
  return {
    type: feat.type,
    geometry: feat.geometry,
    properties: {
      ...props,
      entity: props.entity || '未知政权',
      color: props.color || fallback.color || '#888888',
      fillOpacity: props.fillOpacity !== undefined ? props.fillOpacity : 0.35,
    },
  };
}

// 2. 时期 → 文件映射；按文件去重（song-1111 / liao-1111 共用 regimes-1100 等）
const periods = periodsIndex.periods || [];
const fileSet = new Map(); // fileBase -> { files: [periodIds], periodLabels: [labels] }
for (const period of periods) {
  for (const file of period.files || []) {
    if (!fileSet.has(file)) {
      fileSet.set(file, { periodIds: [], periodLabels: [] });
    }
    const entry = fileSet.get(file);
    entry.periodIds.push(period.id);
    entry.periodLabels.push(period.label);
  }
}

// 3. 读全部文件 → 标定用的全时期包围盒（矩形即可，fitSize/bounds 只依赖 bbox）
let geoXmin = Infinity, geoXmax = -Infinity, geoYmin = Infinity, geoYmax = -Infinity;
const fileGeojson = new Map();
for (const [file] of fileSet) {
  const raw = JSON.parse(fs.readFileSync(path.join(HISTORICAL_DIR, file), 'utf8'));
  const features = (raw.features || []).map(normalizeFeature);
  features.forEach((feature) => {
    walkCoords(feature.geometry, ([lng, lat]) => {
      if (lng < geoXmin) geoXmin = lng;
      if (lng > geoXmax) geoXmax = lng;
      if (lat < geoYmin) geoYmin = lat;
      if (lat > geoYmax) geoYmax = lat;
    });
  });
  fileGeojson.set(file, { type: 'FeatureCollection', features, properties: raw.properties || {} });
}

if (![geoXmin, geoXmax, geoYmin, geoYmax].every(Number.isFinite) || geoXmax <= geoXmin || geoYmax <= geoYmin) {
  console.error('[bake] 全时期包围盒无效，中止');
  process.exit(1);
}

// 4. 统一投影：与 ChinaMap.js fitProjection + project 完全一致
//    （geoMercator().fitSize([1000,800]) + bounds 中心居中 + y 翻转）
const projection = geoMercator();
const fitGeoJson = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [geoXmin, geoYmin], [geoXmax, geoYmin],
        [geoXmax, geoYmax], [geoXmin, geoYmax], [geoXmin, geoYmin],
      ]],
    },
  }],
};
projection.fitSize([1000, 800], fitGeoJson);
const bounds = geoPath(projection).bounds(fitGeoJson);
const cx = (bounds[0][0] + bounds[1][0]) / 2;
const cy = (bounds[0][1] + bounds[1][1]) / 2;
const project = ([lng, lat]) => {
  const p = projection([lng, lat]);
  return [p[0] - cx, cy - p[1]];
};

// 5. 逐文件生成纯色占位贴图
function walkCoords(geometry, fn) {
  if (!geometry) return;
  if (geometry.type === 'Point') { fn(geometry.coordinates); return; }
  if (geometry.type === 'MultiPoint') { geometry.coordinates.forEach((c) => fn(c)); return; }
  if (geometry.type === 'LineString') { geometry.coordinates.forEach((c) => fn(c)); return; }
  if (geometry.type === 'MultiLineString') { geometry.coordinates.forEach((line) => line.forEach((c) => fn(c))); return; }
  if (geometry.type === 'Polygon') { geometry.coordinates.forEach((ring) => ring.forEach((c) => fn(c))); return; }
  if (geometry.type === 'MultiPolygon') { geometry.coordinates.forEach((poly) => poly.forEach((ring) => ring.forEach((c) => fn(c)))); return; }
}

function parseHex(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return [136, 136, 136];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function darken([r, g, b], k) {
  return [Math.max(0, Math.round(r * k)), Math.max(0, Math.round(g * k)), Math.max(0, Math.round(b * k))];
}

function computeWorldBox(geojson) {
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  geojson.features.forEach((feature) => {
    walkCoords(feature.geometry, (lngLat) => {
      const [x, y] = project(lngLat);
      if (x < xmin) xmin = x;
      if (x > xmax) xmax = x;
      if (y < ymin) ymin = y;
      if (y > ymax) ymax = y;
    });
  });
  if (![xmin, xmax, ymin, ymax].every(Number.isFinite) || xmax <= xmin || ymax <= ymin) return null;
  const padX = (xmax - xmin) * PAD_RATIO || 1;
  const padY = (ymax - ymin) * PAD_RATIO || 1;
  return { xmin: xmin - padX, xmax: xmax + padX, ymin: ymin - padY, ymax: ymax + padY };
}

function normalizePolygons(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

function tracePath(ctx, rings, toPx) {
  ctx.beginPath();
  rings.forEach((ring) => {
    const pts = ring.map((lngLat) => toPx(lngLat));
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  });
}

const manifest = {
  version: 1,
  bakedAt: new Date().toISOString().slice(0, 10),
  status: 'placeholder', // 全部为占位版：待美术重做（见 docs/technical/texture-bake-plan.md）
  width: TEX_WIDTH,
  fitBoxLngLat: [geoXmin, geoYmin, geoXmax, geoYmax],
  byPeriod: {},
  files: {},
};

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

for (const [file, meta] of fileSet) {
  const geojson = fileGeojson.get(file);
  const worldBox = computeWorldBox(geojson);
  if (!worldBox) {
    console.warn(`[bake] ${file}: 无有效几何，跳过`);
    continue;
  }

  const W = TEX_WIDTH;
  const H = Math.max(256, Math.round((W * (worldBox.ymax - worldBox.ymin)) / (worldBox.xmax - worldBox.xmin)));

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const toPx = (lngLat) => {
    const [x, y] = project(lngLat);
    return [
      ((x - worldBox.xmin) / (worldBox.xmax - worldBox.xmin)) * W,
      ((worldBox.ymax - y) / (worldBox.ymax - worldBox.ymin)) * H,
    ];
  };

  for (const feature of geojson.features) {
    const props = feature.properties || {};
    const [r, g, b] = parseHex(props.color);
    const alpha = Math.min(1, Math.max(0.08, Number(props.fillOpacity) || 0.35));

    for (const rings of normalizePolygons(feature.geometry)) {
      // 主体：纯色填充（占位版；美术重做后替换为水彩晕染）
      tracePath(ctx, rings, toPx);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.fill('evenodd');

      // 边界：同色系加深细线，方便对齐验证
      const [dr, dg, db] = darken([r, g, b], 0.7);
      tracePath(ctx, rings, toPx);
      ctx.strokeStyle = `rgba(${dr}, ${dg}, ${db}, ${Math.min(1, alpha + 0.22)})`;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  }

  const png = canvas.toBuffer('image/png');
  const outFile = file.replace(/\.json$/, '.png');
  fs.writeFileSync(path.join(OUT_DIR, outFile), png);

  meta.periodIds.forEach((periodId) => { manifest.byPeriod[periodId] = outFile; });
  manifest.files[outFile] = {
    status: 'placeholder-rework',
    source: file,
    periods: meta.periodIds,
    periodLabels: meta.periodLabels,
    size: [W, H],
    worldBox: worldBox,
    featureCount: geojson.features.length,
    sizeKb: Math.round(png.length / 1024),
  };
  console.log(`[bake] ${outFile}  ${W}×${H}  ${(png.length / 1024).toFixed(0)}KB  ${meta.periodIds.join(', ')}`);
}

// 6. 写标定数据与 manifest
const fitJsonPath = path.join(OUT_DIR, 'fit-geojson.json');
fs.writeFileSync(fitJsonPath, JSON.stringify(fitGeoJson));
console.log(`[bake] fit-geojson.json  ${(fs.statSync(fitJsonPath).size / 1024).toFixed(1)}KB（统一投影标定）`);

const manifestPath = path.join(OUT_DIR, 'manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`[bake] manifest.json  ${(fs.statSync(manifestPath).size / 1024).toFixed(1)}KB`);
console.log(`[bake] 完成：${fileSet.size} 个时期文件 → ${Object.keys(manifest.files).length} 张占位贴图`);