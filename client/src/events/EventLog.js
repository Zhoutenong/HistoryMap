// 右侧历史事件流抽屉。
// 地图上每首次出现一个泡泡，这里就在底部追加一条记录，旧记录自动上移。
// 抽屉可收起（.collapsed）；收起期间新增记录计入未读数，由 onUnread 通知顶栏徽标。
import { clearChildren } from '../dom.js';

/** 搜索事件的可读字段；保持纯函数，便于在无 DOM 环境下测试。 */
export function matchesEvent(ev, query) {
  const text = [ev.short, ev.title, ev.detail, ev.place, ev.impact, ev.year]
    .filter((value) => value !== undefined && value !== null)
    .join(' ')
    .toLocaleLowerCase();
  return text.includes(query.trim().toLocaleLowerCase());
}

// 字段权重：标题/简称命中相关性最高，地点次之，正文最低；前缀/精确命中加乘。
const SEARCH_FIELDS = [
  ['short', 40],
  ['title', 40],
  ['place', 15],
  ['impact', 8],
  ['detail', 5],
];

function scoreEvent(ev, q) {
  let score = 0;
  for (const [key, weight] of SEARCH_FIELDS) {
    const value = ev[key];
    if (value === undefined || value === null) continue;
    const text = String(value).toLocaleLowerCase();
    if (text === q) score += weight * 3;
    else if (text.startsWith(q)) score += weight * 2;
    else if (text.includes(q)) score += weight;
  }
  const yearText = String(ev.year ?? '');
  if (yearText === q) score += 25;
  else if (yearText.includes(q)) score += 8;
  return score;
}

/**
 * 搜索事件并按相关性排序：命中得分高者在前，同分按年份、id 升序（结果稳定）。
 * 只返回匹配的事件；空查询返回空数组（空查询走「已出现记录」分支）。
 * @param {Array<object>} events 当前朝代完整事件索引
 * @param {string} query 搜索词
 * @returns {Array<object>}
 */
export function searchEvents(events, query) {
  const q = String(query || '').trim().toLocaleLowerCase();
  if (!q) return [];
  const scored = [];
  for (const ev of events) {
    const score = scoreEvent(ev, q);
    if (score > 0) scored.push({ ev, score });
  }
  scored.sort((a, b) => b.score - a.score || a.ev.year - b.ev.year || a.ev.id - b.ev.id);
  return scored.map((item) => item.ev);
}

/**
 * 把文本按查询词拆成「命中/未命中」段（不区分大小写，全部出现位置）。
 * 返回 [{ text, match }]，供调用方以安全 DOM 方式渲染 <mark>，不经 innerHTML。
 * @param {string} text
 * @param {string} query
 * @returns {Array<{text: string, match: boolean}>}
 */
export function splitHighlight(text, query) {
  const str = String(text);
  const q = String(query || '').trim().toLocaleLowerCase();
  if (!q) return [{ text: str, match: false }];
  const segments = [];
  const lower = str.toLocaleLowerCase();
  let pos = 0;
  while (pos < str.length) {
    const idx = lower.indexOf(q, pos);
    if (idx === -1) {
      if (pos < str.length) segments.push({ text: str.slice(pos), match: false });
      break;
    }
    if (idx > pos) segments.push({ text: str.slice(pos, idx), match: false });
    segments.push({ text: str.slice(idx, idx + q.length), match: true });
    pos = idx + q.length;
  }
  if (!segments.length) segments.push({ text: str, match: false });
  return segments;
}

/** 按 splitHighlight 段结构向父节点追加文本节点/<mark> 节点（纯 DOM 构造）。 */
function appendHighlight(parent, text, query) {
  for (const seg of splitHighlight(text, query)) {
    if (seg.match) {
      const mark = document.createElement('mark');
      mark.textContent = seg.text;
      parent.appendChild(mark);
    } else {
      parent.appendChild(document.createTextNode(seg.text));
    }
  }
}

export class EventLog {
  /**
   * @param {object} opts
   * @param {string|HTMLElement} opts.container  信息栏容器（或其选择器）
   * @param {(event:object)=>void} [opts.onPick] 点击记录回调
   * @param {(unread:number)=>void} [opts.onUnread] 未读数变化回调
   * @param {Array<object>} [opts.events] 当前朝代的完整搜索索引
   */
  constructor({ container, onPick = () => {}, onUnread = () => {}, events = [] }) {
    this.el = typeof container === 'string'
      ? document.querySelector(container)
      : container;
    this.list = this.el.querySelector('.log-list');
    this.onPick = onPick;
    this.onUnread = onUnread;
    /** 已出现过的泡泡 id，避免回退/重播时重复记录 */
    this.seen = new Set();
    /** 抽屉收起期间新增的未读数 */
    this._unread = 0;
    /** 已播放/出现的记录（搜索为空时唯一显示来源） */
    this.entries = [];
    /** 当前朝代的完整搜索索引，不改变已出现记录和未读语义 */
    this.events = [];
    this._searchTimer = null;
    this.searchInput = this.el.querySelector('.log-search input');
    this.toggleButton = document.getElementById('log-toggle');
    this.closeButton = document.getElementById('log-close');
    this._returnFocus = null;
    this.setEvents(events);
    this._bindSearch();
  }

  /** 设置当前朝代的完整搜索索引；不会改变已出现记录。 */
  setEvents(events = []) {
    this.events = Array.isArray(events) ? events.slice() : [];
    this._renderSearch(this.searchInput ? this.searchInput.value : '');
  }

