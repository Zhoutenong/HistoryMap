#!/usr/bin/env node
/**
 * 全图扫描：找到所有有色区域（非纸色）和文字位置。
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
  if (type === 'IHDR') {
    width = data.readUInt32BE(0); height = data.readUInt32BE(4);
    bitDepth = data[8]; colorType = data[9];
  } else if (type === 'IDAT') { idat.push(data); }
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
        a = (v + pr) & 255; break;
      }
    }
    line[x] = a; px[y * stride + x] = a;
  }
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

// ===== 1. 按行统计彩色像素分布（每行多少个"有色"像素）=====
// "有色"= 非纸色（luminance 不在 0.80~0.90 范围 或 饱和度 > 0.15）
console.log('===== 全图非纸色像素分布 (每20行采样) =====\n');

for (let y = 0; y < height; y += 20) {
  let colored = 0, dark = 0, red = 0, blue = 0, green = 0, brown = 0;
  for (let x = 0; x < width; x += 4) {
    const i = y * stride + x * channels;
    const r = px[i], g = px[i+1], b = px[i+2];
    const [h, s, l] = rgbToHsl(r, g, b);
    // Paper: l > 0.80 and s < 0.20
    const isPaper = l > 0.80 && s < 0.20;
    if (!isPaper) {
      colored++;
      if (l < 0.3) dark++;
      if (h < 25 && s > 0.25 && r > 80) red++;
      if (h >= 190 && h <= 250 && s > 0.15) blue++;
      if (h >= 80 && h <= 160 && s > 0.10) green++;
      if (h >= 20 && h <= 55 && s > 0.10 && l > 0.25 && l < 0.65) brown++;
    }
  }
  if (colored > 10) {
    const bar = '█'.repeat(Math.min(50, Math.round(colored / 4)));
    const types = [];
    if (red > 3) types.push(`红${red}`);
    if (blue > 3) types.push(`蓝${blue}`);
    if (green > 3) types.push(`绿${green}`);
    if (brown > 3) types.push(`褐${brown}`);
    if (dark > 3) types.push(`暗${dark}`);
    console.log(`y=${String(y).padStart(4)} | 彩色=${String(colored).padStart(3)} | ${bar} | ${types.join(' ')}`);
  }
}

// ===== 2. 找辽/西夏标签（在上半部分 y=400~900 范围做更宽搜索）=====
console.log('\n===== 上半部分文字搜索 (y=400~900, x=0~1080) =====\n');

// 在 y=400~900 范围找所有深色文字行
for (let y = 400; y < 900; y += 5) {
  let textPixels = 0;
  let xMin = 9999, xMax = 0;
  for (let x = 0; x < width; x += 2) {
    const i = y * stride + x * channels;
    const r = px[i], g = px[i+1], b = px[i+2];
    const brightness = (r + g + b) / 3;
    const [h, s, l] = rgbToHsl(r, g, b);
    // Dark text on light background
    if (brightness < 140 || (brightness < 170 && s > 0.2)) {
      textPixels++;
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
    }
  }
  if (textPixels >= 3 && (xMax - xMin) > 5) {
    // Sample color of the text
    const midX = Math.round((xMin + xMax) / 2);
    const i = y * stride + midX * channels;
    const hex = '#' + [px[i], px[i+1], px[i+2]].map(v => v.toString(16).padStart(2, '0')).join('');
    console.log(`  y=${y}: text pixels=${textPixels}, x range=[${xMin}, ${xMax}], center pixel=${hex}`);
  }
}

// ===== 3. 在 y=900~1100 范围搜索宋标签和其他标注 =====
console.log('\n===== 中部文字搜索 (y=900~1200) =====\n');

for (let y = 900; y < 1200; y += 5) {
  let textPixels = 0;
  let xMin = 9999, xMax = 0;
  for (let x = 0; x < width; x += 2) {
    const i = y * stride + x * channels;
    const r = px[i], g = px[i+1], b = px[i+2];
    const brightness = (r + g + b) / 3;
    const [h, s, l] = rgbToHsl(r, g, b);
    if (brightness < 140 || (brightness < 170 && s > 0.2)) {
      textPixels++;
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
    }
  }
  if (textPixels >= 3 && (xMax - xMin) > 5) {
    const midX = Math.round((xMin + xMax) / 2);
    const i = y * stride + midX * channels;
    const hex = '#' + [px[i], px[i+1], px[i+2]].map(v => v.toString(16).padStart(2, '0')).join('');
    console.log(`  y=${y}: text px=${textPixels}, x=[${xMin}~${xMax}], color=${hex}`);
  }
}

// ===== 4. 找红色像素最密集的行（宋色块边界）=====
console.log('\n===== 红色像素(y<1700)分布 =====\n');

for (let y = 900; y < 1750; y += 10) {
  let redCount = 0;
  for (let x = 0; x < width; x += 3) {
    const i = y * stride + x * channels;
    const r = px[i], g = px[i+1], b = px[i+2];
    const [h, s, l] = rgbToHsl(r, g, b);
    if (h < 20 && s > 0.30 && r > 100) redCount++;
  }
  if (redCount > 5) {
    const bar = '█'.repeat(Math.min(40, redCount));
    console.log(`y=${String(y).padStart(4)}: red=${String(redCount).padStart(3)} ${bar}`);
  }
}

// ===== 5. 找蓝色/灰色像素分布（辽色块）=====
console.log('\n===== 蓝灰像素分布 =====\n');

for (let y = 200; y < 1200; y += 10) {
  let blueCount = 0;
  for (let x = 0; x < width; x += 3) {
    const i = y * stride + x * channels;
    const r = px[i], g = px[i+1], b = px[i+2];
    const [h, s, l] = rgbToHsl(r, g, b);
    if (h >= 190 && h <= 250 && s > 0.12 && b > 70) blueCount++;
  }
  if (blueCount > 5) {
    const bar = '█'.repeat(Math.min(40, blueCount));
    console.log(`y=${String(y).padStart(4)}: blue=${String(blueCount).padStart(3)} ${bar}`);
  }
}

// ===== 6. 找橄榄/褐色像素分布（西夏/吐蕃）=====
console.log('\n===== 赭黄/褐色像素分布 =====\n');

for (let y = 200; y < 1700; y += 10) {
  let brownCount = 0;
  for (let x = 0; x < width; x += 3) {
    const i = y * stride + x * channels;
    const r = px[i], g = px[i+1], b = px[i+2];
    const [h, s, l] = rgbToHsl(r, g, b);
    if (h >= 20 && h <= 55 && s > 0.12 && l > 0.25 && l < 0.65 && r > 80) brownCount++;
  }
  if (brownCount > 5) {
    const bar = '█'.repeat(Math.min(40, brownCount));
    console.log(`y=${String(y).padStart(4)}: brown=${String(brownCount).padStart(3)} ${bar}`);
  }
}

// ===== 7. 找绿/灰绿色像素（大理/大越）=====
console.log('\n===== 绿色像素分布 =====\n');

for (let y = 1200; y < 1800; y += 10) {
  let greenCount = 0;
  for (let x = 0; x < width; x += 3) {
    const i = y * stride + x * channels;
    const r = px[i], g = px[i+1], b = px[i+2];
    const [h, s, l] = rgbToHsl(r, g, b);
    if (h >= 60 && h <= 160 && s > 0.10 && l > 0.2 && l < 0.7) greenCount++;
  }
  if (greenCount > 3) {
    const bar = '█'.repeat(Math.min(40, greenCount));
    console.log(`y=${String(y).padStart(4)}: green=${String(greenCount).padStart(3)} ${bar}`);
  }
}
