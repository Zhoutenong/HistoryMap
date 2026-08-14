import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

import { buildChinaMap, fitProjection, project } from './map/ChinaMap.js';
import { Timeline } from './timeline/Timeline.js';
import { EventBubbles } from './events/EventBubbles.js';
import { EventLog } from './events/EventLog.js';
import { buildTerritoryOverlay, fadeIn, getOverlayCacheStats } from './map/TerritoryOverlay.js';
import { Legend } from './map/Legend.js';
import { getMap, getEvents, getMeta, getOverlay, getDynasties } from './api.js';
import { applyTheme, getTheme } from './theme.js';
import { loadSettings, saveSettings, SPEED_MAP, CATEGORIES } from './settings/store.js';
import { clearChildren } from './dom.js';
import { settingsFromParam } from './settings/transfer.js';
import { parseViewParams, viewToQuery, buildShareUrl, copyText } from './share.js';
import { SettingsMenu } from './settings/SettingsMenu.js';
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

/**
 * 取景构图：以疆域包围球为准重设相机距离与视野中心。
 * - scale：距离倍率（越大地图越小、留白越多）。默认 0.98 是全图构图；
 *   详情面板打开时用 1.28（地图缩小给右侧面板让位）。
 * - shiftX：水平偏移比例（占视口宽度），正数右移、负数左移；详情打开时 -0.16。
 * 相机相对视角方向不变（正俯 + 前倾），保证地图永远是「北朝上」平面视图。
 */
