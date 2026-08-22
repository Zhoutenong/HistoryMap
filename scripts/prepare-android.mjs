#!/usr/bin/env node
// 同步后端数据到 Android assets（数据单一来源：只复制，不手抄）。
// 用法：node scripts/prepare-android.mjs，再 cd android && gradle assembleDebug。
// （Android 版为原生渲染，不再打包前端构建产物。）
// 覆盖目标 assets 目录前会整体清空重建，保证无残留旧文件。

import { cpSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'android', 'app', 'src', 'main', 'assets');

const SEED = join(ROOT, 'server', 'data', 'seed');         // 事件/朝代 seed SQL
const GEO = join(ROOT, 'server', 'data', 'geo');           // GeoJSON 数据根
const HISTORICAL = join(GEO, 'historical');                // 历史疆域 + 辅助层
const WEB_STATIC = join(ROOT, 'client', 'public');         // 前端静态贴图（宣纸/山水/烘焙水彩）

// cpSync 的 filter 会作用到源根目录本身，目录必须放行（否则整棵树被跳过）；
// 只需文件级筛选。历史目录排除 source/ 与 _archive_v1_chinaclip/ 两个子目录。
const EXCLUDE_DIRS = new Set(['source', '_archive_v1_chinaclip']);

// 前端静态资源只同步贴图/纹理（Android 渲染器读取），
// 排除 favicon.svg 等非渲染资源；textures/ 子目录内按扩展名保留全部 png/json。
const WEB_STATIC_FILES = new Set(['paper-texture.jpg', 'paper-grain.png', 'ink-landscape.png']);
const keepWebStatic = (src) => {
  const name = src.split(/[\\/]/).pop();
  // hires/（4096 桌面高倍档）不进 APK：Android 维持 2048（4096×3300 ARGB ≈ 50MB，内存红线）
  if (statSync(src).isDirectory()) return name !== 'hires';
  return WEB_STATIC_FILES.has(name) || name.endsWith('.png') || name.endsWith('.json');
};

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

// 2. seed SQL（Room 首次建库重放）
copy(SEED, join(ASSETS, 'seed'), keepSeed);

// 3. 现代底图
copy(join(GEO, 'china.json'), join(ASSETS, 'geo', 'china.json'));

// 4. 历史疆域 + 辅助层
copy(HISTORICAL, join(ASSETS, 'geo', 'historical'), keepInHistorical);

// 5. 前端静态贴图（宣纸底/纸纹/山水插画/烘焙水彩纹理）→ assets/web
//   （Android 渲染器经 assets/web/ 读取；只同步静态资源，不打包前端 JS/HTML/CSS 产物）
copy(WEB_STATIC, join(ASSETS, 'web'), keepWebStatic);

console.log('已同步 Android assets:');
for (const dest of copied) console.log(`  ${dest.replace(ROOT + '\\', '')}`);
console.log(`完成：${copied.length} 个目标目录`);
