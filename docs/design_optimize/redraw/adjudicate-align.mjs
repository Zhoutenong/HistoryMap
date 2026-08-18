#!/usr/bin/env node
/**
 * adjudicate-align.mjs — 渲染坐标系裁决实验
 *
 * 复刻 MapRenderer.kt / Projection.kt / WorldToScreen 的精确公式，
 * 对真机截图 artifacts/audit/post-fix2-main.png 做数值校验，
 * 判定「标签与色块错位」是真错位还是假阳性。
 *
 * 用法：
 *   node docs/design_optimize/redraw/adjudicate-align.mjs
 *   node docs/design_optimize/redraw/adjudicate-align.mjs --probe-only
 */

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const SCREENSHOT = path.join(ROOT, 'artifacts/audit/post-fix2-main.png');
const ANALYZE = path.join(ROOT, 'scripts/analyze-image.mjs');
const PERIODS = JSON.parse(readFileSync(path.join(ROOT, 'server/data/geo/historical/periods.json'), 'utf8'));
const REGIMES_1100 = JSON.parse(readFileSync(path.join(ROOT, 'server/data/geo/historical/regimes-1100.json'), 'utf8'));

// ═══════════════════════════════════════════════════════════════
// 1. 常量（精确复刻 MapVisualTokens.kt / DesignMetrics.kt）
// ═══════════════════════════════════════════════════════════════

const CANVAS_W = 1080;
const CANVAS_H = 2244;
const MAP_TOP = 154;       // Dimensions.MAP_TOP
const MAP_BOTTOM = 1410;   // Dimensions.MAP_BOTTOM
const CAMERA_FIT_BOOST = 1.4;
const AREA_TOP_FRAC = MAP_TOP / CANVAS_H;    // 0.06862
const AREA_BOTTOM_FRAC = MAP_BOTTOM / CANVAS_H; // 0.62834
const FIT_W = 1000.0;  // Projection.FIT_WIDTH
const FIT_H = 800.0;   // Projection.FIT_HEIGHT

// 截图尺寸（真机 P20: 1080×2244）
const VP_W = 1080;
const VP_H = 2244;
const ASPECT = VP_W / VP_H;

// ═══════════════════════════════════════════════════════════════
// 2. Mercator 投影（精确复刻 Projection.kt）
// ═══════════════════════════════════════════════════════════════

function toRad(deg) { return deg * Math.PI / 180; }
function mercatorRaw(lng, lat) {
  const x = toRad(lng);
  const y = Math.log(Math.tan(Math.PI / 4 + toRad(lat) / 2));
  return [x, y];
}

function fitProjection(allLngLatPoints) {
  // 初始 scale=150 计算包围盒
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [lng, lat] of allLngLatPoints) {
    const [rx, ry] = mercatorRaw(lng, lat);
    const px = 150 * rx;
    const py = 150 * ry;
    if (px < x0) x0 = px;
    if (px > x1) x1 = px;
    if (py < y0) y0 = py;
    if (py > y1) y1 = py;
  }
  const boxW = x1 - x0;
  const boxH = y1 - y0;
  const k = Math.min(FIT_W / boxW, FIT_H / boxH);
  const scale = 150 * k;
  const tx = (FIT_W - k * (x0 + x1)) / 2;
  const ty = (FIT_H - k * (y0 + y1)) / 2;

  // project 函数
  return function project(lng, lat) {
    const [rx, ry] = mercatorRaw(lng, lat);
    const px = scale * rx + tx;
    const py = scale * ry + ty;
    return [(px - FIT_W / 2), (FIT_H / 2 - py)]; // y 翻转
  };
}

// ═══════════════════════════════════════════════════════════════
// 3. 提取 regimes-1100.json 的所有坐标点
// ═══════════════════════════════════════════════════════════════

