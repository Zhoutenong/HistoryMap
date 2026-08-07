// 右侧历史事件流抽屉。
// 地图上每首次出现一个泡泡，这里就在底部追加一条记录，旧记录自动上移。
// 抽屉可收起（.collapsed）；收起期间新增记录计入未读数，由 onUnread 通知顶栏徽标。

export class EventLog {
  /**
   * @param {object} opts
   * @param {string|HTMLElement} opts.container  信息栏容器（或其选择器）
   * @param {(event:object)=>void} [opts.onPick] 点击记录回调
   * @param {(unread:number)=>void} [opts.onUnread] 未读数变化回调
   */
  constructor({ container, onPick = () => {}, onUnread = () => {} }) {
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
    /** 全部记录（供搜索过滤） */
    this.entries = [];
    this.searchInput = this.el.querySelector('.log-search input');
    this._bindSearch();
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
    entry.innerHTML = `
      <span class="log-year">${ev.year} 年</span>
      <span class="log-short">${ev.short}</span>
    `;
    entry.addEventListener('click', () => this.onPick(ev));
    this.entries.push({ el: entry, ev });

    // 新条目插到最前；配合 CSS column-reverse，视觉上就是从底部冒出来，旧记录上移
    this.list.prepend(entry);
    this.list.scrollTo({ top: 0, behavior: 'smooth' });

    // 抽屉收起时记未读
    if (this.el.classList.contains('collapsed')) {
      this._unread++;
      this.onUnread(this._unread);
    }
  }

  /** 清空全部记录（朝代切换时调用） */
  clear() {
    this.entries = [];
    this.seen.clear();
    this.list.innerHTML = '';
    if (this.searchInput) this.searchInput.value = '';
    this.clearUnread();
  }

  /** 搜索框过滤：按事件简称/标题模糊匹配 */
  _bindSearch() {
    const input = this.el.querySelector('.log-search input');
    if (!input) return;
    input.addEventListener('input', () => {
      const q = input.value.trim();
      this.entries.forEach(({ el, ev }) => {
        const hit = !q || ev.short.includes(q) || (ev.title || '').includes(q) || String(ev.year).includes(q);
        el.style.display = hit ? '' : 'none';
      });
      // 空结果提示
      let empty = this.el.querySelector('.log-empty');
      const visibleCount = this.entries.filter(({ el }) => el.style.display !== 'none').length;
      if (q && visibleCount === 0) {
        if (!empty) {
          empty = document.createElement('div');
          empty.className = 'log-empty';
          this.list.appendChild(empty);
        }
        empty.textContent = '没有匹配的事件';
      } else if (empty) {
        empty.remove();
      }
    });
  }

  /** 展开/收起抽屉；展开时清空未读 */
  toggle() {
    this.el.classList.contains('collapsed') ? this.show() : this.hide();
  }

  show() {
    this.el.classList.remove('collapsed');
    this.clearUnread();
  }

  hide() {
    this.el.classList.add('collapsed');
  }

  clearUnread() {
    if (this._unread === 0) return;
    this._unread = 0;
    this.onUnread(0);
  }
}
