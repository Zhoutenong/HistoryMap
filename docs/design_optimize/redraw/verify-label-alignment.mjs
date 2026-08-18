#!/usr/bin/env node
/**
 * 标签-色块对齐验证脚本
 * 复刻 Projection.kt 的投影链路，计算预期屏幕坐标，
 * 然后用 analyze-image.mjs 采样像素颜色进行交叉验证。
 *
 * 投影链路：
 *   1. fit-geojson.json 的 bbox → Projection.fit() → scale/tx/ty
 *   2. worldBounds = 投影所有 regime 点 → 加 6% pad
 *   3. resetCamera: contain-fit 到 1080×2244 视口 + CAMERA_FIT_BOOST
 *   4. worldToScreen: 世界坐标 → 屏幕坐标
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// ========= 1. Mercator Projection (replicate Projection.kt) =========
const FIT_WIDTH = 1000.0;
const FIT_HEIGHT = 800.0;
const CENTER_X = FIT_WIDTH / 2;
const CENTER_Y = FIT_HEIGHT / 2;

function mercatorFit(points, width = FIT_WIDTH, height = FIT_HEIGHT) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of points) {
    const x = 150.0 * (p.lng * Math.PI / 180);
    const y = 150.0 * Math.log(Math.tan(Math.PI / 4 + (p.lat * Math.PI / 180) / 2));
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  const boxW = x1 - x0;
  const boxH = y1 - y0;
  const k = (boxW <= 0 || boxH <= 0) ? 1.0 : Math.min(width / boxW, height / boxH);
  const scale = 150.0 * k;
  const tx = (width - k * (x0 + x1)) / 2;
  const ty = (height - k * (y0 + y1)) / 2;
  return { scale, tx, ty };
}

function project(proj, lng, lat) {
  const rawX = (lng * Math.PI / 180);
  const rawY = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2));
  const px = proj.scale * rawX + proj.tx;
  const py = proj.scale * rawY + proj.ty;
  return [px - CENTER_X, CENTER_Y - py]; // y 向上
}

// ========= 2. Load fit-geojson.json for projection calibration =========
const fitGeojson = JSON.parse(fs.readFileSync(
  path.join(process.cwd(), 'client/public/textures/overlay/fit-geojson.json'), 'utf8'
));
const fitCoords = fitGeojson.features[0].geometry.coordinates[0]; // outer ring
const fitPoints = fitCoords.map(c => ({ lng: c[0], lat: c[1] }));
const proj = mercatorFit(fitPoints);

console.log(`Projection calibration: scale=${proj.scale.toFixed(2)}, tx=${proj.tx.toFixed(2)}, ty=${proj.ty.toFixed(2)}`);

// ========= 3. Load periods.json for labels, cities, entities =========
const periods = JSON.parse(fs.readFileSync(
  path.join(process.cwd(), 'server/data/geo/historical/periods.json'), 'utf8'
));

const entityColors = {};
for (const e of periods.entities) {
  entityColors[e.name] = e.color;
}

// ========= 4. Compute worldBounds from regimes-1100.geojson =========
const regimesFile = JSON.parse(fs.readFileSync(
  path.join(process.cwd(), 'server/data/geo/historical/regimes-1100.json'), 'utf8'
));

// Collect all projected points from regime polygons
let wxMin = Infinity, wyMin = Infinity, wxMax = -Infinity, wyMax = -Infinity;
for (const f of regimesFile.features) {
  const geom = f.geometry;
  const rings = geom.type === 'MultiPolygon' ? geom.coordinates.flatMap(p => p) : geom.coordinates;
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      const [wx, wy] = project(proj, lng, lat);
      if (wx < wxMin) wxMin = wx;
      if (wx > wxMax) wxMax = wx;
      if (wy < wyMin) wyMin = wy;
      if (wy > wyMax) wyMax = wy;
    }
  }
}

// 6% pad (same as MapRenderer.boundsOf)
const padX = (wxMax - wxMin) * 0.06;
const padY = (wyMax - wyMin) * 0.06;
const worldBounds = {
  left: wxMin - padX,
  top: wyMin - padY,
  right: wxMax + padX,
  bottom: wyMax + padY,
};
const wbWidth = worldBounds.right - worldBounds.left;
const wbHeight = worldBounds.bottom - worldBounds.top;
console.log(`worldBounds (with 6% pad): [${worldBounds.left.toFixed(1)}, ${worldBounds.top.toFixed(1)}] → [${worldBounds.right.toFixed(1)}, ${worldBounds.bottom.toFixed(1)}]`);
console.log(`  width=${wbWidth.toFixed(1)}, height=${wbHeight.toFixed(1)}, center=(${((worldBounds.left+worldBounds.right)/2).toFixed(1)}, ${((worldBounds.top+worldBounds.bottom)/2).toFixed(1)})`);

// ========= 5. Compute anchorBounds (宋 regime only) =========
let axMin = Infinity, ayMin = Infinity, axMax = -Infinity, ayMax = -Infinity;
for (const f of regimesFile.features) {
  const name = f.properties?.name || f.properties?.entity || '';
  if (!name.includes('宋')) continue;
  const geom = f.geometry;
  const rings = geom.type === 'MultiPolygon' ? geom.coordinates.flatMap(p => p) : geom.coordinates;
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      const [wx, wy] = project(proj, lng, lat);
      if (wx < axMin) axMin = wx;
      if (wx > axMax) axMax = wx;
      if (wy < ayMin) ayMin = wy;
      if (wy > ayMax) ayMax = wy;
    }
  }
}
const anchorBounds = { centerX: (axMin + axMax) / 2, centerY: (ayMin + ayMax) / 2 };
console.log(`宋 anchorBounds center: (${anchorBounds.centerX.toFixed(1)}, ${anchorBounds.centerY.toFixed(1)})`);

// ========= 6. resetCamera (replicate MapRenderer.resetCamera) =========
// Viewport: 1080 × 2244 (P20 screenshot)
const viewportW = 1080;
const viewportH = 2244;
const aspect = viewportW / viewportH;

// Camera map area — exact from DesignMetrics.kt & MapVisualTokens.kt
const CAMERA_FIT_BOOST = 1.4;
const CAMERA_MAP_AREA_TOP_FRAC = 154 / 2244;    // = 0.06863
const CAMERA_MAP_AREA_BOTTOM_FRAC = 1410 / 2244; // = 0.62834
const areaH = viewportH * (CAMERA_MAP_AREA_BOTTOM_FRAC - CAMERA_MAP_AREA_TOP_FRAC);
const areaCenterY = viewportH * (CAMERA_MAP_AREA_TOP_FRAC + CAMERA_MAP_AREA_BOTTOM_FRAC) / 2;

// contain-fit
const zW = (wbWidth * viewportH) / (viewportW * 800.0);
const zH = (wbHeight * viewportH) / (areaH * 800.0);
let zoom = Math.max(zW, zH) / CAMERA_FIT_BOOST;
zoom = Math.max(0.25, Math.min(24.0, zoom));

// cy: vertical center
let cy = (worldBounds.top + worldBounds.bottom) / 2 - (areaCenterY - viewportH / 2) * (2 * 400 * zoom) / viewportH;

// cx: horizontal anchor to 宋 center
const visibleW = 2 * 400 * zoom * aspect;
let cx;
if (visibleW < wbWidth) {
  cx = Math.max(worldBounds.left + visibleW / 2, Math.min(anchorBounds.centerX, worldBounds.right - visibleW / 2));
} else {
  cx = (worldBounds.left + worldBounds.right) / 2;
}

console.log(`\nCamera state: zoom=${zoom.toFixed(4)}, cx=${cx.toFixed(2)}, cy=${cy.toFixed(2)}`);
console.log(`  visible world: ${(2*400*zoom*aspect).toFixed(0)} × ${(2*400*zoom).toFixed(0)}`);

// ========= 7. worldToScreen (replicate MapRenderer.worldToScreen) =========
// textureWorldBox ≈ worldBounds (same computation)
const textureWorldBox = worldBounds; // simplified: same as worldBounds for initial calc

function worldToScreen(wx, wy) {
  const halfH = 400 * zoom;
  const halfW = halfH * aspect;
  const sx = (wx - cx) / halfW * (viewportW / 2) + viewportW / 2;
  // mirrorCenterY: textureWorldBox center - cy (R6 fix)
  const mirrorCenterY = (textureWorldBox.top + textureWorldBox.bottom) - cy;
  const sy = viewportH / 2 + (wy - mirrorCenterY) / halfH * (viewportH / 2);
  return [sx, sy];
}

// ========= 8. Compute expected screen coords for labels & cities =========
console.log('\n===== 预期屏幕坐标 =====\n');

// Regime labels
const regimeLabels = {
  '宋': [112.6, 33.2],
  '辽': [115.6, 43.4],
  '西夏': [105.2, 38.4],
  '吐蕃': [89.8, 31.6],
  '大理': [100.0, 25.4],
  '大越': [105.6, 20.6],
  '高丽': [127.2, 38.4],
  '海南': [109.6, 19.0],
};

// Cities
const cities = {
  '东京开封府': [114.35, 34.78],
  '成都': [104.06, 30.65],
  '临安': [120.16, 30.25],
  '南京应天府': [118.78, 32.06],
  '北京大名府': [115.02, 36.28],
  '太原': [112.55, 37.87],
  '广州': [113.27, 23.13],
  '兴庆府': [106.27, 38.47],
  '燕京': [116.4, 39.9],
  '西京河南府': [112.45, 34.62],
  '鄂州': [114.31, 30.52],
  '泉州': [118.58, 24.91],
  '扬州': [119.41, 32.39],
  '苏州': [120.58, 31.3],
};

// Note: Screenshot shows 979-986 year, period=song-1111
// The screenshot has these visible labels from my visual inspection:
// 辽 (top-right of map area), 西夏 (center-left), 宋 (center), 吐蕃 (far left),
// 大理 (bottom-left), 大越 (bottom-center), 海南 (bottom), 高丽 (far right)
// Cities: 成都府, 江宁府(=南京应天府?), 登州(not in city list - may be in overlay), 密州, 沂州, 大名府, 青州, 莱州

console.log('标注元素 | 经纬度 | 投影世界坐标 | 预期屏幕坐标');
console.log('-'.repeat(80));

function fmtRow(name, lngLat, kind) {
  const [wx, wy] = project(proj, lngLat[0], lngLat[1]);
  const [sx, sy] = worldToScreen(wx, wy);
  return `${kind} ${name} | [${lngLat[0]},${lngLat[1]}] | (${wx.toFixed(1)}, ${wy.toFixed(1)}) | (${sx.toFixed(0)}, ${sy.toFixed(0)})`;
}

const allPoints = [];
for (const [name, coord] of Object.entries(regimeLabels)) {
  const row = fmtRow(name, coord, '政权');
  console.log(row);
  allPoints.push({ name, coord, type: 'regime', ...computeScreen(coord) });
}
for (const [name, coord] of Object.entries(cities)) {
  const row = fmtRow(name, coord, '城池');
  console.log(row);
  allPoints.push({ name, coord, type: 'city', ...computeScreen(coord) });
}

function computeScreen(lngLat) {
  const [wx, wy] = project(proj, lngLat[0], lngLat[1]);
  const [sx, sy] = worldToScreen(wx, wy);
  return { wx, wy, sx, sy };
}

// ========= 9. Additional random test points inside regime territories =========
// Random point inside 宋 (red block) at ~[116, 29] (south of Yangtze)
const randomChecks = [
  { name: '随机-宋内部1', coord: [116, 29], expect: '宋色(红)' },
  { name: '随机-宋内部2', coord: [110, 26], expect: '宋色(红)' },
  { name: '随机-辽内部', coord: [118, 46], expect: '辽色(蓝灰)' },
];

console.log('\n===== 反向校验点 =====');
for (const pt of randomChecks) {
  const r = computeScreen(pt.coord);
  console.log(`${pt.name} | [${pt.coord}] | screen(${r.sx.toFixed(0)}, ${r.sy.toFixed(0)}) | 预期: ${pt.expect}`);
  allPoints.push({ name: pt.name, coord: pt.coord, type: 'random', expect: pt.expect, ...r });
}

// ========= 10. Write probe commands for analyze-image.mjs =========
console.log('\n===== 像素采样命令 =====\n');
console.log('# 对每个标注点，在预期坐标附近采样 (半径 20px 矩形)');
for (const p of allPoints) {
  const x = Math.round(p.sx);
  const y = Math.round(p.sy);
  // probe rectangle: x-20,y-20,40,40
  console.log(`# ${p.name}: screen(${x}, ${y})`);
  console.log(`node scripts/analyze-image.mjs artifacts/audit/post-fix2-main.png --probe "${x-20},${y-20},40,40"`);
}

// Save all points to JSON for the next step
const outputPath = path.join(process.cwd(), 'docs/design_optimize/redraw/probe-points.json');
fs.writeFileSync(outputPath, JSON.stringify(allPoints, null, 2));
console.log(`\nSaved probe points to ${outputPath}`);
