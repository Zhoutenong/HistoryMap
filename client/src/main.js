import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

import { buildChinaMap } from './map/ChinaMap.js';
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

// 应用赛博暗色主题
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
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}
animate();

// —— 从后端加载数据并装配 ——
// 用 async IIFE 而非顶层 await，避免老 target 不支持（AGENTS.md 已知坑）
(async () => {
  try {
    const settings = loadSettings();

    // 按年份确定显示哪个时期的疆域
    function getPeriodForYear(year) {
      if (year < 960) return null;
      if (year < 1127) return '1111';   // 北宋稳定期
      return '1142';                     // 南宋·绍兴和议
    }

    // 先加载 meta 确定初始年份，再决定时期
    const meta = await getMeta(DYNASTY);
    const initialPeriod = getPeriodForYear(meta.startYear) || '1111';

    const [geojson, overlayGeojson, events] = await Promise.all([
      getMap(),
      getOverlay(DYNASTY, initialPeriod),
      getEvents(DYNASTY),
    ]);

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

    // 让相机看向地图并缩放到合适大小
    const box = new THREE.Box3().setFromObject(mapGroup);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    controls.target.copy(sphere.center);
    const dist = sphere.radius / Math.sin((camera.fov * Math.PI) / 180 / 2);
    camera.position.set(sphere.center.x, sphere.center.y - dist * 0.25, dist);
    controls.update();

    // 详情面板逻辑
    function showDetail(ev) {
      detailPanel.innerHTML = `
        <button class="detail-close" title="关闭">×</button>
        <div class="detail-year">${ev.year} 年</div>
        <h2>${ev.title}</h2>
        <p>${ev.detail}</p>
      `;
      detailPanel.classList.remove('hidden');
      detailPanel.querySelector('.detail-close').addEventListener('click', (e) => {
        e.stopPropagation();
        detailPanel.classList.add('hidden');
        bubbles.highlight(null);
      });
      bubbles.highlight(ev);
    }

    // 右侧历史事件信息栏
    const eventLog = new EventLog({
      container: '#event-log',
      onPick: showDetail
    });

    // 事件泡泡层
    const bubbles = new EventBubbles({
      scene,
      events,
      categories: settings.categories,
      onPick: showDetail,
      onAppear: (ev) => eventLog.add(ev)
    });

    // 点击空白处关闭详情
    renderer.domElement.addEventListener('click', () => {
      detailPanel.classList.add('hidden');
      bubbles.highlight(null);
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
        bubbles.update(y, prevYear);
        territoryOverlay.update(y);
        // 跨过时期边界时，重载疆域叠加层
        const newPeriod = getPeriodForYear(y);
        if (newPeriod && newPeriod !== currentPeriod) {
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

    // 时间轴范围标签同步为实际起止年
    document.querySelector('.tl-range').textContent = `${meta.startYear} — ${meta.endYear}`;

    // 设置菜单：分类/速度/自动播放/底图显隐
    new SettingsMenu({
      onChange: (s) => {
        bubbles.setCategories(s.categories);
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
