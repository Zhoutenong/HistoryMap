#!/usr/bin/env node
/**
 * 最终精确验证：在截图的每个标注文字位置及其下方/周围精确采样。
 * 基于热力图分析结果，重新校准坐标。
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

// ========================================================================
// 从截图仔细辨认，重新校准标注位置
// 截图坐标系：(0,0)=左上角，x 向右，y 向下
//
// 从截图看：
// - 地图从 y≈110 开始（顶栏下方）
// - 时间轴从 y≈1780 开始
// - 地图区域大约 y=110~1780
// ========================================================================

console.log('Image: 1080x2244\n');

// ===== Part 1: 沿热力图中的关键水平线精细扫描 =====
// 从热力图看，褐色(O)出现在 y=920-1160, x≈380-500 区域
// 红色(R)出现在 y=1200-1680, x≈300-600
// 绿色(Y)出现在 y=1120-1240, x≈350-450

// 让我在每个"O"/"R"/"Y"块的精确位置采样
console.log('===== 热力图色块精确采样 =====\n');

const blockSamples = [
  // 热力图上的 O 区域 (y=920~1080, x=400~500)
  { name: 'O块-上(y=960)', x: 420, y: 960, expect: '西夏/边界' },
  { name: 'O块-中(y=1000)', x: 440, y: 1000, expect: '西夏' },
  { name: 'O块-中(y=1040)', x: 460, y: 1040, expect: '西夏' },
  // 热力图上的 R 区域
  { name: 'R块-上(y=1200)', x: 460, y: 1200, expect: '宋' },
  { name: 'R块-中(y=1300)', x: 400, y: 1300, expect: '宋' },
  { name: 'R块-中(y=1400)', x: 500, y: 1400, expect: '宋' },
  { name: 'R块-下(y=1500)', x: 500, y: 1500, expect: '宋' },
  // 热力图上的 Y 区域 (y=1120~1240)
  { name: 'Y块-上(y=1160)', x: 380, y: 1160, expect: '大理?' },
  { name: 'Y块-中(y=1200)', x: 360, y: 1200, expect: '大理?' },
  { name: 'Y块-下(y=1240)', x: 350, y: 1240, expect: '大理?' },
  // 热力图上的 O+R 混合区域 (y=1360~1680)
  { name: 'O块-南(y=1400)', x: 280, y: 1400, expect: '吐蕃/大理?' },
  { name: 'O块-南(y=1500)', x: 280, y: 1500, expect: '大理' },
  { name: 'O块-南(y=1600)', x: 300, y: 1600, expect: '大越' },
  { name: 'O块-南(y=1660)', x: 400, y: 1660, expect: '大越/海南' },
  // 纸色区域（辽应该在的位置）
  { name: '纸色区(y=600,x=625)', x: 625, y: 600, expect: '辽色块?' },
  { name: '纸色区(y=600,x=500)', x: 500, y: 600, expect: '辽?' },
  { name: '纸色区(y=700,x=625)', x: 625, y: 700, expect: '辽?' },
  { name: '纸色区(y=500,x=550)', x: 550, y: 500, expect: '辽?' },
];

console.log('| 区域 | 坐标 | 平均色 | 色相分类 | R/G/B |');
console.log('|---|---|---|---|---|');
for (const bs of blockSamples) {
  const c = probeRect(bs.x, bs.y, 30, 20);
  if (!c) continue;
  const hex = hexStr(c);
  const cls = classifyColor(c[0], c[1], c[2]);
  console.log(`| ${bs.name} | (${bs.x},${bs.y}) | ${hex} | ${cls} | ${c[0]},${c[1]},${c[2]} |`);
}

// ===== Part 2: 沿标注文字位置做 1px 宽的垂直扫描 =====
// 找到每个标注文字的精确 y 坐标（文字最密集的行）
console.log('\n===== 标注文字精确 Y 坐标扫描 =====\n');

// 在截图中可见的标注及它们的大概 x 位置
const labelXPositions = [
  { name: '辽', xRange: [600, 660] },
  { name: '西夏', xRange: [370, 430] },
  { name: '宋', xRange: [490, 550] },
  { name: '吐蕃', xRange: [15, 80] },
  { name: '大理', xRange: [230, 300] },
  { name: '大越', xRange: [390, 460] },
  { name: '高丽', xRange: [890, 950] },
  { name: '海南', xRange: [480, 540] },
];

for (const lbl of labelXPositions) {
  let bestY = -1, bestScore = 0;
  for (let y = 200; y < 1800; y++) {
    let score = 0;
    for (let x = lbl.xRange[0]; x <= lbl.xRange[1]; x += 2) {
      const c = getPixel(x, y);
      if (!c) continue;
      const [h, s, l] = rgbToHsl(c[0], c[1], c[2]);
      // Dark or colored text on paper
      if (l < 0.65 || (s > 0.25 && l < 0.75)) score++;
    }
    if (score > bestScore) { bestScore = score; bestY = y; }
  }
  if (bestY > 0 && bestScore >= 2) {
    // Sample the text color at this y
    let colors = [];
    for (let x = lbl.xRange[0]; x <= lbl.xRange[1]; x += 2) {
      const c = getPixel(x, bestY);
      if (c) colors.push(c);
    }
    const avgR = Math.round(colors.reduce((s, c) => s + c[0], 0) / colors.length);
    const avgG = Math.round(colors.reduce((s, c) => s + c[1], 0) / colors.length);
    const avgB = Math.round(colors.reduce((s, c) => s + c[2], 0) / colors.length);
    const hex = hexStr([avgR, avgG, avgB]);
    
    // Sample color block below the text (y+40, 40x20 rect)
    const block = probeRect((lbl.xRange[0] + lbl.xRange[1]) / 2, bestY + 40, 40, 20);
    const blockHex = block ? hexStr(block) : 'N/A';
    const blockCls = block ? classifyColor(block[0], block[1], block[2]) : 'N/A';
    
    console.log(`「${lbl.name}」: 文字 y=${bestY}, x=[${lbl.xRange[0]}~${lbl.xRange[1]}], 文字色=${hex}, 下方40px色块=${blockHex}(${blockCls})`);
  } else {
    console.log(`「${lbl.name}」: 未找到文字 (xRange=[${lbl.xRange[0]}~${lbl.xRange[1]}], bestScore=${bestScore})`);
  }
}

// ===== Part 3: 在城池标注位置扫描 =====
console.log('\n===== 城池标注精确 Y 坐标 =====\n');

const cityXPositions = [
  { name: '成都府', xRange: [280, 370] },
  { name: '江宁府', xRange: [700, 780] },
  { name: '登州', xRange: [755, 820] },
  { name: '密州', xRange: [690, 760] },
  { name: '沂州', xRange: [690, 750] },
  { name: '江陵府', xRange: [550, 630] },
  { name: '大名府', xRange: [590, 670] },
  { name: '青州', xRange: [670, 730] },
  { name: '莱州', xRange: [755, 815] },
  { name: '高梁河', xRange: [610, 700] },
];

for (const city of cityXPositions) {
  let bestY = -1, bestScore = 0;
  for (let y = 700; y < 1200; y++) {
    let score = 0;
    for (let x = city.xRange[0]; x <= city.xRange[1]; x += 2) {
      const c = getPixel(x, y);
      if (!c) continue;
      const [h, s, l] = rgbToHsl(c[0], c[1], c[2]);
      if (l < 0.65 || (s > 0.25 && l < 0.75)) score++;
    }
    if (score > bestScore) { bestScore = score; bestY = y; }
  }
  if (bestY > 0 && bestScore >= 2) {
    let colors = [];
    for (let x = city.xRange[0]; x <= city.xRange[1]; x += 2) {
      const c = getPixel(x, bestY);
      if (c) colors.push(c);
    }
    const avgR = Math.round(colors.reduce((s, c) => s + c[0], 0) / colors.length);
    const avgG = Math.round(colors.reduce((s, c) => s + c[1], 0) / colors.length);
    const avgB = Math.round(colors.reduce((s, c) => s + c[2], 0) / colors.length);
    const hex = hexStr([avgR, avgG, avgB]);
    
    const block = probeRect((city.xRange[0] + city.xRange[1]) / 2, bestY + 40, 40, 20);
    const blockHex = block ? hexStr(block) : 'N/A';
    const blockCls = block ? classifyColor(block[0], block[1], block[2]) : 'N/A';
    
    console.log(`「${city.name}」: y=${bestY}, 文字色=${hex}, 下方色块=${blockHex}(${blockCls})`);
  } else {
    console.log(`「${city.name}」: 未找到 (bestScore=${bestScore})`);
  }
}

// ===== Part 4: 关键位置颜色确认 =====
console.log('\n===== 关键位置直接像素颜色 =====\n');

// 从热力图中读取关键坐标
const keyPoints = [
  { name: 'O块中心(y=1000,x=440)', x: 440, y: 1000 },
  { name: 'R块中心(y=1400,x=500)', x: 500, y: 1400 },
  { name: 'Y块中心(y=1200,x=370)', x: 370, y: 1200 },
  { name: '纸色(y=600,x=550)', x: 550, y: 600 },
  { name: '纸色(y=700,x=625)', x: 625, y: 700 },
  { name: '地图区(y=400,x=200)', x: 200, y: 400 },
  { name: '地图区(y=400,x=800)', x: 800, y: 400 },
];

for (const kp of keyPoints) {
  const c = getPixel(kp.x, kp.y);
  if (!c) continue;
  const hex = hexStr(c);
  const [h, s, l] = rgbToHsl(c[0], c[1], c[2]);
  const cls = classifyColor(c[0], c[1], c[2]);
  console.log(`  ${kp.name}: ${hex} h=${h} s=${s} l=${l.toFixed(2)} → ${cls}`);
}
