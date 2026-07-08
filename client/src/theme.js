// 当前唯一主题：赛博暗色（荧光霓虹）。
// 如需再次换肤，把新主题 token 写进 cyber 对象即可。

const cyber = {
  name: '赛博暗色',
  bg: '#050a14',
  text: '#d0f0ff',
  panelBg: 'rgba(6,14,26,0.96)',
  panelBorder: 'rgba(0,240,255,0.4)',
  panelShadow: 'rgba(0,240,255,0.15)',
  accent: '#ff2a6d',
  accentText: '#ffffff',
  accentHover: '#ff5a8f',
  bubble: 'rgba(255,42,109,0.92)',
  bubbleHover: 'rgba(255,80,140,1)',
  bubbleText: '#ffffff',
  bubbleBorder: 'rgba(255,42,109,0.6)',
  bubbleFocus: '#00f0ff',
  bubbleFocusText: '#050a14',
  bubbleFocusBorder: '#00f0ff',
  bubbleDot: '#ffffff',
  timelineBgStart: 'rgba(6,14,26,0.96)',
  timelineBgEnd: 'rgba(6,14,26,0.6)',
  timelineTrack: 'rgba(208,240,255,0.12)',
  timelineProgressStart: '#00f0ff',
  timelineProgressEnd: '#ff2a6d',
  timelineThumb: '#d0f0ff',
  timelineThumbBorder: '#00f0ff',
  timelineTick: 'rgba(208,240,255,0.25)',
  timelineTickText: 'rgba(208,240,255,0.55)',
  logHeaderBorder: 'rgba(208,240,255,0.08)',
  logEntryBg: 'rgba(208,240,255,0.05)',
  logEntryHover: 'rgba(208,240,255,0.12)',
  mapProvince: 0x0d1f2d,
  mapEdge: 0x2a8fbd,
  mapOcean: 0x082038,
  territoryFill: '#00f0ff',
  territoryBorder: '#00f0ff',
  territoryOpacity: 0.35,
  loadingBg: 'rgba(6,14,26,0.9)',
  loadingText: '#00f0ff',
  loadingBorder: 'rgba(0,240,255,0.4)',
  errorText: '#ff2a6d'
};

let current = cyber;

/**
 * 应用赛博暗色主题：把 token 写入 CSS 变量，并记录当前主题供 JS 模块读取。
 */
export function applyTheme() {
  current = cyber;

  const root = document.documentElement;
  Object.keys(cyber).forEach((key) => {
    if (key === 'name') return;
    if (typeof cyber[key] === 'number') return;
    root.style.setProperty(`--${key}`, cyber[key]);
  });

  return cyber;
}

/**
 * 获取当前主题 token（包含 JS 数值颜色）。
 */
export function getTheme() {
  return current;
}
