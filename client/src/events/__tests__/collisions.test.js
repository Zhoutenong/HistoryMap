import { describe, it, expect } from 'vitest';
import { resolveCollisions, rectsOverlap } from '../collisions.js';

// 便捷构造节点：{year, x, y, w, h} → {year, rect, fixed}
const nd = (year, x, y, w = 80, h = 26, fixed = false) => ({ year, rect: { x, y, w, h }, fixed });

describe('resolveCollisions', () => {
  it('同坐标两个节点：晚者被向下推，间隔为 gap', () => {
    const nodes = [nd(960, 100, 100), nd(963, 100, 100)];
    const [a, b] = resolveCollisions(nodes, { gap: 6 });
    expect(a.dx).toBe(0);
    expect(a.dy).toBe(0);
    expect(b.dx).toBe(0);
    expect(b.dy).toBe(26 + 6); // 完全重叠：高度 + gap
  });

  it('部分重叠时推挤量 = 重叠高度 + gap', () => {
    const nodes = [nd(960, 100, 100), nd(963, 110, 105)]; // 上节点 y=100..126，下节点 y=105..131 → 重叠 21
    const [, b] = resolveCollisions(nodes, { gap: 6 });
    expect(b.dy).toBe(21 + 6);
  });

  it('水平方向重叠、垂直不重叠时不做推挤', () => {
    const nodes = [nd(960, 100, 100), nd(963, 100, 200)]; // x 相同（重叠 80），y 相距 74 不重叠
    const [, b] = resolveCollisions(nodes);
    expect(b.dx).toBe(0);
    expect(b.dy).toBe(0);
  });

  it('垂直推挤超限时改为水平推挤（maxPush 限制）', () => {
    // maxPush=50：960→963 推 32；960→966 推 32；
    // 963→966 时垂直余量只剩 18（50-32），不够 32 → 改水平推
    const nodes = [
      nd(960, 100, 100),
      nd(963, 100, 100),
      nd(966, 100, 100),
    ];
    const [a, b, c] = resolveCollisions(nodes, { gap: 6, maxPush: 50 });
    expect(a.dx).toBe(0);
    expect(a.dy).toBe(0);
    expect(b.dx).toBe(0);
    expect(b.dy).toBe(32);
    expect(c.dx).toBeGreaterThan(0); // 垂直余量不足 → 水平推
    expect(c.dy).toBe(32);
    expect(c.dx).toBeLessThanOrEqual(50);
  });

  it('fixed 节点不可被推挤（障碍物）', () => {
    const nodes = [nd(960, 100, 100, 80, 26, true), nd(963, 100, 100)];
    const [, b] = resolveCollisions(nodes, { gap: 6 });
    expect(b.dy).toBe(26 + 6); // 泡泡被推，障碍物不动（fixed 节点无 dx/dy 断言）
  });

  it('不重叠的节点保持零位移', () => {
    const nodes = [nd(960, 0, 0), nd(963, 400, 300)];
    const shifts = resolveCollisions(nodes);
    shifts.forEach((s) => {
      expect(s.dx).toBe(0);
      expect(s.dy).toBe(0);
    });
  });
});

describe('rectsOverlap', () => {
  it('重叠与不重叠', () => {
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 20, w: 10, h: 10 })).toBe(false);
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false); // 恰好相切
  });
});
