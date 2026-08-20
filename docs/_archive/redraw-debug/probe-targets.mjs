#!/usr/bin/env node
/**
 * Targeted pixel probes for alignment verification.
 * Probes specific screen locations to determine actual territory colors.
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
  } catch (e) { return `[error: ${e.message}]`; }
}

console.log('=== 辽 territory 区域垂直扫描 (x=540) ===');
for (let y = 880; y <= 1200; y += 30) {
  console.log(`  y=${y}: ${probe(540, y, 4, 4)}`);
}

console.log('\n=== 辽 territory 区域水平扫描 (y=1050) ===');
for (let x = 400; x <= 1100; x += 40) {
  console.log(`  x=${x}: ${probe(x, 1050, 4, 4)}`);
}

console.log('\n=== 宋 territory 垂直扫描 (x=540) ===');
for (let y = 1100; y <= 1750; y += 30) {
  console.log(`  y=${y}: ${probe(540, y, 4, 4)}`);
}

console.log('\n=== 太原位置 (567, 1202) 附近 ===');
for (let dy = -60; dy <= 60; dy += 15) {
  console.log(`  y=${1202+dy}: ${probe(567, 1202+dy, 4, 4)}`);
}

console.log('\n=== 旧模型宋label位置 (568, 666) 附近 ===');
for (let dy = -30; dy <= 30; dy += 10) {
  console.log(`  y=${666+dy}: ${probe(568, 666+dy, 4, 4)}`);
}

console.log('\n=== 旧模型辽label位置 (643, 339) 附近 ===');
for (let dy = -30; dy <= 30; dy += 10) {
  console.log(`  y=${339+dy}: ${probe(643, 339+dy, 4, 4)}`);
}

console.log('\n=== 吐蕃区域 (x=160, y=1350) ===');
for (let dy = -60; dy <= 60; dy += 20) {
  console.log(`  y=${1350+dy}: ${probe(160, 1350+dy, 4, 4)}`);
}

console.log('\n=== 大理区域 (x=330, y=1620) ===');
for (let dy = -40; dy <= 40; dy += 20) {
  console.log(`  y=${1620+dy}: ${probe(330, 1620+dy, 4, 4)}`);
}

console.log('\n=== 西夏区域 (x=300, y=1130) ===');
for (let dy = -40; dy <= 40; dy += 20) {
  console.log(`  y=${1130+dy}: ${probe(300, 1130+dy, 4, 4)}`);
}
