// 右侧历史事件信息栏。
// 地图上每首次出现一个泡泡，这里就在底部追加一条记录，旧记录自动上移。

export class EventLog {
  /**
   * @param {object} opts
   * @param {string|HTMLElement} opts.container  信息栏容器（或其选择器）
   * @param {(event:object)=>void} [opts.onPick] 点击记录回调
   */
  constructor({ container, onPick = () => {} }) {
    this.el = typeof container === 'string'
      ? document.querySelector(container)
      : container;
    this.list = this.el.querySelector('.log-list');
    this.onPick = onPick;
    /** 已出现过的泡泡 id，避免回退/重播时重复记录 */
    this.seen = new Set();
  }

  /**
   * 添加一条事件记录。
   * @param {object} ev 事件对象
   */
  add(ev) {
    if (this.seen.has(ev.id)) return;
    this.seen.add(ev.id);

    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `
      <span class="log-year">${ev.year} 年</span>
      <span class="log-short">${ev.short}</span>
    `;
    entry.addEventListener('click', () => this.onPick(ev));

    // 新条目插到最前；配合 CSS column-reverse，视觉上就是从底部冒出来，旧记录上移
    this.list.prepend(entry);
    this.list.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