function extractAllPoints(geojson) {
  const pts = [];
  for (const feat of geojson.features) {
    const geom = feat.geometry;
    if (!geom) continue;
    if (geom.type === 'MultiPolygon') {
      for (const poly of geom.coordinates) {
        for (const ring of poly) {
          for (const coord of ring) {
            pts.push(coord);
          }
        }
      }
    } else if (geom.type === 'Polygon') {
      for (const ring of geom.coordinates) {
        for (const coord of ring) {
          pts.push(coord);
        }
      }
    }
  }
  return pts;
}

// ═══════════════════════════════════════════════════════════════
// 4. 计算 worldBounds / textureWorldBox / anchorBounds
// ═══════════════════════════════════════════════════════════════

function computeBounds(project, geojson, includePadding = true) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const feat of geojson.features) {
    const geom = feat.geometry;
    if (!geom) continue;
    const coords = [];
    if (geom.type === 'MultiPolygon') {
      for (const poly of geom.coordinates) for (const ring of poly) coords.push(...ring);
    } else if (geom.type === 'Polygon') {
      for (const ring of geom.coordinates) coords.push(...ring);
    }
    for (const c of coords) {
      const [wx, wy] = project(c[0], c[1]);
      if (wx < x0) x0 = wx;
      if (wx > x1) x1 = wx;
      if (wy < y0) y0 = wy;
      if (wy > y1) y1 = wy;
    }
  }
  if (includePadding) {
    const padX = (x1 - x0) * 0.06;
    const padY = (y1 - y0) * 0.06;
    x0 -= padX; y0 -= padY; x1 += padX; y1 += padY;
  }
  return { left: x0, top: y0, right: x1, bottom: y1, width: x1 - x0, height: y1 - y0, centerX: (x0 + x1) / 2, centerY: (y0 + y1) / 2 };
}

function computeAnchorBounds(project, geojson) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const feat of geojson.features) {
    if (!feat.properties?.entity?.includes('宋')) continue;
    const geom = feat.geometry;
    if (!geom) continue;
    const coords = [];
    if (geom.type === 'MultiPolygon') {
      for (const poly of geom.coordinates) for (const ring of poly) coords.push(...ring);
    } else if (geom.type === 'Polygon') {
      for (const ring of geom.coordinates) coords.push(...ring);
    }
    for (const c of coords) {
      const [wx, wy] = project(c[0], c[1]);
      if (wx < x0) x0 = wx;
      if (wx > x1) x1 = wx;
      if (wy < y0) y0 = wy;
      if (wy > y1) y1 = wy;
    }
  }
  if (!isFinite(x0)) return null;
  return { left: x0, top: y0, right: x1, bottom: y1, centerX: (x0 + x1) / 2, centerY: (y0 + y1) / 2 };
}

// ═══════════════════════════════════════════════════════════════
// 5. resetCamera（精确复刻 MapRenderer.kt L822-853）
// ═══════════════════════════════════════════════════════════════

function resetCamera(worldBoundsBox, anchorBoundsBox) {
  const portrait = VP_H >= VP_W;
  const areaTopFrac = portrait ? AREA_TOP_FRAC : 0;
  const areaBottomFrac = portrait ? AREA_BOTTOM_FRAC : 1;
  const areaH = VP_H * (areaBottomFrac - areaTopFrac);
  const areaCenterY = VP_H * (areaTopFrac + areaBottomFrac) / 2;

  const zW = (worldBoundsBox.width * VP_H) / (VP_W * 800);
  const zH = (worldBoundsBox.height * VP_H) / (areaH * 800);
  const boost = portrait ? CAMERA_FIT_BOOST : 1;
  let zoom = Math.max(zW, zH) / boost;
  zoom = Math.max(0.25, Math.min(24, zoom));

  // cy
  const cy = worldBoundsBox.centerY - (areaCenterY - VP_H / 2) * (2 * 400 * zoom) / VP_H;

  // cx
  const visibleW = 2 * 400 * zoom * ASPECT;
  const anchorX = anchorBoundsBox ? anchorBoundsBox.centerX : worldBoundsBox.centerX;
  let cx;
  if (visibleW < worldBoundsBox.width) {
    cx = Math.max(worldBoundsBox.left + visibleW / 2, Math.min(anchorX, worldBoundsBox.right - visibleW / 2));
  } else {
    cx = worldBoundsBox.centerX;
  }

  return { zoom, cx, cy, areaH, areaCenterY, zW, zH, visibleW };
}

