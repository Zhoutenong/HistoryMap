import { describe, it, expect } from 'vitest';
import { yearToPct, clampYear, tickStep } from '../calc.js';

describe('yearToPct', () => {
  it('起点 0%、终点 100%、中点 50%', () => {
    expect(yearToPct(960, 960, 1279)).toBe(0);
    expect(yearToPct(1279, 960, 1279)).toBe(100);
    expect(yearToPct((960 + 1279) / 2, 960, 1279)).toBeCloseTo(50, 5);
  });

  it('start === end 时返回 0（防除零）', () => {
    expect(yearToPct(960, 960, 960)).toBe(0);
  });
});

describe('clampYear', () => {
  it('范围内原样、越界收敛', () => {
    expect(clampYear(1100, 960, 1279)).toBe(1100);
    expect(clampYear(900, 960, 1279)).toBe(960);
    expect(clampYear(1300, 960, 1279)).toBe(1279);
  });
});

describe('tickStep', () => {
  it('按跨度选步长', () => {
    expect(tickStep(400)).toBe(40);   // >300
    expect(tickStep(200)).toBe(20);   // >120
    expect(tickStep(100)).toBe(10);   // 其余
  });
});
