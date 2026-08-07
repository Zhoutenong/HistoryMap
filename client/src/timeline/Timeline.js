// 时间轴组件：自动播放 / 暂停 / 拖动。
// 是「当前年份」的唯一状态源，地图与泡泡层都通过 onYearChange 订阅。
// 设计见 AGENTS.md「架构边界」一节。

import { yearToPct, clampYear, tickStep } from './calc.js';

export class Timeline {
  /**
   * @param {object} opts
   * @param {number} opts.start 起始年（含）
   * @param {number} opts.end   结束年（含）
   * @param {number} [opts.tickMs=120] 每推进一年间隔（毫秒）
   * @param {boolean} [opts.autoplay=true] 是否开机自动播放
   * @param {(year:number)=>void} [opts.onChange]
   */
  constructor({ start, end, tickMs = 120, autoplay = true, onChange = () => {} }) {
    this.start = start;
    this.end = end;
    this.tickMs = tickMs;
    this.autoplay = autoplay;
    this.onChange = onChange;

    this.year = start;
    this.playing = false;   // 先置 false，让 play() 能正常启动定时器
    this._timer = null;
    this._dragging = false;

    this._cacheDom();
    this._renderTicks();
    this._bind();
    this._render();
    if (autoplay) {
      this.play();          // play() 内部会把 playing 置 true、设置按钮文案、启动定时器
    } else {
      this.pause();         // 停在 start 年，按钮显示「▶ 播放」
    }
  }

  _cacheDom() {
    this.el = document.getElementById('timeline');
    this.track = document.getElementById('tl-track');
    this.thumb = document.getElementById('tl-thumb');
    this.progress = document.getElementById('tl-progress');
    this.yearLabel = document.getElementById('tl-year');
    this.playBtn = document.getElementById('tl-play');
    this.ticksEl = document.getElementById('tl-ticks');
    this.markersEl = document.getElementById('tl-markers');
  }

  _renderTicks() {
    // 每隔数十年打一个刻度（较密，便于定位）
    const span = this.end - this.start;
    const step = tickStep(span);
    const frag = document.createDocumentFragment();
    for (let y = this.start; y <= this.end; y += step) {
      const t = document.createElement('div');
      t.className = 'tl-tick';
      t.style.left = `${this._yearToPct(y)}%`;
      t.innerHTML = `<span>${y}</span>`;
      frag.appendChild(t);
    }
    this.ticksEl.appendChild(frag);
  }

  _yearToPct(y) {
    return yearToPct(y, this.start, this.end);
  }
  _pctToYear(p) {
    return clampYear(Math.round(this.start + (p / 100) * (this.end - this.start)), this.start, this.end);
  }

  _bind() {
    this.playBtn.addEventListener('click', () => {
      this.toggle();
      // 松开焦点：否则按钮保持聚焦后，空格快捷键会被「输入/按钮聚焦时不响应」逻辑屏蔽
      this.playBtn.blur();
    });

    const onPointerDown = (e) => {
      this._dragging = true;
      this.pause();
      this._updateFromPointer(e);
      const move = (ev) => this._updateFromPointer(ev);
      const up = () => {
        this._dragging = false;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };
    this.track.addEventListener('pointerdown', onPointerDown);

    // 键盘快捷键：空格播放/暂停，←/→ 逐年步进
    // 输入框/按钮聚焦时不响应（避免与输入、按钮触发的空格冲突）
    window.addEventListener('keydown', (e) => this._onKeydown(e));
  }

  _onKeydown(e) {
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
    if (e.code === 'Space') {
      e.preventDefault(); // 防页面滚动
      this.toggle();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.setYear(this.year - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.setYear(this.year + 1);
    }
  }

  _updateFromPointer(e) {
    const rect = this.track.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    this.setYear(this._pctToYear(pct));
  }

  play() {
    if (this.playing) return;
    // 到末尾再点播放：从头重来，避免「点了没反应」
    if (this.year >= this.end) this.setYear(this.start);
    this.playing = true;
    this.playBtn.innerHTML = '<span class="tl-play-icon">❚❚</span>';
    this.playBtn.setAttribute('aria-label', '暂停');
    this._timer = setInterval(() => {
      if (this.year >= this.end) {
        this.pause();
        return;
      }
      this.setYear(this.year + 1);
    }, this.tickMs);
  }

  pause() {
    this.playing = false;
    this.playBtn.innerHTML = '<span class="tl-play-icon">▶</span>';
    this.playBtn.setAttribute('aria-label', '播放');
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  /**
   * 运行时调整播放速度。setInterval 闭包捕获旧 tickMs，故正在播放时需重建定时器。
   * @param {number} ms
   */
  setTickMs(ms) {
    this.tickMs = ms;
    if (this.playing) {
      this.pause();
      this.play();
    }
  }

  /**
   * 运行时调整时间范围（朝代切换用）：
   * 更新边界、重渲染刻度、clamp 当前年并通知订阅者。
   * @param {number} start
   * @param {number} end
   */
  setRange(start, end) {
    this.start = start;
    this.end = end;
    this.year = Math.max(start, Math.min(end, this.year));
    this.ticksEl.innerHTML = '';
    this._renderTicks();
    this._render();
    this.onChange(this.year);
  }

  toggle() {
    this.playing ? this.pause() : this.play();
  }

  setYear(y) {
    y = Math.max(this.start, Math.min(this.end, y));
    if (y === this.year) return;
    this.year = y;
    this._render();
    this.onChange(y);
  }

  _render() {
    const pct = this._yearToPct(this.year);
    this.thumb.style.left = `${pct}%`;
    this.progress.style.width = `${pct}%`;
    this.yearLabel.textContent = `${this.year} 年`;
  }

  /**
   * 渲染事件刻度点：每个事件在轨道上对应一个小圆点，点击跳到该年并回调。
   * 刻度点按分类着色（cat-xxx 与泡泡共用 CSS 变量 --cat）。
   * @param {object[]} events 事件数据数组
   * @param {(ev:object)=>void} [onMarkerClick] 点击刻度点回调
   */
  setEvents(events, onMarkerClick = () => {}) {
    this.markersEl.innerHTML = '';
    this._markers = [];
    events.slice().sort((a, b) => a.year - b.year).forEach((ev) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = `tl-marker cat-${ev.category || 'era'}`;
      dot.style.left = `${this._yearToPct(ev.year)}%`;
      dot.title = `${ev.year}年 · ${ev.short}`;
      // stopPropagation：不触发轨道拖拽，也不让 pointerdown 抢走点击
      dot.addEventListener('pointerdown', (e) => e.stopPropagation());
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setYear(ev.year);
        onMarkerClick(ev);
      });
      this.markersEl.appendChild(dot);
      this._markers.push({ dot, ev });
    });
  }

  /**
   * 按启用的分类过滤刻度点显隐（分类关闭时对应刻度点变淡）。
   * @param {string[]} categories
   */
  filterMarkers(categories) {
    if (!this._markers) return;
    this._markers.forEach(({ dot, ev }) => {
      dot.classList.toggle('off', !categories.includes(ev.category));
    });
  }
}
