// 当前唯一主题：古典水墨·宣纸（米白纸底 + 墨色 + 朱砂点缀）。
// 如需再次换肤，把新主题 token 写进 ink 对象即可。

const ink = {
  name: '古典水墨·宣纸',
  bg: '#e6d8b5',
  text: '#3a3428',
  panelBg: 'rgba(244, 240, 228, 0.96)',
  panelBorder: 'rgba(58, 52, 40, 0.28)',
  panelShadow: 'rgba(58, 52, 40, 0.22)',
  accent: '#b03a2e',
  accentText: '#fdf8ec',
  accentHover: '#c4503f',
  bubble: 'rgba(250,246,235,0.96)',
  bubbleHover: 'rgba(176,58,46,0.96)',
  bubbleText: '#3a3428',
  bubbleBorder: 'rgba(58,52,40,0.4)',
  bubbleFocus: '#b03a2e',
  bubbleFocusText: '#fdf8ec',
  bubbleFocusBorder: '#8a2c22',
  bubbleDot: '#b03a2e',
  timelineBgStart: 'rgba(250,246,235,0.95)',
  timelineBgEnd: 'rgba(250,246,235,0.86)',
  timelineTrack: 'rgba(58,52,40,0.14)',
  timelineProgressStart: '#b03a2e',
  timelineProgressEnd: '#d49a2a',
  timelineThumb: '#fdf8ec',
  timelineThumbBorder: '#b03a2e',
  timelineTick: 'rgba(58,52,40,0.35)',
  timelineTickText: 'rgba(58,52,40,0.6)',
  logHeaderBorder: 'rgba(58,52,40,0.14)',
  logEntryBg: 'rgba(58,52,40,0.045)',
  logEntryHover: 'rgba(176,58,46,0.09)',
  mapProvince: 0xe6dfc8,
  mapEdge: 0x8a8272,
  loadingBg: 'rgba(250,246,235,0.95)',
  loadingText: '#3a3428',
  loadingBorder: 'rgba(58,52,40,0.3)',
  errorText: '#b03a2e'
};

let current = ink;

/**
 * 应用水墨主题：把 token 写入 CSS 变量，并记录当前主题供 JS 模块读取。
 */
export function applyTheme() {
  current = ink;

  const root = document.documentElement;
  Object.keys(ink).forEach((key) => {
    if (key === 'name') return;
    if (typeof ink[key] === 'number') return;
    root.style.setProperty(`--${key}`, ink[key]);
  });

  return ink;
}

/**
 * 获取当前主题 token（包含 JS 数值颜色）。
 */
export function getTheme() {
  return current;
}
