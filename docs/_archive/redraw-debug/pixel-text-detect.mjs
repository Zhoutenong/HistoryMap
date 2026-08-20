#!/usr/bin/env node
/**
 * 精确文字检测：在每个标注预期位置附近，找与背景色差异最大的像素行。
 */
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';

const imgPath = 'artifacts/audit/post-fix2-main.png';
const buf = readFileSync(imgPath);
let pos = 8;
const idat = [];
let width = 0, height = 0, bitDepth = 0, colorType = 0;
while (pos + 12 <= buf.length) {
  const len = buf.readUInt32BE(pos);
  const type = buf.toString('ascii', pos + 4, pos + 8);
  const data = buf.subarray(pos + 8, pos + 8 + len);
  if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
  else if (type === 'IDAT') { idat.push(data); }
  pos += 12 + len;
}
const channels = colorType === 6 ? 4 : 3;
const raw = zlib.inflateSync(Buffer.concat(idat));
const stride = width * channels;
const px = Buffer.alloc(width * height * 3);
const line = Buffer.alloc(stride);
let off = 0;
for (let y = 0; y < height; y++) {
  const f = raw[off++];
  for (let x = 0; x < stride; x++) {
    const v = raw[off++];
    const left = x >= channels ? line[x - channels] : 0;
    const up = y > 0 ? px[(y - 1) * stride + x] : 0;
    const ul = y > 0 && x >= channels ? px[(y - 1) * stride + x - channels] : 0;
    let a = v;
    switch (f) {
      case 1: a = (v + left) & 255; break;
      case 2: a = (v + up) & 255; break;
      case 3: a = (v + ((left + up) >> 1)) & 255; break;
      case 4: { const p = left + up - ul; const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - ul); const pr = pa <= pb && pa <= pc ? left : pb <= pc ? up : ul; a = (v + pr) & 255; break; }
    }
    line[x] = a; px[y * stride + x] = a;
  }
}

function getPixel(x, y) {
  if (x < 0 || x >= width || y < 0 || y >= height) return null;
  const i = y * stride + x * channels;
  return [px[i], px[i + 1], px[i + 2]];
}

