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

    // 提取所有唯一 entity + color
    const seen = new Set();
    this._entries = [];
    for (const feat of overlayGeojson.features) {
      const props = feat.properties || {};
      const entity = props.entity;
      const color = props.color;
      if (entity && color && !seen.has(entity)) {
        seen.add(entity);
        this._entries.push({ entity, color });
      }
    }

    if (this._entries.length === 0) {
      this.el.classList.add('hidden');
      return;
    }

    // 渲染
    this.el.innerHTML = this._entries.map(e => `
      <div class="legend-row">
        <span class="legend-swatch" style="background:${e.color};box-shadow:0 0 6px ${e.color}"></span>
        <span>${e.entity}</span>
      </div>
    `).join('');

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
}
