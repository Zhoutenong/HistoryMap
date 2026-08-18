#!/usr/bin/env node
/**
 * 像素采样脚本：在 post-fix2-main.png 上对标注位置和色块内部采样，
 * 输出每个点的颜色和区块主色。
 *
 * 用法：node docs/design_optimize/redraw/pixel-probe.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'path';
import zlib from 'node:zlib';

const imgPath = 'artifacts/audit/post-fix2-main.png';

// ===== PNG 解码（复用 analyze-image.mjs 的逻辑）=====
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
  for (let y = Math.max(0, y0); y < Math.min(y0 + h, height); y += 2) {
    for (let x = Math.max(0, x0); x < Math.min(x0 + w, width); x += 2) {
      const i = y * stride + x * channels;
      rS += px[i]; gS += px[i + 1]; bS += px[i + 2]; nS++;
      const key = (px[i] >> 4) << 8 | (px[i + 1] >> 4) << 4 | (px[i + 2] >> 4);
      hist.set(key, (hist.get(key) || 0) + 1);
    }
  }
  if (nS === 0) return { avg: [0, 0, 0], top: [] };
  const avg = [Math.round(rS / nS), Math.round(gS / nS), Math.round(bS / nS)];
  const top = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([k, n]) => ({
      hex: '#' + [((k >> 8) & 15) * 16 + 8, ((k >> 4) & 15) * 16 + 8, (k & 15) * 16 + 8]
        .map(v => v.toString(16).padStart(2, '0')).join(''),
      pct: +(n / nS * 100).toFixed(0),
    }));
  return { avg, top };
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

function colorFamily(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const [h, s, l] = rgbToHsl(r, g, b);
  if (s < 0.15 && l > 0.80) return '宣纸/亮色背景';
  if (s < 0.15) return '灰/暗色';
  // 宋=红/砖红 (hue 0~20)
  if (h < 25 && s > 0.3 && r > 100) return '红/砖红(宋)';
  // 辽=蓝灰 (hue 200~240)
  if (h >= 190 && h <= 250 && s > 0.2 && b > 80) return '蓝灰(辽)';
  // 西夏=赭黄 (hue 30~50)
  if (h >= 25 && h <= 55 && s > 0.25 && r > 120) return '赭黄(西夏)';
  // 金=金黄 (hue 40~55)
  if (h >= 35 && h <= 60 && s > 0.3 && r > 130 && g > 100) return '金黄(金)';
  // 吐蕃=褐 (hue 25~40, 较暗)
  if (h >= 20 && h <= 45 && s > 0.2 && l > 0.25 && l < 0.55) return '褐(吐蕃)';
  // 大理=灰绿 (hue 100~150)
  if (h >= 90 && h <= 160 && s > 0.15) return '灰绿(大理)';
  // 大越=黄绿 (hue 60~90)
  if (h >= 55 && h <= 95 && s > 0.2) return '黄绿(大越)';
  return `其他(h=${h},s=${s},l=${l})`;
}

console.log(`Image: ${width}x${height}`);

// ===== 采样点定义 =====
// 基于截图视觉定位（手动观察标注文字在图像中的位置）
const probePoints = [
  // === 政权名标注（视觉定位 + 投影定位双版本）===
  { name: '政权「宋」', visualXY: [520, 1050], regime: '宋', colorHex: '#b03a2e' },
  { name: '政权「辽」', visualXY: [625, 630], regime: '辽', colorHex: '#4a6a8a' },
  { name: '政权「西夏」', visualXY: [405, 790], regime: '西夏', colorHex: '#b08d4f' },
  { name: '政权「吐蕃」', visualXY: [45, 1370], regime: '吐蕃', colorHex: '#8a6a4a' },
  { name: '政权「大理」', visualXY: [270, 1530], regime: '大理', colorHex: '#6a8a5f' },
  { name: '政权「大越」', visualXY: [420, 1650], regime: '大越', colorHex: '#8a9a5a' },
  { name: '政权「高丽」', visualXY: [920, 780], regime: '高丽', colorHex: '#5a7a9a' },
  { name: '政权「海南」', visualXY: [510, 1680], regime: '海南', colorHex: '#a04a3a' },

  // === 城池标注（视觉定位）===
  { name: '城池「成都府」', visualXY: [330, 1090], regime: '宋', note: '宋域西部' },
  { name: '城池「江宁府」', visualXY: [740, 1050], regime: '宋', note: '宋域东部（南京应天府）' },
  { name: '城池「登州」', visualXY: [790, 830], regime: '宋', note: '宋域东北沿海' },
  { name: '城池「密州」', visualXY: [720, 890], regime: '宋', note: '宋域东部' },
  { name: '城池「沂州」', visualXY: [720, 930], regime: '宋', note: '宋域东部' },
  { name: '城池「江陵府」', visualXY: [580, 1080], regime: '宋', note: '宋域中部' },
  { name: '城池「大名府」', visualXY: [630, 850], regime: '宋', note: '宋域北部（北京大名府）' },
  { name: '城池「青州」', visualXY: [700, 860], regime: '宋', note: '宋域东部' },
  { name: '城池「莱州」', visualXY: [790, 860], regime: '宋', note: '宋域东部沿海' },
  { name: '城池「高梁河」', visualXY: [660, 780], regime: '事件地点', note: '宋辽交界' },

  // === 反向校验（色块内部随机点）===
  { name: '反向-宋色块内部A', visualXY: [500, 1200], regime: '宋', expectColor: '宋色红' },
  { name: '反向-宋色块内部B', visualXY: [450, 1150], regime: '宋', expectColor: '宋色红' },
  { name: '反向-辽色块内部', visualXY: [680, 600], regime: '辽', expectColor: '辽色蓝灰' },
  { name: '反向-西夏色块内部', visualXY: [350, 830], regime: '西夏', expectColor: '西夏赭黄' },
];

console.log('\n===== 像素采样结果 =====\n');
console.log('| 标注元素 | 视觉坐标(x,y) | 中心像素RGB | 区块主色 | 色相家族判定 | 匹配预期? |');
console.log('|---|---|---|---|---|---|');

for (const pt of probePoints) {
  const [vx, vy] = pt.visualXY;
  const center = getPixel(vx, vy);
  // 探测标签周围 40×40 区块的主色（不含标签文字本身，取稍远的区域）
  // 对于政权名标签，取标签下方 30px 处的色块颜色
  const blockProbe = probeRect(vx - 25, vy + 20, 50, 50);
  const blockAvg = blockProbe.avg;
  const blockHex = '#' + blockAvg.map(v => v.toString(16).padStart(2, '0')).join('');
  const family = colorFamily(blockHex);

  // 判断是否匹配
  let match = '—';
  if (pt.regime === '宋') {
    match = family.includes('红') || family.includes('砖红') ? '✅ 对齐' : '❌ 错位';
  } else if (pt.regime === '辽') {
    match = family.includes('蓝灰') ? '✅ 对齐' : '❌ 错位';
  } else if (pt.regime === '西夏') {
    match = family.includes('赭黄') || family.includes('褐') ? '✅ 对齐' : '❌ 错位';
  } else if (pt.regime === '吐蕃') {
    match = family.includes('褐') || family.includes('纸') ? '✅ 对齐/边界' : '❌ 错位';
  } else if (pt.regime === '大理') {
    match = family.includes('灰绿') || family.includes('褐') ? '✅ 对齐' : '❌ 错位';
  } else if (pt.regime === '大越') {
    match = family.includes('黄绿') || family.includes('灰绿') ? '✅ 对齐' : '❌ 错位';
  } else if (pt.regime === '高丽') {
    match = family.includes('蓝灰') || family.includes('纸') ? '✅ 对齐' : '❌ 错位';
  } else if (pt.regime === '海南') {
    match = family.includes('红') || family.includes('砖红') ? '✅ 对齐' : '❌ 错位';
  }

  const cHex = center ? '#' + center.map(v => v.toString(16).padStart(2, '0')).join('') : 'N/A';
  console.log(`| ${pt.name} | (${vx},${vy}) | ${cHex} | ${blockHex} | ${family} | ${match} |`);
}

// ===== 额外：大范围区块色彩分析（验证整体色块分布）=====
console.log('\n===== 大范围区块色相分析 =====\n');
const gridProbes = [
  { label: '左上(辽域)', xy: [600, 550], size: 60 },
  { label: '中上(西夏域)', xy: [380, 780], size: 60 },
  { label: '中央(宋域-北)', xy: [550, 950], size: 60 },
  { label: '中央(宋域-中)', xy: [500, 1080], size: 60 },
  { label: '中央(宋域-南)', xy: [480, 1200], size: 60 },
  { label: '左下(大理域)', xy: [250, 1530], size: 60 },
  { label: '下方(大越域)', xy: [430, 1660], size: 60 },
  { label: '右下(宋域-岭南)', xy: [550, 1350], size: 60 },
  { label: '右上(辽域-远)', xy: [700, 500], size: 60 },
  { label: '左中(吐蕃域)', xy: [50, 1350], size: 60 },
];

for (const gp of gridProbes) {
  const r = probeRect(gp.xy[0] - gp.size / 2, gp.xy[1] - gp.size / 2, gp.size, gp.size);
  const hex = '#' + r.avg.map(v => v.toString(16).padStart(2, '0')).join('');
  const family = colorFamily(hex);
  console.log(`  ${gp.label.padEnd(16)} (${gp.xy[0]},${gp.xy[1]})  avg=${hex}  family=${family}  top=${r.top.map(t => t.hex + '(' + t.pct + '%)').join(' ')}`);
}