let frameBase = null; // { center, dist } 首次标定后固定，供缩放/平移后回归
function frameMap({ scale = 0.98, shiftX = 0 } = {}) {
  if (!frameBase) return;
  const { center, dist } = frameBase;
  const d = dist * scale;
  // 水平偏移换算：屏幕比例 → 世界单位（按当前取景距离的可见半宽）
  const halfW = d * Math.tan((camera.fov * Math.PI) / 180 / 2) * camera.aspect;
  const shift = shiftX * 2 * halfW;
  const tweenTo = {
    px: center.x + shift, py: center.y - d * 0.3, pz: center.z + d * 0.95,
    tx: center.x + shift, ty: center.y, tz: center.z,
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
    let bubbles = null;
    let legend = null;
    let eventLog = null;
    let mapGroup = null;
    let territoryOverlay = null;
    let prevYear = 0;
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
          // CSS2DRenderer 缓存不会自动清理已从 scene 移除的对象的 DOM 元素，
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

    // 详情面板逻辑：打开详情时暂停播放（避免读详情时年份继续跑、聚焦的泡泡过期），
    // 关闭时恢复打开前的播放状态。timeline/bubbles 在 loadDynasty 中创建，闭包内运行时访问。
    // 详情打开时加半透明遮罩并锁死地图交互（读详情时防止误触旋转/拾取）。
    let resumePlayback = false;
    let detailReturnFocus = null;
    function showDetail(ev) {
      detailReturnFocus = document.activeElement;
      resumePlayback = timeline.playing;
      timeline.pause();
      // 分类名（设计图详情面板的「时代格局/军事·领土」徽章）；无匹配时不显示
      const catLabel = (CATEGORIES.find((c) => c.id === ev.category) || {}).label || '';
      // 时期名（如「北宋极盛」）：由 meta.periods 数据驱动，补充事件的时代背景
      const periodName = periodLabel(getPeriodForYear(ev.year));
      // 相关事件：按年份排序后取当前事件前后各一条（排除自身）
      const sorted = currentEvents.slice().sort((a, b) => a.year - b.year);
      const idx = sorted.findIndex((e) => e.id === ev.id);
      const related = [];
      if (idx > 0) related.push(sorted[idx - 1]);
      if (idx >= 0 && idx < sorted.length - 1) related.push(sorted[idx + 1]);
      clearChildren(detailPanel);
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
      addText('span', 'detail-year', `${ev.year} 年`, head);
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
      detailPanel.appendChild(head);
      const detailTitle = addText('h2', '', ev.title || '未命名事件');
      detailTitle.id = 'detail-title';
      if (ev.place) addText('div', 'detail-meta', ev.place);
      addText('div', 'detail-divider', '');
      addText('p', 'detail-text', ev.detail || '暂无详情');
      if (ev.impact) {
        const impact = document.createElement('div');
        impact.className = 'detail-impact';
        addText('div', 'detail-impact-title', '影 响', impact);
        addText('p', '', ev.impact, impact);
        detailPanel.appendChild(impact);
      }
      if (related.length) {
        const relatedPanel = document.createElement('div');
        relatedPanel.className = 'detail-related';
        addText('div', 'detail-related-title', '相关事件', relatedPanel);
        const relatedList = document.createElement('div');
        relatedList.className = 'detail-related-list';
        related.forEach((r) => {
          const button = addText('button', 'detail-related-item', `${r.year} · ${r.short || '未命名事件'}`, relatedList);
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

    // 点击事件流/刻度点：先跳到事件年份，再打开详情
    const jumpToEvent = (ev) => {
      timeline.setYear(ev.year);
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
          const button = addText('button', 'detail-related-item', `${r.year} · ${r.short || '未命名事件'}`, relatedList);
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
        timeline.setYear(ev.year);
        showDetail(ev);
      } else {
        closeDetail();
      }
    });

    // —— 核心装配：加载朝代数据并重建可切换图层（初始加载与朝代切换共用）——
    async function loadDynasty(dynastyId) {
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
      const [geojson, overlayGeojson, events] = await Promise.all([
        getMap({ signal: controller.signal }),
        getOverlay(dynastyId, initialPeriod, { signal: controller.signal }),
        getEvents(dynastyId, { signal: controller.signal }),
      ]);
      if (requestSeq !== dynastyRequestSeq) return false;

      currentDynasty = dynastyId;
      periodMeta = meta;
      // 朝代数据只有在全部请求成功后才提交；此时同步页面标题和印章，
      // 避免切换期间仍显示上一个朝代的品牌信息。
      const brandSeal = document.querySelector('.brand-seal');
      if (brandSeal) brandSeal.textContent = meta.name?.replace(/朝$/, '') || dynastyId;
      document.title = `中国历史地图 · ${meta.name || dynastyId}`;
      overlayEmpty = false;
      currentEvents = events;
      overlayRequestSeq++;

      // 标定投影：用历史疆域（覆盖中国及周边）做 fitSize，
      // 保证现代底图即使隐藏，投影仍然有效。必须在任何 project() 调用前完成（单例，只标定一次）。
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

      // 相机取景：优先用疆域叠加层（始终在视野里），底图隐藏时也能正确取景。
      // frameMap 以包围球为基准做构图（scale 越大留白越多），后续详情面板开关也复用它。
      const focusGroup = territoryOverlay.group.children.length ? territoryOverlay.group : mapGroup;
      const box = new THREE.Box3().setFromObject(focusGroup);
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const radius = Number.isFinite(sphere.radius) && sphere.radius > 0 ? sphere.radius : 500;
      const center = [sphere.center.x, sphere.center.y, sphere.center.z].every(Number.isFinite)
        ? sphere.center
        : new THREE.Vector3(0, 0, 0);
      frameBase = {
        center,
        dist: radius / Math.sin((camera.fov * Math.PI) / 180 / 2),
      };
      // 构图：scale 0.98 让地图主体占画面约六成（参考图比例），微右移平衡左侧图例
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
          onChange: async (y) => {
            watermark.textContent = y;
            bubbles.update(y, prevYear);
            territoryOverlay.update(y);
            // 跨过时期边界时，重载疆域叠加层
            const newPeriod = getPeriodForYear(y);
            if (newPeriod && newPeriod !== currentPeriod) {
              // 政权更替转场横幅（如 1127 靖康：北宋 → 南宋）
              showEraBanner(y, periodLabel(currentPeriod), periodLabel(newPeriod));
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
                clearOverlayGroup(territoryOverlay.group);
                currentOverlayData = freshOverlay;
                // 重建新 overlay
                const newOverlay = buildTerritoryOverlay(freshOverlay, {
                  period: newPeriod,
                  layerConfig: 'default',
                  onPickPrefecture: (pref) => showPlaceDetail(pref),
                });
                // 把新 group 的资源迁移到旧 group
                while (newOverlay.group.children.length > 0) {
                  territoryOverlay.group.add(newOverlay.group.children[0]);
                }
                // 新疆域淡入（材质从 0 → 各自原始 opacity）
                fadeIn(territoryOverlay.group);
                console.log(`[overlay] 切换到 ${newPeriod} 时期`);
                legend.update(freshOverlay);
                overlayEmpty = !Array.isArray(freshOverlay?.features) || freshOverlay.features.length === 0;
                loadingEl.textContent = overlayEmpty
                  ? '当前时期暂无疆域数据，仍可查看事件与时间轴'
                  : '';
                loadingEl.classList.toggle('hidden', !overlayEmpty);
                // 新 overlay 的政权标签已插入 DOM，重排泡泡避开标签（避免盖住政权名）
                setTimeout(() => bubbles.resolve(), 100);
              } catch (err) {
                if (!isAbortError(err) && requestSeq === overlayRequestSeq && dynastySeq === dynastyRequestSeq
                  && overlayLoadingPeriod === newPeriod) {
                  console.warn('[overlay] 时期切换失败:', err);
                  loadingEl.textContent = '时期疆域加载失败，仍可查看事件与时间轴';
                  loadingEl.classList.remove('hidden');
                }
              }
            }
            prevYear = y;
          }
        });
      } else {
        timeline.setRange(meta.startYear, meta.endYear, { resetYear: true });
        timeline.setTickMs(SPEED_MAP[settings.speed] || SPEED_MAP.normal);
      }

      // 初始刷新：prevYear 设为 start-1，让开局就在窗口内的事件也能触发「首次出现」
      prevYear = meta.startYear;
      currentPeriod = getPeriodForYear(meta.startYear) || '1111';
      overlayLoadingPeriod = currentPeriod;
      bubbles.update(meta.startYear, meta.startYear - 1);
      territoryOverlay.update(meta.startYear);
      watermark.textContent = meta.startYear;  // 水印初始值（autoplay 关闭时 onChange 不会立即触发）

      // 时间轴事件刻度点：点击跳到该年并打开详情；初始按设置过滤分类
      timeline.setEvents(currentEvents, (ev) => jumpToEvent(ev));
      timeline.filterMarkers(settings.categories);

      // 时间轴范围标签同步为实际起止年
      tlRange.textContent = `${meta.startYear} — ${meta.endYear}`;
    }

    // 设置菜单：分类/速度/自动播放/底图显隐
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
      }
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
      timeline.setYear(viewEvent.year);
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
