// 设置菜单：事件分类（多选）/ 播放速度 / 开机自动播放。
// 持久化走 settings/store.js；每次改动回调 onChange(mergedSettings)。
// 面板用 .hidden toggle，靠齿轮按钮或关闭键控制显隐（不点外部关闭，避免误触）。

import { CATEGORIES, loadSettings, saveSettings } from './store.js';
import { exportSettingsText, importSettingsText, settingsToParam } from './transfer.js';
import { copyText } from '../share.js';

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
    this._returnFocus = null;
    this._render();
    this._bind();
  }

  _render() {
    const { categories, speed, autoplay, showBaseMap, showOverlay, showRivers, showMountains, showCities, showPlaces, showPrefectures, showSeats, showCounties } = this.settings;
    const allChecked = CATEGORIES.every((c) => categories.includes(c.id));

    const catRows = CATEGORIES.map((c) => {
      const checked = categories.includes(c.id) ? 'checked' : '';
      return `
        <label class="settings-row">
          <input type="checkbox" data-cat="${c.id}" aria-label="显示${c.label}" ${checked}>
          <span class="cat-dot" style="--cat:${c.color}" aria-hidden="true"></span>
          <span class="settings-label">${c.label}</span>
        </label>`;
    }).join('');

    this.panel.innerHTML = `
      <button class="settings-close" type="button" title="关闭设置" aria-label="关闭设置">×</button>
      <h3 id="settings-title">设置</h3>

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
        <label class="settings-row">
          <input type="checkbox" id="settings-rivers" ${showRivers ? 'checked' : ''}>
          <span class="settings-label">河流</span>
        </label>
        <label class="settings-row">
          <input type="checkbox" id="settings-mountains" ${showMountains ? 'checked' : ''}>
          <span class="settings-label">山脉</span>
        </label>
        <label class="settings-row">
          <input type="checkbox" id="settings-cities" ${showCities ? 'checked' : ''}>
          <span class="settings-label">城市</span>
        </label>
        <label class="settings-row">
          <input type="checkbox" id="settings-places" ${showPlaces ? 'checked' : ''}>
          <span class="settings-label">地点</span>
        </label>
        <label class="settings-row">
          <input type="checkbox" id="settings-prefectures" ${showPrefectures ? 'checked' : ''}>
          <span class="settings-label">州府边界</span>
        </label>
        <label class="settings-row">
          <input type="checkbox" id="settings-seats" ${showSeats ? 'checked' : ''}>
          <span class="settings-label">治所标注</span>
        </label>
        <label class="settings-row">
          <input type="checkbox" id="settings-counties" ${showCounties ? 'checked' : ''}>
          <span class="settings-label">县治</span>
        </label>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">设置导入 / 导出</div>
        <div class="settings-transfer-actions">
          <button type="button" class="settings-tf-btn" data-action="export-copy">复制设置</button>
          <button type="button" class="settings-tf-btn" data-action="export-download">下载文件</button>
          <button type="button" class="settings-tf-btn" data-action="export-link">复制分享链接</button>
          <button type="button" class="settings-tf-btn" data-action="import-file">导入文件</button>
        </div>
        <textarea id="settings-import-text" rows="3" placeholder="粘贴设置 JSON，点「应用」导入…"></textarea>
        <div class="settings-transfer-row">
          <button type="button" class="settings-tf-btn primary" data-action="import-apply">应用</button>
          <span id="settings-transfer-status" class="settings-transfer-status" role="status"></span>
        </div>
        <input type="file" id="settings-import-file" class="hidden" accept=".json,application/json">
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
    // 关闭按钮 + 导入导出操作 + 阻止冒泡合并到同一个 capture 监听：
    // capture 阶段的 stopPropagation 会掐死事件传播（同元素 bubble 阶段的
    // listener 也不会执行），所以「× 关闭」的判断必须放在这里，否则按钮点击失效。
    this.panel.addEventListener('click', (e) => {
      if (e.target.classList.contains('settings-close')) this.hide();
      const action = e.target.dataset && e.target.dataset.action;
      if (action) this._onAction(action);
      // 阻止面板内点击冒泡到地图（避免关闭详情面板/触发射线拾取）
      e.stopPropagation();
    }, true);
  }

  _onChange(e) {
    const t = e.target;

    // 设置文件导入（change 事件委托到面板）
    if (t.id === 'settings-import-file') {
      const file = t.files && t.files[0];
      if (file) this._importFile(file);
      t.value = '';  // 允许重复选择同一文件
      return;
    }

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

    const auxiliarySettings = {
      'settings-rivers': 'showRivers',
      'settings-mountains': 'showMountains',
      'settings-cities': 'showCities',
      'settings-places': 'showPlaces',
      'settings-prefectures': 'showPrefectures',
      'settings-seats': 'showSeats',
      'settings-counties': 'showCounties',
    };
    if (auxiliarySettings[t.id]) this._patch({ [auxiliarySettings[t.id]]: t.checked });
  }

  _patch(patch) {
    this.settings = saveSettings(patch);
    this.onChange(this.settings);
  }

  /** 导入/导出操作分发（data-action 按钮，面板上委托）。 */
  async _onAction(action) {
    if (action === 'export-copy') {
      const ok = await copyText(exportSettingsText(this.settings));
      this._setStatus(ok ? '已复制设置 JSON' : '复制失败', !ok);
      return;
    }
    if (action === 'export-download') {
      this._downloadSettings();
      return;
    }
    if (action === 'export-link') {
      const url = `${location.origin}${location.pathname}?s=${settingsToParam(this.settings)}`;
      const ok = await copyText(url);
      this._setStatus(ok ? '已复制分享链接' : '复制失败', !ok);
      return;
    }
    if (action === 'import-file') {
      this.panel.querySelector('#settings-import-file')?.click();
      return;
    }
    if (action === 'import-apply') {
      const ta = this.panel.querySelector('#settings-import-text');
      this._applyImport(ta ? ta.value : '');
    }
  }

  /** 把设置导出为 .json 文件并下载。 */
  _downloadSettings() {
    const blob = new Blob([exportSettingsText(this.settings)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'historymap-settings.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    this._setStatus('已下载设置文件', false);
  }

  /** 读取导入文件（FileReader 异步完成后走同一套文本导入逻辑）。 */
  _importFile(file) {
    const reader = new FileReader();
    reader.onload = () => this._applyImport(String(reader.result || ''));
    reader.onerror = () => this._setStatus('导入失败：文件读取错误', true);
    reader.readAsText(file);
  }

  /** 导入设置文本：校验 → 落库 → 应用 → 刷新面板（非法输入不改动现有设置）。 */
  _applyImport(text) {
    const imported = importSettingsText(text);
    if (!imported) {
      this._setStatus('导入失败：无效的设置 JSON', true);
      return;
    }
    this.settings = saveSettings(imported);
    this.onChange(this.settings);
    this._render();
    this._setStatus('设置已导入', false);
  }

  /** 状态提示（textContent，仅显示固定文案）。 */
  _setStatus(text, isError = false) {
    const el = this.panel.querySelector('#settings-transfer-status');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('error', isError);
  }

  toggle() {
    this.panel.classList.contains('hidden') ? this.show() : this.hide();
  }

  hide({ restoreFocus = true } = {}) {
    this.panel.classList.add('hidden');
    this.panel.setAttribute('aria-hidden', 'true');
    this.btn.setAttribute('aria-expanded', 'false');
    if (restoreFocus && this._returnFocus && typeof this._returnFocus.focus === 'function') {
      this._returnFocus.focus();
    }
    this._returnFocus = null;
  }

  show() {
    this._returnFocus = document.activeElement;
    this.panel.classList.remove('hidden');
    this.panel.setAttribute('aria-hidden', 'false');
    this.btn.setAttribute('aria-expanded', 'true');
    const close = this.panel.querySelector('.settings-close');
    close?.focus();
  }
}