  /**
   * 添加一条事件记录。
   * @param {object} ev 事件对象
   */
  add(ev) {
    if (this.seen.has(ev.id)) return;
    this.seen.add(ev.id);

    const entry = document.createElement('div');
    // cat-xxx 供 CSS 按分类给条目左侧色条配色（与泡泡/刻度点共用 --cat）
    entry.className = `log-entry cat-${ev.category || 'era'}`;
    entry.setAttribute('role', 'listitem');
    entry.tabIndex = 0;
    entry.setAttribute('aria-label', `${ev.year}年${ev.month || 1}月，${ev.short || '未命名事件'}`);
    const year = document.createElement('span');
    year.className = 'log-year';
    year.textContent = `${ev.year}年${ev.month || 1}月`;
    const short = document.createElement('span');
    short.className = 'log-short';
    short.textContent = ev.short || '未命名事件';
    entry.append(year, short);
    entry.addEventListener('click', () => this.onPick(ev));
    entry.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.onPick(ev);
      }
    });
    this.entries.push({ el: entry, ev });

    // 新条目插到最前；配合 CSS column-reverse，视觉上就是从底部冒出来，旧记录上移
    this.list.prepend(entry);
    this.list.scrollTo({ top: 0, behavior: 'smooth' });
    this._renderSearch(this.searchInput ? this.searchInput.value : '');

    // 抽屉收起时记未读
    if (this.el.classList.contains('collapsed')) {
      this._unread++;
      this.onUnread(this._unread);
    }
  }

  /** 清空全部记录（朝代切换时调用） */
  clear() {
    this.entries = [];
    this.events = [];
    this.seen.clear();
    clearChildren(this.list);
    if (this.searchInput) {
      this.searchInput.value = '';
      this.searchInput.removeAttribute('aria-label');
    }
    clearTimeout(this._searchTimer);
    this.clearUnread();
  }

  /** 搜索框过滤：搜索完整索引，空查询只显示已出现记录。 */
  _bindSearch() {
    if (!this.searchInput) return;
    this.searchInput.addEventListener('input', () => {
      // 搜索是本地内存过滤，不需要异步防抖；立即渲染可保证键入后
      // 结果节点与当前输入同步，避免自动化或快速操作读到旧 DOM。
      clearTimeout(this._searchTimer);
      this._searchTimer = null;
      this._renderSearch(this.searchInput.value);
    });
  }

  _renderSearch(value = '') {
    if (!this.list) return;
    const query = value.trim();
    // 搜索时用 searchEvents 返回「相关性排序」的命中；空查询只显示已出现记录
    const matches = query
      ? searchEvents(this.events, query).map((ev) => ({
        ev,
        entry: this.entries.find((item) => item.ev.id === ev.id),
      }))
      : this.entries.map((entry) => ({ ev: entry.ev, entry }));
    const visibleIds = new Set(matches.map(({ ev }) => ev.id));
    this.entries.forEach(({ el, ev }) => {
      el.style.display = visibleIds.has(ev.id) ? '' : 'none';
      el.classList.toggle('is-search-match', Boolean(query && visibleIds.has(ev.id)));
    });
    let results = this.el.querySelector('.log-search-results');
    if (query) {
      if (!results) {
        results = document.createElement('div');
        results.className = 'log-search-results';
        this.list.prepend(results);
      }
      clearChildren(results);
      matches.forEach(({ ev }) => {
        // 搜索结果始终使用独立的结果节点，即使事件已经在时间轴播放并
        // 出现在 entries 中；这样已出现和未出现的事件具有一致的搜索交互。
        const result = document.createElement('button');
        result.type = 'button';
        result.className = 'log-entry log-search-result';
        result.setAttribute('aria-label', `${ev.year}年${ev.month || 1}月，${ev.short || ev.title || '未命名事件'}`);
        const year = document.createElement('span');
        year.className = 'log-year';
        appendHighlight(year, `${ev.year}年${ev.month || 1}月`, query);
        const short = document.createElement('span');
        short.className = 'log-short';
        appendHighlight(short, ev.short || ev.title || '未命名事件', query);
        result.append(year, short);
        result.addEventListener('click', () => this.onPick(ev));
        results.appendChild(result);
      });
      if (!matches.length) {
        const empty = document.createElement('div');
        empty.className = 'log-empty';
        empty.textContent = '没有匹配的事件';
        results.appendChild(empty);
      }
    } else if (results) {
      results.remove();
    }
  }

  /** 展开/收起抽屉；展开时清空未读 */
  toggle() {
    this.el.classList.contains('collapsed') ? this.show() : this.hide();
  }

  show() {
    this._returnFocus = document.activeElement;
    this.el.classList.remove('collapsed');
    this.el.setAttribute('aria-hidden', 'false');
    this.toggleButton?.setAttribute('aria-expanded', 'true');
    this.toggleButton?.setAttribute('aria-label', '关闭历史事件流');
    this.clearUnread();
    this.closeButton?.focus();
  }

  hide({ restoreFocus = true } = {}) {
    this.el.classList.add('collapsed');
    this.el.setAttribute('aria-hidden', 'true');
    this.toggleButton?.setAttribute('aria-expanded', 'false');
    this.toggleButton?.setAttribute('aria-label', '打开历史事件流');
    if (restoreFocus && this._returnFocus && typeof this._returnFocus.focus === 'function') {
      this._returnFocus.focus();
    }
    this._returnFocus = null;
  }

  clearUnread() {
    if (this._unread === 0) return;
    this._unread = 0;
    this.onUnread(0);
  }
}
