import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

import { buildChinaMap, fitProjection, project } from './map/ChinaMap.js';
import { Timeline } from './timeline/Timeline.js';
import { EventBubbles } from './events/EventBubbles.js';
import { EventLog } from './events/EventLog.js';
import { buildTerritoryOverlay } from './map/TerritoryOverlay.js';
import { Legend } from './map/Legend.js';
import { getMap, getEvents, getMeta, getOverlay } from './api.js';
import { applyTheme, getTheme } from './theme.js';
import { loadSettings, SPEED_MAP } from './settings/store.js';
import { SettingsMenu } from './settings/SettingsMenu.js';
import './styles.css';

// 默认朝代。未来切换朝代只改这个常量 + 后端数据，地图/泡泡层无需改（AGENTS.md 扩展点）。
const DYNASTY = 'song';

const container = document.getElementById('scene-container');
const loadingEl = document.getElementById('loading');

// 应用古典水墨·宣纸主题
applyTheme();
const theme = getTheme();

// —— three.js 基础三件套 ——
const scene = new THREE.Scene();
scene.background = new THREE.Color(theme.bg);

const camera = new THREE.PerspectiveCamera(45, 1, 1, 5000);
camera.position.set(0, -650, 760);

const renderer = new THREE.WebGLRenderer({ antialias: true });
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
controls.minDistance = 300;
controls.maxDistance = 2000;
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
}
animate();

