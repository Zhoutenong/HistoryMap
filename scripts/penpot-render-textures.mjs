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
 * 用法：node scripts/penpot-render-textures.mjs [--styles artifacts/penpot/styles.json] [--width 2048|4096]
 * 样式文件缺省时按 Web 端默认 token 渲染（等价 WatercolorBuilder）。
 * 幂等：可重跑，输出直接覆盖 client/public/textures/overlay/*.png。
 * 分辨率变体（阶段⑤）：默认 2048 写主目录；--width 4096 写 hires/ 子目录（桌面高倍缩放
 * 档，Android 不同步——内存红线）。两档都在 manifest.files[file].variants 登记，
 * 运行时按设备能力选择（TerritoryOverlay.applyBakedWatercolor）。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { geoMercator, geoPath } from 'd3-geo';
import { createCanvas } from '@napi-rs/canvas';
import polygonClipping from 'polygon-clipping';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const HISTORICAL_DIR = path.join(ROOT, 'server', 'data', 'geo', 'historical');
const OUT_DIR = path.join(ROOT, 'client', 'public', 'textures', 'overlay');
const STYLE_PATH = process.argv.indexOf('--styles') >= 0
  ? path.resolve(ROOT, process.argv[process.argv.indexOf('--styles') + 1])
  : null;

const widthArgIdx = process.argv.indexOf('--width');
const TEX_WIDTH = widthArgIdx >= 0
  ? Math.max(1024, Math.min(4096, Math.round(Number(process.argv[widthArgIdx + 1]) || 2048)))
  : 2048;
const HIRES = TEX_WIDTH > 2048;
const OUT_SUBDIR = HIRES ? path.join(OUT_DIR, 'hires') : OUT_DIR;
if (HIRES) fs.mkdirSync(OUT_SUBDIR, { recursive: true });
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

// —— 海岸线 / 岸外水纹 pass（阶段③，2026-08-22）——
// 古地图惯例：海岸线重墨、岸外数圈细水纹，内部政权边界细而淡。做法：全部政权
// union 取外轮廓（= 海岸线 + 国界外缘），贴图绘制顺序为「水纹（底层）→ 政权填色
// （覆盖水纹陆内半侧）→ union 轮廓重描」。水纹用逐级加宽描边模拟岸外偏移带
// （陆内侧被填色盖住，视觉只剩岸外圈），避免引入真正的多边形偏移依赖。
const COAST_INK = [58, 52, 40];    // #3a3428 淡墨（与政权边界干边同族）
const WATER_INK = [86, 112, 127];  // 青灰墨（海面水纹，区别于陆上淡墨）
// 描边宽以 2048 档为基准按 TEX_WIDTH 等比缩放，2048/4096 两档观感一致
const PX = TEX_WIDTH / 2048;
const COAST_STROKE = { width: 2.6 * PX, alpha: 0.55 };
const WATER_RINGS = [              // [描边宽（贴图像素）, alpha]，宽度一半会被陆上填色覆盖
  { width: 8 * PX, alpha: 0.1 },
  { width: 16 * PX, alpha: 0.06 },
];

/** 全部政权 union → MultiPolygon（[poly][ring][pt]，lng/lat 坐标）；失败返回 null。 */
function unionRegimeOutlines(geojson) {
  try {
    const polys = [];
    for (const f of geojson.features) {
      for (const rings of normalizePolygons(f.geometry)) polys.push(rings);
    }
    if (!polys.length) return null;
    const u = polys.length === 1 ? polygonClipping.union(polys[0]) : polygonClipping.union(polys[0], ...polys.slice(1));
    if (!u) return null;
    // 0.15 返回 MultiPolygon；个别路径返回 Polygon（u[0][0][0] 是数字）则包一层
    return typeof u[0][0][0] === 'number' ? [u] : u;
  } catch (err) {
    console.warn(`  union 失败（${err.message}），跳过海岸线层`);
    return null;
  }
}

/** 一次性 beginPath 描出 MultiPolygon 全部环（供单次 stroke 的水纹/海岸线）。 */
function traceMultiPolygon(ctx, multipoly, toPx) {
  ctx.beginPath();
  for (const poly of multipoly) {
    for (const ring of poly) {
      const pts = ring.map(toPx);
      if (!pts.length) continue;
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
    }
  }
}

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

  // 岸外水纹（底层）：union 外轮廓逐级加宽描边，陆内半侧随后被政权填色覆盖
  const coastOutline = unionRegimeOutlines(geojson);
  if (coastOutline) {
    ctx.save();
    ctx.filter = 'none';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const ring of WATER_RINGS) {
      traceMultiPolygon(ctx, coastOutline, toPx);
      ctx.strokeStyle = rgba(WATER_INK, ring.alpha);
      ctx.lineWidth = ring.width;
      ctx.stroke();
    }
    ctx.restore();
  }

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

  // 海岸线重描（顶层）：union 外轮廓重墨，比内部政权边界（干边 ~0.8px/0.28）重一档，
  // 建立「海岸粗重、国界细淡」的古地图层级
  if (coastOutline) {
    ctx.save();
    ctx.filter = 'none';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    traceMultiPolygon(ctx, coastOutline, toPx);
    ctx.strokeStyle = rgba(COAST_INK, COAST_STROKE.alpha);
    ctx.lineWidth = COAST_STROKE.width;
    ctx.stroke();
    ctx.restore();
  }

  const png = canvas.toBuffer('image/png');
  const outFile = file.replace(/\.json$/, '.png');
  fs.writeFileSync(path.join(OUT_SUBDIR, outFile), png);

  // manifest：主档条目 + 分辨率变体登记（bake 整写 manifest 会清掉 variants，此处按磁盘自愈补齐）
  const entry = manifest.files[outFile] = {
    ...(manifest.files[outFile] || {}),
    status: 'penpot-v1',
    rendered: new Date().toISOString().slice(0, 10),
    styleSource: STYLE_PATH ? path.basename(STYLE_PATH) : 'web-default',
  };
  const variants = { ...(entry.variants || {}) };
  if (HIRES) {
    variants[String(TEX_WIDTH)] = `hires/${outFile}`;
    if (!variants['2048'] && fs.existsSync(path.join(OUT_DIR, outFile))) variants['2048'] = outFile;
  } else {
    variants['2048'] = outFile;
    if (fs.existsSync(path.join(OUT_DIR, 'hires', outFile))) variants['4096'] = `hires/${outFile}`;
    else delete variants['4096'];
  }
  entry.variants = variants;
  if (!HIRES) entry.sizeKb = Math.round(png.length / 1024);
  console.log(`[penpot-render] ${outFile}  ${W}×${H}${HIRES ? ' (hires)' : ''}  ${(png.length / 1024).toFixed(0)}KB  ${meta.periodIds.join(', ')}`);
}

manifest.status = 'penpot';
fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('[penpot-render] manifest.json 已更新（status=penpot）');