import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

import { buildChinaMap, fitProjection, project } from './map/ChinaMap.js';
import { Timeline } from './timeline/Timeline.js';
import { monthIndex } from './timeline/calc.js';
import { EventBubbles } from './events/EventBubbles.js';
import { EventLog } from './events/EventLog.js';
import { buildTerritoryOverlay, getOverlayCacheStats } from './map/TerritoryOverlay.js';
import { Legend } from './map/Legend.js';
import { getMap, getEvents, getMeta, getOverlay, getDynasties, getPlace, getPersons, getAllOverlay } from './api.js';
import { applyTheme, getTheme } from './theme.js';
import { loadSettings, saveSettings, SPEED_MAP, CATEGORIES } from './settings/store.js';
import { clearChildren } from './dom.js';
import { settingsFromParam } from './settings/transfer.js';
import { parseViewParams, viewToQuery, buildShareUrl, copyText } from './share.js';
import { buildEventCardSVG, eventSummary, captureMapImage, svgToPngBlob, copyPngToClipboard, downloadBlob } from './events/EventCard.js';
import { SettingsMenu } from './settings/SettingsMenu.js';
import { LOD } from './contract-tokens.js';
import './styles.css';

// 默认朝代。未来切换朝代只改这个常量 + 后端数据，地图/泡泡层无需改（AGENTS.md 扩展点）。
const DYNASTY_DEFAULT = 'song';
let currentDynasty = DYNASTY_DEFAULT;
const isAbortError = (err) => err && err.name === 'AbortError';

const container = document.getElementById('scene-container');
const loadingEl = document.getElementById('loading');

// 应用古典水墨·宣纸主题
applyTheme();
const theme = getTheme();

// —— three.js 基础三件套 ——
const scene = new THREE.Scene();
// 场景透明（alpha），让页面宣纸纹理透出为地图背景；不要设置 scene.background
scene.background = null;

const camera = new THREE.PerspectiveCamera(45, 1, 1, 5000);
camera.position.set(0, -650, 760);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0);  // 透明清屏
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

// 标签渲染器（事件泡泡），叠在 WebGL 之上
const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.left = '0';
labelRenderer.domElement.style.zIndex = '15';           // 高于时间轴(10)，让泡泡可被点到
labelRenderer.domElement.style.pointerEvents = 'none';  // 容器整体不拦事件，只有单个泡泡(.event-bubble)重新打开 pointer-events
container.appendChild(labelRenderer.domElement);

// 光照
scene.add(new THREE.AmbientLight(0xffffff, 0.65));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
dirLight.position.set(200, -400, 600);
scene.add(dirLight);

// —— LOD 档位（docs/requirements/zoom-lod-requirements.md §4.2，与 Android LodLevel.kt:nextLod 状态机同源）——
// 阈值与滞回数值来自 contract/tokens.json（双端唯一事实来源，本地不再手写一份）。
// s = 可见世界宽 / 世界包围盒宽；0=L0 全国 / 1=L1 区域 / 2=L2 省域 / 3=L3 州府级。
// 滞回（contract lod.hysteresis）：以「prev↔next 分界线」为判据（放大越过新档下限-滞回、
// 缩小越过原档下限+滞回），缩放临界抖动不反复换档。animate 循环每帧计算，变化时驱动 overlay.setLod。
const LOD_HYST = LOD.hysteresis;
const [L0_LOWER, L1_LOWER, L2_LOWER] = LOD.thresholds; // L0/L1/L2 档下界（降序）
const lodState = { overlay: null, tier: 0 };
// 状态机式换挡（与 Android nextLod 逐分支一致）：输入「当前档位 + 实时 s」，输出下一档位。
function nextLodTier(prev, s) {
  switch (prev) {
    case 0: return s < L0_LOWER - LOD_HYST ? 1 : 0;
    case 1:
      if (s < L1_LOWER - LOD_HYST) return 2;
      if (s >= L0_LOWER + LOD_HYST) return 0;
      return 1;
    case 2:
      if (s < L2_LOWER - LOD_HYST) return 3;
      if (s >= L1_LOWER + LOD_HYST) return 1;
      return 2;
    default: return s >= L2_LOWER + LOD_HYST ? 2 : 3;
  }
}
function updateLod() {
  const ov = lodState.overlay;
  if (!ov || !ov.worldBox || !ov.setLod) return;
  const box = ov.worldBox;
  const worldWidth = box.xmax - box.xmin;
  if (!(worldWidth > 0)) return;
  // 相机到目标距离（z=0 平面处）推算可见世界宽：半高 = d·tan(fov/2)，半宽 = 半高·aspect
  const dist = camera.position.distanceTo(controls.target) || 1;
  const halfH = dist * Math.tan((camera.fov * Math.PI) / 180 / 2);
  const halfW = halfH * camera.aspect;
  const s = (2 * halfW) / worldWidth;
  const next = nextLodTier(lodState.tier, s);
  if (next !== lodState.tier) {
    lodState.tier = next;
    ov.setLod(next);
  }
}

const controls = new OrbitControls(camera, renderer.domElement);
controls.addEventListener('change', () => bubblesRef?.markLeadersDirty());
controls.enableDamping = true;
controls.dampingFactor = 0.08;
// 参考图是平面古地图：锁定旋转，只保留滚轮缩放 + 拖动平移
controls.enableRotate = false;
controls.minDistance = 350;
controls.maxDistance = 4200;
controls.target.set(0, 0, 0);

// 详情面板
const detailPanel = document.getElementById('detail-panel');

// 大年份水印
const watermark = document.getElementById('year-watermark');

// 相机聚焦补间：无新依赖，复用 animate 循环。
// OrbitControls 无输入时 sphericalDelta 恒为 0，update() 会保留外部设置的相机位置。
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
let camTween = null;

// 事件泡泡实例（loadDynasty 内创建），供 animate 循环同步指向线
let bubblesRef = null;

// 世界坐标 → 屏幕 CSS 像素（事件泡泡指向线用；与 CSS2DRenderer 同款换算）
const _v3 = new THREE.Vector3();
function worldToScreen(x, y, z) {
  _v3.set(x, y, z).project(camera);
  const w = container.clientWidth / 2;
  const h = container.clientHeight / 2;
  return [_v3.x * w + w, -_v3.y * h + h];
}

/** 平滑聚焦到某经纬度：目标设为事件点，相机沿原视角方向适度拉近。 */
function focusOn(coord, zoom = 0.62) {
  const [tx, ty] = project(coord);
  const dx = camera.position.x - controls.target.x;
  const dy = camera.position.y - controls.target.y;
  const dz = camera.position.z - controls.target.z;
  camTween = {
    t: 0,
    from: {
      px: camera.position.x, py: camera.position.y, pz: camera.position.z,
      tx: controls.target.x, ty: controls.target.y, tz: controls.target.z,
    },
    to: {
      px: tx + dx * zoom, py: ty + dy * zoom, pz: dz * zoom,
      tx, ty, tz: 0,
    },
  };
}

// —— 取景构图（可见带适配）——
// 旧版只按包围球适配（纵向 FOV），竖屏必然「下半屏才见地图、上半空宣纸」。
// 新版以「顶栏与时间轴卡之间的带状区域」为画框做宽高双向适配；竖屏再放大
// （东西缘允许出屏）并以主政权 bbox 水平锚定——与 Android MapRenderer.resetCamera
// 的 CAMERA_FIT_BOOST + anchorBounds 思路对齐（数值同源）。
const VIEW_INSETS = { top: 60, bottom: 106 }; // 顶栏 52px+8 / 时间轴卡 ~90px+16
const PORTRAIT_FIT_BOOST = 1.4;              // 竖屏放大倍率（Android CAMERA_FIT_BOOST 同值）

