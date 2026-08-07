/**
 * 地图图例：显示当前时期各政权的颜色标识。
 *
 * 从 overlay GeoJSON 的 features 中提取 entity + color，
 * 去重后渲染到 #legend 元素。
 */
export class Legend {
  constructor() {
    this.el = document.getElementById('legend');
    /** @type {Array<{entity:string, color:string}>} */
    this._entries = [];
  }

  /**
   * 根据 overlay 数据更新图例。
   * @param {object} overlayGeojson  FeatureCollection
   */
  update(overlayGeojson) {
    if (!overlayGeojson || !overlayGeojson.features) {
      this.el.classList.add('hidden');
      return;
    }

    // 提取所有唯一 entity + color（labelMajor 主叙事政权加粗显示）
    const seen = new Set();
    this._entries = [];
    for (const feat of overlayGeojson.features) {
      const props = feat.properties || {};
      const entity = props.entity;
      const color = props.color;
      if (entity && color && !seen.has(entity)) {
        seen.add(entity);
        this._entries.push({ entity, color, major: !!props.labelMajor });
      }
    }

    if (this._entries.length === 0) {
      this.el.classList.add('hidden');
      return;
    }

    // 渲染：顶部小标题「政权」（设计图风格），每行色块 + 政权名
    this.el.innerHTML = `
      <div class="legend-title">政权</div>
      ${this._entries.map(e => `
        <div class="legend-row${e.major ? ' major' : ''}" data-entity="${e.entity}">
          <span class="legend-swatch" style="background:${e.color}"></span>
          <span>${e.entity}</span>
        </div>
      `).join('')}
    `;
    this._bindHover();

    this.el.classList.remove('hidden');
  }

  /** 隐藏图例 */
  hide() {
    this.el.classList.add('hidden');
  }

  /** 显示图例 */
  show() {
    if (this._entries.length > 0) {
      this.el.classList.remove('hidden');
    }
  }

  /**
   * 行 hover 联动地图上的政权标签：
   * 命中的 .regime-label 加 hover-focus，其余加 hover-dim。
   * 注意：政权标签是 CSS2DObject 元素，CSS2DRenderer 每帧覆盖其 transform，
   * 联动只能改颜色/背景/透明度，不能写 transform 动画。
   */
  _bindHover() {
    // 每次 update 重渲染后重建委托（图例在时期切换时会整体 innerHTML 重建）
    const labels = () => [...document.querySelectorAll('.regime-label')];
    const clear = () => {
      labels().forEach((el) => {
        el.classList.remove('hover-focus', 'hover-dim');
      });
    };
    this.el.querySelectorAll('.legend-row').forEach((row) => {
      row.addEventListener('mouseenter', () => {
        const entity = row.dataset.entity;
        clear();
        labels().forEach((el) => {
          if (el.textContent === entity) el.classList.add('hover-focus');
          else el.classList.add('hover-dim');
        });
      });
      row.addEventListener('mouseleave', clear);
    });
  }
}
