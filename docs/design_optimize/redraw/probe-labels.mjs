#!/usr/bin/env node
/**
 * Probe for the actual position of regime labels on the screenshot.
 * Labels are Compose text (dark ink color) rendered on top of the GL territory.
 */
import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const ANALYZE = path.join(ROOT, 'scripts/analyze-image.mjs');
const PNG = path.join(ROOT, 'artifacts/audit/post-fix2-main.png');

function probe(x, y, w, h) {
  const spec = `${Math.round(x)},${Math.round(y)},${w},${h}`;
  try {
    return execSync(`node "${ANALYZE}" "${PNG}" --probe "${spec}"`, { encoding: 'utf8', timeout: 30000 }).trim();
  } catch (e) { return `[error]`; }
}

// Search for text labels (dark ink on territory)
// Labels should be dark text (#3A3428 or similar)
function isDarkText(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return r < 100 && g < 100 && b < 80;
}

// Scan for "宋" label text near predicted position (569, 1346)
console.log('=== 搜索宋 label 文字 (预测位置附近) ===');
for (let dy = -40; dy <= 40; dy += 5) {
  const hex = probe(569, 1346 + dy, 4, 4);
  const m = hex.match(/平均\s+(#[0-9a-f]{6})/i);
  if (m && isDarkText(m[1])) {
    console.log(`  FOUND DARK at y=${1346+dy}: ${hex}`);
  }
}

// Scan for "辽" label text - try predicted position AND actual territory area
console.log('\n=== 搜索辽 label 文字 ===');
// Predicted: (644, 1020)
for (let dy = -40; dy <= 40; dy += 5) {
  const hex = probe(644, 1020 + dy, 4, 4);
  const m = hex.match(/平均\s+(#[0-9a-f]{6})/i);
  if (m && isDarkText(m[1])) {
    console.log(`  FOUND DARK at predicted (644, ${1020+dy}): ${hex}`);
  }
}
// Actual territory area (x=400-480, y=1000-1100)
for (let y = 980; y <= 1100; y += 5) {
  for (let x = 380; x <= 500; x += 5) {
    const hex = probe(x, y, 4, 4);
    const m = hex.match(/平均\s+(#[0-9a-f]{6})/i);
    if (m && isDarkText(m[1])) {
      console.log(`  FOUND DARK at (${x}, ${y}): ${hex}`);
    }
  }
}

// Search for "西夏" label text
console.log('\n=== 搜索西夏 label 文字 ===');
// Predicted: (383, 1185)
for (let dy = -40; dy <= 40; dy += 5) {
  const hex = probe(383, 1185 + dy, 4, 4);
  const m = hex.match(/平均\s+(#[0-9a-f]{6})/i);
  if (m && isDarkText(m[1])) {
    console.log(`  FOUND DARK at predicted (383, ${1185+dy}): ${hex}`);
  }
}

// Search for "吐蕃" label text
console.log('\n=== 搜索吐蕃 label 文字 ===');
// Predicted: (-2, 1393) → clamp to x=0
for (let dy = -40; dy <= 40; dy += 5) {
  const hex = probe(10, 1393 + dy, 4, 4);
  const m = hex.match(/平均\s+(#[0-9a-f]{6})/i);
  if (m && isDarkText(m[1])) {
    console.log(`  FOUND DARK at (10, ${1393+dy}): ${hex}`);
  }
}

// Search for "大理" label text
console.log('\n=== 搜索大理 label 文字 ===');
// Predicted: (253, 1570)
for (let dy = -40; dy <= 40; dy += 5) {
  const hex = probe(253, 1570 + dy, 4, 4);
  const m = hex.match(/平均\s+(#[0-9a-f]{6})/i);
  if (m && isDarkText(m[1])) {
    console.log(`  FOUND DARK at predicted (253, ${1570+dy}): ${hex}`);
  }
}

// Broad search: scan entire map area for dark text clusters
console.log('\n=== 全图暗色文字搜索 (y=900-1800, 每20px) ===');
for (let y = 900; y <= 1800; y += 20) {
  for (let x = 50; x <= 1050; x += 20) {
    const hex = probe(x, y, 6, 6);
    const m = hex.match(/平均\s+(#[0-9a-f]{6})/i);
    if (m && isDarkText(m[1])) {
      console.log(`  DARK at (${x}, ${y}): ${hex}`);
    }
  }
}
