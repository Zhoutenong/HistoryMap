import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

import { buildChinaMap, fitProjection, project } from './map/ChinaMap.js';
import { Timeline } from './timeline/Timeline.js';
import { EventBubbles } from './events/EventBubbles.js';
import { EventLog } from './events/EventLog.js';
import { buildTerritoryOverlay, fadeIn } from './map/TerritoryOverlay.js';
import { Legend } from './map/Legend.js';
import { getMap, getEvents, getMeta, getOverlay, getDynasties } from './api.js';
import { applyTheme, getTheme } from './theme.js';
import { loadSettings, SPEED_MAP, CATEGORIES } from './settings/store.js';
import { SettingsMenu } from './settings/SettingsMenu.js';
import './styles.css';

// 默认朝代。未来切换朝代只改这个常量 + 后端数据，地图/泡泡层无需改（AGENTS.md 扩展点）。
const DYNASTY_DEFAULT = 'song';
let currentDynasty = DYNASTY_DEFAULT;

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
    let dynastyRequestSeq = 0;
    let overlayRequestSeq = 0;

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
    function showDetail(ev) {
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
      detailPanel.innerHTML = `
        <button class="detail-close" title="关闭">×</button>
        <div class="detail-head">
          <span class="detail-year">${ev.year} 年</span>
          ${catLabel ? `<span class="detail-cat">${catLabel}</span>` : ''}
          ${periodName ? `<span class="detail-cat">${periodName}</span>` : ''}
        </div>
        <h2>${ev.title}</h2>
        ${ev.place ? `<div class="detail-meta">${ev.place}</div>` : ''}
        <div class="detail-divider"></div>
        <p class="detail-text">${ev.detail}</p>
        ${ev.impact ? `
          <div class="detail-impact">
            <div class="detail-impact-title">影 响</div>
            <p>${ev.impact}</p>
          </div>` : ''}
        ${related.length ? `
          <div class="detail-related">
            <div class="detail-related-title">相关事件</div>
            <div class="detail-related-list">
              ${related.map((r) => `
                <button type="button" class="detail-related-item" data-id="${r.id}">${r.year} · ${r.short}</button>
              `).join('')}
            </div>
          </div>` : ''}
        <img src="/ink-landscape.png" class="detail-ink-art" alt="水墨山水">
      `;
      // 相关事件点击：跳到该事件并刷新详情
      detailPanel.querySelectorAll('.detail-related-item').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const target = currentEvents.find((x) => x.id === Number(btn.dataset.id));
          if (target) jumpToEvent(target);
        });
      });
      detailPanel.classList.remove('hidden');
      detailMask.classList.remove('hidden');
      controls.enabled = false;
      detailPanel.querySelector('.detail-close').addEventListener('click', (e) => {
        e.stopPropagation();
        closeDetail();
      });
      bubbles.highlight(ev);
      // 打开详情：地图缩小 + 左移，给右侧面板让位（构图级重取景）
      frameMap({ scale: 1.28, shiftX: -0.16 });
      // 点击事件：相机平滑聚焦到事件位置
      focusOn(ev.coord);
    }

    function closeDetail() {
      detailPanel.classList.add('hidden');
      detailMask.classList.add('hidden');
      controls.enabled = true;
      bubbles.highlight(null);
      // 关闭详情：回到全图构图（与初始构图一致）
      frameMap({ scale: 0.98, shiftX: 0.02 });
      if (resumePlayback) timeline.play();
      resumePlayback = false;
    }

    // 点击事件流/刻度点：先跳到事件年份，再打开详情
    const jumpToEvent = (ev) => {
      timeline.setYear(ev.year);
      showDetail(ev);
    };

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
    document.getElementById('log-toggle').addEventListener('click', (e) => {
      e.currentTarget.blur();  // 松开焦点，避免屏蔽空格等全局快捷键
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
        dynastySelect.innerHTML = (list || [])
          .map((d) => `<option value="${d.id}">${d.name}</option>`)
          .join('');
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
          if (requestSeq === dynastyRequestSeq) loadingEl.classList.add('hidden');
        })
        .catch((err) => {
          if (requestSeq !== dynastyRequestSeq) return;
          console.error('[dynasties] 朝代切换失败:', err);
          loadingEl.textContent = '朝代数据加载失败';
        });
    });

    // —— 核心装配：加载朝代数据并重建可切换图层（初始加载与朝代切换共用）——
    async function loadDynasty(dynastyId) {
      const requestSeq = ++dynastyRequestSeq;
      const meta = await getMeta(dynastyId);
      if (requestSeq !== dynastyRequestSeq) return false;

      // 初始时期：由 meta 数据驱动；periods 缺失时退到第一个时期（最后防线）
      const initialPeriod = meta.periods?.find((p) => meta.startYear >= p.start && meta.startYear <= p.end)?.id
        || meta.periods?.[0]?.id
        || '1111';
      const [geojson, overlayGeojson, events] = await Promise.all([
        getMap(),
        getOverlay(dynastyId, initialPeriod),
        getEvents(dynastyId),
      ]);
      if (requestSeq !== dynastyRequestSeq) return false;

      currentDynasty = dynastyId;
      periodMeta = meta;
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

      // 疆域叠加层：清旧建新
      if (territoryOverlay) clearOverlayGroup(territoryOverlay.group);
      territoryOverlay = buildTerritoryOverlay(overlayGeojson);
      territoryOverlay.group.visible = settings.showOverlay;
      scene.add(territoryOverlay.group);

      // 地图图例
      if (!legend) legend = new Legend();
      legend.update(overlayGeojson);

      // 相机取景：优先用疆域叠加层（始终在视野里），底图隐藏时也能正确取景。
      // frameMap 以包围球为基准做构图（scale 越大留白越多），后续详情面板开关也复用它。
      const focusGroup = territoryOverlay.group.children.length
        ? territoryOverlay.group
        : mapGroup;
      const box = new THREE.Box3().setFromObject(focusGroup);
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      frameBase = {
        center: sphere.center,
        dist: sphere.radius / Math.sin((camera.fov * Math.PI) / 180 / 2),
      };
      // 构图：scale 0.98 让地图主体占画面约六成（参考图比例），微右移平衡左侧图例
      frameMap({ scale: 0.98, shiftX: 0.02 });
      controls.update();

      // 事件泡泡层：清旧建新
      if (bubbles) bubbles.dispose();
      // 事件流：先清空旧朝代记录（必须在 bubbles.update 触发 onAppear 之前）
      eventLog.clear();
      bubbles = new EventBubbles({
        scene,
        events,
        categories: settings.categories,
        onPick: jumpToEvent,
        onAppear: (ev) => eventLog.add(ev),
        toScreen: worldToScreen,
        leadersHost: labelRenderer.domElement,
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
              try {
                const freshOverlay = await getOverlay(currentDynasty, newPeriod);
                if (requestSeq !== overlayRequestSeq || dynastySeq !== dynastyRequestSeq
                  || overlayLoadingPeriod !== newPeriod) return;
                clearOverlayGroup(territoryOverlay.group);
                // 重建新 overlay
                const newOverlay = buildTerritoryOverlay(freshOverlay);
                // 把新 group 的资源迁移到旧 group
                while (newOverlay.group.children.length > 0) {
                  territoryOverlay.group.add(newOverlay.group.children[0]);
                }
                // 新疆域淡入（材质从 0 → 各自原始 opacity）
                fadeIn(territoryOverlay.group);
                console.log(`[overlay] 切换到 ${newPeriod} 时期`);
                legend.update(freshOverlay);
                // 新 overlay 的政权标签已插入 DOM，重排泡泡避开标签（避免盖住政权名）
                setTimeout(() => bubbles.resolve(), 100);
              } catch (err) {
                if (requestSeq === overlayRequestSeq && dynastySeq === dynastyRequestSeq
                  && overlayLoadingPeriod === newPeriod) {
                  console.warn('[overlay] 时期切换失败:', err);
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
      }
    });

    // 初始加载
    await loadDynasty(currentDynasty);
    loadingEl.classList.add('hidden');
  } catch (err) {
    console.error('加载失败:', err);
    loadingEl.textContent = '数据加载失败，请确认后端已启动 (localhost:3001)';
    loadingEl.style.color = theme.errorText;
  }
})();
