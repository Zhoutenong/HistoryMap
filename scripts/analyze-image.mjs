#!/usr/bin/env node
/**
 * PNG 程序化分析工具（模型不识图时的一致性辅助）：
 * 1. 解码 PNG（8-bit RGB/RGBA，非隔行，Node 自带 zlib，无第三方依赖）
 * 2. 输出主色调 TopN（hex + 占比）
 * 3. 输出布局 ASCII 图（按色相/明度分类的字符网格，粗略还原版面分区）
 * 4. 可选 --json 输出机器可读结果（供 check-visual-tokens 等下游使用）
 *
 * 用法：node scripts/analyze-image.mjs <png路径> [--json]
 */
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';

const path = process.argv[2];
if (!path) {
  console.error('usage: node scripts/analyze-image.mjs <png> [--json]');
  process.exit(1);
}
const asJson = process.argv.includes('--json');

// ---------- 1. 解析 chunk，解压 IDAT ----------
const buf = readFileSync(path);
if (buf.readUInt32BE(0) !== 0x89504e47) {
  console.error('not a PNG file: ' + path);
  process.exit(1);
}
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
if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
  console.error(`unsupported PNG format: bitDepth=${bitDepth} colorType=${colorType} (仅支持 8-bit RGB/RGBA)`);
  process.exit(1);
}
const channels = colorType === 6 ? 4 : 3;
const raw = zlib.inflateSync(Buffer.concat(idat));

// ---------- 2. 反滤波重建像素 ----------
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

// ---------- 3. 主色调直方图（4-bit/通道量化） ----------
const hist = new Map();
let total = 0;
for (let y = 0; y < height; y += 2) {
  for (let x = 0; x < width; x += 2) {
    const i = y * stride + x * channels;
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const key = (r >> 4) << 8 | (g >> 4) << 4 | (b >> 4);
    hist.set(key, (hist.get(key) || 0) + 1);
    total++;
  }
}
const top = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
const palette = top.map(([key, n]) => {
  const r = ((key >> 8) & 15) * 16 + 8;
  const g = ((key >> 4) & 15) * 16 + 8;
  const b = (key & 15) * 16 + 8;
  const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  return { hex, pct: +(n / total * 100).toFixed(1), rgb: [r, g, b] };
});

// ---------- 4. 布局 ASCII 图（色相/明度分类） ----------
function classify(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const L = (mx + mn) / 2 / 255;
  const S = mx === 0 ? 0 : (mx - mn) / mx;
  // 只有饱和度足够高（>0.28）且不是亮纸色才算"彩色"，避免暖米白误判为朱砂
  if (S > 0.28 && L < 0.85) {
    if (mx === r && r > b && (r - g) > 25 && (r - b) > 40) return r > 110 ? 'R' : 'r'; // 朱砂/暖红
    if (mx === g && g > r * 1.12 && g > b * 1.12) return 'G';                           // 茶绿/青绿
    if (mx === b && b > r * 1.05 && (b - g) > 15) return 'B';                          // 黛青/蓝
    if (r > 150 && g > 120 && b < 130 && (r - b) > 50) return 'Y';                     // 赭金
    return 'o';                                                                        // 其它彩色
  }
  if (L > 0.85) return '.';
  if (L > 0.62) return ':';
  if (L > 0.4) return 'o';
  return '#';
}
const block = 24;
const cols = Math.ceil(width / block), rows = Math.ceil(height / block);
let ascii = '';
for (let by = 0; by < rows; by++) {
  let row = '';
  for (let bx = 0; bx < cols; bx++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = by * block; y < Math.min((by + 1) * block, height); y += 2) {
      for (let x = bx * block; x < Math.min((bx + 1) * block, width); x += 2) {
        const i = y * stride + x * channels;
        r += px[i]; g += px[i + 1]; b += px[i + 2]; n++;
      }
    }
    if (n) { r /= n; g /= n; b /= n; }
    row += classify(r, g, b);
  }
  ascii += row + '\n';
}

// ---------- 4b. 横向分带调色板（每 1/8 高度条带内 Top3 色，还原版面分区） ----------
const bands = 8;
const bandPalettes = [];
for (let b = 0; b < bands; b++) {
  const histB = new Map();
  let nB = 0;
  const y0 = Math.floor((height / bands) * b);
  const y1 = Math.floor((height / bands) * (b + 1));
  for (let y = y0; y < y1; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = y * stride + x * channels;
      const r = px[i], g = px[i + 1], bv = px[i + 2];
      const key = (r >> 4) << 8 | (g >> 4) << 4 | (bv >> 4);
      histB.set(key, (histB.get(key) || 0) + 1);
      nB++;
    }
  }
  bandPalettes.push(
    [...histB.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([key, n]) => {
      const r = ((key >> 8) & 15) * 16 + 8;
      const g = ((key >> 4) & 15) * 16 + 8;
      const b = (key & 15) * 16 + 8;
      return { hex: '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join(''), pct: +(n / nB * 100).toFixed(1) };
    }),
  );
}