// ═══════════════════════════════════════════════════════════════
// 6. worldToScreen（精确复刻 MapRenderer.kt L867-877）
// ═══════════════════════════════════════════════════════════════

function worldToScreen(wx, wy, zoom, cx, cy, texWorldBox) {
  const halfH = 400 * zoom;
  const halfW = halfH * ASPECT;
  const sx = (wx - cx) / halfW * (VP_W / 2) + VP_W / 2;
  // 镜像轴：textureWorldBox 中心
  const mirrorCY = texWorldBox ? (texWorldBox.top + texWorldBox.bottom - cy) : cy;
  const sy = VP_H / 2 + (wy - mirrorCY) / halfH * (VP_H / 2);
  return [sx, sy];
}

// ═══════════════════════════════════════════════════════════════
// 7. 旧公式（mirrorCenterY = cy，无镜像修正）
// ═══════════════════════════════════════════════════════════════

function worldToScreenOld(wx, wy, zoom, cx, cy) {
  const halfH = 400 * zoom;
  const halfW = halfH * ASPECT;
  const sx = (wx - cx) / halfW * (VP_W / 2) + VP_W / 2;
  const sy = VP_H / 2 + (wy - cy) / halfH * (VP_H / 2);
  return [sx, sy];
}

// ═══════════════════════════════════════════════════════════════
// 8. buildViewProjMatrix 屏幕坐标（GL 路径，用于 quad 顶点）
// ═══════════════════════════════════════════════════════════════

function worldToScreenGL(wx, wy, zoom, cx, cy) {
  const halfH = 400 * zoom;
  const halfW = halfH * ASPECT;
  const ndcX = (wx - cx) / halfW;
  const ndcY = (wy - cy) / halfH;
  // GL viewport: NDC (-1,-1) → bottom-left, (1,1) → top-right
  const sx = (ndcX + 1) / 2 * VP_W;
  const sy = (1 - ndcY) / 2 * VP_H; // y-flip
  return [sx, sy];
}

// ═══════════════════════════════════════════════════════════════
// 9. 像素探针（调用 analyze-image.mjs --probe）
// ═══════════════════════════════════════════════════════════════

function probe(x, y, w, h) {
  const spec = `${Math.round(x)},${Math.round(y)},${w},${h}`;
  try {
    const out = execSync(`node "${ANALYZE}" "${SCREENSHOT}" --probe "${spec}"`, { encoding: 'utf8', timeout: 30000 });
    return out.trim();
  } catch (e) {
    return `[probe error: ${e.message}]`;
  }
}

