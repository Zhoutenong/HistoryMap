#!/usr/bin/env node
// 同步前端构建产物与后端数据到 Android assets（数据单一来源：只复制，不手抄）。
// 用法：npm run build 之后执行 node scripts/prepare-android.mjs，再 cd android && gradle assembleDebug。
// 覆盖目标 assets 目录前会整体清空重建，保证无残留旧文件。

import { cpSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'android', 'app', 'src', 'main', 'assets');

const DIST = join(ROOT, 'client', 'dist');                 // 前端构建产物
const SEED = join(ROOT, 'server', 'data', 'seed');         // 事件/朝代 seed SQL
const GEO = join(ROOT, 'server', 'data', 'geo');           // GeoJSON 数据根
const HISTORICAL = join(GEO, 'historical');                // 历史疆域 + 辅助层

// cpSync 的 filter 会作用到源根目录本身，目录必须放行（否则整棵树被跳过）；
// 只需文件级筛选。历史目录排除 source/ 与 _archive_v1_chinaclip/ 两个子目录。
const EXCLUDE_DIRS = new Set(['source', '_archive_v1_chinaclip']);

const keepInHistorical = (src) => {
  const name = src.split(/[\\/]/).pop();
  if (statSync(src).isDirectory()) return !EXCLUDE_DIRS.has(name);
  if (name === 'README.md') return true;
  return name.endsWith('.json') || name.endsWith('.geojson');
};

const keepSeed = (src) => {
  if (statSync(src).isDirectory()) return true;
  return src.endsWith('.sql');
};

const copied = [];

function copy(src, dest, filter) {
  cpSync(src, dest, { recursive: true, filter });
  copied.push(dest);
}

// 1. 清空重建 assets（保证无残留）
rmSync(ASSETS, { recursive: true, force: true });
mkdirSync(ASSETS, { recursive: true });

// 2. 前端构建产物（vite base './'，file:// 可解析）
copy(DIST, join(ASSETS, 'web'));

// 3. seed SQL（Room 首次建库重放）
copy(SEED, join(ASSETS, 'seed'), keepSeed);

// 4. 现代底图
copy(join(GEO, 'china.json'), join(ASSETS, 'geo', 'china.json'));

// 5. 历史疆域 + 辅助层
copy(HISTORICAL, join(ASSETS, 'geo', 'historical'), keepInHistorical);

console.log('已同步 Android assets:');
for (const dest of copied) console.log(`  ${dest.replace(ROOT + '\\', '')}`);
console.log(`完成：${copied.length} 个目标目录`);
