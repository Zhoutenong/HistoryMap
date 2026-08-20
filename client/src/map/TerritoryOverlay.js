import * as THREE from 'three';
import { geoCentroid } from 'd3-geo';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { project } from './ChinaMap.js';

/**
 * 水墨晕染叠加层。
 *
 * 与旧版「每个政权一个 ShapeGeometry 纯色填充 + 虚线边框」不同，
 * 新版把整个时期的政权多边形绘制到一张高分辨率 OffscreenCanvas 上，
 * 用水彩手法分层渲染（羽化晕染 → 主体色 → 淡墨边界 → 颗粒纹理），
 * 再作为 CanvasTexture 贴到覆盖全图的 PlaneGeometry（z=7）。
 * 视觉上接近设计图的「水墨晕染古地图」，而非矢量填色。
 *
 * 保留的外部契约（main.js 依赖）：
 *   - buildTerritoryOverlay(geojson) → { group, update }，group 内包含
 *     washMesh（z=7）+ 政权名标签（z=7.2）+ 城市标注（z=7.4）
 *   - fadeIn(group, duration)：对透明材质做 0 → base 淡入
 *   - 时期切换时 main.js 遍历 group.children dispose（washMesh 的
 *     geometry/material.map 均在此处置）
 */

/** 把政权色降饱和、压暗，转成水彩颜料色（低饱和、偏灰）。 */
function watercolorTint(hex) {
  const c = new THREE.Color(hex || '#888888');
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  const s = Math.max(0, hsl.s * 0.78);                 // 饱和度保留 78%（更浓）
  const l = Math.min(0.46, Math.max(0.32, hsl.l * 0.82)); // 亮度压到 0.32–0.46
  const tint = new THREE.Color().setHSL(hsl.h, s, l);
  return {
    r: Math.round(tint.r * 255),
    g: Math.round(tint.g * 255),
    b: Math.round(tint.b * 255),
  };
}

/** 把 Polygon / MultiPolygon 统一成 [rings, rings, ...]，rings[0] 为外环，其余为孔洞。 */
function normalizePolygons(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.map((poly) => poly);
  }
  return [];
}

/**
 * 绘制单个多边形（含孔洞）到 canvas 路径，并返回全部像素点。
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} rings [[[lng,lat],...], ...]
 * @param {(lng:number,lat:number)=>[number,number]} toPx 经纬度 → 像素
 * @returns {Array<[number,number][]>} 每环的点数组（供包围盒/斑驳层计算）
 */
function tracePath(ctx, rings, toPx) {
  ctx.beginPath();
  const all = [];
  rings.forEach((ring) => {
    const pts = ring.map(([lng, lat]) => toPx(lng, lat));
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0], pts[j][1]);
    ctx.closePath();
    all.push(pts);
  });
  return all;
}

/** 简单的确定性伪随机数（种子固定，保证每次生成的颗粒一致）。 */
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return ((s >> 16) & 0xff) / 255;
  };
}

/**
 * 生成水彩晕染纹理。
 * @param {object} geojson FeatureCollection
 * @returns {{ canvas: HTMLCanvasElement, width:number, height:number, worldBox: {xmin,xmax,ymin,ymax} }}
 */
const OVERLAY_CACHE_MAX = 4;
const watercolorCache = new Map();
const overlayCacheMetrics = { hits: 0, misses: 0 };

function getViewportConfig(config = {}) {
  const dpr = Math.min(2, Number(config.dpr) || window.devicePixelRatio || 1);
  const viewW = Math.max(800, Number(config.viewportWidth) || window.innerWidth || 1280);
  const viewH = Math.max(1, Number(config.viewportHeight) || window.innerHeight || 720);
  const lowEnd = config.lowEnd === undefined
    ? (navigator.hardwareConcurrency || 8) <= 4
    : !!config.lowEnd;
  return { period: config.period || '', dpr, viewW, viewH, lowEnd, layerConfig: config.layerConfig || 'default' };
}

function overlayCacheKey(geojson, config) {
  const props = geojson?.properties || {};
  const features = Array.isArray(geojson?.features) ? geojson.features : [];
  const featureSignature = features.map((feature) => {
    const featureProps = feature?.properties || {};
    return `${featureProps.entity || ''}:${featureProps.color || ''}:${feature.geometry?.type || ''}:${JSON.stringify(feature.geometry?.coordinates || '')}`;
  }).join('|');
  // 州府面（properties.prefectures）参与水彩缓存签名：州府描边 canvas 与政权水彩共用同一纹理
  const prefectures = Array.isArray(props.prefectures) ? props.prefectures : [];
  const prefectureSignature = prefectures.map((feature) => {
    return `${feature.geometry?.type || ''}:${JSON.stringify(feature.geometry?.coordinates || '')}`;
  }).join('|');
  return [config.period || props.period || props.periodId || props.id || props.year || '', featureSignature,
    prefectureSignature, config.viewW, config.viewH, config.dpr, config.lowEnd, config.layerConfig].join('~');
}