// ---------- 4c. 彩色区块定位（每 32px 块的平均饱和度 > 0.25 视为水彩/彩色元素） ----------
const blk = 32;
const cCols = Math.ceil(width / blk), cRows = Math.ceil(height / blk);
const saturatedBlocks = [];
for (let by = 0; by < cRows; by++) {
  for (let bx = 0; bx < cCols; bx++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = by * blk; y < Math.min((by + 1) * blk, height); y += 2) {
      for (let x = bx * blk; x < Math.min((bx + 1) * blk, width); x += 2) {
        const i = y * stride + x * channels;
        r += px[i]; g += px[i + 1]; b += px[i + 2]; n++;
      }
    }
    if (n) { r /= n; g /= n; b /= n; }
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const S = mx === 0 ? 0 : (mx - mn) / mx;
    if (S > 0.25) {
      const hex = '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
      saturatedBlocks.push({ bx, by, hex, s: +S.toFixed(2) });
    }
  }
}
// 按行归并输出（每行列出各色块列位置）
const byRow = new Map();
for (const bl of saturatedBlocks) {
  if (!byRow.has(bl.by)) byRow.set(bl.by, []);
  byRow.get(bl.by).push(bl);
}

// ---------- 5. 输出 ----------
if (process.argv.includes('--probe')) {
  // --probe "x,y,w,h" 取样区域平均色 + 区内 Top4（可多次传）
  const probes = process.argv
    .map((a, i) => (a === '--probe' ? process.argv[i + 1] : null))
    .filter(Boolean);
  for (const spec of probes) {
    const [x0, y0, w, h] = spec.split(',').map(Number);
    const histP = new Map();
    let rS = 0, gS = 0, bS = 0, nS = 0;
    for (let y = y0; y < Math.min(y0 + h, height); y += 2) {
      for (let x = x0; x < Math.min(x0 + w, width); x += 2) {
        const i = y * stride + x * channels;
        rS += px[i]; gS += px[i + 1]; bS += px[i + 2]; nS++;
        const key = (px[i] >> 4) << 8 | (px[i + 1] >> 4) << 4 | (px[i + 2] >> 4);
        histP.set(key, (histP.get(key) || 0) + 1);
      }
    }
    const top = [...histP.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
      .map(([k, n]) => '#' + [((k >> 8) & 15) * 16 + 8, ((k >> 4) & 15) * 16 + 8, (k & 15) * 16 + 8]
        .map((v) => v.toString(16).padStart(2, '0')).join('') + `(${(n / nS * 100).toFixed(0)}%)`);
    const hex = '#' + [rS / nS, gS / nS, bS / nS].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
    console.log(`probe(${spec}) 平均 ${hex}  Top: ${top.join('  ')}`);
  }
  process.exit(0);
}
if (asJson) {
  console.log(JSON.stringify({ width, height, palette, bandPalettes, saturatedBlocks, ascii }, null, 2));
} else {  console.log(`尺寸: ${width}x${height} (${(width / height).toFixed(3)} 宽高比)`);
  console.log('\n主色调 Top14:');
  palette.forEach((p) => console.log(`  ${p.hex}  ${String(p.pct).padStart(5)}%  rgb(${p.rgb})`));
  console.log('\n横向 8 带 Top3 色（带高 = 图高/8，按高度从上到下）:');
  bandPalettes.forEach((bp, i) => {
    console.log(`  带${i} (y=${Math.floor((height / bands) * i)}~${Math.floor((height / bands) * (i + 1))}): ` +
      bp.map((c) => `${c.hex}(${c.pct}%)`).join('  '));
  });
  console.log('\n彩色区块（32px 块，平均饱和度>0.25；行=块行号，y 像素范围）:');
  for (const [by, bls] of byRow) {
    const yPx = by * blk;
    const cells = bls.map((b) => `[x${b.bx} ${b.hex} s${b.s}]`).join(' ');
    console.log(`  行${by} (y=${yPx}~${yPx + blk}): ${cells}`);
  }
  console.log('\n布局分类图 (R=朱砂 r=暗红 Y=赭金 B=黛青 G=茶绿 o=中间调 .=亮纸 : =纸面 #=墨色):');
  console.log(ascii);
}
