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
 *     washMesh（z=7）+ 政权名标签（z=7.2）
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
function buildWatercolorCanvas(geojson) {
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
  const padX = (xmax - xmin) * 0.06 || 1;
  const padY = (ymax - ymin) * 0.06 || 1;
  xmin -= padX; xmax += padX;
  ymin -= padY; ymax += padY;

  // 动态纹理尺寸：按视口 × dpr 决定（上限 2048），低端机（核数 ≤4）减半省内存
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const viewW = Math.max(800, window.innerWidth || 1280);
  const lowEnd = (navigator.hardwareConcurrency || 8) <= 4;
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

  // 2f. 淡墨河流（示意路径）：宽而淡的墨晕底 + 细实墨线，古地图水脉感。
  //     数据源 periods.json 的 rivers（黄河/长江简化路径，示意用）。
  const rivers = geojson.properties?.rivers || [];
  rivers.forEach((river) => {
    const pts = (river.path || []).map(([lng, lat]) => toPx(lng, lat));
    if (pts.length < 2) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.filter = 'blur(2px)';
    ctx.strokeStyle = 'rgba(58, 52, 40, 0.16)';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.filter = 'none';
    ctx.strokeStyle = 'rgba(58, 52, 40, 0.38)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  });

  // 2g. 山脉符号：古地图「三峰」式淡墨小三角（示意点位）
  const mountains = geojson.properties?.mountains || [];
  mountains.forEach((m) => {
    const coord = m.coord || [];
    if (coord.length < 2) return;
    const [x, y] = toPx(coord[0], coord[1]);
    const s = 8; // 单峰半宽（px，画布尺度；2048 画布缩到屏幕后约 3-4px）
    ctx.save();
    ctx.fillStyle = 'rgba(58, 52, 40, 0.5)';
    // 三峰并列：中间高、两侧低
    [
      { dx: -s * 1.6, dh: s * 0.9 },
      { dx: 0, dh: s * 1.4 },
      { dx: s * 1.6, dh: s * 0.9 },
    ].forEach(({ dx, dh }) => {
      ctx.beginPath();
      ctx.moveTo(x + dx - s * 0.6, y + s * 0.8);
      ctx.lineTo(x + dx, y - dh);
      ctx.lineTo(x + dx + s * 0.6, y + s * 0.8);
      ctx.closePath();
      ctx.fill();
    });
    ctx.restore();
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
export function buildTerritoryOverlay(geojson) {
  const root = new THREE.Group();
  root.name = 'TerritoryOverlay';

  // 水彩纹理 plane
  const { canvas, worldBox } = buildWatercolorCanvas(geojson);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const box = worldBox;
  const w = box.xmax - box.xmin;
  const h = box.ymax - box.ymin;
  const planeGeo = new THREE.PlaneGeometry(w, h);
  const planeMat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const washMesh = new THREE.Mesh(planeGeo, planeMat);
  washMesh.name = 'watercolor-wash';
  washMesh.castShadow = false;
  washMesh.receiveShadow = false;
  washMesh.position.set((box.xmin + box.xmax) / 2, (box.ymin + box.ymax) / 2, 7);
  root.add(washMesh);

  // 政权名标签（同一政权只标一次，取第一个 feature 的质心）
  const seen = new Set();
  geojson.features.forEach((feature) => {
    const entity = (feature.properties || {}).entity;
    if (!entity || seen.has(entity)) return;
    seen.add(entity);
    const label = buildRegimeLabel(feature, entity);
    if (label) root.add(label);
  });

  // update(year): 时期已在请求时确定，所有政权同时显示
  function update(_year) {
    // no-op
  }

  return { group: root, update };
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
