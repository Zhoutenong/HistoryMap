// 事件分享卡片（P3）：把事件合成为可传播的 SVG 卡片图
//（地图局部截图 + 年份水印 + 事件简述 + 深链接提示），可下载 PNG / 复制到剪贴板。
// buildEventCardSVG 为纯字符串构造（vitest 覆盖转义/换行/结构）；
// 浏览器侧的截图与 PNG 导出（captureMapImage / svgToPngBlob / copyPngToClipboard）
// 由 main.js 在详情面板「卡片」按钮中调用。

const PAPER_BG = '#e6d8b5';
const INK = '#3a3428';
const VERMILION = '#b03a2e';
const CARD_W = 900;
const CARD_H = 600;

/** XML 属性/文本转义 */
function esc(s = '') {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * CJK 文本按显示宽度换行（中文 1 字宽、ASCII 半字宽）。
 * @param {string} text
 * @param {number} maxWidth 最大宽度（字数计）
 * @param {number} maxLines 最多行数，超出末行加省略号
 */
function wrapText(text, maxWidth, maxLines) {
  const lines = [];
  let line = '';
  let width = 0;
  for (const ch of String(text)) {
    const cp = ch.codePointAt(0);
    const w = cp < 256 ? 0.5 : 1;
    if (width + w > maxWidth) {
      lines.push(line);
      line = '';
      width = 0;
      if (lines.length >= maxLines) break;
    }
    line += ch;
    width += w;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines) {
    // 最后一行若原文还有剩余，补省略号（在宽度内回退一字符）
    const consumed = lines.join('').length;
    if (consumed < String(text).length) {
      let last = lines[maxLines - 1];
      if (last.length >= 2) last = `${last.slice(0, -1)}…`;
      else last = '…';
      lines[maxLines - 1] = last;
    }
  }
  return lines;
}

/** 事件详情首句摘要（与 Android shortEventSummary 同规则：首句 + 截断） */
export function eventSummary(detail = '', max = 56) {
  const text = String(detail).trim();
  if (!text) return '';
  const firstSentence = ['。', '！', '？', '；']
    .map((sep) => text.indexOf(sep))
    .filter((i) => i > 0)
    .sort((a, b) => a - b)[0];
  const sentence = firstSentence !== undefined ? text.slice(0, firstSentence).trim() : text;
  return sentence.length > max ? `${sentence.slice(0, max - 1)}…` : sentence;
}

/**
 * 构建事件卡片 SVG（纯函数）。
 * @param {object} card
 * @param {number} card.year 事件年份（大字水印）
 * @param {string} card.title 事件标题
 * @param {string} [card.place] 地点徽章
 * @param {string} [card.summary] 事件简述（首句）
 * @param {string} [card.dynastyName] 朝代名（右上角印章）
 * @param {string} [card.mapDataUrl] 地图截图 data URL（缺省渲染素色底）
 * @param {string} [card.footnote] 左下角脚注（如站点名）
 * @returns {string} SVG 文本
 */
export function buildEventCardSVG({ year, title, place = '', summary = '', dynastyName = '', mapDataUrl = '', footnote = '中国历史地图 · HistoryMap' }) {
  const summaryLines = wrapText(summary, 30, 4);
  const summarySpans = summaryLines
    .map((line, i) => `<text x="64" y="${448 + i * 34}" font-size="24" fill="${INK}" opacity="0.92">${esc(line)}</text>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  <defs>
    <clipPath id="mapClip"><rect x="0" y="0" width="${CARD_W}" height="340" rx="0"/></clipPath>
  </defs>
  <rect width="${CARD_W}" height="${CARD_H}" fill="${PAPER_BG}"/>
  ${mapDataUrl
    ? `<image href="${esc(mapDataUrl)}" x="0" y="0" width="${CARD_W}" height="340" preserveAspectRatio="xMidYMid slice" clip-path="url(#mapClip)"/>`
    : `<rect x="0" y="0" width="${CARD_W}" height="340" fill="${PAPER_BG}" opacity="0.6"/>`}
  <rect x="0" y="336" width="${CARD_W}" height="8" fill="${VERMILION}" opacity="0.85"/>
  <g font-family="'Noto Serif SC','Songti SC','SimSun',serif">
    <text x="836" y="86" font-size="64" font-weight="700" fill="${VERMILION}" opacity="0.88" text-anchor="end">${esc(String(year).replace(/[^0-9]/g, ''))}</text>
    ${dynastyName ? `<rect x="792" y="104" width="44" height="44" rx="6" fill="${VERMILION}"/><text x="814" y="135" font-size="26" font-weight="700" fill="#fdf8ec" text-anchor="middle">${esc(dynastyName.replace(/朝$/, '').slice(0, 1))}</text>` : ''}
    <text x="64" y="128" font-size="44" font-weight="700" fill="#fdf8ec" stroke="${INK}" stroke-width="1" opacity="0.96">${esc(title)}</text>
    ${place ? `<text x="64" y="168" font-size="22" fill="#fdf8ec" opacity="0.9">◆ ${esc(place)}</text>` : ''}
  </g>
  <text x="64" y="430" font-size="34" font-weight="700" fill="${INK}" font-family="'Noto Serif SC','Songti SC','SimSun',serif">${esc(title)}</text>
  <g font-family="'Noto Serif SC','Songti SC','SimSun',serif">${summarySpans}</g>
  <text x="64" y="${CARD_H - 40}" font-size="18" fill="#6b6353" font-family="'Noto Serif SC','Songti SC','SimSun',serif" opacity="0.85">${esc(footnote)}</text>
</svg>`;
}

/**
 * 截取当前 three.js 渲染画面（同步 render 后立即读，避免 preserveDrawingBuffer 常开）。
 * @returns {string|null} data URL；渲染器不可用时 null
 */
export function captureMapImage(renderer, scene, camera) {
  try {
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/png');
  } catch {
    return null;
  }
}

/**
 * SVG → PNG Blob（2x 分辨率导出）。SVG 内嵌 data URL 图片同源，canvas 不会被污染。
 * @param {string} svgText
 * @returns {Promise<Blob>}
 */
export function svgToPngBlob(svgText, scale = 1.5) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = CARD_W * scale;
      canvas.height = CARD_H * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob 失败'))), 'image/png');
    };
    img.onerror = () => reject(new Error('SVG 加载失败'));
    img.src = url;
  });
}

/** 复制 PNG 到剪贴板（不支持 ClipboardItem 的环境返回 false） */
export async function copyPngToClipboard(blob) {
  try {
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false;
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch {
    return false;
  }
}

/** 触发浏览器下载 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