function probeColor(x, y, w, h) {
  const spec = `${Math.round(x)},${Math.round(y)},${w},${h}`;
  try {
    const out = execSync(`node "${ANALYZE}" "${SCREENSHOT}" --probe "${spec}"`, { encoding: 'utf8', timeout: 30000 });
    // 解析 "probe(...) 平均 #rrggbb  Top: ..."
    const m = out.match(/平均\s+(#[0-9a-f]{6})/i);
    if (m) return m[1];
    return null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// 10. 颜色相似度
// ═══════════════════════════════════════════════════════════════

function hexToRgb(hex) {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return [0, 0, 0];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function colorDist(a, b) {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

function classifyColor(hex) {
  const [r, g, b] = hexToRgb(hex);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const L = (mx + mn) / 2 / 255;
  const S = mx === 0 ? 0 : (mx - mn) / mx;
  if (S > 0.2 && L > 0.15 && L < 0.85) {
    if (r > g && r > b && (r - b) > 30) return 'red/warm';
    if (g > r && g > b) return 'green';
    if (b > r && b > g) return 'blue';
    if (r > 130 && g > 100 && b < 120) return 'yellow/brown';
    return 'other-chromatic';
  }
  if (L > 0.85) return 'white/paper';
  if (L > 0.6) return 'light-gray';
  if (L > 0.3) return 'mid-gray';
  return 'dark';
}

// ═══════════════════════════════════════════════════════════════
// 11. 主流程
// ═══════════════════════════════════════════════════════════════

console.log('═══════════════════════════════════════════════════════════');
console.log('  渲染坐标系裁决实验 — adjudicate-align.mjs');
console.log('═══════════════════════════════════════════════════════════\n');

// 11a. 提取所有坐标点并拟合投影
const allPoints = extractAllPoints(REGIMES_1100);
console.log(`[投影] regimes-1100.json 共 ${allPoints.length} 个顶点`);
const project = fitProjection(allPoints);

// 验证投影：输出几个已知点的投影坐标
const testPts = [
  ['宋 label', 112.6, 33.2],
  ['辽 label', 115.6, 43.4],
  ['成都', 104.06, 30.65],
  ['东京开封府', 114.35, 34.78],
];
console.log('\n[投影验证] 已知点 → 世界坐标：');
for (const [name, lng, lat] of testPts) {
  const [wx, wy] = project(lng, lat);
  console.log(`  ${name} [${lng},${lat}] → wx=${wx.toFixed(2)}, wy=${wy.toFixed(2)}`);
}

// 11b. 计算三种包围盒
const worldBounds = computeBounds(project, REGIMES_1100, true);  // 含 6% pad
const texWorldBox = computeBounds(project, REGIMES_1100, true);  // 同（仅政权，无河山）
const anchorBounds = computeAnchorBounds(project, REGIMES_1100);

console.log('\n[包围盒]');
console.log(`  worldBounds:    left=${worldBounds.left.toFixed(2)} top=${worldBounds.top.toFixed(2)} right=${worldBounds.right.toFixed(2)} bottom=${worldBounds.bottom.toFixed(2)} w=${worldBounds.width.toFixed(2)} h=${worldBounds.height.toFixed(2)}`);
console.log(`  textureWorldBox: left=${texWorldBox.left.toFixed(2)} top=${texWorldBox.top.toFixed(2)} right=${texWorldBox.right.toFixed(2)} bottom=${texWorldBox.bottom.toFixed(2)} w=${texWorldBox.width.toFixed(2)} h=${texWorldBox.height.toFixed(2)}`);
console.log(`  anchorBounds(宋): left=${anchorBounds.left.toFixed(2)} top=${anchorBounds.top.toFixed(2)} right=${anchorBounds.right.toFixed(2)} bottom=${anchorBounds.bottom.toFixed(2)} cx=${anchorBounds.centerX.toFixed(2)} cy=${anchorBounds.centerY.toFixed(2)}`);

// 11c. resetCamera
const cam = resetCamera(worldBounds, anchorBounds);
console.log('\n[resetCamera]');
console.log(`  viewport: ${VP_W}×${VP_H}  aspect=${ASPECT.toFixed(6)}`);
console.log(`  areaH=${cam.areaH.toFixed(2)}  areaCenterY=${cam.areaCenterY.toFixed(2)}`);
console.log(`  zW=${cam.zW.toFixed(6)}  zH=${cam.zH.toFixed(6)}`);
console.log(`  zoom=${cam.zoom.toFixed(6)}  cx=${cam.cx.toFixed(6)}  cy=${cam.cy.toFixed(6)}`);
console.log(`  visibleW=${cam.visibleW.toFixed(2)}  worldBounds.width=${worldBounds.width.toFixed(2)}`);

// 11d. 每个政权的世界坐标矩形 → 屏幕坐标
const entityColors = {};
for (const feat of REGIMES_1100.features) {
  const e = feat.properties?.entity;
  const c = feat.properties?.color;
  if (e && c) entityColors[e] = c;
}

const regimes = {};
for (const feat of REGIMES_1100.features) {
  const entity = feat.properties?.entity;
  if (!entity) continue;
  if (regimes[entity]) continue;
  const geom = feat.geometry;
  if (!geom) continue;
  const worldPts = [];
  if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) for (const ring of poly) for (const c of ring) worldPts.push(c);
  } else if (geom.type === 'Polygon') {
    for (const ring of geom.coordinates) for (const c of ring) worldPts.push(c);
  }
  // 世界坐标包围盒
  let wx0 = Infinity, wy0 = Infinity, wx1 = -Infinity, wy1 = -Infinity;
  for (const c of worldPts) {
    const [wx, wy] = project(c[0], c[1]);
    if (wx < wx0) wx0 = wx;
    if (wx > wx1) wx1 = wx;
    if (wy < wy0) wy0 = wy;
    if (wy > wy1) wy1 = wy;
  }
  regimes[entity] = {
    worldBox: { left: wx0, top: wy0, right: wx1, bottom: wy1 },
    color: entityColors[entity] || '#888888',
  };
}

// 11e. 标签/城市坐标
const labels = PERIODS.labels || {};
const cities = (PERIODS.cities || []);

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  数值表：相机参数 & 政权理论矩形');
console.log('═══════════════════════════════════════════════════════════\n');

console.log(`| 参数 | 值 |`);
console.log(`|---|---|`);
console.log(`| zoom | ${cam.zoom.toFixed(6)} |`);
console.log(`| cx | ${cam.cx.toFixed(6)} |`);
console.log(`| cy | ${cam.cy.toFixed(6)} |`);
console.log(`| viewport | ${VP_W}×${VP_H} |`);
console.log(`| aspect | ${ASPECT.toFixed(6)} |`);
console.log(`| halfH (400*zoom) | ${(400 * cam.zoom).toFixed(2)} |`);
console.log(`| halfW (halfH*aspect) | ${(400 * cam.zoom * ASPECT).toFixed(2)} |`);

// 每个政权的世界矩形 → worldToScreen 四角 → 屏幕矩形
const regimeScreenBoxes = {};
console.log('\n| 政权 | 世界 left | 世界 top | 世界 right | 世界 bottom | 屏幕 left | 屏幕 top | 屏幕 right | 屏幕 bottom |');
console.log(`|---|---|---|---|---|---|---|---|---|`);

for (const [entity, data] of Object.entries(regimes)) {
  const wb = data.worldBox;
  const [sx0, sy0] = worldToScreen(wb.left, wb.top, cam.zoom, cam.cx, cam.cy, texWorldBox);
  const [sx1, sy1] = worldToScreen(wb.right, wb.bottom, cam.zoom, cam.cx, cam.cy, texWorldBox);
  const sLeft = Math.min(sx0, sx1);
  const sRight = Math.max(sx0, sx1);
  const sTop = Math.min(sy0, sy1);
  const sBottom = Math.max(sy0, sy1);
  regimeScreenBoxes[entity] = { left: sLeft, top: sTop, right: sRight, bottom: sBottom };
  console.log(`| ${entity} | ${wb.left.toFixed(1)} | ${wb.top.toFixed(1)} | ${wb.right.toFixed(1)} | ${wb.bottom.toFixed(1)} | ${sLeft.toFixed(1)} | ${sTop.toFixed(1)} | ${sRight.toFixed(1)} | ${sBottom.toFixed(1)} |`);
}

// 11f. 截图实测 — 扫描宋红块边界
console.log('\n═══════════════════════════════════════════════════════════');
console.log('  截图实测：宋红块边界扫描');
console.log('═══════════════════════════════════════════════════════════\n');

// 宋的理论屏幕矩形
const songBox = regimeScreenBoxes['宋'];
console.log(`宋理论屏幕矩形: left=${songBox.left.toFixed(1)} top=${songBox.top.toFixed(1)} right=${songBox.right.toFixed(1)} bottom=${songBox.bottom.toFixed(1)}`);

// 在理论矩形中心探测
const songCx = (songBox.left + songBox.right) / 2;
const songCy = (songBox.top + songBox.bottom) / 2;
console.log(`理论中心: (${songCx.toFixed(1)}, ${songCy.toFixed(1)})`);
const centerProbe = probe(Math.round(songCx) - 10, Math.round(songCy) - 10, 20, 20);
console.log(`  理论中心像素: ${centerProbe}`);

// 扫描宋红块边界：从理论矩形四边向内搜索
function findEdge(startX, startY, endX, endY, step, isRedFn) {
  const dx = endX - startX;
  const dy = endY - startY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.ceil(dist / step);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(startX + dx * t);
    const y = Math.round(startY + dy * t);
    const hex = probeColor(x - 2, y - 2, 4, 4);
    if (hex && isRedFn(hex)) {
      return { x, y, hex };
    }
  }
  return null;
}

function isReddish(hex) {
  const [r, g, b] = hexToRgb(hex);
  return r > 100 && r > g * 1.2 && r > b * 1.3;
}

// 从理论矩形中心向四边扫描
const scanStep = 5;
console.log('\n宋红块边界扫描（从理论中心向四边）：');

// 上边界（从中心向上）
const topEdge = findEdge(songCx, songCy, songCx, songBox.top - 50, -scanStep, isReddish);
console.log(`  上边界: ${topEdge ? `(${topEdge.x}, ${topEdge.y}) hex=${topEdge.hex}` : '未找到'}`);

// 下边界（从中心向下）
const botEdge = findEdge(songCx, songCy, songCx, songBox.bottom + 50, scanStep, isReddish);
console.log(`  下边界: ${botEdge ? `(${botEdge.x}, ${botEdge.y}) hex=${botEdge.hex}` : '未找到'}`);

// 左边界（从中心向左）
const leftEdge = findEdge(songCx, songCy, songBox.left - 50, songCy, -scanStep, isReddish);
console.log(`  左边界: ${leftEdge ? `(${leftEdge.x}, ${leftEdge.y}) hex=${leftEdge.hex}` : '未找到'}`);

// 右边界（从中心向右）
const rightEdge = findEdge(songCx, songCy, songBox.right + 50, songCy, scanStep, isReddish);
console.log(`  右边界: ${rightEdge ? `(${rightEdge.x}, ${rightEdge.y}) hex=${rightEdge.hex}` : '未找到'}`);

// 也从理论矩形外向内扫描
console.log('\n从理论矩形外向内扫描：');

function findEdgeFromOutside(startX, startY, dirX, dirY, maxDist, step, isRedFn) {
  for (let d = 0; d <= maxDist; d += step) {
    const x = Math.round(startX + dirX * d);
    const y = Math.round(startY + dirY * d);
    const hex = probeColor(x - 2, y - 2, 4, 4);
    if (hex && isRedFn(hex)) {
      return { x, y, hex, dist: d };
    }
  }
  return null;
}

// 从上向下扫
const topInward = findEdgeFromOutside(songCx, Math.max(0, songBox.top - 100), 0, 1, 200, scanStep, isReddish);
console.log(`  从上向下: ${topInward ? `(${topInward.x}, ${topInward.y}) hex=${topInward.hex} dist=${topInward.dist}` : '未找到'}`);

// 从下向上扫
const botInward = findEdgeFromOutside(songCx, Math.min(VP_H - 1, songBox.bottom + 100), 0, -1, 200, scanStep, isReddish);
console.log(`  从下向上: ${botInward ? `(${botInward.x}, ${botInward.y}) hex=${botInward.hex} dist=${botInward.dist}` : '未找到'}`);

// 从左向右扫
const leftInward = findEdgeFromOutside(Math.max(0, songBox.left - 100), songCy, 1, 0, 200, scanStep, isReddish);
console.log(`  从左向右: ${leftInward ? `(${leftInward.x}, ${leftInward.y}) hex=${leftInward.hex} dist=${leftInward.dist}` : '未找到'}`);

// 从右向左扫
const rightInward = findEdgeFromOutside(Math.min(VP_W - 1, songBox.right + 100), songCy, -1, 0, 200, scanStep, isReddish);
console.log(`  从右向左: ${rightInward ? `(${rightInward.x}, ${rightInward.y}) hex=${rightInward.hex} dist=${rightInward.dist}` : '未找到'}`);

// 11g. 标签定位裁决
console.log('\n═══════════════════════════════════════════════════════════');
console.log('  标签裁决表');
console.log('═══════════════════════════════════════════════════════════\n');

const labelTests = [
  { name: '宋', lng: labels['宋']?.[0], lat: labels['宋']?.[1] },
  { name: '辽', lng: labels['辽']?.[0], lat: labels['辽']?.[1] },
  { name: '西夏', lng: labels['西夏']?.[0], lat: labels['西夏']?.[1] },
  { name: '吐蕃', lng: labels['吐蕃']?.[0], lat: labels['吐蕃']?.[1] },
  { name: '大理', lng: labels['大理']?.[0], lat: labels['大理']?.[1] },
  { name: '大越', lng: labels['大越']?.[0], lat: labels['大越']?.[1] },
];

const cityTests = [
  { name: '成都', lng: 104.06, lat: 30.65 },
  { name: '东京开封府', lng: 114.35, lat: 34.78 },
  { name: '南京应天府', lng: 118.78, lat: 32.06 },
  { name: '太原', lng: 112.55, lat: 37.87 },
];

const allTests = [...labelTests.filter(t => t.lng != null), ...cityTests];

console.log(`| 名称 | 经纬度 | ①精确公式 (sx,sy) | ②旧模型 (sx,sy) | ①-② dy | 实测像素色 | 所在政权色 | 落点判定 |`);
console.log(`|---|---|---|---|---|---|---|---|`);

const results = [];
for (const t of allTests) {
  const [wx, wy] = project(t.lng, t.lat);
  const [sx1, sy1] = worldToScreen(wx, wy, cam.zoom, cam.cx, cam.cy, texWorldBox);
  const [sx2, sy2] = worldToScreenOld(wx, wy, cam.zoom, cam.cx, cam.cy);
  const dy = sy1 - sy2;

  // 探测精确公式位置
  const probeR = 15;
  const actualColor = probeColor(Math.round(sx1) - probeR, Math.round(sy1) - probeR, probeR * 2, probeR * 2);

  // 判断该标签属于哪个政权
  let belongEntity = 'unknown';
  for (const [entity, box] of Object.entries(regimeScreenBoxes)) {
    if (sx1 >= box.left && sx1 <= box.right && sy1 >= box.top && sy1 <= box.bottom) {
      belongEntity = entity;
      break;
    }
  }
  const entityColor = entityColors[belongEntity] || '—';

  // 判定
  let verdict = '—';
  if (actualColor) {
    const cat = classifyColor(actualColor);
    const dist = colorDist(actualColor, entityColor);
    if (belongEntity !== 'unknown' && dist < 80) {
      verdict = `✓ 对齐 (${belongEntity} 色块内)`;
    } else if (belongEntity !== 'unknown' && dist < 120) {
      verdict = `~ 近似 (${belongEntity} 色块, dist=${dist.toFixed(0)})`;
    } else {
      verdict = `✗ 偏差 (在${belongEntity}块内 dist=${dist.toFixed(0)}, 实际=${actualColor})`;
    }
  }

  results.push({ name: t.name, sx1, sy1, sx2, sy2, dy, actualColor, entityColor, belongEntity, verdict });
  console.log(`| ${t.name} | [${t.lng},${t.lat}] | (${sx1.toFixed(1)}, ${sy1.toFixed(1)}) | (${sx2.toFixed(1)}, ${sy2.toFixed(1)}) | ${dy.toFixed(1)}px | ${actualColor || '?'} | ${entityColor} | ${verdict} |`);
}

// 11h. 北汉灭亡事件泡泡验证
console.log('\n═══════════════════════════════════════════════════════════');
console.log('  事件泡泡交叉验证：北汉灭亡 [112.55, 37.87]（太原）');
console.log('═══════════════════════════════════════════════════════════\n');

const evtLng = 112.55, evtLat = 37.87;
const [evtWx, evtWy] = project(evtLng, evtLat);
const [evtSx1, evtSy1] = worldToScreen(evtWx, evtWy, cam.zoom, cam.cx, cam.cy, texWorldBox);
const [evtSx2, evtSy2] = worldToScreenOld(evtWx, evtWy, cam.zoom, cam.cx, cam.cy);
console.log(`事件世界坐标: wx=${evtWx.toFixed(2)}, wy=${evtWy.toFixed(2)}`);
console.log(`①精确公式屏幕: (${evtSx1.toFixed(1)}, ${evtSy1.toFixed(1)})`);
console.log(`②旧模型屏幕: (${evtSx2.toFixed(1)}, ${evtSy2.toFixed(1)})`);
console.log(`dy 差值: ${(evtSy1 - evtSy2).toFixed(1)}px`);

// 探测事件位置
const evtProbe = probe(Math.round(evtSx1) - 8, Math.round(evtSy1) - 8, 16, 16);
console.log(`精确公式位置像素: ${evtProbe}`);
const evtProbeOld = probe(Math.round(evtSx2) - 8, Math.round(evtSy2) - 8, 16, 16);
console.log(`旧模型位置像素: ${evtProbeOld}`);

// 扫描朱砂锚点（5px 朱砂圆）
console.log('\n在精确公式位置附近搜索朱砂锚点...');
for (let dy = -30; dy <= 30; dy += 5) {
  for (let dx = -30; dx <= 30; dx += 5) {
    const px = Math.round(evtSx1) + dx;
    const py = Math.round(evtSy1) + dy;
    const hex = probeColor(px - 2, py - 2, 4, 4);
    if (hex) {
      const [r, g, b] = hexToRgb(hex);
      // 朱砂色: 高红、低绿蓝
      if (r > 140 && r > g * 2 && r > b * 2 && g < 80 && b < 80) {
        console.log(`  朱砂点: (${px}, ${py}) hex=${hex} (r=${r} g=${g} b=${b})`);
      }
    }
  }
}

// 11i. 最终裁决
console.log('\n═══════════════════════════════════════════════════════════');
console.log('  裁决结论');
console.log('═══════════════════════════════════════════════════════════\n');

// 统计对齐情况
const aligned = results.filter(r => r.verdict.includes('✓'));
const nearAligned = results.filter(r => r.verdict.includes('~'));
const misaligned = results.filter(r => r.verdict.includes('✗'));

console.log(`对齐: ${aligned.length}/${results.length}`);
console.log(`近似: ${nearAligned.length}/${results.length}`);
console.log(`偏差: ${misaligned.length}/${results.length}`);

if (misaligned.length > 0) {
  console.log('\n偏差标签:');
  for (const r of misaligned) {
    console.log(`  ${r.name}: ①(${r.sx1.toFixed(1)},${r.sy1.toFixed(1)}) ②(${r.sx2.toFixed(1)},${r.sy2.toFixed(1)}) dy=${r.dy.toFixed(1)}px 实测=${r.actualColor}`);
  }
}

// 输出 JSON 摘要供报告使用
const summary = {
  camera: { zoom: cam.zoom, cx: cam.cx, cy: cam.cy, vpW: VP_W, vpH: VP_H },
  worldBounds: { left: worldBounds.left, top: worldBounds.top, right: worldBounds.right, bottom: worldBounds.bottom },
  texWorldBox: { left: texWorldBox.left, top: texWorldBox.top, right: texWorldBox.right, bottom: texWorldBox.bottom },
  anchorBounds: anchorBounds ? { left: anchorBounds.left, top: anchorBounds.top, right: anchorBounds.right, bottom: anchorBounds.bottom } : null,
  regimeScreenBoxes,
  labelResults: results,
};

// Write summary JSON
import { writeFileSync, mkdirSync } from 'node:fs';
const outDir = path.join(ROOT, 'docs/design_optimize/redraw');
try { mkdirSync(outDir, { recursive: true }); } catch {}
writeFileSync(path.join(outDir, 'adjudicate-summary.json'), JSON.stringify(summary, null, 2));
console.log(`\n摘要已写入 docs/design_optimize/redraw/adjudicate-summary.json`);
