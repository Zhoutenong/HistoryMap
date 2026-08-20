/**
 * 用 Penpot 样式渲染水彩疆域贴图（美术重做管线）。
 *
 * 分工（见 docs/technical/texture-bake-plan.md）：
 *   - Penpot：制作贴图设计稿（每政权三层：bloom 晕染 / body 主体 / edge 描边），
 *     fill/blur/透明度 可视可调（penpot-prepare-svg.mjs 提供几何 SVG）；
 *   - 本脚本：读取 geojson 几何（与 bake 同投影同 worldBox）+ artifacts/penpot/styles.json
 *     （Penpot 提取的样式参数），按 Web 端 WatercolorBuilder 的水彩管线本地渲染：
 *     羽化晕染 + 主体 + 斑驳（确定性随机）+ 边界 + 干边，输出 2048 宽透明 PNG。
 *
 * 用法：node scripts/penpot-render-textures.mjs [--styles artifacts/penpot/styles.json]
 * 样式文件缺省时按 Web 端默认 token 渲染（等价 WatercolorBuilder）。
 * 幂等：可重跑，输出直接覆盖 client/public/textures/overlay/*.png。
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
const STYLE_PATH = process.argv.indexOf('--styles') >= 0
  ? path.resolve(ROOT, process.argv[process.argv.indexOf('--styles') + 1])
  : null;

const TEX_WIDTH = 2048;
const PAD_RATIO = 0.06;

const periodsIndex = JSON.parse(fs.readFileSync(path.join(HISTORICAL_DIR, 'periods.json'), 'utf8'));
const fitGeoJson = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'fit-geojson.json'), 'utf8'));

// Penpot 样式：entity -> { bloom: {opacity, blur}, body: {opacity, blur}, edge: {fillOpacity, stroke, strokeOpacity, strokeWidth} }
const penpotStyles = {};
if (STYLE_PATH && fs.existsSync(STYLE_PATH)) {
  const rows = JSON.parse(fs.readFileSync(STYLE_PATH, 'utf8'));
  for (const r of rows) {
    if (!r.entity) continue;
    if (!penpotStyles[r.entity]) penpotStyles[r.entity] = {};
    const target = r.layer === 'bloom' ? 'bloom' : r.layer === 'body' ? 'body' : 'edge';
    penpotStyles[r.entity][target] = {
      fill: r.fill,
      opacity: r.fillOpacity,
      blur: r.blur,
      stroke: r.stroke,
      strokeOpacity: r.strokeOpacity,
      strokeWidth: r.strokeWidth,
    };
  }
  console.log(`[penpot-render] 样式覆盖：${Object.keys(penpotStyles).length} 个政权（${path.basename(STYLE_PATH)}）`);
} else {
  console.log('[penpot-render] 无样式覆盖，用 Web 端默认 token');
}

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

const periods = periodsIndex.periods || [];
const fileSet = new Map();
for (const period of periods) {
  for (const file of period.files || []) {
    if (!fileSet.has(file)) fileSet.set(file, { periodIds: [], periodLabels: [] });
    const entry = fileSet.get(file);
    entry.periodIds.push(period.id);
    entry.periodLabels.push(period.label);
  }
}

const projection = geoMercator();
projection.fitSize([1000, 800], fitGeoJson);
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

function parseHex(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return [136, 136, 136];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function darken([r, g, b], k) {
  return [Math.max(0, Math.round(r * k)), Math.max(0, Math.round(g * k)), Math.max(0, Math.round(b * k))];
}

function rgba([r, g, b], a) {
  return `rgba(${r}, ${g}, ${b}, ${a})`;
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

// 确定性随机（同 seed 重跑结果一致）
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const manifest = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'manifest.json'), 'utf8'));

for (const [file, meta] of fileSet) {
  const raw = JSON.parse(fs.readFileSync(path.join(HISTORICAL_DIR, file), 'utf8'));
  const geojson = { type: 'FeatureCollection', features: (raw.features || []).map(normalizeFeature) };
  const worldBox = computeWorldBox(geojson);
  if (!worldBox) { console.warn(`[penpot-render] ${file}: 无有效几何，跳过`); continue; }

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
    const entity = props.entity || '未知政权';
    const style = penpotStyles[entity] || {};
    const base = parseHex(props.color);
    const opacity = Math.min(1, Math.max(0.08, Number(props.fillOpacity) || 0.35));

    for (const rings of normalizePolygons(feature.geometry)) {
      // 1. bloom 羽化晕染（大模糊、高透明，alpha 与 fillOpacity 联动）
      const bloomOpacity = (style.bloom && style.bloom.opacity != null) ? style.bloom.opacity : Math.min(1, opacity * 0.9);
      const bloomBlur = (style.bloom && style.bloom.blur != null) ? style.bloom.blur : 24;
      ctx.save();
      ctx.filter = `blur(${bloomBlur}px)`;
      tracePath(ctx, rings, toPx);
      ctx.fillStyle = rgba(base, Math.min(1, Math.max(0.02, bloomOpacity)));
      ctx.fill('evenodd');
      ctx.restore();

      // 2. body 主体色层（轻微模糊，alpha 与 fillOpacity 联动，让宣纸透出）
      const bodyOpacity = (style.body && style.body.opacity != null) ? style.body.opacity : opacity;
      const bodyBlur = (style.body && style.body.blur != null) ? style.body.blur : 6;
      ctx.save();
      ctx.filter = `blur(${bodyBlur}px)`;
      tracePath(ctx, rings, toPx);
      ctx.fillStyle = rgba(base, bodyOpacity);
      ctx.fill('evenodd');
      ctx.restore();

      // 3. 水彩斑驳（clip 路径内撒低透明径向色斑，确定性随机）
      const mottle = Math.max(30, Math.round(rings.length * 20));
      const rng = mulberry32(rings.length * 7919 + base[0] * 31 + base[1] * 17 + base[2] * 7);
      ctx.save();
      tracePath(ctx, rings, toPx);
      ctx.clip('evenodd');
      for (let i = 0; i < mottle; i++) {
        const px = rng() * W;
        const py = rng() * H;
        const pr = 10 + rng() * 60;
        const a = (13 + rng() * 18) / 255;
        const grad = ctx.createRadialGradient(px, py, 0, px, py, pr);
        grad.addColorStop(0, rgba(base, a));
        grad.addColorStop(1, rgba(base, 0));
        ctx.fillStyle = grad;
        ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
      }
      ctx.restore();

      // 4. 淡墨边界（同色系描边）+ 干边（更深细描边）
      const edgeStroke = style.edge && style.edge.stroke ? style.edge.stroke : props.color || '#888888';
      const edgeOpacity = (style.edge && style.edge.strokeOpacity != null) ? style.edge.strokeOpacity : Math.min(1, opacity + 0.13);
      const edgeWidth = (style.edge && style.edge.strokeWidth != null) ? style.edge.strokeWidth : 1.8;
      tracePath(ctx, rings, toPx);
      ctx.strokeStyle = rgba(parseHex(edgeStroke), edgeOpacity);
      ctx.lineWidth = edgeWidth;
      ctx.lineJoin = 'round';
      ctx.stroke();

      const [dr, dg, db] = darken(parseHex(edgeStroke), 0.7);
      tracePath(ctx, rings, toPx);
      ctx.strokeStyle = rgba([dr, dg, db], 0.28);
      ctx.lineWidth = 0.8;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  }

  const png = canvas.toBuffer('image/png');
  const outFile = file.replace(/\.json$/, '.png');
  fs.writeFileSync(path.join(OUT_DIR, outFile), png);

  manifest.files[outFile] = {
    ...(manifest.files[outFile] || {}),
    status: 'penpot-v1',
    rendered: new Date().toISOString().slice(0, 10),
    styleSource: STYLE_PATH ? path.basename(STYLE_PATH) : 'web-default',
    sizeKb: Math.round(png.length / 1024),
  };
  console.log(`[penpot-render] ${outFile}  ${W}×${H}  ${(png.length / 1024).toFixed(0)}KB  ${meta.periodIds.join(', ')}`);
}

manifest.status = 'penpot';
fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('[penpot-render] manifest.json 已更新（status=penpot）');