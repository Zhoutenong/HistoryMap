/**
 * 时间轴月份换算（纯函数，供 Timeline 与单测复用）。
 * 时间轴自 960 年「年粒度」升级为「月粒度」：T 时刻用 monthIndex(year, month)
 * 表示（year*12 + month-1，month ∈ 1..12），当前状态始终携带 (year, month)。
 */

/** 年 + 月 → 连续月份序号（0 起）。month 无效值兜底 1。 */
export function monthIndex(year, month) {
  const m = Number.isFinite(month) && month >= 1 && month <= 12 ? month : 1;
  return year * 12 + (m - 1);
}

/** 月份序号 → { year, month } */
export function yearMonthFromIndex(idx) {
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return { year: y, month: m };
}

/**
 * 某年某月 → 轨道百分比（0-100）。
 * 轨道左端 = 起始年 1 月，右端 = 结束年 12 月。
 */
export function monthToPct(year, month, startYear, endYear) {
  const startIdx = monthIndex(startYear, 1);
  const endIdx = monthIndex(endYear, 12);
  const span = endIdx - startIdx;
  if (span <= 0) return 0;
  return ((monthIndex(year, month) - startIdx) / span) * 100;
}

/** 轨道百分比 → { year, month }（clamp 到 [起始年1月, 结束年12月]） */
export function pctToMonth(pct, startYear, endYear) {
  const startIdx = monthIndex(startYear, 1);
  const endIdx = monthIndex(endYear, 12);
  const span = endIdx - startIdx;
  const idx = Math.round(startIdx + (pct / 100) * Math.max(0, span));
  return yearMonthFromIndex(Math.max(startIdx, Math.min(endIdx, idx)));
}

/** (year, month) clamp 到 [起始年1月, 结束年12月]，返回 { year, month } */
export function clampMonth(year, month, startYear, endYear) {
  const startIdx = monthIndex(startYear, 1);
  const endIdx = monthIndex(endYear, 12);
  const idx = Math.max(startIdx, Math.min(endIdx, monthIndex(year, month)));
  return yearMonthFromIndex(idx);
}

/** (year, month) → (year_end, month_end) 窗口内判定（含端点） */
export function withinWindow(year, month, startYear, startMonth, endYear, endMonth) {
  const t = monthIndex(year, month);
  return t >= monthIndex(startYear, startMonth) && t <= monthIndex(endYear, endMonth);
}

// —— 以下为兼容旧测试/刻度步长用的年粒度辅助（刻度按年打仍复用 tickStep）——

/** 年份 → 轨道百分比（0-100）：以「该年 1 月」在月粒度轨道上的位置定位。 */
export function yearToPct(year, start, end) {
  return monthToPct(year, 1, start, end);
}

/** 年份 clamp 到 [start, end] */
export function clampYear(year, start, end) {
  return Math.max(start, Math.min(end, year));
}

/** 按跨度选择刻度步长（与 Timeline._renderTicks 一致） */
export function tickStep(span) {
  return span > 300 ? 40 : span > 120 ? 20 : 10;
}
