import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { project } from '../map/ChinaMap.js';
import { resolveCollisions } from './collisions.js';

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
    /** 折叠状态：同簇 ≥3 个且推挤不开时收成「+N」聚合泡泡 */
    this._folds = [];       // [{ members: items[], aggObj }]
    this._folded = new Set(); // 被折叠隐藏的 item
    this._skipFoldOnce = false; // 展开后跳过本帧折叠（避免立即又收拢）
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
    // 年份变化：清掉旧折叠（聚合对象移除、成员恢复），重新按窗口评估
    this._clearFolds();
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
   * （年份较晚）向下/向侧推挤；同时把地图政权标签视为不可移动障碍物，
   * 避免泡泡盖在政权名上。年份变化与窗口 resize 时调用；
   * 相机拖动期间的瞬时重叠不做实时重排（指向线每帧跟随，可接受）。
   */
  resolve() {
    const visible = this.items.filter((it) => it.obj.visible);
    // 清空偏移
    visible.forEach((it) => this._setShift(it, 0, 0));

    // 1. 读锚点：偏移已清零，getBoundingClientRect 即未推挤时的实际位置。
    //    注意：此方法由 _scheduleResolve 在下一帧渲染后调用（元素已在 DOM 中），
    //    同步直调（如 resize）时可见元素也已在 DOM，均可测得真实矩形。
    const bubbleNodes = visible.map((it) => {
      const r = it.el.getBoundingClientRect();
      return {
        it,
        year: it.ev.year,
        rect: { x: r.left, y: r.top, w: r.width, h: r.height },
        dx: 0,
        dy: 0,
      };
    });

    // 2. 把地图政权标签加入为不可移动障碍物（年份 -Infinity，确保排序最前）
    const labelEls = Array.from(document.querySelectorAll('.regime-label'));
    const labelNodes = labelEls
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({
        it: null,
        year: -Infinity,
        rect: { x: r.left, y: r.top, w: r.width, h: r.height },
        dx: 0,
        dy: 0,
      }));

    // 刚切换时期/首次渲染时，CSS2DRenderer 可能还没把元素插回 DOM，
    // 此时所有矩形都是 0 —— 延迟一帧重试（有上限，防死循环）
    const needRetry =
      (labelEls.length > 0 && labelNodes.length === 0) ||
      (visible.length > 0 && bubbleNodes.length === 0);
    if (needRetry && (this._resolveTries || 0) < 4) {
      this._resolveTries = (this._resolveTries || 0) + 1;
      this._scheduleResolve();
      return;
    }
    this._resolveTries = 0;

    const nodes = [...labelNodes, ...bubbleNodes];
    if (nodes.length < 2) return;

    // 推挤逻辑为纯函数（collisions.js），便于单测；障碍物（标签）标记 fixed 不可推
    const shifts = resolveCollisions(
      nodes.map((nd) => ({ ...nd, fixed: !nd.it })),
      { gap: 6, maxPush: 64 }
    );
    nodes.forEach((nd, i) => {
      if (nd.it) this._setShift(nd.it, shifts[i].dx, shifts[i].dy);
    });
    this._applyFolds(bubbleNodes);
  }

  /**
   * 同屏折叠：推挤后仍互相重叠的泡泡构成「簇」；
   * 簇 ≥3 个时收成「+N」聚合泡泡（点击展开），避免画面拥挤。
   * 展开后的下一帧跳过折叠（_skipFoldOnce），让用户能看到明细。
   */
  _applyFolds(nodes) {
    if (this._skipFoldOnce) {
      this._skipFoldOnce = false;
      return;
    }
    if (nodes.length < 3) return;
    // 并查集按「推挤后仍重叠」聚簇
    const n = nodes.length;
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const ax = a.rect.x + a.dx;
        const ay = a.rect.y + a.dy;
        const bx = b.rect.x + b.dx;
        const by = b.rect.y + b.dy;
        const ox = Math.min(ax + a.rect.w, bx + b.rect.w) - Math.max(ax, bx);
        const oy = Math.min(ay + a.rect.h, by + b.rect.h) - Math.max(ay, by);
        if (ox > 0 && oy > 0) parent[find(i)] = find(j);
      }
    }
    const groups = new Map();
    nodes.forEach((nd, i) => {
      const root = find(i);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(nd);
    });
    groups.forEach((group) => {
      if (group.length < 3) return;
      const members = group.map((g) => g.it);
      members.forEach((it) => {
        this._folded.add(it);
        it.obj.visible = false; // 渲染器下一帧隐藏
      });
      this._createFold(members);
    });
  }

  /** 创建「+N」聚合泡泡（位置取成员世界坐标平均） */
  _createFold(members) {
    let sx = 0;
    let sy = 0;
    members.forEach((it) => {
      sx += it.obj.position.x;
      sy += it.obj.position.y;
    });
    sx /= members.length;
    sy /= members.length;

    const el = document.createElement('div');
    el.className = 'event-bubble fold-bubble';
    const inner = document.createElement('span');
    inner.className = 'bubble-inner cat-era';
    inner.innerHTML = `<span class="bubble-seal"></span><span class="bubble-short">+${members.length} 个事件</span>`;
    el.appendChild(inner);
    inner.addEventListener('click', (e) => {
      e.stopPropagation();
      this._expandFold(members);
    });
    const obj = new CSS2DObject(el);
    obj.position.set(sx, sy, 12);
    this.scene.add(obj);
    this._folds.push({ members, aggObj: obj });
  }

  /** 展开折叠：移除聚合对象、恢复成员可见，并跳过本帧重折叠 */
  _expandFold(members) {
    const f = this._folds.find((x) => x.members === members);
    if (f) {
      if (f.aggObj.element && f.aggObj.element.parentNode) {
        f.aggObj.element.parentNode.removeChild(f.aggObj.element);
      }
      this.scene.remove(f.aggObj);
      this._folds = this._folds.filter((x) => x !== f);
    }
    members.forEach((it) => {
      this._folded.delete(it);
      it.obj.visible = true;
    });
    this._skipFoldOnce = true;
    this._scheduleResolve();
  }

  /** 清空全部折叠（年份变化时调用） */
  _clearFolds() {
    this._folds.forEach(({ aggObj }) => {
      if (aggObj.element && aggObj.element.parentNode) {
        aggObj.element.parentNode.removeChild(aggObj.element);
      }
      this.scene.remove(aggObj);
    });
    this._folds = [];
    this._folded.clear();
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
    // 轻量缓存：位置/颜色未变时跳过 innerHTML 重建（每帧调用，避免无谓 DOM 解析）
    let key = `${shifted.length}|`;
    const parts = shifted.map((it) => {
      const [sx, sy] = this.toScreen(it.obj.position.x, it.obj.position.y, it.obj.position.z);
      const r = it.el.getBoundingClientRect();
      const inner = it.el.querySelector('.bubble-inner');
      const catColor = inner
        ? (getComputedStyle(inner).getPropertyValue('--cat').trim() || '#b03a2e')
        : '#b03a2e';
      return { it, sx, sy, r, catColor };
    });
    parts.forEach(({ sx, sy, r, catColor }) => {
      key += `${sx.toFixed(1)},${sy.toFixed(1)},${r.left.toFixed(1)},${r.top.toFixed(1)},${catColor};`;
    });
    if (key === this._leadersKey) return;
    this._leadersKey = key;

    let markup = '';
    parts.forEach(({ sx, sy, r, catColor }) => {
      const cx = r.left + r.width / 2;
      const topY = r.top + 2;
      // 方向（锚点 → 泡泡底边），线终点留出箭头空间
      const dx = cx - sx;
      const dy = topY - sy;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const endX = cx - ux * 6;
      const endY = topY - uy * 6;
      // 箭头三角（指向泡泡）与锚点圆点
      const ax = endX + ux * 5;
      const ay = endY + uy * 5;
      const px = -uy;
      const py = ux;
      markup += `<line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${endX.toFixed(1)}" y2="${endY.toFixed(1)}" stroke="rgba(58,52,40,0.62)" stroke-width="1.5" stroke-dasharray="4 3"/>`;
      markup += `<polygon points="${ax.toFixed(1)},${ay.toFixed(1)} ${(endX + px * 3.5).toFixed(1)},${(endY + py * 3.5).toFixed(1)} ${(endX - px * 3.5).toFixed(1)},${(endY - py * 3.5).toFixed(1)}" fill="${catColor}" opacity="0.85"/>`;
      markup += `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="3" fill="${catColor}" stroke="#fdf8ec" stroke-width="1" opacity="0.92"/>`;
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

  /** 销毁全部泡泡与聚合对象（朝代切换时调用，之后可重建新实例） */
  dispose() {
    this._clearFolds();
    this.items.forEach(({ obj, el }) => {
      if (el.parentNode) el.parentNode.removeChild(el);
      this.scene.remove(obj);
    });
    this.items = [];
    if (this.leadersSvg) this.leadersSvg.innerHTML = '';
  }
}
