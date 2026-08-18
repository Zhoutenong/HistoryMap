#!/usr/bin/env node
/**
 * Quick verification: probe old vs new formula positions for key labels.
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

// Key comparison: 宋 label
// New formula: (568.6, 1346.0) — should be in 宋 red territory
// Old formula: (568.6, 666.0) — should be above map area
console.log('=== 宋 label: 新公式 vs 旧公式 ===');
console.log('新公式 (569, 1346):', probe(569, 1346, 6, 6));
console.log('旧公式 (569, 666):', probe(569, 666, 6, 6));
console.log('新公式上移680px (569, 666):', probe(569, 666, 6, 6));

// Verify: the 宋 red region center should be around (540, 1450)
console.log('\n=== 宋 红块中心区域 ===');
console.log('(540, 1400):', probe(540, 1400, 8, 8));
console.log('(540, 1450):', probe(540, 1450, 8, 8));
console.log('(540, 1500):', probe(540, 1500, 8, 8));

// 辽 territory: should be northeast (upper right)
console.log('\n=== 辽 territory 位置验证 ===');
// From horizontal scan: 辽 brownish at x=400-480, y=1050
console.log('(440, 1050) 辽区域:', probe(440, 1050, 8, 8));
console.log('(800, 1050) 辽区域:', probe(800, 1050, 8, 8));
console.log('(900, 1000) 辽区域:', probe(900, 1000, 8, 8));

// 西夏 territory: should be northwest
console.log('\n=== 西夏 territory 位置验证 ===');
console.log('(200, 1100):', probe(200, 1100, 8, 8));
console.log('(250, 1150):', probe(250, 1150, 8, 8));

// 吐蕃 territory: should be west
console.log('\n=== 吐蕃 territory 位置验证 ===');
console.log('(160, 1370):', probe(160, 1370, 8, 8));
console.log('(160, 1420):', probe(160, 1420, 8, 8));

// 大理 territory: should be southwest
console.log('\n=== 大理 territory 位置验证 ===');
console.log('(330, 1620):', probe(330, 1620, 8, 8));
console.log('(330, 1660):', probe(330, 1660, 8, 8));

// 北汉灭亡事件锚点（太原 112.55, 37.87）
// New formula: (567.4, 1202.2)
// Old formula: (567.4, 522.2)
console.log('\n=== 北汉灭亡事件泡泡锚点 ===');
console.log('新公式 (567, 1202):', probe(567, 1202, 8, 8));
console.log('旧公式 (567, 522):', probe(567, 522, 8, 8));

// 顶部状态栏区域 (y < 154)
console.log('\n=== 顶部状态栏区域 ===');
console.log('(540, 100):', probe(540, 100, 8, 8));
console.log('(540, 200):', probe(540, 200, 8, 8));
