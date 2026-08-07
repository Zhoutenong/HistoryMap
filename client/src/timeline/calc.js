/**
 * 时间轴年份换算（纯函数，供 Timeline 与单测复用）。
 */

/** 年份 → 轨道百分比（0-100） */
export function yearToPct(year, start, end) {
  if (end <= start) return 0;
  return ((year - start) / (end - start)) * 100;
}

/** 年份 clamp 到 [start, end] */
export function clampYear(year, start, end) {
  return Math.max(start, Math.min(end, year));
}

/** 按跨度选择刻度步长（与 Timeline._renderTicks 一致） */
export function tickStep(span) {
  return span > 300 ? 40 : span > 120 ? 20 : 10;
}
