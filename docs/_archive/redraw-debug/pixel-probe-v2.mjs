#!/usr/bin/env node
/**
 * 像素采样脚本 v2：基于截图视觉仔细定位后的精确坐标，
 * 对标注位置和色块区域进行颜色采样和对齐判定。
 */
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';

const imgPath = 'artifacts/audit/post-fix2-main.png';

// ===== PNG 解码 =====
const buf = readFileSync(imgPath);
let pos = 8;
const idat = [];
let width = 0, height = 0, bitDepth = 0, colorType = 0;
while (pos + 12 <= buf.length) {
  const len = buf.readUInt32BE(pos);
  const type = buf.toString('ascii', pos + 4, pos + 8);
  const data = buf.subarray(pos + 8, pos + 8 + len);
  if (type === 'IHDR') {
    width = data.readUInt32BE(0);
    height = data.readUInt32BE(4);
    bitDepth = data[8];
    colorType = data[9];
  } else if (type === 'IDAT') {
    idat.push(data);
  }
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
      case 4: {
        const p = left + up - ul;
        const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - ul);
        const pr = pa <= pb && pa <= pc ? left : pb <= pc ? up : ul;
        a = (v + pr) & 255;
        break;
      }
    }
    line[x] = a;
    px[y * stride + x] = a;
  }
}

function getPixel(x, y) {
  if (x < 0 || x >= width || y < 0 || y >= height) return null;
  const i = y * stride + x * channels;
  return [px[i], px[i + 1], px[i + 2]];
}

function probeRect(x0, y0, w, h) {
  let rS = 0, gS = 0, bS = 0, nS = 0;
  const hist = new Map();
  for (let y = Math.max(0, y0); y < Math.min(y0 + h, height); y += 1) {
    for (let x = Math.max(0, x0); x < Math.min(x0 + w, width); x += 1) {
      const i = y * stride + x * channels;
      rS += px[i]; gS += px[i + 1]; bS += px[i + 2]; nS++;
      const key = (px[i] >> 4) << 8 | (px[i + 1] >> 4) << 4 | (px[i + 2] >> 4);
      hist.set(key, (hist.get(key) || 0) + 1);
    }
  }
  if (nS === 0) return null;
  const avg = [Math.round(rS / nS), Math.round(gS / nS), Math.round(bS / nS)];
  const top = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([k, n]) => ({
      hex: '#' + [((k >> 8) & 15) * 16 + 8, ((k >> 4) & 15) * 16 + 8, (k & 15) * 16 + 8]
        .map(v => v.toString(16).padStart(2, '0')).join(''),
      pct: +(n / nS * 100).toFixed(0),
    }));
  return { avg, top, n: nS };
}

function probeRadius(cx, cy, r) {
  let rS = 0, gS = 0, bS = 0, nS = 0;
  const hist = new Map();
  for (let y = Math.max(0, cy - r); y <= Math.min(height - 1, cy + r); y += 1) {
    for (let x = Math.max(0, cx - r); x <= Math.min(width - 1, cx + r); x += 1) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > r * r) continue;
      const i = y * stride + x * channels;
      rS += px[i]; gS += px[i + 1]; bS += px[i + 2]; nS++;
      const key = (px[i] >> 4) << 8 | (px[i + 1] >> 4) << 4 | (px[i + 2] >> 4);
      hist.set(key, (hist.get(key) || 0) + 1);
    }
  }
  if (nS === 0) return null;
  const avg = [Math.round(rS / nS), Math.round(gS / nS), Math.round(bS / nS)];
  const top = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([k, n]) => ({
      hex: '#' + [((k >> 8) & 15) * 16 + 8, ((k >> 4) & 15) * 16 + 8, (k & 15) * 16 + 8]
        .map(v => v.toString(16).padStart(2, '0')).join(''),
      pct: +(n / nS * 100).toFixed(0),
    }));
  return { avg, top, n: nS };
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

