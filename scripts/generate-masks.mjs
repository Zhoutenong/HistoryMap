/**
 * 生成黑白轮廓蒙版 PNG（白色=政权区域，黑色=背景）。
 * 供 ChatGPT / DALL-E 等 AI 工具做 img2img 参考。
 *
 * 用法：node scripts/generate-masks.mjs [--width 1024]
 * 输出：artifacts/masks/<fileBase>.png
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { geoMercator, geoPath } from 'd3-geo';
import { createCanvas } from '@napi-rs/canvas';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const HISTORICAL_DIR = path.join(ROOT, 'server', 'data', 'geo', 'historical');
const OUT_DIR = path.join(ROOT, 'artifacts', 'masks');

const widthArgIdx = process.argv.indexOf('--width');
const TEX_WIDTH = widthArgIdx >= 0 ? Number(process.argv[widthArgIdx + 1]) : 1024;
const PAD_RATIO = 0.06;

fs.mkdirSync(OUT_DIR, { recursive: true });

const periodsIndex = JSON.parse(fs.readFileSync(path.join(HISTORICAL_DIR, 'periods.json'), 'utf8'));

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

// Generate masks
let generated = 0;
for (const [file, { periodLabels }] of fileSet) {
  const geojson = fileGeojson.get(file);
  const worldBox = computeWorldBox(geojson);
  if (!worldBox) continue;

  const wbW = worldBox.xmax - worldBox.xmin;
  const wbH = worldBox.ymax - worldBox.ymin;
  const texHeight = Math.round(TEX_WIDTH * (wbH / wbW));

  const canvas = createCanvas(TEX_WIDTH, texHeight);
  const ctx = canvas.getContext('2d');

  // Black background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, TEX_WIDTH, texHeight);

  // White filled polygons for ALL territories
  ctx.fillStyle = '#ffffff';
  for (const feature of geojson.features) {
    for (const rings of normalizePolygons(feature.geometry)) {
      for (const ring of rings) {
        ctx.beginPath();
        for (let i = 0; i < ring.length; i++) {
          const [x, y] = project(ring[i]);
          const sx = ((x - worldBox.xmin) / (worldBox.xmax - worldBox.xmin)) * TEX_WIDTH;
          const sy = ((worldBox.ymax - y) / (worldBox.ymax - worldBox.ymin)) * texHeight;
          if (i === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  const fileBase = path.basename(file, '.json');
  const outPath = path.join(OUT_DIR, `${fileBase}.png`);
  const pngBuf = canvas.toBuffer('image/png');
  fs.writeFileSync(outPath, pngBuf);
  console.log(`[mask] ${fileBase}.png  ${TEX_WIDTH}×${texHeight}  ${Math.round(pngBuf.length / 1024)}KB  (${periodLabels.join(', ')})`);
  generated++;
}

console.log(`[mask] 共 ${generated} 个蒙版 → ${OUT_DIR}`);