/**
 * 取景构图：以 frameBase 的世界包围盒重设相机距离与视野中心。
 * - scale：距离倍率（越大地图越小、留白越多）。默认 0.98 是全图构图；
 *   详情面板打开时用 1.28（地图缩小给右侧面板让位）。
 * - shiftX：水平偏移比例（占视口宽度），正数右移、负数左移；详情打开时 -0.16。
 * 相机相对视角方向不变（正俯 + 前倾），保证地图永远是「北朝上」平面视图。
 */
let frameBase = null; // { center, worldW, worldH, anchorBox } 首次标定后固定，供缩放/平移后回归
function frameMap({ scale = 0.98, shiftX = 0 } = {}) {
  if (!frameBase) return;
  const { center, worldW, worldH, anchorBox } = frameBase;
  const h = Math.max(1, container.clientHeight);
  const bandH = Math.max(1, h - VIEW_INSETS.top - VIEW_INSETS.bottom);
  const tanHalf = Math.tan((camera.fov * Math.PI) / 180 / 2);
  // 宽向 fit（全图入画）与高向 fit（填满可见带）取严者
  let d = Math.max(
    worldW / (2 * tanHalf * camera.aspect),
    (worldH * h) / (2 * bandH * tanHalf),
  );
  if (camera.aspect < 1) {
    // 竖屏放大：让地图主体占满画面（东西缘允许出屏），Android CAMERA_FIT_BOOST 同值
    d /= PORTRAIT_FIT_BOOST;
  }
  d *= scale;
  const halfH = d * tanHalf;
  const halfW = halfH * camera.aspect;
  let shift = shiftX * 2 * halfW;
  if (camera.aspect < 1 && anchorBox) {
    // 水平钳制：主政权 bbox 不出画（主政权比画幅还宽时退化为居中锚定）
    const shiftMin = anchorBox.xmax - halfW - center.x; // 保住主政权右缘的最小偏移
    const shiftMax = anchorBox.xmin + halfW - center.x; // 保住主政权左缘的最大偏移
    shift = shiftMin > shiftMax
      ? (anchorBox.xmin + anchorBox.xmax) / 2 - center.x
      : Math.min(shiftMax, Math.max(shiftMin, shift));
  }
  // 垂直居中于可见带：带中心高于屏幕中心 (bottom-top)/2 像素，目标点相应下移同等世界量，
  // 使地图中心恰好落在「顶栏 ↔ 时间轴卡」的带中心（旧版写死 -0.3d 视角导致地图沉底）
  const bandCenterShiftY = ((VIEW_INSETS.bottom - VIEW_INSETS.top) / h) * halfH;
  const ty = center.y - bandCenterShiftY;
  const tweenTo = {
    px: center.x + shift, py: ty - d * 0.3, pz: center.z + d * 0.95,
    tx: center.x + shift, ty, tz: center.z,
  };
  camTween = {
    t: 0,
    from: {
      px: camera.position.x, py: camera.position.y, pz: camera.position.z,
      tx: controls.target.x, ty: controls.target.y, tz: controls.target.z,
    },
    to: tweenTo,
  };
}

/**
 * 主政权（当前朝代本体，如「宋」）的世界包围盒：竖屏放大取景时的水平锚定，
 * 防止放大后兴趣区域（本朝疆域）出屏。等价 Android anchorBoundsOf。
 */
function computeMainRegimeBox(geojson, mainEntity) {
  if (!mainEntity) return null;
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  let hit = false;
  const acc = (ring) => ring.forEach(([lng, lat]) => {
    const [x, y] = project([lng, lat]);
    if (x < xmin) xmin = x;
    if (x > xmax) xmax = x;
    if (y < ymin) ymin = y;
    if (y > ymax) ymax = y;
    hit = true;
  });
  (geojson?.features || []).forEach((f) => {
    if (!(f?.properties?.entity || '').includes(mainEntity)) return;
    const g = f.geometry;
    if (g?.type === 'Polygon') g.coordinates.forEach(acc);
    else if (g?.type === 'MultiPolygon') g.coordinates.forEach((poly) => poly.forEach(acc));
  });
  return hit && xmax > xmin && ymax > ymin ? { xmin, xmax, ymin, ymax } : null;
}

// 自适应大小
function resize() {
  const w = container.clientWidth;
  const h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  bubblesRef?.markLeadersDirty();
  renderer.setSize(w, h);
  labelRenderer.setSize(w, h);
}
window.addEventListener('resize', resize);
resize();

// 渲染循环
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  updateLod(); // LOD 档位（s 判据 + 滞回），变化时驱动 overlay.setLod
  if (camTween) {
    camTween.t = Math.min(1, camTween.t + 0.03);
    const t = easeInOutCubic(camTween.t);
    const a = camTween.from;
    const b = camTween.to;
    camera.position.set(lerp(a.px, b.px, t), lerp(a.py, b.py, t), lerp(a.pz, b.pz, t));
    controls.target.set(lerp(a.tx, b.tx, t), lerp(a.ty, b.ty, t), lerp(a.tz, b.tz, t));
    if (camTween.t >= 1) camTween = null;
  }
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  // 指向线每帧跟随（泡泡被推挤后，线从事件真实位置连到泡泡）
  if (bubblesRef) bubblesRef.syncLeaders();
}
animate();