function classifyBlock(r, g, b) {
  const [h, s, l] = rgbToHsl(r, g, b);
  // Paper background: very light, low saturation
  if (l > 0.85 && s < 0.15) return { family: '宣纸底', h, s, l };
  if (l > 0.82 && s < 0.20) return { family: '宣纸底(暖)', h, s, l };
  // 宋 = 红/砖红: hue 0~25, high saturation, medium-light
  if (h < 25 && s > 0.30 && r > 100) return { family: '宋(红/砖红)', h, s, l };
  // 辽 = 蓝灰: hue 200~250
  if (h >= 190 && h <= 250 && s > 0.15 && b > 80) return { family: '辽(蓝灰)', h, s, l };
  // 西夏 = 赭黄/暗黄: hue 30~55, moderate saturation
  if (h >= 25 && h <= 55 && s > 0.20 && r > 100 && l > 0.3 && l < 0.7) return { family: '西夏(赭黄)', h, s, l };
  // 吐蕃 = 褐/暗棕: hue 25~45, low-medium lightness
  if (h >= 20 && h <= 50 && s > 0.12 && l >= 0.25 && l < 0.55) return { family: '吐蕃(褐)', h, s, l };
  // 大理 = 灰绿: hue 90~150
  if (h >= 80 && h <= 160 && s > 0.10) return { family: '大理(灰绿)', h, s, l };
  // 大越/高棉 = 黄绿: hue 55~90
  if (h >= 50 && h <= 95 && s > 0.15) return { family: '大越(黄绿)', h, s, l };
  // 灰色/mountain
  if (s < 0.10 && l < 0.7) return { family: '灰/山体', h, s, l };
  // Dark areas
  if (l < 0.25) return { family: '暗色', h, s, l };
  return { family: `未分类(h=${h},s=${s.toFixed(2)},l=${l.toFixed(2)})`, h, s, l };
}

function hexStr(rgb) {
  return '#' + rgb.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}

console.log(`Image: ${width}x${height}\n`);

// ========================================================================
// Step 1: 确定每个标注文字在图像中的精确位置
// 通过在图像上用小矩形扫描，找到非背景色（深色/彩色文字）的位置
// ========================================================================

// 扫描策略：沿标注大致区域逐行扫描，找到非纸色像素最密集的位置
function findTextCenter(x0, y0, x1, y1) {
  let bestY = -1, bestCount = 0;
  for (let y = y0; y < y1; y++) {
    let count = 0;
    for (let x = x0; x < x1; x++) {
      const c = getPixel(x, y);
      if (!c) continue;
      const brightness = (c[0] + c[1] + c[2]) / 3;
      // 文字颜色：显著暗于背景（<180）或显著红/蓝/绿
      const [h, s, l] = rgbToHsl(c[0], c[1], c[2]);
      if (brightness < 180 || (s > 0.3 && l < 0.7)) count++;
    }
    if (count > bestCount) { bestCount = count; bestY = y; }
  }
  if (bestY < 0) return null;
  // Now find bestX on that row
  let bestX = -1; bestCount = 0;
  for (let x = x0; x < x1; x++) {
    let count = 0;
    for (let y = bestY - 8; y <= bestY + 8; y++) {
      const c = getPixel(x, y);
      if (!c) continue;
      const brightness = (c[0] + c[1] + c[2]) / 3;
      const [h, s, l] = rgbToHsl(c[0], c[1], c[2]);
      if (brightness < 180 || (s > 0.3 && l < 0.7)) count++;
    }
    if (count > bestCount) { bestCount = count; bestX = x; }
  }
  return { x: bestX, y: bestY, textBrightness: bestCount };
}

// ===== Step 2: 在图像中扫描找到每个标注文字的精确位置 =====
console.log('===== Step 1: 扫描标注文字精确位置 =====\n');

