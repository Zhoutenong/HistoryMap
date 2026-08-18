#!/usr/bin/env node
/**
 * 演示管线 · 重绘生成器（识图 → 数据驱动重绘）v2
 *
 * 输入（真实数据，非像素克隆）：
 *   - server/data/geo/historical/regimes-1100.json   真实政权疆域
 *   - client/public/textures/overlay/fit-geojson.json 投影标定 bbox
 *   - server/data/geo/historical/periods.json         政权配色/标签/河流/城市
 *   - 像素分析 + 区域特写识图                         版式参数
 *
 * v2 变更：所有图层直接输出到屏幕坐标（872×1256 地图区），
 *   不再经 1000×800 中间画布 → 地图铺满竖向区域、坐标单一空间。
 * 输出：docs/design_optimize/redraw/prompt4-redraw.html（872×1804 物理像素，2x 逻辑）
 * 用法：node docs/design_optimize/redraw/build.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoMercator, geoPath } from 'd3-geo';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', '..');
const HIST = path.join(ROOT, 'server', 'data', 'geo', 'historical');
const OVERLAY = path.join(ROOT, 'client', 'public', 'textures', 'overlay');

// ---------- 投影（与 penpot / bake 管线同配方：geoMercator fitSize + 居中） ----------
const fit = JSON.parse(fs.readFileSync(path.join(OVERLAY, 'fit-geojson.json'), 'utf8'));
const projection = geoMercator().fitSize([1000, 800], fit);
const b = geoPath(projection).bounds(fit);
const cx = (b[0][0] + b[1][0]) / 2;
const cy = (b[0][1] + b[1][1]) / 2;
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

// ---------- 屏幕版式（872×1804 物理像素，2x 逻辑；参数源自像素分带 + 特写识图） ----------
const W = 872;
const H = 1804;
const MAP = { x: 0, y: 144, w: W, h: 1256 };       // 地图区（顶栏下 → 底部面板上）
const PANEL = {
  y: 1400, h: 404,
  play: { x: 28, y: 34, r: 32 },
  yearX: 120, yearY: 74,
  rangeX: 600, rangeY: 84,
  trackX0: 112, trackX1: 848, trackY: 158,
  tabsY: 238, divY: 342, safeY: 366,
};

// 地图空间映射：lng/lat → 地图局部坐标（0..W × 0..MAP.h；y 向下）
const geojson = JSON.parse(fs.readFileSync(path.join(HIST, 'regimes-1100.json'), 'utf8'));
let bxmin = Infinity, bxmax = -Infinity, bymin = Infinity, bymax = -Infinity;
geojson.features.forEach((feat) => {
  walkCoords(feat.geometry, (c) => {
    const [x, y] = project(c);
    if (x < bxmin) bxmin = x;
    if (x > bxmax) bxmax = x;
    if (y < bymin) bymin = y;
    if (y > bymax) bymax = y;
  });
});
const PAD = 0.03;
const bw = bxmax - bxmin, bh = bymax - bymin;
const nx = (x) => ((x - bxmin) / bw) * (1 + 2 * PAD) - PAD;   // 归一 0..1（含边距）
const ny = (y) => ((bymax - y) / bh) * (1 + 2 * PAD) - PAD;
const toMap = ([lng, lat]) => {
  const [x, y] = project([lng, lat]);
  return [nx(x) * MAP.w, ny(y) * MAP.h];                      // 地图局部坐标（相对 MAP 左上角）
};

// ---------- 路径生成（简化抽稀，输出地图局部坐标） ----------
const SIMPLIFY = 1.5;
function normalizePolys(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}
function simplifyRing(ring) {
  if (ring.length < 4) return ring;
  const out = [ring[0]];
  for (let i = 1; i < ring.length - 1; i++) {
    const [px0, py0] = toMap(out[out.length - 1]);
    const [x, y] = toMap(ring[i]);
    if ((x - px0) ** 2 + (y - py0) ** 2 >= SIMPLIFY * SIMPLIFY) out.push(ring[i]);
  }
  out.push(ring[ring.length - 1]);
  return out;
}
function ringD(ring) {
  let d = '';
  ring.forEach(([lng, lat], i) => {
    const [x, y] = toMap([lng, lat]);
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  return d + 'Z';
}

const periods = JSON.parse(fs.readFileSync(path.join(HIST, 'periods.json'), 'utf8'));
const ENTITY = Object.fromEntries(periods.entities.map((e) => [e.name, e.color]));
function pathFor(feature) {
  const entity = feature.properties.entity || '未知';
  const color = feature.properties.color || ENTITY[entity] || '#888';
  const op = Math.min(1, Math.max(0.08, Number(feature.properties.fillOpacity) || 0.35));
  return normalizePolys(feature.geometry)
    .map((rings) => rings.map(ringD).join(''))
    .filter(Boolean)
    .map((d) => `<path d="${d}" fill="${color}" fill-opacity="${op}" stroke="${color}" stroke-opacity="0.6" stroke-width="1.6" data-entity="${entity}"/>`);
}
const regimePaths = geojson.features.flatMap(pathFor);
// 与 penpot 管线产物核对：同一 geojson 应产出同数量的政权路径
const artifactSvg = fs.readFileSync(path.join(ROOT, 'artifacts', 'penpot', 'regimes-1100.svg'), 'utf8');
const artifactCount = (artifactSvg.match(/data-entity=/g) || []).length;
if (Math.abs(regimePaths.length - artifactCount) > 1) {
  console.warn(`[build] 路径数量与 penpot 产物不一致：自算 ${regimePaths.length} vs 产物 ${artifactCount}`);
}
console.log(`[build] 政权路径 ${regimePaths.length} 条（penpot 产物 ${artifactCount} 条）`);

// ---------- 文本/标绘元素 ----------
const r1 = (v) => Math.round(v * 10) / 10;
const textEl = (x, y, str, cls, anchor = 'middle') =>
  `<text x="${r1(x)}" y="${r1(y)}" class="${cls}" text-anchor="${anchor}">${str}</text>`;

const REGIME_LABELS = [
  ['宋', [112.6, 33.2]], ['辽', [115.6, 43.4]], ['西夏', [105.2, 38.4]],
  ['金', [117.5, 42.5]], // 1100 数据集无金疆域：标签按截图位置近似（图例含金）
  ['吐蕃', [89.8, 31.6]], ['大理', [100, 25.4]],
];
const CITIES = [
  ['大 同', [113.3, 40.1]], ['兰 州', [103.83, 36.06]], ['西 宁', [101.78, 36.62]],
  ['成都', [104.06, 30.65]], ['开封', [114.35, 34.78]], ['临安', [120.16, 30.25]],
  ['北京', [115.02, 36.28]], ['南京', [118.78, 32.06]],
];
const RIVERS = periods.rivers.filter((r) => ['黄河', '长江', '淮河'].includes(r.name));
const RIVER_LABEL_POS = { '黄河': [119.2, 37.0] }; // 黄河标签避让「大同」城名，移到下游段
const SEAS = [['东海', [123.0, 31.5]], ['南海', [112.0, 16.5]]];

const riverParts = RIVERS.map((r) => {
  const pts = r.path.map((c) => toMap(c).map(r1).join(' ')).join(' ');
  const lp = RIVER_LABEL_POS[r.name] ?? r.path[Math.floor(r.path.length / 2)];
  const [mx, my] = toMap(lp);
  return `<g class="river"><polyline points="${pts}"/></g>` + textEl(mx, my + 8, r.name, 'river-label');
}).join('');
const cityParts = CITIES.map(([name, c]) => {
  const [x, y] = toMap(c);
  return `<g class="city"><circle cx="${r1(x)}" cy="${r1(y)}" r="3.4"/></g>` + textEl(x, y + 24, name, 'city-label');
}).join('');
const regimeParts = REGIME_LABELS.map(([name, c]) => {
  const [x, y] = toMap(c);
  return textEl(x, y, name, `regime-label${name === '宋' || name === '辽' ? ' major' : ''}`);
}).join('');
const seaParts = SEAS.map(([name, c]) => {
  const [x, y] = toMap(c);
  return textEl(x, y, name, 'sea-label');
}).join('');

// ---------- 事件泡泡（锚点=真实经纬度；偏移=避让布局，模拟碰撞推挤） ----------
const CARD_H = 118;
const CAT = {
  era: '#b03a2e', figure: '#6e5a7e', military: '#a0622d', economy: '#5f7d4f', invention: '#46647f',
};
const EVENTS = [
  { title: '靖康之变', text: '1127年，金军攻破汴京，宋徽宗、宋钦宗被俘。', anchor: [114.35, 34.78], dx: -150, dy: -150, w: 300, cat: CAT.military },
  { title: '陈桥兵变', text: '1127年，赵匡胤在陈桥驿发动兵变，建立宋朝。', anchor: [114.35, 34.52], dx: -300, dy: 10, w: 260, cat: CAT.era },
  { title: '绍兴和议', text: '1127年，宋金议和，以淮河为界，宋割地求和。', anchor: [117.9, 32.3], dx: 35, dy: 110, w: 300, cat: CAT.military },
];
const events = EVENTS.map((e) => {
  const [ax, ay] = toMap(e.anchor);
  const left = Math.max(12, Math.min(W - e.w - 12, ax + e.dx));
  const top = Math.max(16, Math.min(MAP.h - CARD_H - 16, ay + e.dy));
  return { ...e, ax, ay, left, top };
});

const bubbleHtml = events.map((e, i) => `
  <div class="bubble" style="left:${e.left}px;top:${e.top}px;width:${e.w - 24}px;--cat:${e.cat}">
    <div class="bubble-title">${e.title}</div>
    <div class="bubble-text">${e.text}</div>
  </div>`).join('');
const leaderHtml = events.map((e) => {
  const cx2 = e.left + e.w / 2 - 12;
  const cy2 = e.dy < 0 ? e.top + CARD_H - 6 : e.top + 6;
  return `<line x1="${cx2}" y1="${cy2}" x2="${e.ax}" y2="${e.ay}" class="leader"/>` +
    `<circle cx="${e.ax}" cy="${e.ay}" r="5" class="anchor"/>`;
}).join('');

// ---------- 时间轴（真实事件年份刻度点） ----------
const T0 = 960, T1 = 1279;
const tX = (yr) => PANEL.trackX0 + ((yr - T0) / (T1 - T0)) * (PANEL.trackX1 - PANEL.trackX0);
const trackDots = [
  ['陈桥兵变960', tX(960), CAT.era],
  ['澶渊之盟1004', tX(1004), CAT.figure],
  ['熙宁变法1069', tX(1069), CAT.economy],
  ['靖康之变1127', tX(1127), CAT.military],
  ['绍兴和议1141', tX(1141), CAT.invention],
];
const trackDotHtml = trackDots.map(([t, x, color]) =>
  `<span class="track-dot" style="left:${Math.round(x)}px;background:${color}" title="${t}"></span>`).join('');

const tabDefs = [
  ['政治', CAT.era, true], ['人物', CAT.figure, false],
  ['军事', CAT.military, false], ['经济', CAT.economy, false], ['文化', CAT.invention, false],
];
const tabW = W / 5;
const tabHtml = tabDefs.map(([label, color, active], i) => `
  <div class="tab${active ? ' active' : ''}" style="left:${Math.round(i * tabW)}px;width:${tabW}px">
    <span class="tab-dot" style="background:${color}"></span>
    <span class="tab-label">${label}</span>
    ${active ? '<span class="tab-underline"></span>' : ''}
  </div>`).join('');

// ---------- 顶栏 / 图例 ----------
const iconSlots = [['☰', '事件'], ['⚙', '设置'], ['⋯', '更多']]
  .map(([glyph, cap]) => `<div class="icon-slot"><span class="icon-glyph">${glyph}</span><em>44×44</em></div>`).join('');
const legendItems = [
  ['宋', ENTITY['宋']], ['辽', ENTITY['辽']], ['西夏', ENTITY['西夏']],
  ['金', ENTITY['金']], ['大理', ENTITY['大理']], ['吐蕃', ENTITY['吐蕃']],
].map(([name, color]) =>
  `<div class="legend-item"><span class="legend-dot" style="background:${color}"></span><span>${name}</span></div>`).join('');

// ---------- 组装 HTML ----------
const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>prompt_4 重绘 · 识图→数据驱动重绘演示</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: #b8a890; }
  .stage { display: flex; justify-content: center; padding: 24px 0; }
  .app {
    position: relative; width: ${W}px; height: ${H}px; overflow: hidden;
    background:
      radial-gradient(1300px 800px at 30% 18%, rgba(255,250,240,.95), transparent 62%),
      radial-gradient(1100px 1000px at 78% 72%, rgba(226,198,166,.55), transparent 55%),
      linear-gradient(160deg, #efe2cc 0%, #e8d8c8 45%, #dbc5a6 100%);
    border-radius: 18px; box-shadow: 0 18px 50px rgba(60,40,20,.35);
  }
  .paper { position: absolute; inset: 0; width: 100%; height: 100%; opacity: .12; mix-blend-mode: multiply; pointer-events: none; }
  .statusbar { position: absolute; top: 0; left: 0; right: 0; height: 56px; display: flex; align-items: center; justify-content: space-between; padding: 0 26px; font: 22px/1 sans-serif; color: rgba(60,45,30,.75); }
  .topbar { position: absolute; top: 56px; left: 0; right: 0; height: 88px; display: flex; align-items: center; padding: 0 22px; border-bottom: 1px solid rgba(120,90,60,.18); }
  .brand { font: 700 30px/1 'STKaiti','KaiTi','SimSun',serif; color: #5a4030; letter-spacing: 4px; }
  .dyn-btn { margin-left: 18px; padding: 10px 22px; font: 600 26px/1 'STKaiti','KaiTi',serif; color: #a0432f;
    background: rgba(255,250,240,.92); border: 2px solid rgba(176,58,46,.8); border-radius: 999px; }
  .icon-row { margin-left: auto; display: flex; gap: 26px; }
  .icon-slot { display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .icon-glyph { width: 88px; height: 88px; display: grid; place-items: center; font-size: 34px; color: #b8a890;
    border: 2px dashed rgba(140,115,85,.55); border-radius: 10px; background: rgba(240,228,208,.6); }
  .icon-slot em { font-style: normal; font: 16px/1 sans-serif; color: #9a8874; }
  .legend { position: absolute; top: 150px; left: 18px; z-index: 5; padding: 14px 18px 16px;
    background: rgba(250,242,226,.85); border: 1px solid rgba(160,120,70,.25); border-radius: 12px; box-shadow: 0 4px 12px rgba(90,60,30,.12); }
  .legend-head { font: 700 26px/1 'STKaiti','KaiTi',serif; color: #fff; background: #b03a2e;
    display: inline-block; padding: 8px 16px; border-radius: 8px; margin-bottom: 12px; }
  .legend-item { display: flex; align-items: center; gap: 12px; padding: 7px 0; font: 22px/1 'STKaiti','KaiTi',serif; color: #5a4030; }
  .legend-dot { width: 16px; height: 16px; border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(0,0,0,.15); }
  /* 地图层：svg 与浮层共用地图局部坐标（0..872 × 0..1256，相对 .map） */
  .map { position: absolute; top: ${MAP.y}px; left: 0; width: ${W}px; height: ${MAP.h}px; }
  .map svg.regimes { position: absolute; inset: 0; width: 100%; height: 100%; }
  .regimes .rpath { fill-opacity: .46; stroke-opacity: .6; stroke-width: 1.6; }
  .regimes .rpath.blur { fill-opacity: .22; filter: blur(7px); }
  .river { fill: none; stroke: rgba(70,90,110,.55); stroke-width: 2.6; stroke-linecap: round; }
  .river-label { font: italic 23px/1 'STKaiti','KaiTi',serif; fill: rgba(90,110,130,.85); }
  .city-label { font: 21px/1 'STKaiti','KaiTi',serif; fill: rgba(80,60,40,.9); }
  .city circle { fill: rgba(80,60,40,.9); }
  .regime-label { font: 700 42px/1 'STKaiti','KaiTi',serif; fill: rgba(70,50,35,.55); letter-spacing: 6px; }
  .regime-label.major { font-size: 48px; fill: rgba(70,50,35,.68); }
  .sea-label { font: italic 32px/1 'STKaiti','KaiTi',serif; fill: rgba(90,110,130,.6); letter-spacing: 10px; }
  .bubble { position: absolute; z-index: 6; padding: 14px 16px 12px 26px; border-radius: 12px;
    background: linear-gradient(180deg, #fdf5e6, #f3e4cc); border: 1.5px solid rgba(176,58,46,.8);
    box-shadow: 0 6px 16px rgba(90,60,30,.22); }
  .bubble::before { content: ''; position: absolute; left: 0; top: 8px; bottom: 8px; width: 7px; border-radius: 4px; background: var(--cat); }
  .bubble-title { font: 700 26px/1.2 'STKaiti','KaiTi',serif; color: #7a3a28; margin-bottom: 6px; }
  .bubble-text { font: 20px/1.45 'STKaiti','KaiTi',serif; color: #6b5638; }
  .leaders { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 4; pointer-events: none; overflow: visible; }
  .leader { stroke: rgba(176,58,46,.55); stroke-width: 2.5; stroke-dasharray: 7 7; fill: none; }
  .anchor { fill: #b03a2e; opacity: .9; }
  /* 底部面板 */
  .panel { position: absolute; left: 0; right: 0; bottom: 0; height: ${PANEL.h}px; z-index: 7;
    background: linear-gradient(180deg, #faf0dd, #f1e2c6); border-radius: 26px 26px 0 0;
    box-shadow: 0 -8px 22px rgba(90,60,30,.2); }
  .play-btn { position: absolute; left: 26px; top: ${PANEL.play.y}px; width: 64px; height: 64px; border-radius: 50%;
    background: #fdf5e6; border: 2.5px solid rgba(176,58,46,.85); display: grid; place-items: center; }
  .play-tri { width: 0; height: 0; border-left: 20px solid #b03a2e; border-top: 13px solid transparent; border-bottom: 13px solid transparent; margin-left: 4px; }
  .year { position: absolute; top: ${PANEL.yearY}px; left: ${PANEL.yearX}px; font: 700 44px/1 'STKaiti','KaiTi',serif; color: #6b3a28; }
  .range { position: absolute; top: ${PANEL.rangeY}px; left: ${PANEL.rangeX}px; font: 24px/1 'STKaiti','KaiTi',serif; color: #8a7a68; }
  .track { position: absolute; top: ${PANEL.trackY}px; left: ${PANEL.trackX0}px; width: ${PANEL.trackX1 - PANEL.trackX0}px; height: 40px; }
  .track-base { position: absolute; top: 12px; left: 0; right: 0; height: 5px; border-radius: 3px; background: rgba(90,70,50,.18); }
  .track-fill { position: absolute; top: 12px; left: 0; height: 5px; border-radius: 3px;
    background: linear-gradient(90deg, #c05a3e, #b03a2e); box-shadow: 0 0 8px rgba(176,58,46,.35); }
  .track-knob { position: absolute; top: 5px; width: 20px; height: 20px; border-radius: 50%;
    background: #fdf5e6; border: 2.5px solid #b03a2e; box-shadow: 0 2px 6px rgba(90,60,30,.25); transform: translateX(-10px); }
  .track-year { position: absolute; top: -2px; font: 18px/1 'STKaiti','KaiTi',serif; color: #7a6a58; transform: translateX(-50%); }
  .track-dot { position: absolute; top: 38px; width: 13px; height: 13px; border-radius: 50%; transform: translateX(-50%); box-shadow: inset 0 0 0 1px rgba(255,255,255,.6), 0 1px 3px rgba(0,0,0,.2); }
  .tabs { position: absolute; top: ${PANEL.tabsY}px; left: 0; right: 0; height: 88px; }
  .tab { position: absolute; top: 0; height: 88px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; }
  .tab-dot { width: 17px; height: 17px; border-radius: 50%; display: grid; place-items: center; font: 11px/1 sans-serif; color: #fff; box-shadow: inset 0 0 0 1px rgba(0,0,0,.15); }
  .tab-label { font: 24px/1 'STKaiti','KaiTi',serif; color: #5a4030; }
  .tab.active .tab-label { color: #a8322a; font-weight: 700; }
  .tab-underline { position: absolute; bottom: 6px; width: 44px; height: 5px; border-radius: 3px; background: #b03a2e; }
  .divider { position: absolute; top: ${PANEL.divY}px; left: 28px; right: 28px; border-top: 2px dashed rgba(176,58,46,.4); }
  .safe-area { position: absolute; top: ${PANEL.safeY}px; left: 28px; font: 18px/1 'STKaiti','KaiTi',serif; color: #9a8874; }
  .anno-toggle { position: fixed; left: 12px; bottom: 12px; z-index: 99; font: 14px/1.4 sans-serif; color: #554;
    background: rgba(255,255,255,.85); border: 1px solid #aaa; border-radius: 6px; padding: 6px 10px; cursor: pointer; }
  .app.anno-off .icon-slot em,
  .app.anno-off .safe-area { display: none; }
</style>
</head>
<body>
<div class="stage">
  <div class="app" id="app">
    <svg class="paper" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
      <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 0.55  0 0 0 0 0.42  0 0 0 0 0.28  0 0 0 0.5 0"/></filter>
      <rect width="${W}" height="${H}" filter="url(#grain)"/>
    </svg>

    <div class="statusbar"><span>9:41</span><span>▂▄▆ █</span></div>

    <header class="topbar">
      <span class="brand">历史地图</span>
      <button class="dyn-btn">宋 ▾</button>
      <div class="icon-row">${iconSlots}</div>
    </header>

    <aside class="legend">
      <div class="legend-head">政权 ▾</div>
      ${legendItems}
    </aside>

    <div class="map">
      <svg class="regimes" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${MAP.h}">
        <g>
          ${regimePaths.map((p) => p.replace('/>', ' class="rpath blur"/>')).join('\n          ')}
        </g>
        <g>
          ${regimePaths.join('\n          ')}
        </g>
        ${riverParts}
        ${cityParts}
        ${regimeParts}
        ${seaParts}
      </svg>
      <svg class="leaders" viewBox="0 0 ${W} ${MAP.h}">${leaderHtml}</svg>
      ${bubbleHtml}
    </div>

    <section class="panel">
      <div class="play-btn"><div class="play-tri"></div></div>
      <div class="year">1127年</div>
      <div class="range">960 — 1279</div>
      <div class="track">
        <div class="track-base"></div>
        <div class="track-fill" style="width:${((1127 - T0) / (T1 - T0) * 100).toFixed(1)}%"></div>
        <div class="track-knob" style="left:${((1127 - T0) / (T1 - T0) * 100).toFixed(1)}%"></div>
        <div class="track-year" style="left:0%">960</div>
        <div class="track-year" style="left:${((1127 - T0) / (T1 - T0) * 100).toFixed(1)}%">1127</div>
        <div class="track-year" style="left:100%">1279</div>
        ${trackDotHtml}
      </div>
      <div class="tabs">${tabHtml}</div>
      <div class="divider"></div>
      <div class="safe-area">安全区 28dp</div>
    </section>
  </div>
</div>
<label class="anno-toggle"><input type="checkbox" checked onchange="document.getElementById('app').classList.toggle('anno-off', !this.checked)"> 显示设计标注（44×44 / 安全区）</label>
</body>
</html>
`;

const outFile = path.join(__dirname, 'prompt4-redraw.html');
fs.writeFileSync(outFile, html, 'utf8');
console.log(`[build] 已生成 ${outFile.replace(/\\/g, '/')} (${(html.length / 1024).toFixed(1)} KB)`);
console.log(`[build] 河流 ${RIVERS.length} · 城市 ${CITIES.length} · 政权标签 ${REGIME_LABELS.length} · 事件 ${events.length}`);
events.forEach((e) => console.log(`  · ${e.title} 锚点(${e.ax},${e.ay}) 卡片(${e.left},${e.top},${e.w}x${CARD_H})`));