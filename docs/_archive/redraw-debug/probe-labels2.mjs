#!/usr/bin/env node
/**
 * Targeted probe for label text positions.
 */
import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const ANALYZE = path.join(ROOT, 'scripts/analyze-image.mjs');
const PNG = path.join(ROOT, 'artifacts/audit/post-fix2-main.png');

function probe(x, y, w, h) {
  const spec = `${Math.round(x)},${Math.round(y)},${w},${h}`;
  try {
    return execSync(`node "${ANALYZE}" "${PNG}" --probe "${spec}"`, { encoding: 'utf8', timeout: 15000 }).trim();
  } catch (e) { return `[error]`; }
}

function isDarkText(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return r < 120 && g < 120 && b < 100;
}

// For each label, scan a ±50px area around the predicted position
const targets = [
  { name: '宋', x: 569, y: 1346 },
  { name: '辽-predicted', x: 644, y: 1020 },
  { name: '西夏', x: 383, y: 1185 },
  { name: '吐蕃', x: 10, y: 1393 },
  { name: '大理', x: 253, y: 1570 },
  { name: '大越', x: 393, y: 1701 },
];

for (const t of targets) {
  console.log(`\n=== ${t.name} label 搜索 (中心 ${t.x},${t.y}) ===`);
  let found = false;
  for (let dy = -50; dy <= 50; dy += 4) {
    const hex = probe(t.x, t.y + dy, 4, 4);
    const m = hex.match(/平均\s+(#[0-9a-f]{6})/i);
    if (m && isDarkText(m[1])) {
      console.log(`  DARK TEXT at (${t.x}, ${t.y + dy}): ${hex}`);
      found = true;
    }
  }
  if (!found) console.log('  (no dark text found in ±50px)');
}

// Also scan for text labels in the city label area (宋 territory upper portion)
console.log('\n=== 城市标注区域搜索 (宋 territory 上半部) ===');
for (let y = 1300; y <= 1450; y += 4) {
  for (let x = 400; x <= 700; x += 4) {
    const hex = probe(x, y, 3, 3);
    const m = hex.match(/平均\s+(#[0-9a-f]{6})/i);
    if (m && isDarkText(m[1])) {
      console.log(`  CITY LABEL at (${x}, ${y}): ${hex}`);
    }
  }
}