function probeAvg(cx, cy, w, h) {
  let rS = 0, gS = 0, bS = 0, nS = 0;
  for (let y = Math.max(0, Math.floor(cy - h/2)); y < Math.min(Math.ceil(cy + h/2), height); y++) {
    for (let x = Math.max(0, Math.floor(cx - w/2)); x < Math.min(Math.ceil(cx + w/2), width); x++) {
      const i = y * stride + x * channels;
      rS += px[i]; gS += px[i + 1]; bS += px[i + 2]; nS++;
    }
  }
  if (nS === 0) return null;
  return [Math.round(rS / nS), Math.round(gS / nS), Math.round(bS / nS)];
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h;
  if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (mx === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [Math.round(h * 360), +s.toFixed(2), +l.toFixed(2)];
}

function hexStr(rgb) {
  return '#' + rgb.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}

function classifyColor(r, g, b) {
  const [h, s, l] = rgbToHsl(r, g, b);
  if (l > 0.88 && s < 0.18) return '宣纸底(亮)';
  if (l > 0.82 && s < 0.20) return '宣纸底(暖)';
  if (h < 25 && s > 0.30 && r > 100) return '宋(红/砖红)';
  if (h >= 190 && h <= 260 && s > 0.10 && b > 70) return '辽(蓝灰)';
  if (h >= 25 && h <= 55 && s > 0.12 && l > 0.25 && l < 0.65) return '西夏(赭黄)';
  if (h >= 20 && h <= 45 && s > 0.10 && l >= 0.30 && l < 0.60) return '吐蕃(褐)';
  if (h >= 80 && h <= 160 && s > 0.08 && l > 0.2 && l < 0.65) return '大理(灰绿)';
  if (h >= 50 && h <= 90 && s > 0.10 && l > 0.25) return '大越(黄绿)';
  if (s < 0.08 && l > 0.3 && l < 0.75) return '灰/中性';
  return `其他(h=${h},s=${s.toFixed(2)},l=${l.toFixed(2)})`;
}

console.log('Image: 1080x2244\n');

// ========================================================================
// 策略：文字在暖色纸上比背景暗 20~60 个单位
// 背景大约 R=245,G=231,B=196 (#f5e7c4)
// 文字大约 R=155,G=138,B=118 (#9b8a76) 到 R=195,G=175,B=145
// 差异：ΔR=50~90, ΔG=56~93, ΔB=51~78
// 用亮度差检测：如果某像素比周围背景暗 30+ 亮度单位，就是文字
// ========================================================================

// Step 1: 在每个标注位置附近做精确的文字行检测
// 对每行计算"暗像素密度"（与20像素外的背景比较）

function findTextLine(cx, cy, searchH, searchW) {
  // Get background color from edges of search box
  const bgR = probeAvg(cx, cy - searchH/2 - 10, searchW, 5) || [245, 231, 196];
  const bgBrightness = (bgR[0] + bgR[1] + bgR[2]) / 3;
  
  let bestY = -1, bestScore = 0;
  for (let y = Math.max(0, cy - searchH/2); y < Math.min(cy + searchH/2, height); y++) {
    let score = 0;
    for (let x = Math.max(0, cx - searchW/2); x < Math.min(cx + searchW/2, width); x += 2) {
      const c = getPixel(x, y);
      if (!c) continue;
      const brightness = (c[0] + c[1] + c[2]) / 3;
      // 文字像素比背景暗 25+ 个单位
      if (bgBrightness - brightness > 25) score++;
    }
    if (score > bestScore) { bestScore = score; bestY = y; }
  }
  if (bestY < 0 || bestScore < 2) return null;
  
  // Get text color at bestY
  let colors = [];
  for (let x = Math.max(0, cx - searchW/2); x < Math.min(cx + searchW/2, width); x += 2) {
    const c = getPixel(x, bestY);
    if (!c) continue;
    const brightness = (c[0] + c[1] + c[2]) / 3;
    if (bgBrightness - brightness > 25) colors.push(c);
  }
  if (colors.length === 0) return null;
  
  const avgR = Math.round(colors.reduce((s, c) => s + c[0], 0) / colors.length);
  const avgG = Math.round(colors.reduce((s, c) => s + c[1], 0) / colors.length);
  const avgB = Math.round(colors.reduce((s, c) => s + c[2], 0) / colors.length);
  
  // Get color block below text
  const blockBelow = probeAvg(cx, bestY + 50, 30, 20);
  const blockBelowHex = blockBelow ? hexStr(blockBelow) : 'N/A';
  const blockBelowCls = blockBelow ? classifyColor(blockBelow[0], blockBelow[1], blockBelow[2]) : 'N/A';
  
  // Also get block at text level (to see what the text is ON)
  const blockAtText = probeAvg(cx, bestY, 10, 10);
  const blockAtTextHex = blockAtText ? hexStr(blockAtText) : 'N/A';
  const blockAtTextCls = blockAtText ? classifyColor(blockAtText[0], blockAtText[1], blockAtText[2]) : 'N/A';
  
  return {
    y: bestY, score: bestScore,
    textColor: hexStr([avgR, avgG, avgB]),
    blockBelow: blockBelowHex, blockBelowCls,
    blockAtText: blockAtTextHex, blockAtTextCls,
  };
}

// ===== 政权名标注检测 =====
console.log('===== 政权名标注文字检测 =====\n');

const regimeLabels = [
  { name: '辽', cx: 630, cy: 630, searchW: 80, searchH: 80 },
  { name: '西夏', cx: 405, cy: 790, searchW: 80, searchH: 80 },
  { name: '宋', cx: 520, cy: 1050, searchW: 80, searchH: 100 },
  { name: '吐蕃', cx: 45, cy: 1340, searchW: 80, searchH: 80 },
  { name: '大理', cx: 270, cy: 1510, searchW: 80, searchH: 80 },
  { name: '大越', cx: 430, cy: 1610, searchW: 80, searchH: 80 },
  { name: '高丽', cx: 925, cy: 780, searchW: 80, searchH: 80 },
  { name: '海南', cx: 510, cy: 1670, searchW: 80, searchH: 80 },
];

console.log('| 标注 | 搜索中心 | 找到文字Y | 文字色 | 标注处色块 | 下方50px色块 | 判定 |');
console.log('|---|---|---|---|---|---|---|');

for (const rl of regimeLabels) {
  const result = findTextLine(rl.cx, rl.cy, rl.searchH, rl.searchW);
  if (result) {
    let match = '—';
    const expected = { '辽': '蓝灰', '宋': '红', '西夏': '赭黄', '吐蕃': '褐', '大理': '灰绿', '大越': '黄绿', '高丽': '蓝灰', '海南': '红' }[rl.name];
    if (expected === '红') match = result.blockBelowCls.includes('宋') || result.blockBelowCls.includes('红') ? '✅' : '❌';
    else if (expected === '蓝灰') match = result.blockBelowCls.includes('辽') || result.blockBelowCls.includes('蓝灰') ? '✅' : (result.blockBelowCls.includes('宣纸') ? '⚠️纸底' : '❌');
    else if (expected === '赭黄') match = result.blockBelowCls.includes('西夏') || result.blockBelowCls.includes('赭黄') ? '✅' : (result.blockBelowCls.includes('宣纸') ? '⚠️纸底' : '❌');
    else if (expected === '褐') match = result.blockBelowCls.includes('吐蕃') || result.blockBelowCls.includes('褐') || result.blockBelowCls.includes('西夏') ? '✅' : '❌';
    else if (expected === '灰绿') match = result.blockBelowCls.includes('大理') || result.blockBelowCls.includes('灰绿') || result.blockBelowCls.includes('大越') ? '✅' : (result.blockBelowCls.includes('宣纸') ? '⚠️纸底' : '❌');
    else if (expected === '黄绿') match = result.blockBelowCls.includes('大越') || result.blockBelowCls.includes('黄绿') || result.blockBelowCls.includes('宋') ? '✅' : '❌';
    
    console.log(`| ${rl.name} | (${rl.cx},${rl.cy}) | y=${result.y} | ${result.textColor} | ${result.blockAtText}(${result.blockAtTextCls}) | ${result.blockBelow}(${result.blockBelowCls}) | ${match} |`);
  } else {
    console.log(`| ${rl.name} | (${rl.cx},${rl.cy}) | 未找到 | — | — | — | ⚠️ |`);
  }
}

// ===== 城池标注检测 =====
console.log('\n===== 城池标注文字检测 =====\n');

const cityLabels = [
  { name: '成都府', cx: 330, cy: 1080, searchW: 100, searchH: 60 },
  { name: '江宁府', cx: 740, cy: 1050, searchW: 100, searchH: 60 },
  { name: '登州', cx: 790, cy: 830, searchW: 80, searchH: 60 },
  { name: '密州', cx: 720, cy: 890, searchW: 80, searchH: 60 },
  { name: '沂州', cx: 720, cy: 930, searchW: 80, searchH: 60 },
  { name: '江陵府', cx: 580, cy: 1080, searchW: 100, searchH: 60 },
  { name: '大名府', cx: 630, cy: 850, searchW: 80, searchH: 60 },
  { name: '青州', cx: 700, cy: 860, searchW: 80, searchH: 60 },
  { name: '莱州', cx: 790, cy: 860, searchW: 80, searchH: 60 },
];

console.log('| 城池 | 搜索中心 | 文字Y | 文字色 | 标注处色块 | 下方50px |');
console.log('|---|---|---|---|---|---|');

for (const cl of cityLabels) {
  const result = findTextLine(cl.cx, cl.cy, cl.searchH, cl.searchW);
  if (result) {
    console.log(`| ${cl.name} | (${cl.cx},${cl.cy}) | y=${result.y} | ${result.textColor} | ${result.blockAtText}(${result.blockAtTextCls}) | ${result.blockBelow}(${result.blockBelowCls}) |`);
  } else {
    console.log(`| ${cl.name} | (${cl.cx},${cl.cy}) | 未找到 | — | — | — |`);
  }
}

// ===== 反向校验点 =====
console.log('\n===== 反向校验（色块内部采样）=====\n');

const randomChecks = [
  { name: '宋色块核心(500,1450)', x: 500, y: 1450 },
  { name: '宋色块边缘(400,1350)', x: 400, y: 1350 },
  { name: '宋色块南(500,1600)', x: 500, y: 1600 },
  { name: '西夏块核心(430,1000)', x: 430, y: 1000 },
  { name: '大理块(280,1520)', x: 280, y: 1520 },
  { name: '大越块(400,1620)', x: 400, y: 1620 },
  { name: '吐蕃块(50,1380)', x: 50, y: 1380 },
  { name: '辽区域(630,600)', x: 630, y: 600 },
];

for (const rc of randomChecks) {
  const c = getPixel(rc.x, rc.y);
  if (!c) continue;
  const hex = hexStr(c);
  const cls = classifyColor(c[0], c[1], c[2]);
  console.log(`  ${rc.name}: ${hex} → ${cls}`);
}

// ===== 最终总结：找到所有有色块 =====
console.log('\n===== 色块区域总结 =====\n');
console.log('从热力图+采样结果看，实际色块分布：');
console.log('  西夏(赭黄): y≈920~1160, x≈380~500 —— 位于地图中北部');
console.log('  宋(红/砖红): y≈1300~1680, x≈300~600 —— 占据地图中南部大部分');
console.log('  大理/大越(黄绿): y≈1160~1240, x≈300~450 —— 位于宋的西侧');
console.log('  吐蕃(褐): y≈1350~1680, x≈0~300 —— 位于宋的西南方');
console.log('  辽(蓝灰): y≈400~700, x≈500~700 —— 本应在此，但实际全是纸色!');
console.log('');
console.log('关键发现：辽政权色块未渲染！');
