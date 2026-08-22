import { describe, it, expect } from 'vitest';
import { chaikin, riverLayerWidths, buildRiverVertices } from '../RiverRibbons.js';

describe('chaikin', () => {
  it('端点保持不变（与 Android RiverRibbonBuilder.chaikin 同语义）', () => {
    const pts = [[0, 0], [10, 0], [10, 10]];
    const out = chaikin(pts);
    expect(out[0]).toEqual([0, 0]);
    expect(out[out.length - 1]).toEqual([10, 10]);
    // 3 点折线 → 首尾 + 2 段 × 2 插值点 = 6 点
    expect(out.length).toBe(6);
  });

  it('少于 3 点原样返回副本', () => {
    const pts = [[0, 0], [1, 1]];
    const out = chaikin(pts);
    expect(out).toEqual(pts);
    expect(out).not.toBe(pts);
  });
});

describe('riverLayerWidths', () => {
  it('层级单调：水痕 > 主体 > 脊线（Android RIVER_*_WIDTH 分档换算）', () => {
    const w = riverLayerWidths(1000, 1);
    expect(w.major).toBe(true);
    expect(w.wash).toBeGreaterThan(w.body);
    expect(w.body).toBeGreaterThan(w.spine);
    expect(w.wash).toBeGreaterThan(0);
  });

  it('rank>1 走 minor 分档（更窄）', () => {
    const major = riverLayerWidths(1000, 1);
    const minor = riverLayerWidths(1000, 2);
    expect(minor.major).toBe(false);
    expect(minor.wash).toBeLessThan(major.wash);
    expect(minor.body).toBeLessThan(major.body);
  });
});

describe('buildRiverVertices', () => {
  it('少于 2 点返回 null', () => {
    expect(buildRiverVertices([[0, 0]])).toBeNull();
    expect(buildRiverVertices([])).toBeNull();
  });

  it('全部重复点（总弧长 0）返回 null', () => {
    expect(buildRiverVertices([[3, 4], [3, 4], [3, 4]])).toBeNull();
  });

  it('直线三角带：交错左右岸、弧长从上游累计、宽度顺流变宽', () => {
    const built = buildRiverVertices([[0, 0], [10, 0]], { washWidth: 8 });
    expect(built.count).toBe(4);
    expect(built.sides).toEqual([1, -1, 1, -1]);
    expect(built.arc).toEqual([0, 0, 10, 10]);
    // 法线 (0,1)：左岸 y = +halfWidth；上游 k=TAPER_HEAD=0.55 → h=8*0.5*0.55=2.2
    // positions 为交错 xy 对：[x0L,y0L, x0R,y0R, x1L,y1L, x1R,y1R]
    expect(built.positions[1]).toBeCloseTo(2.2, 5);
    expect(built.positions[3]).toBeCloseTo(-2.2, 5);
    // 入海口 k=TAPER_MOUTH=1.3 → h=8*0.5*1.3=5.2
    expect(built.positions[5]).toBeCloseTo(5.2, 5);
    expect(built.positions[7]).toBeCloseTo(-5.2, 5);
  });

  it('多段折线宽度沿弧长单调不减（smoothstep 变宽）', () => {
    const built = buildRiverVertices([[0, 0], [10, 0], [20, 0], [30, 0]], { washWidth: 8 });
    const halfAt = (i) => Math.abs(built.positions[i * 4 + 1]);
    for (let i = 1; i < built.count / 2; i++) {
      expect(halfAt(i)).toBeGreaterThanOrEqual(halfAt(i - 1) - 1e-9);
    }
  });
});
