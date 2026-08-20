#!/usr/bin/env node
/**
 * 精细颜色分析：在每个关键区域精确采样颜色值。
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

function probeRect(cx, cy, w, h) {
  let rS = 0, gS = 0, bS = 0, nS = 0;
  for (let y = Math.max(0, cy - h/2); y < Math.min(cy + h/2, height); y += 1) {
    for (let x = Math.max(0, cx - w/2); x < Math.min(cx + w/2, width); x += 1) {
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

// ===== 在截图上做全面的颜色分布图 =====
// 每 10×10 块取平均色，输出到控制台
console.log('===== 全图颜色热力图 (40×40 块) =====\n');

const blockSize = 40;
const cols = Math.ceil(width / blockSize);
const rows = Math.ceil(height / blockSize);

// Color legend for ASCII art
function colorChar(r, g, b) {
  const [h, s, l] = rgbToHsl(r, g, b);
  if (l > 0.85) return '.'; // paper/bright
  if (l < 0.15) return '#'; // dark
  if (h < 20 && s > 0.25 && r > 80) return 'R'; // red (宋)
  if (h >= 190 && h <= 260 && s > 0.10) return 'B'; // blue (辽)
  if (h >= 25 && h <= 55 && s > 0.15 && l > 0.25 && l < 0.65) return 'O'; // olive/brown (西夏/吐蕃)
  if (h >= 80 && h <= 160 && s > 0.10 && l > 0.2 && l < 0.7) return 'G'; // green (大理)
  if (h >= 50 && h <= 90 && s > 0.10 && l > 0.2) return 'Y'; // yellow-green (大越)
  if (s < 0.10) return ':'; // gray
  return 'o'; // other
}

let map = '';
for (let by = 0; by < rows; by++) {
  let row = '';
  for (let bx = 0; bx < cols; bx++) {
    const probe = probeRect(bx * blockSize + blockSize/2, by * blockSize + blockSize/2, blockSize, blockSize);
    if (!probe) { row += ' '; continue; }
    row += colorChar(probe[0], probe[1], probe[2]);
  }
  map += `${String(by * blockSize).padStart(4)}|${row}|\n`;
}
console.log('      0         100       200       300       400       500       600       700       800       900      1000   1080');
console.log('      0000000000111111111122222222223333333333444444444455555555556666666666777777777788888888889999999999000000000011');
console.log(map);

// ===== 在每个政权标签位置下方精确采样 =====
console.log('\n===== 政权标签精确位置+色块分析 =====\n');

// From the visual inspection of the screenshot, here are the approximate positions:
// These were carefully measured from the 1080x2244 screenshot
const labelData = [
  { name: '辽', x: 625, y: 630, regime: 'liao', color: '#4a6a8a' },
  { name: '西夏', x: 405, y: 790, regime: 'xia', color: '#b08d4f' },
  { name: '宋', x: 520, y: 1050, regime: 'song', color: '#b03a2e' },
  { name: '吐蕃', x: 40, y: 1340, regime: 'tibet', color: '#8a6a4a' },
  { name: '大理', x: 270, y: 1510, regime: 'dali', color: '#6a8a5f' },
  { name: '大越', x: 430, y: 1610, regime: 'vietnam', color: '#8a9a5a' },
  { name: '高丽', x: 920, y: 780, regime: 'korea', color: '#5a7a9a' },
  { name: '海南', x: 510, y: 1670, regime: 'hainan', color: '#a04a3a' },
];

// For each label: sample 5 points (center + 4 directions) to find the label text color
// and 5 points nearby (below/above) to find the block color
console.log('| 政权名 | 标注坐标 | 文字色 | 标注下方色块(20px) | 标注下方色块(60px) | 标注下方色块(100px) |');
console.log('|---|---|---|---|---|---|');

for (const ld of labelData) {
  const center = getPixel(ld.x, ld.y);
  const below20 = probeRect(ld.x, ld.y + 20, 20, 10);
  const below60 = probeRect(ld.x, ld.y + 60, 20, 10);
  const below100 = probeRect(ld.x, ld.y + 100, 20, 10);
  
  const cHex = center ? hexStr(center) : 'N/A';
  const b20Hex = below20 ? hexStr(below20) : 'N/A';
  const b60Hex = below60 ? hexStr(below60) : 'N/A';
  const b100Hex = below100 ? hexStr(below100) : 'N/A';
  
  console.log(`| ${ld.name} | (${ld.x},${ld.y}) | ${cHex} | ${b20Hex} | ${b60Hex} | ${b100Hex} |`);
}

// ===== 在城池标签位置精确采样 =====
console.log('\n===== 城池标签精确位置+色块分析 =====\n');

const cityData = [
  { name: '成都府', x: 330, y: 1090 },
  { name: '江宁府', x: 740, y: 1050 },
  { name: '登州', x: 790, y: 830 },
  { name: '密州', x: 720, y: 890 },
  { name: '沂州', x: 720, y: 930 },
  { name: '江陵府', x: 580, y: 1080 },
  { name: '大名府', x: 630, y: 850 },
  { name: '青州', x: 700, y: 860 },
  { name: '莱州', x: 790, y: 860 },
];

console.log('| 城池名 | 标注坐标 | 文字色 | 下方20px | 下方60px | 下方100px |');
console.log('|---|---|---|---|---|---|');

for (const cd of cityData) {
  const center = getPixel(cd.x, cd.y);
  const below20 = probeRect(cd.x, cd.y + 20, 20, 10);
  const below60 = probeRect(cd.x, cd.y + 60, 20, 10);
  const below100 = probeRect(cd.x, cd.y + 100, 20, 10);
  
  const cHex = center ? hexStr(center) : 'N/A';
  const b20Hex = below20 ? hexStr(below20) : 'N/A';
  const b60Hex = below60 ? hexStr(below60) : 'N/A';
  const b100Hex = below100 ? hexStr(below100) : 'N/A';
  
  console.log(`| ${cd.name} | (${cd.x},${cd.y}) | ${cHex} | ${b20Hex} | ${b60Hex} | ${b100Hex} |`);
}

// ===== 在色块内部中心精确采样 =====
console.log('\n===== 色块中心精确采样 =====\n');

// 从热力图中可以看到色块大致分布
// 红色(宋): y=1300~1680, x=300~600
// 褐色: y=920~1160 area + y=1350~1680
// 我需要找到辽/西夏色块的实际位置

// 先看上半部分(y=400~900)有没有任何非纸色的色块
console.log('--- 上半部分色块搜索 (y=400~920) ---\n');

for (let y = 400; y < 920; y += 20) {
  let nonPaper = 0;
  let xMin = 9999, xMax = 0;
  let sampleColor = null;
  for (let x = 0; x < width; x += 5) {
    const c = getPixel(x, y);
    if (!c) continue;
    const [h, s, l] = rgbToHsl(c[0], c[1], c[2]);
    const isPaper = l > 0.82 && s < 0.20;
    if (!isPaper) {
      nonPaper++;
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
      if (!sampleColor) sampleColor = c;
    }
  }
  if (nonPaper > 3) {
    const hex = sampleColor ? hexStr(sampleColor) : 'N/A';
    console.log(`  y=${y}: nonPaper=${nonPaper}, x=[${xMin}~${xMax}], sample=${hex}`);
  }
}

// ===== 色块精确边界探测 =====
console.log('\n===== 宋红色块精确边界 =====\n');

// 找红色块的上下左右边界
let redYMin = 9999, redYMax = 0, redXMin = 9999, redXMax = 0;
for (let y = 200; y < 1800; y += 5) {
  for (let x = 0; x < width; x += 5) {
    const c = getPixel(x, y);
    if (!c) continue;
    const [h, s, l] = rgbToHsl(c[0], c[1], c[2]);
    if (h < 20 && s > 0.30 && c[0] > 100) {
      if (y < redYMin) redYMin = y;
      if (y > redYMax) redYMax = y;
      if (x < redXMin) redXMin = x;
      if (x > redXMax) redXMax = x;
    }
  }
}
console.log(`宋红块: y=[${redYMin}, ${redYMax}], x=[${redXMin}, ${redXMax}]`);

// 找绿色块(大理/大越)的精确边界
let greenYMin = 9999, greenYMax = 0, greenXMin = 9999, greenXMax = 0;
for (let y = 1200; y < 1800; y += 5) {
  for (let x = 0; x < width; x += 5) {
    const c = getPixel(x, y);
    if (!c) continue;
    const [h, s, l] = rgbToHsl(c[0], c[1], c[2]);
    if (h >= 60 && h <= 160 && s > 0.10 && l > 0.2 && l < 0.7) {
      if (y < greenYMin) greenYMin = y;
      if (y > greenYMax) greenYMax = y;
      if (x < greenXMin) greenXMin = x;
      if (x > greenXMax) greenXMax = x;
    }
  }
}
console.log(`绿块(大理/大越): y=[${greenYMin}, ${greenYMax}], x=[${greenXMin}, ${greenXMax}]`);

// 找褐色块(西夏/吐蕃)的精确边界
let brownYMin = 9999, brownYMax = 0, brownXMin = 9999, brownXMax = 0;
for (let y = 400; y < 1800; y += 5) {
  for (let x = 0; x < width; x += 5) {
    const c = getPixel(x, y);
    if (!c) continue;
    const [h, s, l] = rgbToHsl(c[0], c[1], c[2]);
    if (h >= 20 && h <= 55 && s > 0.12 && l > 0.25 && l < 0.65 && c[0] > 80) {
      if (y < brownYMin) brownYMin = y;
      if (y > brownYMax) brownYMax = y;
      if (x < brownXMin) brownXMin = x;
      if (x > brownXMax) brownXMax = x;
    }
  }
}
console.log(`褐块(西夏/吐蕃): y=[${brownYMin}, ${brownYMax}], x=[${brownXMin}, ${brownXMax}]`);
