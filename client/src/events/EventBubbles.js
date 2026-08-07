import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { project } from '../map/ChinaMap.js';

// 事件泡泡层。
// 显示规则：泡泡只在 [year, yearEnd] 时间窗口内可见，过期自动消失。
// 关键坑（AGENTS.md）：CSS2DRenderer 每帧用 .event-bubble.style.transform 定位，
//   所以脉冲圈、缩放等任何视觉动效都不能写在这个元素上——否则动画期间定位被
//   覆盖，标签会塌到容器原点(左上角)。所有动效都放在内层子元素 .bubble-inner。
// 碰撞避让：同屏多个泡泡重叠时（如 963 年陈桥兵变与杯酒释兵权坐标完全相同），
//   在屏幕空间做推挤，偏移写在 .bubble-shift 的 left/top（渲染器不动它），
//   并用 SVG 指向线从事件真实位置连到被推开的泡泡。

export class EventBubbles {
  /**
   * @param {object} opts
   * @param {THREE.Scene} opts.scene
   * @param {Array} opts.events  事件数据数组
   * @param {string[]} [opts.categories] 启用的分类 id 列表（默认 ['era']）
   * @param {(event:object)=>void} opts.onPick  点击泡泡回调
   * @param {(event:object)=>void} [opts.onAppear] 泡泡首次出现回调
   * @param {(x:number,y:number,z:number)=>[number,number]} [opts.toScreen]
   *   世界坐标 → 屏幕 CSS 像素（main.js 提供）；缺省则指向线功能禁用
   * @param {HTMLElement} [opts.leadersHost] 指向线 SVG 的挂载容器（labelRenderer.domElement）
   */
  constructor({ scene, events, categories = ['era'], onPick, onAppear = () => {}, toScreen = null, leadersHost = null }) {
    this.scene = scene;
    this.events = events.slice().sort((a, b) => a.year - b.year);
    this.activeCategories = categories.slice();
    this.onPick = onPick;
    this.onAppear = onAppear;
    this.toScreen = toScreen;
    /** @type {{obj: CSS2DObject, el: HTMLElement, shift: HTMLElement, ev, dx:number, dy:number}[]} */
    this.items = [];
    this._lastYear = undefined; // 记录最近一次 update 的年份，供 setCategories 重算用
    this._buildAll();
    this._buildLeaders(leadersHost);
  }

  _buildAll() {
    this.events.forEach((ev, idx) => {
      // 外层 .event-bubble：CSS2D 定位专用，自身永远不写 transform 动画
      const wrap = document.createElement('div');
      wrap.className = 'event-bubble';
      wrap.dataset.year = ev.year;

      // 偏移层 .bubble-shift：碰撞避让的屏幕偏移写这里（left/top），
      // 与渲染器写入父级的 transform 互不冲突
      const shift = document.createElement('div');
      shift.className = 'bubble-shift';

      // 内层 .bubble-inner：承载所有视觉样式与动效；cat-xxx 供 CSS 按分类配色。
      // 印章式结构：竖条印章（.bubble-seal，顶部圆点）+ 横向事件名。
      const inner = document.createElement('span');
      inner.className = `bubble-inner cat-${ev.category || 'era'}`;
      inner.innerHTML = `
        <span class="bubble-seal"></span>
        <span class="bubble-short">${ev.short}</span>
      `;
      shift.appendChild(inner);
      wrap.appendChild(shift);

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
      // 同坐标事件轻微错开（世界坐标），屏幕空间再做碰撞推挤
      obj.position.set(x, y + (idx % 5) * 4, 12);
      obj.visible = false; // 初始隐藏，update() 按时间窗口控制
      this.scene.add(obj);
      this.items.push({ obj, el: wrap, shift, ev, dx: 0, dy: 0 });
    });
  }

