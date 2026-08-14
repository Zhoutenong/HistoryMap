#!/usr/bin/env node
// 生成 Android 启动图标 fallback PNG（API 24/25 设备无 adaptive icon 支持）。
// 图案与 res/drawable/ic_launcher_foreground.xml 呼应：宣纸底 + 墨色远山 + 印章红日。
// 一次性生成后提交 git；adaptive icon（mipmap-anydpi-v26）已覆盖 API 26+。

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RES = join(ROOT, 'android', 'app', 'src', 'main', 'res');

// 配色（与 adaptive icon 前景一致）
const BG = [242, 235, 221];   // 宣纸 #F2EBDD
const INK_DARK = [46, 42, 36];  // 近山 #2E2A24
const INK_LIGHT = [74, 66, 56]; // 远山 #4A4238
const RED = [179, 58, 46];    // 印章红 #B33A2E

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** 判断点 (px, py) 是否在三角形 (ax,ay)(bx,by)(cx,cy) 内（重心法） */
function inTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/** 生成 size×size 图标：宣纸底 + 远山 + 近山 + 红日（图案按比例缩放到任意尺寸） */
function pngIcon(size) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // 远山：顶点 (0.5w, 0.40h)，底边 (0.12w, 0.85h)-(0.88w, 0.85h)
  // 近山：顶点 (0.32w, 0.62h)，底边 (0.18w, 0.85h)-(0.75w, 0.85h)
  // 红日：圆心 (0.62w, 0.27h)，半径 0.10w
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x++) {
      let color = BG;
      const nx = x / size;
      const ny = y / size;
      const sunDx = nx - 0.62;
      const sunDy = ny - 0.27;
      if (sunDx * sunDx + sunDy * sunDy <= 0.10 * 0.10) {
        color = RED;
      } else if (inTriangle(nx, ny, 0.32, 0.62, 0.18, 0.85, 0.75, 0.85)) {
        color = INK_DARK;
      } else if (inTriangle(nx, ny, 0.5, 0.40, 0.12, 0.85, 0.88, 0.85)) {
        color = INK_LIGHT;
      }
      row[1 + x * 3] = color[0];
      row[2 + x * 3] = color[1];
      row[3 + x * 3] = color[2];
    }
    rows.push(row);
  }
  const raw = Buffer.concat(rows);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// 各密度尺寸：mdpi 48 / hdpi 72 / xhdpi 96 / xxhdpi 144 / xxxhdpi 192
const DENSITIES = [
  ['mipmap-mdpi', 48],
  ['mipmap-hdpi', 72],
  ['mipmap-xhdpi', 96],
  ['mipmap-xxhdpi', 144],
  ['mipmap-xxxhdpi', 192],
];

for (const [dir, size] of DENSITIES) {
  const outDir = join(RES, dir);
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, 'ic_launcher.png');
  writeFileSync(outFile, pngIcon(size));
  console.log(`生成 ${dir}/ic_launcher.png (${size}×${size}, ${(pngIcon(size).length / 1024).toFixed(1)}KB)`);
}