// 每个标注的搜索范围（基于截图视觉定位的粗略估计）
const labelScans = [
  { name: '辽', regime: 'liao', scanBox: [560, 570, 680, 700], colorExpected: '#4a6a8a' },
  { name: '西夏', regime: 'xia', scanBox: [340, 730, 450, 810], colorExpected: '#b08d4f' },
  { name: '宋', regime: 'song', scanBox: [470, 980, 580, 1080], colorExpected: '#b03a2e' },
  { name: '吐蕃', regime: 'tibet', scanBox: [5, 1300, 90, 1380], colorExpected: '#8a6a4a' },
  { name: '大理', regime: 'dali', scanBox: [220, 1470, 310, 1550], colorExpected: '#6a8a5f' },
  { name: '大越', regime: 'vietnam', scanBox: [380, 1570, 480, 1640], colorExpected: '#8a9a5a' },
  { name: '高丽', regime: 'korea', scanBox: [880, 740, 970, 810], colorExpected: '#5a7a9a' },
  { name: '海南', regime: 'hainan', scanBox: [470, 1640, 560, 1710], colorExpected: '#a04a3a' },
  // 城池
  { name: '成都府', regime: 'song', scanBox: [290, 1050, 380, 1110], colorExpected: null },
  { name: '江宁府', regime: 'song', scanBox: [690, 1000, 790, 1060], colorExpected: null },
  { name: '登州', regime: 'song', scanBox: [750, 790, 830, 840], colorExpected: null },
  { name: '密州', regime: 'song', scanBox: [690, 850, 770, 910], colorExpected: null },
  { name: '沂州', regime: 'song', scanBox: [680, 890, 760, 950], colorExpected: null },
  { name: '江陵府', regime: 'song', scanBox: [540, 1040, 640, 1100], colorExpected: null },
  { name: '大名府', regime: 'song', scanBox: [590, 810, 680, 870], colorExpected: null },
  { name: '青州', regime: 'song', scanBox: [660, 830, 730, 870], colorExpected: null },
  { name: '莱州', regime: 'song', scanBox: [750, 830, 820, 870], colorExpected: null },
  { name: '高梁河', regime: 'event', scanBox: [610, 740, 710, 790], colorExpected: null },
];

const foundLabels = [];

for (const label of labelScans) {
  const [x0, y0, x1, y1] = label.scanBox;
  const center = findTextCenter(x0, y0, x1, y1);
  if (center) {
    const pixel = getPixel(center.x, center.y);
    const pHex = pixel ? hexStr(pixel) : 'N/A';
    foundLabels.push({ ...label, fx: center.x, fy: center.y, pixelHex: pHex });
    console.log(`  「${label.name}」→ 扫描定位 (${center.x}, ${center.y})  文字像素色=${pHex}`);
  } else {
    console.log(`  「${label.name}」→ 未在搜索框 [${label.scanBox}] 中找到文字`);
  }
}

// ===== Step 3: 在每个标注附近采样下方/旁边的色块颜色 =====
console.log('\n===== Step 2: 标注位置+下方色块采样 =====\n');

// 色块采样偏移：在标注位置下方 30~80px 处（避免取到文字本身）
const blockOffsets = [
  { dx: 0, dy: 40, desc: '文字下方40px' },
  { dx: 0, dy: 80, desc: '文字下方80px' },
  { dx: -50, dy: 40, desc: '文字左下' },
  { dx: 50, dy: 40, desc: '文字右下' },
];

console.log('| 标注 | 扫描位置 | 文字色 | 下方40px色块 | 色块判定 | 预期政权色 | 对齐? |');
console.log('|---|---|---|---|---|---|---|');