// —— 从后端加载数据并装配 ——
// 用 async IIFE 而非顶层 await，避免老 target 不支持（AGENTS.md 已知坑）
(async () => {
  try {
    // 分享链接里的设置优先于本地保存：先落库再读取，保证后续所有读取点一致
    const urlSettings = settingsFromParam(new URLSearchParams(location.search).get('s'));
    if (urlSettings) saveSettings(urlSettings);
    const settings = loadSettings();
    const detailMask = document.getElementById('detail-mask');
    const eraBanner = document.getElementById('era-banner');
    const logBadge = document.getElementById('log-badge');
    const tlRange = document.querySelector('.tl-range');

    // —— 跨朝代状态（loadDynasty 反复更新）——
    let periodMeta = null;    // /api/meta 返回（含 periods）
    let currentEvents = [];   // 当前朝代事件
    let timeline = null;

    // e2e 测试钩子（Playwright 经 window.setYearForTest/pauseForTest 驱动时间轴；
    // 生产环境无人调用，无副作用）
    window.setYearForTest = (y) => { if (timeline) timeline.setYear(y); };
    window.pauseForTest = () => { if (timeline) timeline.pause(); };
    let bubbles = null;
    let legend = null;
    let eventLog = null;
    let mapGroup = null;
    let territoryOverlay = null;
    let prevYear = 0;
    let prevMonth = 1;
    let currentPeriod = '';
    let overlayLoadingPeriod = '';
    let overlayEmpty = false;
    let dynastyRequestSeq = 0;
    let overlayRequestSeq = 0;
    let dynastyController = null;
    let overlayController = null;

    // 深链接路由状态：当前详情面板打开的事件（URL ?event= 与详情同步）
    let detailOpenEvent = null;
    // 当前 overlay 原始数据（含 properties.prefectures 州府详情；时期切换时更新）
    let currentOverlayData = null;

    /** 构建视图 URL（相对路径，供 history pushState/replaceState 使用）。 */
    function buildViewHref(view) {
      return `${location.pathname}${viewToQuery(view)}`;
    }


    // 按年份确定显示哪个时期的疆域：边界由后端 meta.periods 给出，前端不写死
    function getPeriodForYear(year) {
      if (!periodMeta || !periodMeta.periods || periodMeta.periods.length === 0) return null;
      const p = periodMeta.periods.find((x) => year >= x.start && year <= x.end);
      return p ? p.id : null;
    }
    function periodLabel(id) {
      const p = periodMeta && periodMeta.periods && periodMeta.periods.find((x) => x.id === id);
      return p ? p.label : id;
    }

    /** 清空 overlay group 并释放资源（时期切换/朝代切换共用） */
    function clearOverlayGroup(group) {
      while (group.children.length > 0) {
        const child = group.children[0];
        child.traverse((node) => {
          // CSS2DRenderer 缓存不会自动清理已从 scene 移除对象的 DOM 元素，
          // 需手动摘除，否则旧时期政权名标签会残留在页面上
          if (node.isCSS2DObject && node.element && node.element.parentNode) {
            node.element.parentNode.removeChild(node.element);
          }
          // 水墨纹理随材质一起释放（CanvasTexture 不自动跟随 material.dispose）
          if (node.material && node.material.map) node.material.map.dispose();
          if (node.geometry) node.geometry.dispose();
          if (node.material) node.material.dispose();
        });
        group.remove(child);
      }
    }

    // —— overlay 交叉淡入（时期/全时期切换共用）——
    // 旧实现「清旧建新 + fadeIn」会先把画面打回宣纸底再淡入，疆域跳变生硬；
    // 新实现保留旧 overlay 作底衬，新 overlay 在其上 400ms 淡入、旧 overlay 同步
    // 淡出后整组释放。CSS2D 标签（政权名/城市/治所）不随材质透明度走，
    // 单独用 element.style.opacity 补间（transform 归 CSS2DRenderer，互不冲突）。
    let activeOverlayFade = null;

    function collectFadeTargets(group) {
      const mats = [];
      const els = [];
      group.traverse((n) => {
        if (n.isCSS2DObject && n.element) els.push(n.element);
        if (!n.material) return;
        if (Array.isArray(n.material)) n.material.forEach((m) => { if (m.transparent) mats.push(m); });
        else if (n.material.transparent) mats.push(n.material);
      });
      return { mats, els };
    }

    function crossfadeOverlay(oldOv, newOv, duration = 400) {
      const oldT = collectFadeTargets(oldOv.group);
      const newT = collectFadeTargets(newOv.group);
      const oldBases = oldT.mats.map((m) => m.opacity);
      const newBases = newT.mats.map((m) => m.opacity);
      // 新 group 置顶：各平面材质均 depthWrite:false，按 renderOrder 后绘制即可覆盖，避免同 z 面闪面
      newOv.group.traverse((n) => { if (n.isMesh) n.renderOrder = 10; });
      newT.mats.forEach((m) => { m.opacity = 0; });
      newT.els.forEach((el) => { el.style.transition = `opacity ${duration}ms ease`; el.style.opacity = '0'; });
      oldT.els.forEach((el) => { el.style.transition = `opacity ${duration}ms ease`; el.style.opacity = '0'; });
      requestAnimationFrame(() => newT.els.forEach((el) => { el.style.opacity = '1'; }));
      const t0 = performance.now();
      const fade = { raf: 0, oldOverlay: oldOv };
      activeOverlayFade = fade;
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / duration);
        const e = 1 - Math.pow(1 - k, 3);
        newT.mats.forEach((m, i) => { m.opacity = newBases[i] * e; });
        oldT.mats.forEach((m, i) => { m.opacity = oldBases[i] * (1 - e); });
        if (k < 1) { fade.raf = requestAnimationFrame(step); return; }
        newOv.group.traverse((n) => { if (n.isMesh) n.renderOrder = 0; });
        newT.mats.forEach((m, i) => { m.opacity = newBases[i]; });
        newT.els.forEach((el) => { el.style.transition = ''; });
        if (activeOverlayFade === fade) activeOverlayFade = null;
        clearOverlayGroup(oldOv.group);
      };
      step();
    }

    /**
     * 安装新 overlay 并与旧 overlay 交叉淡入（替换旧「清旧建新」路径）。
     * 直接用新对象替换 territoryOverlay（所有引用点均动态读取该变量），
     * LOD 驱动随之切到新对象（worldBox 即时生效，不再 patch 旧闭包）。
     */
    function installOverlayWithCrossfade(freshOverlay, { period, layerConfig = 'default' } = {}) {
      const oldOverlay = territoryOverlay;
      // 上一轮淡入未完成就再次切换：立即终止补间并释放上一组底衬
      if (activeOverlayFade) {
        cancelAnimationFrame(activeOverlayFade.raf);
        clearOverlayGroup(activeOverlayFade.oldOverlay.group);
        activeOverlayFade = null;
      }
      const newOverlay = buildTerritoryOverlay(freshOverlay, {
        period, layerConfig,
        onPickPrefecture: (pref) => showPlaceDetail(pref),
      });
      newOverlay.group.visible = settings.showOverlay;
      newOverlay.setAuxiliaryVisibility?.(settings);
      scene.add(newOverlay.group);
      territoryOverlay = newOverlay;
      lodState.overlay = newOverlay;
      currentOverlayData = freshOverlay;
      if (oldOverlay) crossfadeOverlay(oldOverlay, newOverlay);
      legend.update(freshOverlay);
      overlayEmpty = !Array.isArray(freshOverlay?.features) || freshOverlay.features.length === 0;
      loadingEl.textContent = overlayEmpty ? '当前时期暂无疆域数据，仍可查看事件与时间轴' : '';
      loadingEl.classList.toggle('hidden', !overlayEmpty);
      // 新 overlay 的政权标签已插入 DOM，重排泡泡避开标签（避免盖住政权名）
      setTimeout(() => bubbles?.resolve(), 100);
    }

    // 详情面板逻辑：打开详情时暂停播放（避免读详情时年份继续跑、聚焦的泡泡过期），
    // 关闭时恢复打开前的播放状态。timeline/bubbles 在 loadDynasty 中创建，闭包内运行时访问。
    // 详情打开时加半透明遮罩并锁死地图交互（读详情时防止误触旋转/拾取）。
    let resumePlayback = false;
    let detailReturnFocus = null;
    // 详情面板代际计数器：每次打开/关闭详情面板自增。异步追加（如时空库详情）返回时
    // 校验代际，防止「先打开 A 后打开 B」时 A 的迟到响应污染 B 的面板。
    let detailPanelGen = 0;
    function showDetail(ev) {
      detailReturnFocus = document.activeElement;
      resumePlayback = timeline.playing;
      timeline.pause();
      // 分类名（设计图详情面板的「时代格局/军事·领土」徽章）；无匹配时不显示
      const catLabel = (CATEGORIES.find((c) => c.id === ev.category) || {}).label || '';
      // 时期名（如「北宋极盛」）：由 meta.periods 数据驱动，补充事件的时代背景
      const periodName = periodLabel(getPeriodForYear(ev.year));
      // 相关事件：按时间排序后取当前事件前后各一条（排除自身）
      const sorted = currentEvents.slice().sort(
        (a, b) => monthIndex(a.year, a.month || 1) - monthIndex(b.year, b.month || 1)
      );
      const idx = sorted.findIndex((e) => e.id === ev.id);
      const related = [];
      if (idx > 0) related.push(sorted[idx - 1]);
      if (idx >= 0 && idx < sorted.length - 1) related.push(sorted[idx + 1]);
      clearChildren(detailPanel);
      detailPanelGen++;
      const addText = (tag, className, text, parent = detailPanel) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        node.textContent = text;
        parent.appendChild(node);
        return node;
      };
      const closeButton = addText('button', 'detail-close', '×');
      closeButton.type = 'button';
      closeButton.title = '关闭详情';
      closeButton.setAttribute('aria-label', '关闭详情');
      const head = document.createElement('div');
      head.className = 'detail-head';
      addText('span', 'detail-year', `${ev.year}年${ev.month || 1}月`, head);
      if (catLabel) addText('span', 'detail-cat', catLabel, head);
      if (periodName) addText('span', 'detail-cat', periodName, head);
      // 分享：把当前视图（朝代/年份/事件）写入 URL 并复制，收件人可直接打开该事件
      const shareBtn = addText('button', 'detail-share', '分享', head);
      shareBtn.type = 'button';
      shareBtn.title = '复制分享链接';
      shareBtn.setAttribute('aria-label', '复制分享链接');
      shareBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const url = buildShareUrl({ dynasty: currentDynasty, year: ev.year, event: ev.id });
        const ok = await copyText(url);
        shareBtn.textContent = ok ? '已复制' : '复制失败';
        shareBtn.classList.toggle('detail-share-ok', ok);
        setTimeout(() => {
          shareBtn.textContent = '分享';
          shareBtn.classList.remove('detail-share-ok');
        }, 1600);
      });
      // 分享卡片（P3）：地图截图 + 年份水印 + 事件简述 → PNG 下载（并尝试复制到剪贴板）
      const cardBtn = addText('button', 'detail-share', '卡片', head);
      cardBtn.type = 'button';
      cardBtn.title = '生成并下载分享卡片图';
      cardBtn.setAttribute('aria-label', '生成并下载分享卡片图');
      cardBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        cardBtn.textContent = '生成中';
        try {
          const mapImage = captureMapImage(renderer, scene, camera);
          const svgText = buildEventCardSVG({
            year: ev.year,
            title: ev.title || ev.short || '未命名事件',
            place: ev.place || '',
            summary: eventSummary(ev.detail || ''),
            dynastyName: periodMeta?.name || '',
            mapDataUrl: mapImage || '',
            footnote: `中国历史地图 · ${location.host}${viewToQuery({ dynasty: currentDynasty, year: ev.year, event: ev.id })}`,
          });
          const blob = await svgToPngBlob(svgText);
          downloadBlob(blob, `historymap-${currentDynasty}-${ev.year}.png`);
          const copied = await copyPngToClipboard(blob);
          cardBtn.textContent = copied ? '已下载·复制' : '已下载';
        } catch (err) {
          console.error('[card] 卡片生成失败:', err);
          cardBtn.textContent = '失败';
        }
        setTimeout(() => { cardBtn.textContent = '卡片'; }, 1800);
      });
      detailPanel.appendChild(head);
      const detailTitle = addText('h2', '', ev.title || '未命名事件');
      detailTitle.id = 'detail-title';
      if (ev.place) addText('div', 'detail-meta', ev.place);
      // 相关人物（P1 人物视角）：点击徽章直接进入该人物的事件轨迹过滤
      if (Array.isArray(ev.relatedPersons) && ev.relatedPersons.length > 0) {
        const chips = document.createElement('div');
        chips.className = 'detail-person-chips';
        ev.relatedPersons.forEach((p) => {
          const chip = addText('button', 'detail-person-chip', p.name, chips);
          chip.type = 'button';
          const roleText = p.role === 'lead' ? '主导' : '牵连';
          chip.title = p.title ? `${p.title}（${roleText}）` : roleText;
          if (p.role === 'lead') chip.classList.add('lead');
          chip.addEventListener('click', (e) => {
            e.stopPropagation();
            settingsMenu?.selectPerson(p.id);
            closeDetail();
          });
        });
        detailPanel.appendChild(chips);
      }
      addText('div', 'detail-divider', '');
      addText('p', 'detail-text', ev.detail || '暂无详情');
      if (ev.impact) {
        const impact = document.createElement('div');
        impact.className = 'detail-impact';
        addText('div', 'detail-impact-title', '影 响', impact);
        addText('p', '', ev.impact, impact);
        detailPanel.appendChild(impact);
      }
      // 资料来源（P4 考据感）：古籍出处 + 置信度 + 许可（不依赖时空库，随事件数据走）
      if (ev.source) {
        const source = document.createElement('div');
        source.className = 'detail-impact';
        const confText = ev.confidence === 'high' ? '史有明文' : '综合整理';
        addText('div', 'detail-impact-title', '资料来源', source);
        addText('p', '', `${ev.source} · 置信度：${confText} · ${ev.license}`, source);
        detailPanel.appendChild(source);
      }
      if (related.length) {
        const relatedPanel = document.createElement('div');
        relatedPanel.className = 'detail-related';
        addText('div', 'detail-related-title', '相关事件', relatedPanel);
        const relatedList = document.createElement('div');
        relatedList.className = 'detail-related-list';
        related.forEach((r) => {
          const button = addText('button', 'detail-related-item', `${r.year}年${r.month || 1}月 · ${r.short || '未命名事件'}`, relatedList);
          button.type = 'button';
          button.dataset.id = String(r.id);
        });
        relatedPanel.appendChild(relatedList);
        detailPanel.appendChild(relatedPanel);
      }
      const art = document.createElement('img');
      art.src = './ink-landscape.png';
      art.className = 'detail-ink-art';
      art.alt = '水墨山水';
      detailPanel.appendChild(art);
      // 相关事件点击：跳到该事件并刷新详情
      detailPanel.querySelectorAll('.detail-related-item').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const target = currentEvents.find((x) => x.id === Number(btn.dataset.id));
          if (target) jumpToEvent(target);
        });
      });
      detailPanel.classList.remove('hidden');
      detailPanel.setAttribute('aria-hidden', 'false');
      detailMask.classList.remove('hidden');
      detailMask.setAttribute('aria-hidden', 'false');
      controls.enabled = false;
      detailPanel.querySelector('.detail-close').addEventListener('click', (e) => {
        e.stopPropagation();
        closeDetail();
      });
      closeButton.focus();
      bubbles.highlight(ev);
      // 打开详情：地图缩小 + 左移，给右侧面板让位（构图级重取景）
      frameMap({ scale: 1.28, shiftX: -0.16 });
      // 点击事件：相机平滑聚焦到事件位置
      focusOn(ev.coord);
      // 路由：当前视图写入 URL（前进/后退可恢复，刷新可深链接直达）
      detailOpenEvent = ev;
      history.pushState({ view: 'event' }, '', buildViewHref({ dynasty: currentDynasty, year: ev.year, event: ev.id }));
    }

    function closeDetail() {
      detailPanelGen++;
      detailPanel.classList.add('hidden');
      detailPanel.setAttribute('aria-hidden', 'true');
      detailMask.classList.add('hidden');
      detailMask.setAttribute('aria-hidden', 'true');
      controls.enabled = true;
      bubbles.highlight(null);
      // 关闭详情：回到全图构图（与初始构图一致）
      frameMap({ scale: 0.98, shiftX: 0.02 });
      if (resumePlayback) timeline.play();
      resumePlayback = false;
      // 路由：移除 URL 中的事件参数（replaceState 不新增历史记录）
      if (detailOpenEvent) {
        detailOpenEvent = null;
        history.replaceState({ view: 'map' }, '', buildViewHref({ dynasty: currentDynasty, year: timeline.year }));
      }
      if (detailReturnFocus && typeof detailReturnFocus.focus === 'function') {
        detailReturnFocus.focus();
      }
      detailReturnFocus = null;
    }

    // 点击事件流/刻度点：先跳到事件所在年月，再打开详情
    const jumpToEvent = (ev) => {
      timeline.setTime(ev.year, ev.month || 1);
      showDetail(ev);
    };

    /**
     * 州府详情面板：点击州府治所标注打开（元丰九域志基准——户口/土贡/属县 +
     * 舆地广记沿革 + 相关事件）。复用 showDetail 的暂停/遮罩/取景框架，
     * 关闭统一走 closeDetail（Esc/遮罩/空白点击）。
     * @param {{name:string, coord:[number,number], rank?:number}} pref
     */
    function showPlaceDetail(pref) {
      detailReturnFocus = document.activeElement;
      resumePlayback = timeline.playing;
      timeline.pause();
      // 从 overlay 原始数据找完整州府信息（prefecture 面 feature 的属性）
      const full = (currentOverlayData?.properties?.prefectures || [])
        .find((f) => f.properties.name === pref.name);
      const props = full?.properties || {};
      const hh = props.households || {};
      const total = (hh.main || 0) + (hh.guest || 0);
      // 相关事件：事件 place 与州府名匹配（place 前缀如「澶州（今濮阳）」）
      const related = currentEvents.filter((e) => {
        if (!e.place) return false;
        const prefix = e.place.split(/[（(]/)[0].trim();
        if (!prefix) return false;
        return prefix.includes(pref.name) || (prefix.length >= 2 && pref.name.includes(prefix.slice(0, 2)));
      }).slice(0, 6);

      clearChildren(detailPanel);
      detailPanelGen++;
      const addText = (tag, className, text, parent = detailPanel) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        node.textContent = text;
        parent.appendChild(node);
        return node;
      };
      const closeButton = addText('button', 'detail-close', '×');
      closeButton.type = 'button';
      closeButton.title = '关闭详情';
      closeButton.setAttribute('aria-label', '关闭详情');
      const head = document.createElement('div');
      head.className = 'detail-head';
      addText('span', 'detail-year', `${props.route || ''} · ${props.type || '州'}`, head);
      if (props.grade) addText('span', 'detail-cat', props.grade, head);
      detailPanel.appendChild(head);
      const detailTitle = addText('h2', '', `${pref.name} · 府州详情`);
      detailTitle.id = 'detail-title';
      if (props.seat) addText('div', 'detail-meta', `治所 ${props.seat}${props.seatCoord ? `（${props.seatCoord[1].toFixed(2)}°N, ${props.seatCoord[0].toFixed(2)}°E）` : ''}`);
      addText('div', 'detail-divider', '');

      if (hh.main) {
        const box = document.createElement('div');
        box.className = 'detail-impact';
        addText('div', 'detail-impact-title', '户 口 · 元丰九域志', box);
        addText('p', '', `主户 ${hh.main.toLocaleString()} 户 · 客户 ${(hh.guest || 0).toLocaleString()} 户 · 合计 ${total.toLocaleString()} 户`, box);
        detailPanel.appendChild(box);
      }
      if (props.tribute) {
        const box = document.createElement('div');
        box.className = 'detail-impact';
        addText('div', 'detail-impact-title', '土 贡 · 元丰九域志', box);
        addText('p', '', props.tribute, box);
        detailPanel.appendChild(box);
      }
      if (props.evolution) {
        const box = document.createElement('div');
        box.className = 'detail-impact';
        addText('div', 'detail-impact-title', '沿 革 · 舆地广记', box);
        addText('p', '', `${props.evolution}…`, box);
        detailPanel.appendChild(box);
      }
      // 校订说明（P4）：sourceFix 为数据管线按舆地广记对四库本误刻的校正记录
      if (props.sourceFix) {
        const box = document.createElement('div');
        box.className = 'detail-impact';
        addText('div', 'detail-impact-title', '校 订', box);
        addText('p', '', props.sourceFix, box);
        detailPanel.appendChild(box);
      }
      if (props.countyCount !== null && props.countyCount !== undefined) {
        const countyNames = (props.counties || []);
        const shown = countyNames.length > 14 ? `${countyNames.slice(0, 14).join('、')}…` : countyNames.join('、');
        const box = document.createElement('div');
        box.className = 'detail-impact';
        addText('div', 'detail-impact-title', `属 县 · ${props.countyCount}`, box);
        if (shown) addText('p', '', shown, box);
        detailPanel.appendChild(box);
      }
      if (related.length) {
        const relatedPanel = document.createElement('div');
        relatedPanel.className = 'detail-related';
        addText('div', 'detail-related-title', '相关事件', relatedPanel);
        const relatedList = document.createElement('div');
        relatedList.className = 'detail-related-list';
        related.forEach((r) => {
          const button = addText('button', 'detail-related-item', `${r.year}年${r.month || 1}月 · ${r.short || '未命名事件'}`, relatedList);
          button.type = 'button';
          button.dataset.id = String(r.id);
        });
        relatedPanel.appendChild(relatedList);
        detailPanel.appendChild(relatedPanel);
      }
      addText('div', 'detail-note', `${props.confidence === 'medium' ? '治所坐标已人工校订' : '边界为 Voronoi 近似'} · 数据源 ${props.source || '元丰九域志'}`);
      const art = document.createElement('img');
      art.src = './ink-landscape.png';
      art.className = 'detail-ink-art';
      art.alt = '水墨山水';
      detailPanel.appendChild(art);

      // 时空库增强（PostgreSQL + PostGIS，/api/places）：生命周期/史料/变更事件。
      // 时空库未启用（503）时静默跳过，不影响基础详情。
      const placeId = `song-${pref.name}`;
      const panelGen = detailPanelGen;
      getPlace(placeId).then((detail) => {
        // 面板可能已关闭或已切换到其他详情（防竞态：代际不匹配直接丢弃迟到响应）
        if (panelGen !== detailPanelGen || detailPanel.classList.contains('hidden')) return;
        const title = detailPanel.querySelector('#detail-title');
        if (title && detail.title) title.textContent = `${pref.name} · ${detail.title || ''}`.trim();
        // 生命周期（全部时间版本）
        if (Array.isArray(detail.versions) && detail.versions.length) {
          const box = document.createElement('div');
          box.className = 'detail-impact';
          addText('div', 'detail-impact-title', '生命周期 · 时间版本', box);
          detail.versions.forEach((v) => {
            const from = v.validFrom;
            const to = v.validTo ?? '宋亡(1279)';
            const range = v.validFrom === v.validTo ? `${from}` : `${from} — ${to}`;
            addText('p', '', `${range}${v.nameAtTime && v.nameAtTime !== pref.name ? `（${v.nameAtTime}）` : ''}`, box);
          });
          detailPanel.appendChild(box);
        }
        // 变更事件时间线（升/废/置/改…）
        if (Array.isArray(detail.events) && detail.events.length) {
          const box = document.createElement('div');
          box.className = 'detail-impact';
          addText('div', 'detail-impact-title', `变更事件 · ${detail.events.length}`, box);
          detail.events.slice(0, 8).forEach((e) => {
            const yr = e.year ?? '年代不详';
            addText('p', 'detail-event', `${yr} ${e.eventType}${e.yearApprox ? '（约）' : ''} — ${e.detail}`, box);
          });
          if (detail.events.length > 8) addText('p', 'detail-event', `…共 ${detail.events.length} 条`, box);
          detailPanel.appendChild(box);
        }
        // 史料源 + 置信度
        if (Array.isArray(detail.sources) && detail.sources.length) {
          const box = document.createElement('div');
          box.className = 'detail-impact';
          addText('div', 'detail-impact-title', '史料来源', box);
          addText('p', '', detail.sources.map((s) => `${s.title}${s.juan ? `（${s.juan}）` : ''}`).join(' · '), box);
          detailPanel.appendChild(box);
        }
        if (detail.confidence !== undefined && detail.confidence !== null) {
          const box = document.createElement('div');
          box.className = 'detail-impact';
          addText('div', 'detail-impact-title', '数据置信度', box);
          addText('p', '', `整体 ${(detail.confidence * 100).toFixed(0)}% · 州府面为 Voronoi 近似（见版本 note）`, box);
          detailPanel.appendChild(box);
        }
      }).catch((err) => {
        // 503（时空库未启用）或网络错误：静默降级，基础详情已足够
        if (!(err instanceof Error && /503|404/.test(err.message))) {
          console.debug('[places] 时空库详情加载失败:', err.message);
        }
      });
      // 相关事件点击：跳到该事件并刷新详情
      detailPanel.querySelectorAll('.detail-related-item').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const target = currentEvents.find((x) => x.id === Number(btn.dataset.id));
          if (target) jumpToEvent(target);
        });
      });
      detailPanel.classList.remove('hidden');
      detailPanel.setAttribute('aria-hidden', 'false');
      detailMask.classList.remove('hidden');
      detailMask.setAttribute('aria-hidden', 'false');
      controls.enabled = false;
      detailPanel.querySelector('.detail-close').addEventListener('click', (e) => {
        e.stopPropagation();
        closeDetail();
      });
      closeButton.focus();
      frameMap({ scale: 1.28, shiftX: -0.16 });
      focusOn(pref.coord);
    }

    // 朝代更替全屏转场横幅（跨过时期边界时短暂压暗 + 时期名），约 2.6s 后自动消失
    let bannerTimer = null;
    function showEraBanner(year, prevLabel, nextLabel) {
      eraBanner.querySelector('.era-banner-year').textContent = `${year} 年`;
      eraBanner.querySelector('.era-banner-text').textContent =
        prevLabel ? `${prevLabel} → ${nextLabel}` : nextLabel;
      eraBanner.classList.add('show');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => eraBanner.classList.remove('show'), 2600);
    }

    // 右侧历史事件流抽屉（顶栏 ☰ 按钮开关，徽标显示收起期间的新事件数）
    eventLog = new EventLog({
      container: '#event-log',
      onPick: jumpToEvent,
      onUnread: (n) => {
        logBadge.textContent = n > 0 ? String(n) : '';
        logBadge.classList.toggle('hidden', n === 0);
      }
    });
    document.getElementById('log-toggle').addEventListener('click', () => {
      eventLog.toggle();
    });
    document.getElementById('log-close').addEventListener('click', () => eventLog.hide());

    // 窗口尺寸变化时重排泡泡碰撞（锚点随布局变化）
    window.addEventListener('resize', () => bubbles && bubbles.resolve());
    // 相机拖动/缩放结束（debounce 150ms）后重排碰撞，避免拖动期间泡泡瞬时重叠
    let dragResizeTimer = null;
    controls.addEventListener('change', () => {
      clearTimeout(dragResizeTimer);
      dragResizeTimer = setTimeout(() => bubbles && bubbles.resolve(), 150);
    });

    // 点击空白处关闭详情（并恢复播放）；拖拽相机时取消聚焦补间（避免运镜与用户操作打架）
    renderer.domElement.addEventListener('click', () => {
      closeDetail();
    });
    renderer.domElement.addEventListener('pointerdown', () => {
      camTween = null;
    });
    // 点遮罩 = 关闭详情（遮罩挡住地图，避免误触，也天然替代了上面的 canvas 点击关闭）
    detailMask.addEventListener('click', closeDetail);

    // Esc 关闭详情 / 设置面板
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      closeDetail();
      settingsMenu && settingsMenu.hide();
    });

    // 顶栏朝代下拉：数据来自 /api/dynasties（后端 dynasties 表）
    const dynastySelect = document.getElementById('dynasty-select');
    getDynasties()
      .then((list) => {
        clearChildren(dynastySelect);
        (list || []).forEach((d) => {
          const option = document.createElement('option');
          option.value = d.id;
          option.textContent = d.name;
          dynastySelect.appendChild(option);
        });
        dynastySelect.value = currentDynasty;
      })
      .catch((err) => console.warn('[dynasties] 朝代列表加载失败:', err));
    dynastySelect.addEventListener('change', () => {
      const id = dynastySelect.value;
      if (!id || id === currentDynasty) return;
      closeDetail();
      loadingEl.textContent = '正在切换朝代…';
      loadingEl.classList.remove('hidden');
      const requestSeq = dynastyRequestSeq + 1;
      loadDynasty(id)
        .then(() => {
          if (requestSeq === dynastyRequestSeq) {
            loadingEl.classList.add('hidden');
            dynastySelect.value = currentDynasty;
            // 朝代切换后同步 URL（详情已关闭，URL 只保留朝代 + 当前年）
            history.replaceState(null, '', buildViewHref({ dynasty: currentDynasty, year: timeline.year }));
          }
        })
        .catch((err) => {
          if (requestSeq !== dynastyRequestSeq || isAbortError(err)) return;
          console.error('[dynasties] 朝代切换失败:', err);
          loadingEl.textContent = '朝代数据加载失败';
        });
    });

    // 深链接路由：浏览器前进/后退时按 URL 恢复视图（详情开合与历史记录同步）
    window.addEventListener('popstate', async () => {
      const view = parseViewParams(location.search);
      if (view?.dynasty && view.dynasty !== currentDynasty) {
        try {
          await loadDynasty(view.dynasty);
          dynastySelect.value = currentDynasty;
        } catch (err) {
          if (!isAbortError(err)) console.warn('[view] 深链接朝代加载失败，已停留在当前朝代:', err);
        }
      }
      const ev = view?.event !== undefined ? currentEvents.find((e) => e.id === view.event) : undefined;
      if (ev) {
        timeline.setTime(ev.year, ev.month || 1);
        showDetail(ev);
      } else {
        closeDetail();
      }
    });

    // —— 核心装配：加载朝代数据并重建可切换图层（初始加载与朝代切换共用）——
    // 统一投影标定：资源贴图（bake-overlay-textures.mjs 产出）按「全时期包围盒」
    // 渲染，浏览器端必须用同一份数据标定（fit-geojson.json），贴图才能精确对齐。
    // 缺失/加载失败时回落「用当前 overlay 标定」（功能正常，贴图可能错位）。
    let projectionEnsured = false;
    async function ensureProjection() {
      if (projectionEnsured) return;
      projectionEnsured = true;
      try {
        const res = await fetch('./textures/overlay/fit-geojson.json', { cache: 'force-cache' });
        if (res.ok) fitProjection(await res.json());
      } catch { /* 回落 loadDynasty 兜底标定 */ }
    }

    // —— 全时期模式（P2）：给定年份展示当时全部政权（宋/辽/西夏/金等同屏）——
    // 状态：模式开关 + 命中集合稳定区间（properties._range，服务端计算）。
    // 年份仍在区间内时命中集合不变，跳过重取（自动播放每 tick 一年，节流必需）。
    let allPeriodMode = false;
    let allOverlayRange = null;

    async function reloadAllOverlay(year) {
      const requestSeq = ++overlayRequestSeq;
      overlayController?.abort();
      const controller = new AbortController();
      overlayController = controller;
      try {
        const freshOverlay = await getAllOverlay(year, { signal: controller.signal });
        if (requestSeq !== overlayRequestSeq || !allPeriodMode) return;
        installOverlayWithCrossfade(freshOverlay, { period: 'all' });
        allOverlayRange = freshOverlay.properties?._range || null;
      } catch (err) {
        if (!isAbortError(err)) console.error('[all-period] 全时期叠加层加载失败:', err);
      }
    }

    const allPeriodBtn = document.getElementById('allperiod-toggle');
    if (allPeriodBtn) {
      allPeriodBtn.addEventListener('click', async () => {
        allPeriodMode = !allPeriodMode;
        allPeriodBtn.classList.toggle('active', allPeriodMode);
        allPeriodBtn.setAttribute('aria-pressed', String(allPeriodMode));
        dynastySelect.disabled = allPeriodMode;
        if (allPeriodMode) {
          // 时间轴范围 → 全部朝代并集；疆域切到全时期叠加层
          try {
            const ds = await getDynasties();
            const start = Math.min(...ds.map((d) => d.startYear));
            const end = Math.max(...ds.map((d) => d.endYear));
            timeline.setRange(start, end, { resetYear: false });
          } catch (err) {
            console.warn('[all-period] 朝代列表加载失败，保持原时间轴范围:', err);
          }
          await reloadAllOverlay(timeline.year);
        } else {
          // 回到朝代模式：恢复当前朝代的 overlay/时间轴范围/时期状态
          allOverlayRange = null;
          await loadDynasty(currentDynasty);
        }
      });
    }

    async function loadDynasty(dynastyId) {
      await ensureProjection();
      // 深链接/popstate 切朝代时若在全时期模式，先退出（朝代模式为准）
      if (allPeriodMode && allPeriodBtn) {
        allPeriodMode = false;
        allOverlayRange = null;
        allPeriodBtn.classList.remove('active');
        allPeriodBtn.setAttribute('aria-pressed', 'false');
        dynastySelect.disabled = false;
      }
      const requestSeq = ++dynastyRequestSeq;
      dynastyController?.abort();
      overlayController?.abort();
      const controller = new AbortController();
      dynastyController = controller;
      const meta = await getMeta(dynastyId, { signal: controller.signal });
      if (requestSeq !== dynastyRequestSeq) return false;

      // 初始时期：由 meta 数据驱动；periods 缺失时退到第一个时期（最后防线）
      const initialPeriod = meta.periods?.find((p) => meta.startYear >= p.start && meta.startYear <= p.end)?.id
        || meta.periods?.[0]?.id
        || '1111';
      const [geojson, overlayGeojson, events, persons] = await Promise.all([
        getMap({ signal: controller.signal }),
        getOverlay(dynastyId, initialPeriod, { signal: controller.signal }),
        getEvents(dynastyId, { signal: controller.signal }),
        // 人物列表（人物视角）：老后端无该路由时静默降级为空列表
        getPersons(dynastyId, { signal: controller.signal }).catch(() => []),
      ]);
      if (requestSeq !== dynastyRequestSeq) return false;

      currentDynasty = dynastyId;
      periodMeta = meta;
      // 人物视角：注入当前朝代人物列表并重置选择（泡泡层随朝代重建，过滤天然归零）
      settingsMenu?.setPersons(Array.isArray(persons) ? persons : []);
      // 朝代数据只有在全部请求成功后才提交；此时同步页面标题和印章，
      // 避免切换期间仍显示上一个朝代的品牌信息。
      const brandSeal = document.querySelector('.brand-seal');
      if (brandSeal) brandSeal.textContent = meta.name?.replace(/朝$/, '') || dynastyId;
      document.title = `中国历史地图 · ${meta.name || dynastyId}`;
      overlayEmpty = false;
      currentEvents = events;
      overlayRequestSeq++;

      // 兜底标定：ensureProjection 已用 fit-geojson.json 标定过则此调用幂等跳过；
      // 仅在标定文件缺失/失败时用当前 overlay 标定（单例，只标定一次）。
      fitProjection(overlayGeojson);

      // 现代底图：与朝代无关，只建一次
      if (!mapGroup) {
        mapGroup = buildChinaMap(geojson);
        mapGroup.visible = settings.showBaseMap;  // 现代底图默认隐藏
        scene.add(mapGroup);
      }

      // 疆域叠加层：清旧建新；纹理按时期/视口配置复用
      const overlayBuildStarted = performance.now();
      if (territoryOverlay) clearOverlayGroup(territoryOverlay.group);
      currentOverlayData = overlayGeojson;
      territoryOverlay = buildTerritoryOverlay(overlayGeojson, {
        period: initialPeriod,
        layerConfig: 'default',
        onPickPrefecture: (pref) => showPlaceDetail(pref),
      });
      lodState.overlay = territoryOverlay; // LOD 驱动（animate 循环按 s 判据计算）
      lodState.tier = 0;
      const overlayDurationMs = performance.now() - overlayBuildStarted;
      performance.mark('map-initialization-overlay-end');
      console.info('[overlay] 地图初始化', {
        durationMs: overlayDurationMs,
        cache: getOverlayCacheStats(),
      });
      territoryOverlay.group.visible = settings.showOverlay;
      territoryOverlay.setAuxiliaryVisibility?.(settings);
      scene.add(territoryOverlay.group);
      const hasOverlayFeatures = Array.isArray(overlayGeojson?.features) && overlayGeojson.features.length > 0;
      overlayEmpty = !hasOverlayFeatures;
      if (overlayEmpty) {
        loadingEl.textContent = '当前时期暂无疆域数据，仍可查看事件与时间轴';
        loadingEl.classList.remove('hidden');
      }

      // 地图图例
      if (!legend) legend = new Legend();
      legend.update(overlayGeojson);

      // 相机取景：优先用 overlay 的 LOD worldBox（政权+河流+山脉 + 6% 边距，始终在视野里），
      // 底图隐藏时也能正确取景；竖屏放大后以主政权（本朝疆域）bbox 水平锚定。
      const lodBox = territoryOverlay.worldBox;
      let frameCenter; let frameW; let frameH;
      if (lodBox && lodBox.xmax > lodBox.xmin && lodBox.ymax > lodBox.ymin) {
        frameW = lodBox.xmax - lodBox.xmin;
        frameH = lodBox.ymax - lodBox.ymin;
        frameCenter = new THREE.Vector3((lodBox.xmin + lodBox.xmax) / 2, (lodBox.ymin + lodBox.ymax) / 2, 0);
      } else {
        const focusGroup = territoryOverlay.group.children.length ? territoryOverlay.group : mapGroup;
        const sphere = new THREE.Box3().setFromObject(focusGroup).getBoundingSphere(new THREE.Sphere());
        const radius = Number.isFinite(sphere.radius) && sphere.radius > 0 ? sphere.radius : 500;
        frameCenter = [sphere.center.x, sphere.center.y, sphere.center.z].every(Number.isFinite)
          ? sphere.center
          : new THREE.Vector3(0, 0, 0);
        frameW = frameH = radius * 2;
      }
      const mainEntity = (meta.name || dynastyId).replace(/朝$/, '');
      frameBase = {
        center: frameCenter,
        worldW: frameW,
        worldH: frameH,
        anchorBox: computeMainRegimeBox(overlayGeojson, mainEntity),
      };
      // 构图：scale 0.98 留少量余量，微右移平衡左侧图例（竖屏下锚定逻辑另行钳制）
      frameMap({ scale: 0.98, shiftX: 0.02 });
      controls.update();

      // 事件泡泡层：清旧建新
      if (bubbles) bubbles.dispose();
      // 事件流：先清空旧朝代记录（必须在 bubbles.update 触发 onAppear 之前），
      // 再注入完整索引，使尚未播放的事件也可搜索。
      eventLog.clear();
      eventLog.setEvents(currentEvents);
      bubbles = new EventBubbles({
        scene,
        events,
        categories: settings.categories,
        onPick: jumpToEvent,
        onAppear: (ev) => eventLog.add(ev),
        toScreen: worldToScreen,
        leadersHost: labelRenderer.domElement,
        getCollisionObstacles: () => territoryOverlay?.getCollisionObstacles?.() || [],
      });
      bubblesRef = bubbles;

      // 时间轴：当前年份的唯一状态源，起止年由后端 meta 给出。
      // 首次创建；朝代切换时 setRange 更新边界（onChange 闭包读跨朝代状态，可复用）。
      currentPeriod = getPeriodForYear(meta.startYear) || '1111';
      overlayLoadingPeriod = currentPeriod;
      if (!timeline) {
        timeline = new Timeline({
          start: meta.startYear,
          end: meta.endYear,
          tickMs: SPEED_MAP[settings.speed] || SPEED_MAP.normal,
          autoplay: settings.autoplay,
          onChange: async (year, month) => {
            watermark.textContent = `${year}年${month}月`;
            bubbles.update(year, month, prevYear, prevMonth);
            territoryOverlay.update(year);
            // 全时期模式（P2）：年份离开命中集合稳定区间（_range）时重取全部政权
            if (allPeriodMode) {
              const [rangeStart, rangeEnd] = allOverlayRange || [];
              if (rangeStart === undefined || year < rangeStart || year > rangeEnd) {
                await reloadAllOverlay(year);
              }
              prevYear = year;
              prevMonth = month;
              return;
            }
            // 跨过时期边界时，重载疆域叠加层
            const newPeriod = getPeriodForYear(year);
            if (newPeriod && newPeriod !== currentPeriod) {
              // 政权更替转场横幅（如 1127 靖康：北宋 → 南宋）
              showEraBanner(year, periodLabel(currentPeriod), periodLabel(newPeriod));
              currentPeriod = newPeriod;
              overlayLoadingPeriod = newPeriod;
              const requestSeq = ++overlayRequestSeq;
              const dynastySeq = dynastyRequestSeq;
              overlayController?.abort();
              const controller = new AbortController();
              overlayController = controller;
              try {
                const freshOverlay = await getOverlay(currentDynasty, newPeriod, { signal: controller.signal });
                if (requestSeq !== overlayRequestSeq || dynastySeq !== dynastyRequestSeq
                  || overlayLoadingPeriod !== newPeriod) return;
                // 交叉淡入：旧时期 overlay 作底衬淡出，新疆域淡入（不再「打回宣纸再淡入」）
                installOverlayWithCrossfade(freshOverlay, { period: newPeriod });
                console.log(`[overlay] 切换到 ${newPeriod} 时期（交叉淡入）`);
              } catch (err) {
                if (!isAbortError(err) && requestSeq === overlayRequestSeq && dynastySeq === dynastyRequestSeq
                  && overlayLoadingPeriod === newPeriod) {
                  console.warn('[overlay] 时期切换失败:', err);
                  loadingEl.textContent = '时期疆域加载失败，仍可查看事件与时间轴';
                  loadingEl.classList.remove('hidden');
                }
              }
            }
            prevYear = year;
            prevMonth = month;
          }
        });
      } else {
        timeline.setRange(meta.startYear, meta.endYear, { resetYear: true });
        timeline.setTickMs(SPEED_MAP[settings.speed] || SPEED_MAP.normal);
      }

      // 初始刷新：prevTime 设为 start 年首月前一刻，让开局就在窗口内的事件也能触发「首次出现」
      prevYear = meta.startYear;
      prevMonth = 1;
      currentPeriod = getPeriodForYear(meta.startYear) || '1111';
      overlayLoadingPeriod = currentPeriod;
      bubbles.update(meta.startYear, 1, meta.startYear - 1, 12);
      territoryOverlay.update(meta.startYear);
      watermark.textContent = `${meta.startYear}年1月`;  // 水印初始值（autoplay 关闭时 onChange 不会立即触发）

      // 时间轴事件刻度点：点击跳到该年并打开详情；初始按设置过滤分类
      timeline.setEvents(currentEvents, (ev) => jumpToEvent(ev));
      timeline.filterMarkers(settings.categories);

      // 时间轴范围标签同步为实际起止年
      tlRange.textContent = `${meta.startYear} — ${meta.endYear}`;
    }

    // 设置菜单：分类/速度/自动播放/底图显隐 + 人物视角过滤
    const settingsMenu = new SettingsMenu({
      onChange: (s) => {
        bubbles.setCategories(s.categories);
        timeline.filterMarkers(s.categories);
        timeline.setTickMs(SPEED_MAP[s.speed] || SPEED_MAP.normal);
        mapGroup.visible = !!s.showBaseMap;         // 现代底图
        territoryOverlay.group.visible = !!s.showOverlay;  // 历史疆域
        if (territoryOverlay.setAuxiliaryVisibility) {
          territoryOverlay.setAuxiliaryVisibility(s);
        }
      },
      onPersonFilter: (personId) => {
        // 人物视角：只保留该人物关联的事件泡泡（relatedPersons 由 /api/events 附带）
        bubbles?.setPersonFilter(personId);
      },
    });

    // 初始加载
    await loadDynasty(currentDynasty);

    // —— 深链接恢复：URL 携带 dynasty/year/event 时还原视图并打开详情 ——
    const view = parseViewParams(location.search);
    if (view?.dynasty && view.dynasty !== currentDynasty) {
      try {
        await loadDynasty(view.dynasty);
        dynastySelect.value = currentDynasty;
      } catch (err) {
        if (!isAbortError(err)) console.warn('[view] 深链接朝代加载失败，已停留在默认朝代:', err);
      }
    }
    const viewEvent = view?.event !== undefined ? currentEvents.find((e) => e.id === view.event) : undefined;
    if (viewEvent) {
      timeline.setTime(viewEvent.year, viewEvent.month || 1);
      showDetail(viewEvent);
    } else if (view?.year !== undefined) {
      timeline.setYear(view.year);  // 只带年份：跳到该年（setYear 内部 clamp 到朝代范围）
    }

    loadingEl.classList.toggle('hidden', !overlayEmpty);
  } catch (err) {
    if (isAbortError(err)) return;
    console.error('加载失败:', err);
    loadingEl.textContent = '数据加载失败，请确认后端已启动 (localhost:3001)';
    loadingEl.style.color = theme.errorText;
  }
})();
