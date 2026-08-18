#!/usr/bin/env node
/**
 * 演示管线工具：把 prompt_4.png 的关键 UI 区域裁成特写 PNG，
 * 供 modlens 二次识图核对组件细节（图标字形/图例/泡泡/底部面板）。
 * 裁剪坐标来自 analyze-image.mjs 的布局分带结果（872×1804 物理像素）。
 * 用法：node docs/design_optimize/redraw/crop-regions.mjs
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..', 'prompt_4.png');
const OUT = path.join(__dirname, 'crops');

const REGIONS = {
  // 顶栏（含朝代钮 + 3 个 44×44 图标）
  topbar: [0, 96, 872, 200],
  // 图例条（政权 宋 辽 西夏 金 大理 吐蕃）
  legend: [0, 300, 872, 150],
  // 事件泡泡簇（靖康之变/绍兴和议 纸笺区）
  bubbles: [120, 540, 580, 240],
  // 底部面板（年份/轨道/播放钮/分类页签）
  bottom: [0, 1370, 872, 434],
};

fs.mkdirSync(OUT, { recursive: true });
const img = await loadImage(SRC);
for (const [name, [x, y, w, h]] of Object.entries(REGIONS)) {
  const canvas = createCanvas(w, h);
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.drawImage(img, x, y, w, h, 0, 0, w, h);
  const file = path.join(OUT, `${name}.png`);
  fs.writeFileSync(file, canvas.toBuffer('image/png'));
  console.log(`[crop] ${name} ${w}x${h} @(${x},${y}) -> ${file}`);
}