for (const fl of foundLabels) {
  if (!fl.fx) continue;
  // Sample 40×20 rect centered at (fx, fy+40) — below the text
  const probeResult = probeRect(fl.fx - 20, fl.fy + 30, 40, 30);
  if (!probeResult) continue;
  const blockHex = hexStr(probeResult.avg);
  const blockInfo = classifyBlock(probeResult.avg[0], probeResult.avg[1], probeResult.avg[2]);
  const topColors = probeResult.top.map(t => `${t.hex}(${t.pct}%)`).join(' ');

  // Determine expected color family
  const expectedFamilies = {
    'liao': '蓝灰(辽)',
    'song': '红/砖红(宋)',
    'xia': '赭黄(西夏)',
    'tibet': '褐(吐蕃)',
    'dali': '灰绿(大理)',
    'vietnam': '黄绿(大越)',
    'korea': '蓝灰(高丽)',
    'hainan': '红(海南)',
    'event': '交界区',
  };
  const expected = expectedFamilies[fl.regime] || '—';
  let aligned = '—';
  if (fl.regime === 'song') aligned = blockInfo.family.includes('宋') || blockInfo.family.includes('红') ? '✅' : '❌';
  else if (fl.regime === 'liao') aligned = blockInfo.family.includes('辽') || blockInfo.family.includes('蓝灰') ? '✅' : (blockInfo.family.includes('宣纸') ? '⚠️纸底' : '❌');
  else if (fl.regime === 'xia') aligned = blockInfo.family.includes('西夏') || blockInfo.family.includes('赭黄') ? '✅' : (blockInfo.family.includes('宣纸') ? '⚠️纸底' : '❌');
  else if (fl.regime === 'tibet') aligned = blockInfo.family.includes('吐蕃') || blockInfo.family.includes('褐') ? '✅' : (blockInfo.family.includes('宣纸') ? '⚠️纸底' : '❌');
  else if (fl.regime === 'dali') aligned = blockInfo.family.includes('大理') || blockInfo.family.includes('灰绿') ? '✅' : (blockInfo.family.includes('宣纸') ? '⚠️纸底' : '❌');
  else if (fl.regime === 'vietnam') aligned = blockInfo.family.includes('大越') || blockInfo.family.includes('黄绿') ? '✅' : (blockInfo.family.includes('宣纸') ? '⚠️纸底' : '❌');
  else if (fl.regime === 'korea') aligned = blockInfo.family.includes('辽') || blockInfo.family.includes('蓝灰') || blockInfo.family.includes('宣纸') ? '✅' : '❌';
  else if (fl.regime === 'hainan') aligned = blockInfo.family.includes('宣纸') ? '⚠️纸底' : '—';

  console.log(`| ${fl.name} | (${fl.fx},${fl.fy}) | ${fl.pixelHex} | ${blockHex} | ${blockInfo.family} | ${expected} | ${aligned} |`);
}

// ===== Step 4: 直接在色块内部大面积采样，确认色块本身的颜色 =====
console.log('\n===== Step 3: 色块区域直接采样（标注无关，纯色块验证）=====\n');

// 从截图中视觉确认的色块中心区域
const colorBlockSamples = [
  { name: '宋色块-中', xy: [520, 1250], size: 60 },
  { name: '宋色块-南', xy: [500, 1400], size: 60 },
  { name: '辽色块-中', xy: [580, 550], size: 60 },
  { name: '辽色块-东', xy: [700, 490], size: 60 },
  { name: '西夏色块', xy: [370, 760], size: 60 },
  { name: '吐蕃色块', xy: [50, 1320], size: 60 },
  { name: '大理色块', xy: [240, 1510], size: 60 },
  { name: '大越色块', xy: [440, 1630], size: 60 },
  { name: '海南色块', xy: [520, 1690], size: 60 },
  { name: '高丽区域', xy: [930, 770], size: 40 },
];

console.log('| 区域 | 坐标 | 区块平均色 | 色相家族 | Top色分布 |');
console.log('|---|---|---|---|---|');

for (const cs of colorBlockSamples) {
  const [cx, cy] = cs.xy;
  const r = probeRect(cx - cs.size / 2, cy - cs.size / 2, cs.size, cs.size);
  if (!r) continue;
  const hex = hexStr(r.avg);
  const info = classifyBlock(r.avg[0], r.avg[1], r.avg[2]);
  const topStr = r.top.map(t => `${t.hex}(${t.pct}%)`).join(' ');
  console.log(`| ${cs.name} | (${cx},${cy}) | ${hex} | ${info.family} (h=${info.h},s=${info.s.toFixed(2)},l=${info.l.toFixed(2)}) | ${topStr} |`);
}

// ===== Step 5: 随机校验点（在色块内部验证颜色一致性）=====
console.log('\n===== Step 4: 反向校验（色块内部随机点）=====\n');

const randomPoints = [
  { name: '宋块内(400,1300)', xy: [400, 1300] },
  { name: '宋块内(550,1350)', xy: [550, 1350] },
  { name: '宋块内(350,1200)', xy: [350, 1200] },
  { name: '辽块内(620,500)', xy: [620, 500] },
  { name: '辽块内(560,580)', xy: [560, 580] },
  { name: '西夏块内(380,780)', xy: [380, 780] },
  { name: '西夏块内(350,800)', xy: [350, 800] },
];

for (const rp of randomPoints) {
  const c = getPixel(rp.xy[0], rp.xy[1]);
  if (!c) continue;
  const hex = hexStr(c);
  const info = classifyBlock(c[0], c[1], c[2]);
  console.log(`  ${rp.name}: ${hex} → ${info.family}`);
}

console.log('\n===== 完成 =====');
