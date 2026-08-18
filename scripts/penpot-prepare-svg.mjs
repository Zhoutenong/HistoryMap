/**
 * 生成 Penpot 制作水彩贴图用的简化 SVG（每时期一个文件）。
 *
 * 与 bake-overlay-textures.mjs 共用同一投影（fit-geojson.json 标定的
 * geoMercator fitSize([1000,800]) + 居中 + y 翻转），worldBox 同样带 6% 边距，
 * 画布 1000×800 内按宽高比 fit 居中 —— 保证 Penpot 里制作的结果
 * 与现有占位贴图 / 运行时 worldBox 完全对齐。
 *
 * 输出：artifacts/penpot/<period-file>.svg（含每个政权的 <path>，
 * data-entity 标注政权名，fill/fill-opacity 用政权配色 —— Penpot 导入后可再改样式）。
 *
 * 用法：node scripts/penpot-prepare-svg.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { geoMercator, geoPath } from 'd3-geo';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const HISTORICAL_DIR = path.join(ROOT, 'server', 'data', 'geo', 'historical');
const OVERLAY_DIR = path.join(ROOT, 'client', 'public', 'textures', 'overlay');
const OUT_DIR = path.join(ROOT, 'artifacts', 'penpot');

const PAD_RATIO = 0.06;
const CANVAS_W = 1000;
const CANVAS_H = 800;
const SIMPLIFY_PX = 0.6; // 抽稀阈值（画布像素）：2048 宽贴图下约 1.2px 精度

const periodsIndex = JSON.parse(fs.readFileSync(path.join(HISTORICAL_DIR, 'periods.json'), 'utf8'));
const fitGeoJson = JSON.parse(fs.readFileSync(path.join(OVERLAY_DIR, 'fit-geojson.json'), 'utf8'));

const entityStyle = {};
(periodsIndex.entities || []).forEach((e) => { entityStyle[e.name] = { color: e.color }; });

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

const projection = geoMercator();
projection.fitSize([CANVAS_W, CANVAS_H], fitGeoJson);
const bounds = geoPath(projection).bounds(fitGeoJson);
const cx = (bounds[0][0] + bounds[1][0]) / 2;
const cy = (bounds[0][1] + bounds[1][1]) / 2;
const project = ([lng, lat]) => {
  const p = projection([lng, lat]);
  return [p[0] - cx, cy - p[1]];
};

function walkCoords(geometry, fn) {
  if (!geometry) return;
  if (geometry.type === 'Point') { fn(geometry.coordinates); return; }
  if (geometry.type === 'MultiPoint') { geometry.coordinates.forEach((c) => fn(c)); return; }
  if (geometry.type === 'LineString') { geometry.coordinates.forEach((c) => fn(c)); return; }
  if (geometry.type === 'MultiLineString') { geometry.coordinates.forEach((line) => line.forEach((c) => fn(c))); return; }
  if (geometry.type === 'Polygon') { geometry.coordinates.forEach((ring) => ring.forEach((c) => fn(c))); return; }
  if (geometry.type === 'MultiPolygon') { geometry.coordinates.forEach((poly) => poly.forEach((ring) => ring.forEach((c) => fn(c)))); return; }
}

const periods = periodsIndex.periods || [];
const fileSet = new Set();
for (const period of periods) for (const file of period.files || []) fileSet.add(file);

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

/** 简单距离抽稀：相邻保留点间距 >= threshold 才保留（保留首尾点）；在投影空间判断距离。 */
function simplifyRing(ring, threshold) {
  if (ring.length < 4) return ring;
  const out = [ring[0]];
  for (let i = 1; i < ring.length - 1; i++) {
    const [px, py] = project(out[out.length - 1]);
    const [x, y] = project(ring[i]);
    if ((x - px) ** 2 + (y - py) ** 2 >= threshold * threshold) out.push(ring[i]);
  }
  out.push(ring[ring.length - 1]);
  return out;
}

function ringToPathD(ring) {
  let d = '';
  ring.forEach(([x, y], i) => { d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`; });
  return d + 'Z';
}

function toSvgXY(worldBox, [x, y]) {
  const bw = worldBox.xmax - worldBox.xmin;
  const bh = worldBox.ymax - worldBox.ymin;
  const scale = Math.min(CANVAS_W / bw, CANVAS_H / bh);
  const ox = (CANVAS_W - bw * scale) / 2;
  const oy = (CANVAS_H - bh * scale) / 2;
  return [ox + (x - worldBox.xmin) * scale, oy + (worldBox.ymax - y) * scale];
}

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

let total = 0;
for (const file of [...fileSet].sort()) {
  const raw = JSON.parse(fs.readFileSync(path.join(HISTORICAL_DIR, file), 'utf8'));
  const geojson = { type: 'FeatureCollection', features: (raw.features || []).map(normalizeFeature) };
  const worldBox = computeWorldBox(geojson);
  if (!worldBox) { console.warn(`[penpot] ${file}: 无有效几何，跳过`); continue; }

  const toPx = (lngLat) => toSvgXY(worldBox, project(lngLat));
  let paths = '';
  for (const feature of geojson.features) {
    const props = feature.properties || {};
    const entity = props.entity || '未知政权';
    const fill = props.color || '#888888';
    const opacity = Math.min(1, Math.max(0.08, Number(props.fillOpacity) || 0.35));
    for (const rings of normalizePolygons(feature.geometry)) {
      const d = rings.map((ring) => ringToPathD(simplifyRing(ring, SIMPLIFY_PX).map(toPx))).join('');
      if (!d) continue;
      paths += `\n  <path d="${d}" fill="${fill}" fill-opacity="${opacity}" stroke="${fill}" stroke-opacity="0.5" stroke-width="1" data-entity="${entity}" />`;
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" width="${CANVAS_W}" height="${CANVAS_H}">${paths}\n</svg>\n`;
  const outFile = path.join(OUT_DIR, file.replace(/\.json$/, '.svg'));
  fs.writeFileSync(outFile, svg);
  total++;
  console.log(`[penpot] ${path.basename(outFile)}  ${(svg.length / 1024).toFixed(0)}KB  ${geojson.features.length} features`);
}
console.log(`[penpot] 完成：${total} 个 SVG（画布 ${CANVAS_W}×${CANVAS_H}，抽稀 ${SIMPLIFY_PX}px）`);