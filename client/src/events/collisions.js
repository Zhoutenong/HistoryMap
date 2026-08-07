/**
 * 屏幕空间碰撞推挤（纯函数，供 EventBubbles.resolve 与单测复用）。
 *
 * 规则与 EventBubbles 保持一致：
 * - 按年份排序，早出现者优先不动，晚出现者被推挤
 * - fixed 节点（如地图政权标签）不可被推挤，只作为固定障碍
 * - 优先向下推（视觉自然）；垂直将超限时改水平推挤
 *
 * @param {Array<{year:number, rect:{x:number,y:number,w:number,h:number}, fixed?:boolean}>} nodes
 * @param {object} [opts]
 * @param {number} [opts.gap=6]     泡泡间留白（px）
 * @param {number} [opts.maxPush=64] 单方向最大推挤量（px）
 * @returns {Array<{dx:number, dy:number}>} 每个节点的推挤量（与入参顺序一致）
 */
export function resolveCollisions(nodes, { gap = 6, maxPush = 64 } = {}) {
  const result = nodes.map(() => ({ dx: 0, dy: 0 }));
  // 年份升序；固定障碍（year = -Infinity）自然排最前
  const order = nodes
    .map((nd, i) => ({ nd, i }))
    .sort((a, b) => a.nd.year - b.nd.year);

  for (let oi = 0; oi < order.length; oi++) {
    for (let oj = oi + 1; oj < order.length; oj++) {
      const a = order[oi];
      const b = order[oj];
      if (b.nd.fixed) continue; // 障碍物不可被推挤
      const ax = a.nd.rect.x + result[a.i].dx;
      const ay = a.nd.rect.y + result[a.i].dy;
      const bx = b.nd.rect.x + result[b.i].dx;
      const by = b.nd.rect.y + result[b.i].dy;
      const ox = Math.min(ax + a.nd.rect.w, bx + b.nd.rect.w) - Math.max(ax, bx);
      const oy = Math.min(ay + a.nd.rect.h, by + b.nd.rect.h) - Math.max(ay, by);
      if (ox <= 0 || oy <= 0) continue;

      const verticalRoom = maxPush - Math.abs(result[b.i].dy);
      if (oy + gap <= verticalRoom) {
        result[b.i].dy += oy + gap;
      } else {
        const dir = result[b.i].dx <= 0 ? 1 : -1; // 优先向右，已右偏则向左
        const need = Math.min(ox + gap, maxPush);
        result[b.i].dx += need * dir;
      }
    }
  }
  return result;
}

/** 判断两个矩形是否重叠（含零面积边界） */
export function rectsOverlap(a, b) {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return ox > 0 && oy > 0;
}