  /** 指向线 SVG 层：铺满容器、不拦事件，挂在 labelRenderer 之上 */
  _buildLeaders(host) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'bubble-leaders');
    svg.style.display = 'none';
    this.leadersSvg = svg;
    if (host) host.appendChild(svg);
  }

  /**
   * 按时间窗口 [year, yearEnd] 刷新可见性，并在「刚出现」时触发脉冲。
   * 只有当前启用分类内的事件才可见；onAppear 也只对启用分类触发。
   * 可见性刷新后做屏幕空间碰撞避让。
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
    // 碰撞解析延迟到下一帧：CSS2DRenderer 会把不可见元素的 DOM 摘除、
    // 可见元素在渲染时才插回 DOM，同步测量拿不到矩形（全 0）。
    this._scheduleResolve();
  }

  /** 下一帧渲染后再做碰撞解析（同帧多次 update 只排一次） */
  _scheduleResolve() {
    if (this._resolvePending) return;
    this._resolvePending = true;
    requestAnimationFrame(() => {
      this._resolvePending = false;
      this.resolve();
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

  /**
   * 屏幕空间碰撞避让：读可见泡泡的实际矩形，重叠时把「后出现者」
   * （年份较晚）向下/向侧推挤。年份变化与窗口 resize 时调用；
   * 相机拖动期间的瞬时重叠不做实时重排（指向线每帧跟随，可接受）。
   */
  resolve() {
    const visible = this.items.filter((it) => it.obj.visible);
    // 清空偏移
    visible.forEach((it) => this._setShift(it, 0, 0));
    if (visible.length < 2) return;

    // 1. 读锚点：偏移已清零，getBoundingClientRect 即未推挤时的实际位置。
    //    注意：此方法由 _scheduleResolve 在下一帧渲染后调用（元素已在 DOM 中），
    //    同步直调（如 resize）时可见元素也已在 DOM，均可测得真实矩形。
    const nodes = visible.map((it) => {
      const r = it.el.getBoundingClientRect();
      return {
        it,
        year: it.ev.year,
        rect: { x: r.left, y: r.top, w: r.width, h: r.height },
        dx: 0,
        dy: 0,
      };
    });
    // 年份早者优先不动，晚者被推挤（同坐标时按年份先后分离）
    nodes.sort((a, b) => a.year - b.year);

    const GAP = 6;        // 泡泡间留白
    const MAX_PUSH = 64;  // 单方向最大推挤量（px）

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const ax = a.rect.x + a.dx;
        const ay = a.rect.y + a.dy;
        const bx = b.rect.x + b.dx;
        const by = b.rect.y + b.dy;
        const ox = Math.min(ax + a.rect.w, bx + b.rect.w) - Math.max(ax, bx);
        const oy = Math.min(ay + a.rect.h, by + b.rect.h) - Math.max(ay, by);
        if (ox <= 0 || oy <= 0) continue;

        // 优先向下推（视觉上自然）；垂直将超限时改水平推挤
        const verticalRoom = MAX_PUSH - Math.abs(b.dy);
        if (oy + GAP <= verticalRoom) {
          b.dy += oy + GAP;
        } else {
          const dir = b.dx <= 0 ? 1 : -1; // 优先向右，已右偏则向左
          const need = Math.min(ox + GAP, MAX_PUSH);
          b.dx += need * dir;
        }
      }
    }

    nodes.forEach((n) => this._setShift(n.it, n.dx, n.dy));
  }

  /**
   * 每帧同步指向线（在 labelRenderer.render() 之后调用）。
   * 只绘制被推开的泡泡：从事件真实位置（世界坐标 → 屏幕）画虚线到泡泡实际中心，
   * 相机拖动时逐帧跟随。
   */
  syncLeaders() {
    const svg = this.leadersSvg;
    if (!svg || !this.toScreen) return;
    const shifted = this.items.filter(
      (it) => it.obj.visible && Math.abs(it.dx) + Math.abs(it.dy) > 4
    );
    if (shifted.length === 0) {
      svg.style.display = 'none';
      return;
    }
    svg.style.display = 'block';
    let markup = '';
    shifted.forEach((it) => {
      const [sx, sy] = this.toScreen(it.obj.position.x, it.obj.position.y, it.obj.position.z);
      const r = it.el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      // 线连到泡泡底边中点（视觉上更自然），锚点画朱砂圆点（带纸色描边，色块上更醒目）
      markup += `<line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${(r.top + 2).toFixed(1)}" stroke="rgba(58,52,40,0.62)" stroke-width="1.5" stroke-dasharray="4 3"/>`;
      markup += `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="3" fill="#b03a2e" stroke="#fdf8ec" stroke-width="1" opacity="0.92"/>`;
    });
    svg.innerHTML = markup;
  }

  _setShift(it, dx, dy) {
    it.dx = dx;
    it.dy = dy;
    it.shift.style.left = `${dx}px`;
    it.shift.style.top = `${dy}px`;
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
