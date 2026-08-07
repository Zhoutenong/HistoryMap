// 设置菜单：事件分类（多选）/ 播放速度 / 开机自动播放。
// 持久化走 settings/store.js；每次改动回调 onChange(mergedSettings)。
// 面板用 .hidden toggle，靠齿轮按钮或关闭键控制显隐（不点外部关闭，避免误触）。

import { CATEGORIES, loadSettings, saveSettings } from './store.js';

export class SettingsMenu {
  /**
   * @param {object} opts
   * @param {(settings:object)=>void} [opts.onChange] 设置变更回调，参数为合并后的完整设置
   */
  constructor({ onChange = () => {} } = {}) {
    this.settings = loadSettings();
    this.onChange = onChange;
    this.btn = document.getElementById('settings-btn');
    this.panel = document.getElementById('settings-panel');
    this._render();
    this._bind();
  }

  _render() {
    const { categories, speed, autoplay, showBaseMap, showOverlay } = this.settings;
    const allChecked = CATEGORIES.every((c) => categories.includes(c.id));

    const catRows = CATEGORIES.map((c) => {
      const checked = categories.includes(c.id) ? 'checked' : '';
      return `
        <label class="settings-row">
          <input type="checkbox" data-cat="${c.id}" ${checked}>
          <span class="cat-dot" style="--cat:${c.color}"></span>
          <span class="settings-label">${c.label}</span>
        </label>`;
    }).join('');

    this.panel.innerHTML = `
      <button class="settings-close" title="关闭">×</button>
      <h3>设置</h3>

      <div class="settings-section">
        <div class="settings-section-title">事件分类</div>
        <label class="settings-row">
          <input type="checkbox" data-cat-all ${allChecked ? 'checked' : ''}>
          <span class="settings-label all">全部</span>
        </label>
        ${catRows}
      </div>

      <div class="settings-section">
        <div class="settings-section-title">播放</div>
        <label class="settings-row">
          <input type="checkbox" id="settings-autoplay" ${autoplay ? 'checked' : ''}>
          <span class="settings-label">开机自动播放</span>
        </label>
        <div class="settings-speed">
          <label class="speed-option">
            <input type="radio" name="speed" value="slow" ${speed === 'slow' ? 'checked' : ''}>
            <span>慢</span>
          </label>
          <label class="speed-option">
            <input type="radio" name="speed" value="normal" ${speed === 'normal' ? 'checked' : ''}>
            <span>中</span>
          </label>
          <label class="speed-option">
            <input type="radio" name="speed" value="fast" ${speed === 'fast' ? 'checked' : ''}>
            <span>快</span>
          </label>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">显示</div>
        <label class="settings-row">
          <input type="checkbox" id="settings-overlay" ${showOverlay ? 'checked' : ''}>
          <span class="settings-label">历史疆域</span>
        </label>
        <label class="settings-row">
          <input type="checkbox" id="settings-basemap" ${showBaseMap ? 'checked' : ''}>
          <span class="settings-label">现代底图</span>
        </label>
      </div>
    `;
  }

  _bind() {
    // 齿轮按钮：切换面板显隐；松开焦点，避免屏蔽空格等全局快捷键
    this.btn.addEventListener('click', () => {
      this.btn.blur();
      this.toggle();
    });

    // 面板内交互统一在面板上委托
    this.panel.addEventListener('change', (e) => this._onChange(e));
    // 关闭按钮 + 阻止冒泡合并到同一个 capture 监听：
    // capture 阶段的 stopPropagation 会掐死事件传播（同元素 bubble 阶段的
    // listener 也不会执行），所以「× 关闭」的判断必须放在这里，否则按钮点击失效。
    this.panel.addEventListener('click', (e) => {
      if (e.target.classList.contains('settings-close')) this.hide();
      // 阻止面板内点击冒泡到地图（避免关闭详情面板/触发射线拾取）
      e.stopPropagation();
    }, true);
  }

  _onChange(e) {
    const t = e.target;

    // 「全部」快捷开关
    if (t.dataset.catAll !== undefined) {
      const next = t.checked ? CATEGORIES.map((c) => c.id) : ['era'];
      this._patch({ categories: next });
      return;
    }

    // 单个分类勾选
    if (t.dataset.cat !== undefined) {
      let next = CATEGORIES.filter((c) => {
        const box = this.panel.querySelector(`input[data-cat="${c.id}"]`);
        return box && box.checked;
      }).map((c) => c.id);
      // 空选回退默认，避免地图一片空白
      if (next.length === 0) next = ['era'];
      // 「全部」复选框状态随动
      const allBox = this.panel.querySelector('input[data-cat-all]');
      if (allBox) allBox.checked = CATEGORIES.every((c) => next.includes(c.id));
      this._patch({ categories: next });
      return;
    }

    // 播放速度
    if (t.name === 'speed') {
      this._patch({ speed: t.value });
      return;
    }

    // 开机自动播放
    if (t.id === 'settings-autoplay') {
      this._patch({ autoplay: t.checked });
      return;
    }

    // 疆域叠加层
    if (t.id === 'settings-overlay') {
      this._patch({ showOverlay: t.checked });
      return;
    }

    // 现代底图
    if (t.id === 'settings-basemap') {
      this._patch({ showBaseMap: t.checked });
      return;
    }
  }

  _patch(patch) {
    this.settings = saveSettings(patch);
    this.onChange(this.settings);
  }

  toggle() {
    this.panel.classList.toggle('hidden');
  }

  hide() {
    this.panel.classList.add('hidden');
  }

  show() {
    this.panel.classList.remove('hidden');
  }
}
