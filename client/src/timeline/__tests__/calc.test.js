import { describe, it, expect } from 'vitest';
import {
  yearToPct,
  clampYear,
  tickStep,
  monthIndex,
  yearMonthFromIndex,
  monthToPct,
  pctToMonth,
  clampMonth,
  withinWindow,
} from '../calc.js';

describe('monthIndex / yearMonthFromIndex', () => {
  it('round-trips year·month ↔ 连续序号', () => {
    expect(monthIndex(960, 1)).toBe(960 * 12);
    expect(monthIndex(960, 12)).toBe(960 * 12 + 11);
    expect(yearMonthFromIndex(monthIndex(1100, 7))).toEqual({ year: 1100, month: 7 });
    expect(yearMonthFromIndex(monthIndex(1279, 12))).toEqual({ year: 1279, month: 12 });
  });
});

describe('monthToPct / pctToMonth', () => {
  it('起点 0%、终点（结束年12月）100%', () => {
    expect(monthToPct(960, 1, 960, 1279)).toBe(0);
    expect(monthToPct(1279, 12, 960, 1279)).toBe(100);
  });

  it('pctToMonth 是 monthToPct 的逆映射', () => {
    // span = 1279·12+11 − 960·12 = 3839；idx = 11520 + 0.38·3839 ≈ 12979 → 1081年8月
    expect(pctToMonth(38, 960, 1279)).toEqual({ year: 1081, month: 8 });
  });

  it('start === end（单年）时防除零', () => {
    expect(monthToPct(960, 1, 960, 960)).toBe(0);
  });
});

describe('yearToPct（年刻度兼容：取该年 1 月在月轨道的位置）', () => {
  it('起点 0%；结束年 1 月 < 100%（12 月才是 100%）', () => {
    expect(yearToPct(960, 960, 1279)).toBe(0);
    expect(yearToPct(1279, 960, 1279)).toBeLessThan(100);
    expect(yearToPct(1279, 960, 1279)).toBeCloseTo(monthToPct(1279, 1, 960, 1279), 5);
  });

  it('start === end 时返回 0（防除零）', () => {
    expect(yearToPct(960, 960, 960)).toBe(0);
  });
});

describe('clampMonth', () => {
  it('月粒度 clamp 到 [起始年1月, 结束年12月]', () => {
    expect(clampMonth(960, 1, 960, 1279)).toEqual({ year: 960, month: 1 });
    expect(clampMonth(900, 5, 960, 1279)).toEqual({ year: 960, month: 1 });
    expect(clampMonth(1300, 3, 960, 1279)).toEqual({ year: 1279, month: 12 });
    expect(clampMonth(1100, 7, 960, 1279)).toEqual({ year: 1100, month: 7 });
  });
});

describe('withinWindow（月份粒度窗口，含端点）', () => {
  it('闭区间判定', () => {
    // 陈桥兵变：960年正月 — 975年 → 窗口 [960·1, 975·12]
    expect(withinWindow(960, 1, 960, 1, 975, 12)).toBe(true);
    expect(withinWindow(960, 1, 960, 1, 975, 1)).toBe(true);
    expect(withinWindow(976, 1, 960, 1, 975, 12)).toBe(false);
    expect(withinWindow(975, 12, 960, 1, 975, 12)).toBe(true);
  });

  it('单年事件窗口 [year·month, year·month_end] 不再早于起点', () => {
    // 若 monthEnd 被兜底为 month，则窗口为单月
    expect(withinWindow(979, 5, 979, 5, 979, 5)).toBe(true);
    expect(withinWindow(979, 4, 979, 5, 979, 5)).toBe(false);
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
