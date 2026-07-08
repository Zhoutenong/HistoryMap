import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { project } from '../map/ChinaMap.js';

// 事件泡泡层。
// 显示规则：泡泡只在 [year, yearEnd] 时间窗口内可见，过期自动消失。
// 关键坑（AGENTS.md）：CSS2DRenderer 每帧用 .event-bubble.style.transform 定位，
//   所以脉冲圈、缩放等任何视觉动效都不能写在这个元素上——否则动画期间定位被
//   覆盖，标签会塌到容器原点(左上角)。所有动效都放在内层子元素 .bubble-inner。

export class EventBubbles {
  /**
   * @param {object} opts
   * @param {THREE.Scene} opts.scene
   * @param {Array} opts.events  事件数据数组
   * @param {string[]} [opts.categories] 启用的分类 id 列表（默认 ['era']）
   * @param {(event:object)=>void} opts.onPick  点击泡泡回调
   * @param {(event:object)=>void} [opts.onAppear] 泡泡首次出现回调
   */
  constructor({ scene, events, categories = ['era'], onPick, onAppear = () => {} }) {
    this.scene = scene;
    this.events = events.slice().sort((a, b) => a.year - b.year);
    this.activeCategories = categories.slice();
    this.onPick = onPick;
    this.onAppear = onAppear;
    /** @type {{obj: CSS2DObject, el: HTMLElement, ev}[]} */
    this.items = [];
    this._lastYear = undefined; // 记录最近一次 update 的年份，供 setCategories 重算用
    this._buildAll();
  }

  _buildAll() {
    this.events.forEach((ev, idx) => {
      // 外层 .event-bubble：CSS2D 定位专用，自身永远不写 transform 动画
      const wrap = document.createElement('div');
      wrap.className = 'event-bubble';
      wrap.dataset.year = ev.year;

      // 内层 .bubble-inner：承载所有视觉样式与动效；cat-xxx 供 CSS 按分类配色
      const inner = document.createElement('span');
      inner.className = `bubble-inner cat-${ev.category || 'era'}`;
      inner.innerHTML = `
        <span class="bubble-dot"></span>
        <span class="bubble-short">${ev.short}</span>
      `;
      wrap.appendChild(inner);

      // 点击交给内层，stopPropagation 防止冒泡到地图射线拾取
      inner.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onPick(ev);
      });
      // hover：让其他泡泡变暗，自己不变
      wrap.addEventListener('mouseenter', () => this._dimOthers(idx));
      wrap.addEventListener('mouseleave', () => this._clearDim());

      const obj = new CSS2DObject(wrap);
      const [x, y] = project(ev.coord);
      // 同坐标事件轻微错开，避免完全重叠
      obj.position.set(x, y + (idx % 5) * 4, 12);
      obj.visible = false; // 初始隐藏，update() 按时间窗口控制
      this.scene.add(obj);
      this.items.push({ obj, el: wrap, ev });
    });
  }

  /**
   * 按时间窗口 [year, yearEnd] 刷新可见性，并在「刚出现」时触发脉冲。
   * 只有当前启用分类内的事件才可见；onAppear 也只对启用分类触发。
   * @param {number} year
   * @param {number} [prevYear]
   */
  update(year, prevYear) {
    this._lastYear = year;
    const cats = this.activeCategories;
    this.items.forEach(({ obj, el, ev }) => {
      const inCat = cats.includes(ev.category);
      const inWindow = inCat && year >= ev.year && year <= ev.yearEnd;
      obj.visible = inWindow;

      if (inWindow && prevYear !== undefined && prevYear < ev.year) {
        // 新进入窗口：脉冲（作用在 inner，不碰定位元素）
        const inner = el.querySelector('.bubble-inner');
        inner.classList.remove('pulse');
        void inner.offsetWidth; // 强制重排，重启动画
        inner.classList.add('pulse');
        this.onAppear(ev);
      }
    });
  }

  /**
   * 切换启用的分类，并即时重算可见性（不重发 pulse/onAppear）。
   * @param {string[]} categories
   */
  setCategories(categories) {
    this.activeCategories = categories.slice();
    if (this._lastYear !== undefined) {
      // 静默刷新：把 prevYear 设为当前年，避免触发「刚出现」逻辑
      this.update(this._lastYear, this._lastYear);
    }
  }

  /** hover 时除自己外其他泡泡变暗 */
  _dimOthers(selfIdx) {
    this.items.forEach((it, i) => {
      it.el.classList.toggle('dimmed', i !== selfIdx);
    });
  }
  _clearDim() {
    this.items.forEach((it) => it.el.classList.remove('dimmed'));
  }

  /** 高亮某个事件（详情面板打开时） */
  highlight(event) {
    this.items.forEach((it) => {
      it.el.classList.toggle('is-focus', it.ev === event);
    });
  }
}