function recordOverlayMetric(name, value) {
  if (typeof performance !== 'undefined' && performance.mark) performance.mark(name);
  if (typeof console !== 'undefined' && console.debug) console.debug(`[overlay] ${name}`, value);
}

export function getOverlayCacheStats() {
  const total = overlayCacheMetrics.hits + overlayCacheMetrics.misses;
  return { ...overlayCacheMetrics, size: watercolorCache.size, hitRate: total ? overlayCacheMetrics.hits / total : 0 };
}

export function disposeOverlayCache() {
  watercolorCache.clear();
}

function buildWatercolorCanvas(geojson, renderConfig = {}) {
  // 空 overlay 不应进入投影/纹理计算，否则 Infinity/NaN 会传播到 canvas 与相机。
  const features = Array.isArray(geojson?.features) ? geojson.features : [];
  if (features.length === 0) return null;

  // 1. 计算所有投影坐标的边界（水彩晕染会超出多边形，加 6% 边距）
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  geojson.features.forEach((feature) => {
    normalizePolygons(feature.geometry).forEach((rings) => {
      rings.forEach((ring) => ring.forEach(([lng, lat]) => {
        const [x, y] = project([lng, lat]);
        if (x < xmin) xmin = x;
        if (x > xmax) xmax = x;
        if (y < ymin) ymin = y;
        if (y > ymax) ymax = y;
      }));
    });
  });
  if (![xmin, xmax, ymin, ymax].every(Number.isFinite) || xmax <= xmin || ymax <= ymin) return null;
  const padX = (xmax - xmin) * 0.06 || 1;
  const padY = (ymax - ymin) * 0.06 || 1;
  xmin -= padX; xmax += padX;
  ymin -= padY; ymax += padY;

  // 动态纹理尺寸：按视口 × dpr 决定（上限 2048），低端机（核数 ≤4）减半省内存
  const { dpr, viewW, lowEnd } = getViewportConfig(renderConfig);
  const W = Math.max(1024, Math.min(2048, Math.round(viewW * dpr * (lowEnd ? 0.6 : 1.2))));
  const H = Math.max(256, Math.round((W * (ymax - ymin)) / (xmax - xmin)));

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const toPx = (lng, lat) => {
    const [x, y] = project([lng, lat]);
    return [
      ((x - xmin) / (xmax - xmin)) * W,
      ((ymax - y) / (ymax - ymin)) * H, // 世界坐标 y 向上，canvas y 向下
    ];
  };

  // 2. 逐政权分层水彩渲染
  geojson.features.forEach((feature) => {
    const props = feature.properties || {};
    const tint = watercolorTint(props.color);
    const polygons = normalizePolygons(feature.geometry);
    polygons.forEach((rings) => {
      const ptsList = tracePath(ctx, rings, toPx);

      // 2a. 羽化晕染层：模糊的大轮廓，更大范围、更高透明度
      ctx.save();
      ctx.filter = `blur(${Math.max(12, W / 100)}px)`;
      ctx.fillStyle = `rgba(${tint.r}, ${tint.g}, ${tint.b}, 0.32)`;
      ctx.fill('evenodd');
      ctx.restore();

      // 2b. 主体色层：轻微模糊的填充，水彩主体（透明度略降，让宣纸透出、更接近淡墨古画）
      ctx.save();
      ctx.filter = `blur(${Math.max(5, W / 280)}px)`;
      ctx.fillStyle = `rgba(${tint.r}, ${tint.g}, ${tint.b}, 0.46)`;
      ctx.fill('evenodd');
      ctx.restore();

      // 2b2. 水彩斑驳：clip 路径内撒低透明径向色斑（模拟颜料不均的渗晕）。
      // 固定种子，同一时期每次渲染的纹理一致。
      const rng2 = makeRng(20260808);
      let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      ptsList.forEach((pts) => pts.forEach(([px, py]) => {
        if (px < bx0) bx0 = px;
        if (px > bx1) bx1 = px;
        if (py < by0) by0 = py;
        if (py > by1) by1 = py;
      }));
      ctx.save();
      ctx.clip('evenodd');
      // 低端机跳过斑驳层（省渲染时间）
      const blobCount = lowEnd ? 0 : 90 + Math.round(rng2() * 40);
      for (let k = 0; k < blobCount; k++) {
        const cx = bx0 + rng2() * (bx1 - bx0);
        const cy = by0 + rng2() * (by1 - by0);
        const r = 14 + rng2() * 48;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, `rgba(${tint.r}, ${tint.g}, ${tint.b}, ${(0.04 + rng2() * 0.07).toFixed(3)})`);
        g.addColorStop(1, `rgba(${tint.r}, ${tint.g}, ${tint.b}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // 2c. 淡墨边界：同色系描边，更深、更粗
      tracePath(ctx, rings, toPx);
      ctx.save();
      ctx.filter = 'none';
      ctx.lineWidth = 1.8;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = `rgba(${tint.r}, ${tint.g}, ${tint.b}, 0.48)`;
      ctx.stroke();
      ctx.restore();

      // 2d. 加深干边：更深的细描边，模拟水墨干边
      tracePath(ctx, rings, toPx);
      ctx.save();
      ctx.filter = 'none';
      ctx.lineWidth = 0.8;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = `rgba(${Math.max(0, tint.r - 40)}, ${Math.max(0, tint.g - 40)}, ${Math.max(0, tint.b - 40)}, 0.28)`;
      ctx.stroke();
      ctx.restore();
    });
  });

  // 2e. 暖色罩：低透明暖褐罩层（soft-light），让色块与宣纸更融合
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = 'rgba(224, 206, 168, 0.55)';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // 3. 纸张颗粒：soft-light 叠加细密噪点，增强水墨纸感
  const grain = ctx.createImageData(W, H);
  const rng = makeRng(20260807);
  for (let i = 0; i < grain.data.length; i += 4) {
    const v = rng();
    grain.data[i] = 255;
    grain.data[i + 1] = 255;
    grain.data[i + 2] = 255;
    grain.data[i + 3] = Math.round(14 + v * 28); // 颗粒更明显
  }
  const grainCanvas = document.createElement('canvas');
  grainCanvas.width = W;
  grainCanvas.height = H;
  grainCanvas.getContext('2d').putImageData(grain, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = 0.72;
  ctx.drawImage(grainCanvas, 0, 0);
  ctx.restore();

  return { canvas, width: W, height: H, worldBox: { xmin, xmax, ymin, ymax } };
}

// ===== 资源贴图（烘焙优先策略）=====
// 视觉思路：水彩晕染层改为预生成图片资源（scripts/bake-overlay-textures.mjs），
// 双端（Web / Android）共用同一份贴图，程序化 OffscreenCanvas 渲染仅作回退。
// manifest.json：periodId → 贴图文件；贴图宽高比与运行时 worldBox 一致，
// plane 几何/位置不动，只替换材质 map。加载失败静默保持程序化纹理。

const bakedManifestCache = { promise: null };

function getBakedManifest() {
  if (!bakedManifestCache.promise) {
    bakedManifestCache.promise = fetch('./textures/overlay/manifest.json', { cache: 'force-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return bakedManifestCache.promise;
}

/**
 * 资源贴图异步替换 wash 材质 map。时期切换后旧 mesh 已被 dispose，
 * 此时回调直接丢弃（替换旧纹理无害：新纹理随 mesh 一起被 GC 回收）。
 */
function applyBakedWatercolor(washMesh, geojson) {
  if (!washMesh || !washMesh.material) return;
  const periodId = geojson?.properties?._periodId;
  if (!periodId) return;
  getBakedManifest().then((manifest) => {
    const file = manifest?.byPeriod?.[periodId];
    if (!file) return;
    new THREE.TextureLoader().load(
      `./textures/overlay/${file}`,
      (texture) => {
        if (!washMesh.material) return;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        washMesh.material.map = texture;
        washMesh.material.needsUpdate = true;
      },
      undefined,
      () => { /* 加载失败：保持程序化纹理 */ },
    );
  });
}

/**
 * 政权名标签：放在政权几何质心，CSS2DObject 挂到 overlay group 内，
 * 随时期切换迁移、随「历史疆域」开关显隐，无需 main.js 额外处理。
 */
/** 计算 feature 投影后的高度（世界坐标 y 向上，正值表示向北）。 */
function computeFeatureHeight(feature) {
  let ymin = Infinity, ymax = -Infinity;
  normalizePolygons(feature.geometry).forEach((rings) => {
    rings.forEach((ring) => ring.forEach(([lng, lat]) => {
      const [, y] = project([lng, lat]);
      if (y < ymin) ymin = y;
      if (y > ymax) ymax = y;
    }));
  });
  return ymax - ymin || 1;
}

function buildRegimeLabel(feature, entity) {
  const props = feature.properties || {};
  let lngLat;
  // 优先用数据驱动的 labelCoord（人工标定的视觉中心）；缺省回落几何质心
  if (Array.isArray(props.labelCoord) && props.labelCoord.length === 2) {
    lngLat = props.labelCoord;
  } else {
    const centroid = geoCentroid(feature);
    if (!centroid || Number.isNaN(centroid[0])) return null;
    lngLat = centroid;
  }

  let [x, y] = project(lngLat);
  // 仅质心路径对「宋」做向北微调（labelCoord 已人工调好，不再叠加；
  // 世界坐标 y 轴向上，向北移动即 y 增大）
  if (!props.labelCoord && entity === '宋') {
    y += computeFeatureHeight(feature) * 0.08;
  }

  const el = document.createElement('div');
  el.className = props.labelMajor ? 'regime-label major' : 'regime-label';
  el.textContent = entity;
  const obj = new CSS2DObject(el);
  obj.position.set(x, y, 7.2);
  return obj;
}

/**
 * 构建朝代疆域水墨晕染叠加层。
 * @param {object} geojson FeatureCollection
 * @returns {{ group: THREE.Group, update: (year:number)=>void }}
 */
/**
 * 地点类要素 kind 白名单（与 server/routes/overlay.js 的 PLACE_KINDS 一致）。
 * 都城/战场/书院等点位在 overlay 响应顶层 properties.places 中透传，
 * 也允许直接出现在 features 里（kind 命中白名单）。
 */
const PLACE_KINDS = ['capital', 'battlefield', 'academy'];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function auxiliaryItems(geojson, kind, featureKinds = null) {
  const props = geojson?.properties || {};
  const values = asArray(props[kind]);
  const wanted = featureKinds || [kind.slice(0, -1)];
  const features = asArray(geojson?.features).filter((f) => wanted.includes(f?.properties?.kind));
  const items = values.length ? values : features.map((f) => ({ ...f.properties, geometry: f.geometry }));
  return items;
}

function itemCoord(item) {
  if (Array.isArray(item.coord)) return item.coord;
  const geometry = item.geometry;
  if (geometry?.type === 'Point') return geometry.coordinates;
  return null;
}

function itemPath(item) {
  if (Array.isArray(item.path)) return item.path;
  const geometry = item.geometry;
  if (geometry?.type === 'LineString') return geometry.coordinates;
  return null;
}

/**
 * LOD 档位准入（docs/requirements/zoom-lod-requirements.md §4.2 矩阵，与 Android LodLevel.kt 同源）：
 * tier 0=L0 全国（s≥0.40）/ 1=L1 区域 / 2=L2 省域 / 3=L3 州府级。
 * - 政权：主叙事全档，次要 L1+
 * - 城市/治所：rank1 全档，rank2 L1+，rank3 L2+，rank4+ L3
 * - 山脉：rank≤2 全档，rank3 L1+
 * - 河流名：rank1 全档，rank2 L1+，rank3 L2+
 * - 地点：rank1 全档，rank2 L1+
 */
function tierAdmits(item, tier, isMajor = false) {
  if (!item) return true;
  const kind = item.kind;
  const rank = Number(item.rank || 0);
  switch (kind) {
    case 'regime': return isMajor ? true : tier >= 1;
    case 'city':
    case 'prefecture-seat':
      if (rank <= 1) return true;
      if (rank === 2) return tier >= 1;
      if (rank === 3) return tier >= 2;
      return tier >= 3;
    case 'mountain': return rank <= 2 ? true : tier >= 1;
    case 'river':
      if (rank <= 1) return true;
      if (rank === 2) return tier >= 1;
      return tier >= 2;
    case 'capital':
    case 'battlefield':
    case 'academy':
      return rank <= 1 ? true : tier >= 1;
    default: return true;
  }
}

/**
 * LOD s 判据分母（docs/requirements/zoom-lod-requirements.md §4.1）：世界包围盒。
 * 与 Android boundsOf 同源（政权 + 河流 + 山脉，+ 6% 边距），避免河流/山脉
 * 超出政权 bbox 的时期（tang-800 天山、松花江）双端档位偏差。
 * 不包含城市/地点/治所（与 Android 严格一致）。
 */
function computeLodWorldBox(geojson) {
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  const acc = (lng, lat) => {
    if (lng < xmin) xmin = lng;
    if (lng > xmax) xmax = lng;
    if (lat < ymin) ymin = lat;
    if (lat > ymax) ymax = lat;
  };
  asArray(geojson?.features).forEach((f) => {
    normalizePolygons(f.geometry).forEach((rings) => {
      rings.forEach((ring) => ring.forEach(([lng, lat]) => acc(lng, lat)));
    });
  });
  ['rivers', 'mountains'].forEach((kind) => {
    asArray(geojson?.properties?.[kind]).forEach((item) => {
      const path = itemPath(item);
      if (path) path.forEach(([lng, lat]) => acc(lng, lat));
      else {
        const coord = itemCoord(item);
        if (coord) acc(coord[0], coord[1]);
      }
    });
  });
  if (!(isFinite(xmin) && isFinite(ymin) && xmax > xmin && ymax > ymin)) return null;
  const padX = (xmax - xmin) * 0.06;
  const padY = (ymax - ymin) * 0.06;
  return { xmin: xmin - padX, xmax: xmax + padX, ymin: ymin - padY, ymax: ymax + padY };
}

function isVisibleAt(item, year) {
  if (!item) return false;
  // visiblePeriods is the preferred year-window field. Keep `periods` as a
  // compatible alias, but do not treat period ids (for example `song-1111`)
  // as years when the overlay is updated between timeline ticks.
  const periods = Array.isArray(item.visiblePeriods) ? item.visiblePeriods
    : Array.isArray(item.periods) ? item.periods : null;
  if (periods?.length) {
    const matches = periods.some((period) => {
      if (typeof period === 'object' && period !== null) {
        return year >= Number(period.start ?? -Infinity) && year <= Number(period.end ?? Infinity);
      }
      const value = Number(period);
      return Number.isFinite(value) && value === Number(year);
    });
    if (!matches && periods.some((period) => typeof period === 'object' || Number.isFinite(Number(period)))) return false;
  }
  if (item.start !== undefined && year < Number(item.start)) return false;
  if (item.end !== undefined && year > Number(item.end)) return false;
  return true;
}

function buildAuxiliaryOverlay(geojson, kind, z, featureKinds = null) {
  const group = new THREE.Group();
  group.name = kind;
  group.position.z = z;
  const items = auxiliaryItems(geojson, kind, featureKinds);
  items.forEach((item) => {
    const path = kind === 'rivers' ? itemPath(item) : null;
    const coord = kind === 'mountains' || kind === 'cities' || kind === 'places' ? itemCoord(item) : null;
    if (kind === 'rivers' && (!path || path.length < 2)) return;
    if (kind !== 'rivers' && (!coord || coord.length < 2)) return;
    if (kind === 'rivers') {
      const points = path.map((lngLat) => { const [x, y] = project(lngLat); return new THREE.Vector3(x, y, 0); });
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({ color: 0x3a3428, transparent: true, opacity: 0.38 });
      const line = new THREE.Line(geometry, material);
      line.name = 'river';
      line.userData.overlayItem = item;
      group.add(line);
      return;
    }
    const el = document.createElement('div');
    el.className = `${kind.slice(0, -1)}-label`;
    el.dataset.kind = item.kind || kind.slice(0, -1);
    if (item.rank !== undefined) el.dataset.rank = String(item.rank);
    if (kind === 'cities' || kind === 'mountains' || kind === 'places') el.textContent = item.name || '';
    const obj = new CSS2DObject(el);
    obj.userData.overlayItem = item;
    const [x, y] = project(coord);
    obj.position.set(x, y, 0);
    group.add(obj);
  });
  return { group, items };
}

function getCachedWatercolor(geojson, renderConfig) {
  const config = getViewportConfig(renderConfig);
  const key = overlayCacheKey(geojson, config);
  const cached = watercolorCache.get(key);
  if (cached) {
    watercolorCache.delete(key);
    watercolorCache.set(key, cached);
    overlayCacheMetrics.hits += 1;
    recordOverlayMetric('cache-hit', { key, hitRate: getOverlayCacheStats().hitRate });
    return cached;
  }
  overlayCacheMetrics.misses += 1;
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const watercolor = buildWatercolorCanvas(geojson, config);
  if (!watercolor) return null;
  watercolorCache.set(key, watercolor);
  while (watercolorCache.size > OVERLAY_CACHE_MAX) {
    const oldestKey = watercolorCache.keys().next().value;
    watercolorCache.delete(oldestKey);
  }
  recordOverlayMetric('cache-miss', {
    key,
    durationMs: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - started,
    hitRate: getOverlayCacheStats().hitRate,
  });
  return watercolor;
}

/**
 * 州府边界层：独立 canvas 仅画淡墨描边（元丰九域志基准，Voronoi 近似面）。
 * 独立 plane（z=7.02，政权水彩 7 之上、河流 7.1 之下），由「州府边界」开关单独控制。
 * 复用 buildWatercolorCanvas 的包围盒与投影换算逻辑（同一 toPx 映射）。
 */
function buildPrefectureCanvas(geojson, renderConfig = {}) {
  const prefectures = Array.isArray(geojson?.properties?.prefectures) ? geojson.properties.prefectures : [];
  if (prefectures.length === 0) return null;

  // 与政权水彩同款包围盒（州府面被政权轮廓裁剪，bbox 一致；加 6% 边距）
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  geojson.features.forEach((feature) => {
    normalizePolygons(feature.geometry).forEach((rings) => {
      rings.forEach((ring) => ring.forEach(([lng, lat]) => {
        const [x, y] = project([lng, lat]);
        if (x < xmin) xmin = x;
        if (x > xmax) xmax = x;
        if (y < ymin) ymin = y;
        if (y > ymax) ymax = y;
      }));
    });
  });
  if (![xmin, xmax, ymin, ymax].every(Number.isFinite) || xmax <= xmin || ymax <= ymin) return null;
  const padX = (xmax - xmin) * 0.06 || 1;
  const padY = (ymax - ymin) * 0.06 || 1;
  xmin -= padX; xmax += padX;
  ymin -= padY; ymax += padY;

  const { dpr, viewW, lowEnd } = getViewportConfig(renderConfig);
  const W = Math.max(1024, Math.min(2048, Math.round(viewW * dpr * (lowEnd ? 0.6 : 1.2))));
  const H = Math.max(256, Math.round((W * (ymax - ymin)) / (xmax - xmin)));

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const toPx = (lng, lat) => {
    const [x, y] = project([lng, lat]);
    return [
      ((x - xmin) / (xmax - xmin)) * W,
      ((ymax - y) / (ymax - ymin)) * H,
    ];
  };

  prefectures.forEach((feature) => {
    const polygons = normalizePolygons(feature.geometry);
    polygons.forEach((rings) => {
      tracePath(ctx, rings, toPx);
      ctx.save();
      ctx.filter = 'none';
      ctx.lineWidth = 1.1;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(58, 52, 40, 0.36)';
      ctx.stroke();
      ctx.restore();
    });
  });

  return { canvas, width: W, height: H, worldBox: { xmin, xmax, ymin, ymax } };
}

/**
 * 州府治所标注层：CSS2D 标签（class prefecture-label，rank<=2 加 major）。
 * 点击回调 onPick（「州府详情面板」入口）——CSS2D 事件须 stopPropagation 防地图拾取冲突。
 */
function buildPrefectureSeats(geojson, onPick) {
  const group = new THREE.Group();
  group.name = 'prefectureSeats';
  group.position.z = 7.25;
  const items = auxiliaryItems(geojson, 'prefectureSeats', ['prefecture-seat']);
  items.forEach((item) => {
    const coord = itemCoord(item);
    if (!coord || coord.length < 2) return;
    const el = document.createElement('div');
    el.className = Number(item.rank) <= 2 ? 'prefecture-label major' : 'prefecture-label';
    el.dataset.kind = 'prefecture-seat';
    el.dataset.rank = String(item.rank ?? 9);
    el.textContent = item.name || '';
    if (typeof onPick === 'function') {
      el.style.pointerEvents = 'auto';
      el.style.cursor = 'pointer';
      el.title = `查看${item.name || ''}详情`;
      el.addEventListener('click', (e) => {
        e.stopPropagation(); // AGENTS.md CSS2D 事件约束
        onPick({
          name: item.name, rank: item.rank, coord,
          route: item.route, type: item.type, grade: item.grade,
        });
      });
    }
    const obj = new CSS2DObject(el);
    obj.userData.overlayItem = item;
    const [x, y] = project(coord);
    obj.position.set(x, y, 0);
    group.add(obj);
  });
  return { group, items };
}

export function buildTerritoryOverlay(geojson, renderConfig = {}) {
  const root = new THREE.Group();
  root.name = 'TerritoryOverlay';
  const rivers = buildAuxiliaryOverlay(geojson, 'rivers', 7.1);
  const mountains = buildAuxiliaryOverlay(geojson, 'mountains', 7.15);
  const cities = buildAuxiliaryOverlay(geojson, 'cities', 7.3);
  const places = buildAuxiliaryOverlay(geojson, 'places', 7.32, PLACE_KINDS);
  const prefectureSeats = buildPrefectureSeats(geojson, renderConfig.onPickPrefecture);
  root.add(rivers.group, mountains.group, cities.group, places.group, prefectureSeats.group);

  const watercolor = getCachedWatercolor(geojson, renderConfig);
  if (watercolor) {
    const { canvas, worldBox } = watercolor;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const box = worldBox;
    const planeGeo = new THREE.PlaneGeometry(box.xmax - box.xmin, box.ymax - box.ymin);
    const planeMat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide });
    const washMesh = new THREE.Mesh(planeGeo, planeMat);
    washMesh.name = 'watercolor-wash';
    washMesh.position.set((box.xmin + box.xmax) / 2, (box.ymin + box.ymax) / 2, 7);
    root.add(washMesh);
    // 资源贴图优先：烘焙/美术贴图异步加载后替换程序化纹理（失败静默回退）
    applyBakedWatercolor(washMesh, geojson);
  }

  // 州府边界描边 plane（独立开关 showPrefectures 控制；LOD/显隐经
  // currentPrefectureMesh() 按 name 动态查找，时期切换后仍生效）
  const prefectureCanvas = buildPrefectureCanvas(geojson, renderConfig);
  if (prefectureCanvas) {
    const { canvas, worldBox } = prefectureCanvas;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const box = worldBox;
    const planeGeo = new THREE.PlaneGeometry(box.xmax - box.xmin, box.ymax - box.ymin);
    const planeMat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide });
    const prefectureMesh = new THREE.Mesh(planeGeo, planeMat);
    prefectureMesh.name = 'prefecture-strokes';
    prefectureMesh.position.set((box.xmin + box.xmax) / 2, (box.ymin + box.ymax) / 2, 7.02);
    root.add(prefectureMesh);
  }

  const seen = new Set();
  asArray(geojson?.features).forEach((feature) => {
    const entity = (feature.properties || {}).entity;
    if (!entity || seen.has(entity)) return;
    seen.add(entity);
    const label = buildRegimeLabel(feature, entity);
    if (label) root.add(label);
  });

  // 辅助层显隐状态（settings 驱动）+ 时间窗口可见性（年份驱动）+ LOD 档位准入合并管理：
  // CSS2DRenderer 只检查 CSS2DObject.visible（不传播 group.visible），
  // 且 update(year) 每帧轮询——三处必须合并，否则设置开关被年份轮询覆盖。
  // 图层组动态按 name 从 root 查找：时期切换时新子组迁移进 root，闭包持有的旧组
  // 已被 dispose——动态定位保证切换后 settings/LOD/年份过滤仍然生效。
  // 显隐状态：rivers/mountains/cities/places = 辅助层开关，prefectures = 州府边界，
  // seats = 治所标注（Web 与 Android 拆双开关对齐）。
  const visibility = { rivers: true, mountains: true, cities: true, places: true, prefectures: true, seats: true };
  let lastYear = 0;
  let currentTier = 0; // 0=L0 全国 .. 3=L3 州府级（main.js 按 s 判据计算后写入）
  const LAYER_KEYS = { rivers: 'rivers', mountains: 'mountains', cities: 'cities', places: 'places', prefectureSeats: 'seats' };
  const layerGroups = () => root.children.filter((c) => LAYER_KEYS[c.name]);
  const currentPrefectureMesh = () => root.getObjectByName('prefecture-strokes') || null;
  // 州府描边 alpha 平滑（250ms easeOutCubic；L2 ×0.6 / L3 ×1.0 / 其余隐藏）
  let prefAlphaCurrent = 0;
  let prefAlphaTarget = 0;
  let prefAlphaRaf = 0;
  const startPrefAlphaTween = () => {
    cancelAnimationFrame(prefAlphaRaf);
    const from = prefAlphaCurrent;
    const start = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - start) / 250);
      prefAlphaCurrent = from + (prefAlphaTarget - from) * (1 - Math.pow(1 - k, 3));
      const mesh = currentPrefectureMesh();
      if (mesh && mesh.material) mesh.material.opacity = prefAlphaCurrent;
      if (k < 1) prefAlphaRaf = requestAnimationFrame(step);
    };
    prefAlphaRaf = requestAnimationFrame(step);
  };
  const applyVisibility = () => {
    layerGroups().forEach((group) => {
      const layerOn = visibility[LAYER_KEYS[group.name]];
      group.children.forEach((child) => {
        const item = child.userData.overlayItem;
        if (group.name === 'rivers') {
          // 河流几何按 rank 分级淡化（§4.2 矩阵）：rank2 L0 ×0.4、rank3 L1 ×0.4
          // （不整条隐藏，几何 alpha 渐变与 Android riverLodAlpha 一致）
          const rank = Number(item?.rank || 1);
          let alpha = 1;
          if (rank === 2 && currentTier === 0) alpha = 0.4;
          else if (rank >= 3) alpha = currentTier === 0 ? 0 : (currentTier === 1 ? 0.4 : 1);
          child.visible = layerOn && isVisibleAt(item, lastYear) && alpha > 0;
          if (child.material?.transparent) child.material.opacity = 0.38 * alpha;
          return;
        }
        child.visible = layerOn && isVisibleAt(item, lastYear) && tierAdmits(item, currentTier, false);
      });
      const anyItemVisible = group.children.some((c) => isVisibleAt(c.userData.overlayItem, lastYear));
      group.visible = anyItemVisible;
    });
    // 政权名标签（root 直接子级）：主叙事全档，次要 L1+
    root.children.forEach((child) => {
      if (child.isCSS2DObject && child.element?.classList.contains('regime-label')) {
        const major = child.element.classList.contains('major');
        child.visible = tierAdmits({ kind: 'regime' }, currentTier, major);
      }
    });
    // 州府边界描边 plane：L2 首现（alpha ×0.6）、L3 全显（×1.0）；opacity 走平滑值
    const mesh = currentPrefectureMesh();
    if (mesh) {
      mesh.visible = visibility.prefectures && currentTier >= 2;
      mesh.material.opacity = prefAlphaCurrent;
    }
  };
  const update = (year) => {
    lastYear = Number.isFinite(Number(year)) ? Number(year) : lastYear;
    applyVisibility();
  };
  lastYear = Number.isFinite(Number(geojson?.properties?.year)) ? Number(geojson.properties.year) : 0;
  applyVisibility();
  const setAuxiliaryVisibility = (settings) => {
    visibility.rivers = !!settings.showRivers;
    visibility.mountains = !!settings.showMountains;
    visibility.cities = !!settings.showCities;
    visibility.places = !!settings.showPlaces;
    visibility.prefectures = !!settings.showPrefectures; // 州府边界
    visibility.seats = !!settings.showSeats;             // 治所标注
    applyVisibility();
  };
  /**
   * LOD 档位切换：更新准入 + 州府描边 alpha 平滑过渡（250ms），
   * 标签层只对新准入（上档隐藏→本档可见）的元素做 250ms 淡入，
   * 跨档保持可见的标签不动（避免切换瞬间全标签闪烁）。
   */
  const setLod = (tier) => {
    if (tier === currentTier) return;
    // 记录切换前每个标签的可见性
    const prevSeen = new Map();
    root.traverse((child) => {
      if (child.isCSS2DObject && child.element) prevSeen.set(child.element, child.visible);
    });
    currentTier = tier;
    applyVisibility();
    // 州府描边 alpha 平滑（不跳变）
    prefAlphaTarget = tier >= 3 ? 1 : (tier === 2 ? 0.6 : 0);
    startPrefAlphaTween();
    // 只对新准入的标签做淡入
    const entering = [];
    root.traverse((child) => {
      if (!child.isCSS2DObject || !child.element) return;
      if (child.visible && !prevSeen.get(child.element)) entering.push(child.element);
    });
    if (entering.length === 0) return;
    entering.forEach((el) => {
      el.style.transition = 'opacity 250ms ease';
      el.style.opacity = '0';
    });
    requestAnimationFrame(() => {
      entering.forEach((el) => { el.style.opacity = '1'; });
      setTimeout(() => entering.forEach((el) => { el.style.transition = ''; }), 320);
    });
  };
  // EventBubbles consumes these as screen-space, fixed obstacles. Return only
  // currently visible city/regime labels so hidden historical items do not
  // reserve space for events. 州府治所 rank>3 不参与（避免小州标签过度占位）。
  // 动态按 name 查找图层组：时期切换后新组已迁移进 root，且 LOD 档位隐藏的
  // 标签（child.visible=false）自动不占位——「getCollisionObstacles 跟随可见集」。
  const getCollisionObstacles = () => {
    if (!root.visible) return [];
    const obstacles = [];
    const groupByName = (name) => root.children.find((c) => c.name === name) || null;
    const citiesGroup = groupByName('cities');
    const placesGroup = groupByName('places');
    const seatsGroup = groupByName('prefectureSeats');
    if (citiesGroup && citiesGroup.visible) {
      citiesGroup.children.forEach((child) => {
        if (child.visible && child.element && child.element.classList.contains('city-label')) obstacles.push(child.element);
      });
    }
    if (placesGroup && placesGroup.visible) {
      placesGroup.children.forEach((child) => {
        if (child.visible && child.element && child.element.classList.contains('place-label')) obstacles.push(child.element);
      });
    }
    if (seatsGroup && seatsGroup.visible) {
      seatsGroup.children.forEach((child) => {
        if (child.visible && child.element && child.element.classList.contains('prefecture-label')
          && Number(child.element.dataset.rank) <= 3) obstacles.push(child.element);
      });
    }
    root.children.forEach((child) => {
      if (child.visible && child.element && child.element.classList.contains('regime-label')) obstacles.push(child.element);
    });
    return obstacles;
  };
  return {
    group: root,
    update,
    setAuxiliaryVisibility,
    getCollisionObstacles,
    setLod,
    // LOD s 判据分母：全要素包围盒（政权+河流+山脉 + 6% pad，与 Android boundsOf 同源）
    worldBox: computeLodWorldBox(geojson),
  };
}

/**
 * 淡入动画：遍历 group 内所有半透明材质，从 0 渐变回各自原始 opacity。
 * 用于时期切换时新 overlay 的柔和呈现（水彩 plane + 旧版填充材质都适用）。
 * @param {THREE.Group} group
 * @param {number} [duration=400] 毫秒
 */
export function fadeIn(group, duration = 400) {
  const targets = [];
  group.traverse((n) => {
    if (n.material && Array.isArray(n.material)) {
      n.material.forEach((m) => {
        if (m.transparent) targets.push({ mat: m, base: m.opacity });
      });
    } else if (n.material && n.material.transparent) {
      targets.push({ mat: n.material, base: n.material.opacity });
    }
  });
  if (targets.length === 0) return;

  const t0 = performance.now();
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const step = () => {
    const t = Math.min(1, (performance.now() - t0) / duration);
    const k = easeOutCubic(t);
    targets.forEach(({ mat, base }) => {
      mat.opacity = base * k;
    });
    if (t < 1) requestAnimationFrame(step);
  };
  step();
}