// —— 从后端加载数据并装配 ——
// 用 async IIFE 而非顶层 await，避免老 target 不支持（AGENTS.md 已知坑）
(async () => {
  try {
    const settings = loadSettings();

    // 先加载 meta 确定初始年份，再决定时期
    const meta = await getMeta(DYNASTY);

    // 按年份确定显示哪个时期的疆域：边界由后端 meta.periods 给出，前端不写死
    function getPeriodForYear(year) {
      if (!meta.periods || meta.periods.length === 0) return null;
      const p = meta.periods.find((x) => year >= x.start && year <= x.end);
      return p ? p.id : null;
    }
    function periodLabel(id) {
      const p = meta.periods && meta.periods.find((x) => x.id === id);
      return p ? p.label : id;
    }

    // 初始时期：由 meta 数据驱动；periods 缺失时退到第一个时期（最后防线）
    const initialPeriod = getPeriodForYear(meta.startYear) || meta.periods?.[0]?.id || '1111';

    const [geojson, overlayGeojson, events] = await Promise.all([
      getMap(),
      getOverlay(DYNASTY, initialPeriod),
      getEvents(DYNASTY),
    ]);

    // 标定投影：用历史疆域（覆盖中国及周边）做 fitSize，
    // 保证现代底图即使隐藏，投影仍然有效。必须在任何 project() 调用前完成。
    fitProjection(overlayGeojson);

    const mapGroup = buildChinaMap(geojson);
    mapGroup.visible = settings.showBaseMap;  // 现代底图默认隐藏
    scene.add(mapGroup);

    // 宋代疆域叠加层（设置菜单可开关）
    const territoryOverlay = buildTerritoryOverlay(overlayGeojson);
    territoryOverlay.group.visible = settings.showOverlay;
    scene.add(territoryOverlay.group);

    // 地图图例
    const legend = new Legend();
    legend.update(overlayGeojson);

    // 相机取景：优先用疆域叠加层（始终在视野里），底图隐藏时也能正确取景
    const focusGroup = territoryOverlay.group.children.length
      ? territoryOverlay.group
      : mapGroup;
    const box = new THREE.Box3().setFromObject(focusGroup);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    controls.target.copy(sphere.center);
    const dist = sphere.radius / Math.sin((camera.fov * Math.PI) / 180 / 2);
    camera.position.set(sphere.center.x, sphere.center.y - dist * 0.25, dist);
    controls.update();

    // 详情面板逻辑：打开详情时暂停播放（避免读详情时年份继续跑、聚焦的泡泡过期），
    // 关闭时恢复打开前的播放状态。timeline/bubbles 在下方创建，闭包内运行时访问，安全。
    let resumePlayback = false;
    function showDetail(ev) {
      resumePlayback = timeline.playing;
      timeline.pause();
      detailPanel.innerHTML = `
        <button class="detail-close" title="关闭">×</button>
        <div class="detail-year">${ev.year} 年</div>
        <h2>${ev.title}</h2>
        <p>${ev.detail}</p>
      `;
      detailPanel.classList.remove('hidden');
      detailPanel.querySelector('.detail-close').addEventListener('click', (e) => {
        e.stopPropagation();
        closeDetail();
      });
      bubbles.highlight(ev);
      // 点击事件：相机平滑聚焦到事件位置
      focusOn(ev.coord);
    }

    function closeDetail() {
      detailPanel.classList.add('hidden');
      bubbles.highlight(null);
      if (resumePlayback) timeline.play();
      resumePlayback = false;
    }

    // 点击事件流/刻度点：先跳到事件年份，再打开详情
    const jumpToEvent = (ev) => {
      timeline.setYear(ev.year);
      showDetail(ev);
    };

    // 朝代更替全屏转场横幅（跨过时期边界时短暂压暗 + 时期名），约 2.6s 后自动消失
    const eraBanner = document.getElementById('era-banner');
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
    const logBadge = document.getElementById('log-badge');
    const eventLog = new EventLog({
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

    // 事件泡泡层
    const bubbles = new EventBubbles({
      scene,
      events,
      categories: settings.categories,
      onPick: jumpToEvent,
      onAppear: (ev) => eventLog.add(ev)
    });

    // 点击空白处关闭详情（并恢复播放）；拖拽相机时取消聚焦补间（避免运镜与用户操作打架）
    renderer.domElement.addEventListener('click', () => {
      closeDetail();
    });
    renderer.domElement.addEventListener('pointerdown', () => {
      camTween = null;
    });

    // Esc 关闭详情 / 设置面板
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      closeDetail();
      settingsMenu.hide();
    });

    // 时间轴：当前年份的唯一状态源，起止年由后端 meta 给出
    let prevYear = meta.startYear;
    let currentPeriod = getPeriodForYear(meta.startYear) || '1111';
    const timeline = new Timeline({
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
          try {
            const freshOverlay = await getOverlay(DYNASTY, newPeriod);
            // 移除旧 overlay
            while (territoryOverlay.group.children.length > 0) {
              const child = territoryOverlay.group.children[0];
              child.traverse((node) => {
                if (node.geometry) node.geometry.dispose();
                if (node.material) node.material.dispose();
              });
              territoryOverlay.group.remove(child);
            }
            // 重建新 overlay
            const newOverlay = buildTerritoryOverlay(freshOverlay);
            // 把新 group 的资源迁移到旧 group
            while (newOverlay.group.children.length > 0) {
              territoryOverlay.group.add(newOverlay.group.children[0]);
            }
            console.log(`[overlay] 切换到 ${newPeriod} 时期`);
            legend.update(freshOverlay);
          } catch (err) {
            console.warn('[overlay] 时期切换失败:', err);
          }
        }
        prevYear = y;
      }
    });
    // 初始刷新：prevYear 设为 start-1，让开局就在窗口内的事件也能触发「首次出现」
    bubbles.update(meta.startYear, meta.startYear - 1);
    territoryOverlay.update(meta.startYear);
    watermark.textContent = meta.startYear;  // 水印初始值（autoplay 关闭时 onChange 不会立即触发）

    // 时间轴事件刻度点：点击跳到该年并打开详情；初始按设置过滤分类
    timeline.setEvents(events, (ev) => jumpToEvent(ev));
    timeline.filterMarkers(settings.categories);

    // 时间轴范围标签同步为实际起止年
    document.querySelector('.tl-range').textContent = `${meta.startYear} — ${meta.endYear}`;

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

    loadingEl.classList.add('hidden');
  } catch (err) {
    console.error('加载失败:', err);
    loadingEl.textContent = '数据加载失败，请确认后端已启动 (localhost:3001)';
    loadingEl.style.color = theme.errorText;
  }
})();
