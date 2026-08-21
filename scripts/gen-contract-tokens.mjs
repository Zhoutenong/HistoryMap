#!/usr/bin/env node
/**
 * 双端共享数值契约生成器（codebase-review-plan.md A2 第二步）。
 *
 * 唯一事实来源：contract/tokens.json（投影 fitSize、LOD 档位矩阵、碰撞参数、
 * kind 白名单、设置项 schema——分类 + 播放速度）。本脚本据此生成双端消费品：
 *   - client/src/contract-tokens.js                  （Web：Vite/vitest 直接引用）
 *   - android/.../ContractTokens.kt                 （Android：Kotlin object）
 * 服务端参考实现 overlay-merge.js 直接读 contract/tokens.json（见该文件），故三端同源。
 *
 * 用法：
 *   node scripts/gen-contract-tokens.mjs --write   # 覆写两端产物（改契约后执行）
 *   node scripts/gen-contract-tokens.mjs --check   # 校验：产物与契约 diff 一致，不一致退出 1
 *   node scripts/gen-contract-tokens.mjs           # 等价 --write（引导用）
 *
 * 注意：产物是「提交进仓库的生成文件」——校验通过 = 契约是两端数值唯一事实来源。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOKENS_PATH = join(ROOT, 'contract', 'tokens.json');
const JS_OUT = join(ROOT, 'client', 'src', 'contract-tokens.js');
const KT_DIR = join(ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'historymap', 'app');
const KT_OUT = join(KT_DIR, 'ContractTokens.kt');

// ---------- 契约结构校验 ----------
function fail(msg) {
  console.error(`[contract-tokens] 校验失败：${msg}`);
  process.exit(1);
}

const tokens = JSON.parse(readFileSync(TOKENS_PATH, 'utf8'));

if (!Number.isInteger(tokens.version) || tokens.version < 1) fail('version 必须是正整数');
const { projection, lod, collision, placeKinds, categories, speeds } = tokens;
if (!projection || !Number.isFinite(projection.fitWidth) || projection.fitWidth <= 0) fail('projection.fitWidth 非法');
if (!Number.isFinite(projection.fitHeight) || projection.fitHeight <= 0) fail('projection.fitHeight 非法');
if (!lod || !Number.isFinite(lod.hysteresis) || lod.hysteresis < 0) fail('lod.hysteresis 非法');
if (!Array.isArray(lod.thresholds) || lod.thresholds.length !== 3
  || !lod.thresholds.every((t) => Number.isFinite(t)) || !(lod.thresholds[0] > lod.thresholds[1] && lod.thresholds[1] > lod.thresholds[2])) {
  fail('lod.thresholds 必须为 3 个严格降序的有限数（[L0下界, L1下界, L2下界]）');
}
for (const key of ['gap', 'maxPush', 'viewportPad']) {
  if (!collision || !Number.isFinite(collision[key]) || collision[key] <= 0) fail(`collision.${key} 非法`);
}
if (!Array.isArray(placeKinds) || placeKinds.length === 0 || !placeKinds.every((k) => typeof k === 'string' && k.length > 0)) {
  fail('placeKinds 必须是非空字符串数组');
}
if (!Array.isArray(categories) || categories.length === 0) fail('categories 必须是非空数组');
const seenIds = new Set();
for (const c of categories) {
  if (!c.id || !c.label || !c.labelShort) fail(`categories 条目缺少 id/label/labelShort: ${JSON.stringify(c)}`);
  if (seenIds.has(c.id)) fail(`categories id 重复: ${c.id}`);
  seenIds.add(c.id);
}
if (!speeds || !Number.isFinite(speeds.slow) || !Number.isFinite(speeds.normal) || !Number.isFinite(speeds.fast)) {
  fail('speeds 必须含 slow/normal/fast 三个有限数');
}

// ---------- 数字格式化 ----------
const jsNum = (n) => String(n); // JS 直接输出明文（0.4 / 6 / 220）
const jsStr = (s) => JSON.stringify(s);
const ktFloat = (n) => `${n}f`; // 6 → 6f；0.4 → 0.4f
const ktDouble = (n) => (Number.isInteger(n) ? `${n}.0` : String(n));
const ktLong = (n) => `${n}L`;
const ktStr = (s) => JSON.stringify(s);

// ---------- 渲染 JS（Web） ----------
function renderJs(t) {
  const catLines = t.categories.map(
    (c) => `  Object.freeze({ id: ${jsStr(c.id)}, label: ${jsStr(c.label)}, labelShort: ${jsStr(c.labelShort)} }),`,
  ).join('\n');
  const thr = t.lod.thresholds.map(jsNum).join(', ');
  return `/**
 * 双端共享数值契约 —— 由 scripts/gen-contract-tokens.mjs 从 contract/tokens.json 自动生成。
 * ⚠️ 请勿手工编辑：改动契约请修改 contract/tokens.json 后运行 \`npm run contract:tokens:write\`，
 * 并在提交前保证 \`npm run contract:tokens\`（生成物与契约 diff 校验）通过。
 * ${t.note}
 */
const PROJECTION = Object.freeze({ fitWidth: ${jsNum(t.projection.fitWidth)}, fitHeight: ${jsNum(t.projection.fitHeight)} });
const LOD = Object.freeze({ hysteresis: ${jsNum(t.lod.hysteresis)}, thresholds: Object.freeze([${thr}]) });
const COLLISION = Object.freeze({ gap: ${jsNum(t.collision.gap)}, maxPush: ${jsNum(t.collision.maxPush)}, viewportPad: ${jsNum(t.collision.viewportPad)} });
const PLACE_KINDS = Object.freeze(${JSON.stringify(t.placeKinds)});
const CATEGORIES = Object.freeze([
${catLines}
]);
const SPEEDS = Object.freeze({ slow: ${jsNum(t.speeds.slow)}, normal: ${jsNum(t.speeds.normal)}, fast: ${jsNum(t.speeds.fast)} });
const CONTRACT = Object.freeze({
  version: ${t.version},
  projection: PROJECTION,
  lod: LOD,
  collision: COLLISION,
  placeKinds: PLACE_KINDS,
  categories: CATEGORIES,
  speeds: SPEEDS,
});

export { PROJECTION, LOD, COLLISION, PLACE_KINDS, CATEGORIES, SPEEDS, CONTRACT };
export default CONTRACT;
`;
}

// ---------- 渲染 Kotlin（Android） ----------
function renderKt(t) {
  const catLines = t.categories.map(
    (c) => `        CategoryDef(${ktStr(c.id)}, ${ktStr(c.label)}, ${ktStr(c.labelShort)}),`,
  ).join('\n');
  const thr = t.lod.thresholds.map(ktFloat).join(', ');
  const spd = t.speeds;
  const spdPairs = Object.entries(spd).map(([k, v]) => `${ktStr(k)} to ${ktLong(v)}`).join(', ');
  return `// Code generated by scripts/gen-contract-tokens.mjs from contract/tokens.json — DO NOT EDIT.
// ${t.note}
package com.historymap.app

/**
 * 双端共享数值契约（Web 版 client/src/contract-tokens.js 同源）：
 * 投影 fitSize、LOD 档位矩阵、碰撞参数、kind 白名单、设置项 schema（分类 + 播放速度）。
 * 唯一事实来源：contract/tokens.json（由 scripts/gen-contract-tokens.mjs 生成，勿手改；
 * 改契约 → node scripts/gen-contract-tokens.mjs --write 并保持 npm run contract:tokens 通过）。
 */
object ContractTokens {

    /** 投影标定宽高（d3-geo geoMercator fitSize / MercatorProjection.fit 的 1000×800） */
    const val PROJECTION_FIT_WIDTH: Double = ${ktDouble(t.projection.fitWidth)}
    const val PROJECTION_FIT_HEIGHT: Double = ${ktDouble(t.projection.fitHeight)}

    /** LOD 档位滞回（±，缩放临界抖动防反复换档） */
    const val LOD_HYSTERESIS: Float = ${ktFloat(t.lod.hysteresis)}

    /** LOD 档位下界（降序：[L0下界, L1下界, L2下界]；s ≥ 下界即落在该档或更「全国」） */
    val LOD_THRESHOLDS: FloatArray = floatArrayOf(${thr})

    /** 碰撞推挤参数（泡泡间留白 / 单方向最大推挤量 / 视口回收边距） */
    const val COLLISION_GAP: Float = ${ktFloat(t.collision.gap)}
    const val COLLISION_MAX_PUSH: Float = ${ktFloat(t.collision.maxPush)}
    const val COLLISION_VIEWPORT_PAD: Float = ${ktFloat(t.collision.viewportPad)}

    /** 地点类要素 kind 白名单（都城/战场/书院 → 响应顶层 properties.places） */
    val PLACE_KINDS: Set<String> = setOf(${t.placeKinds.map(ktStr).join(', ')})

    /** 事件分类定义（id + 全称 + 时间轴短标签） */
    data class CategoryDef(val id: String, val label: String, val labelShort: String)

    val CATEGORIES: List<CategoryDef> = listOf(
${catLines}
    )

    /** 分类 id → 全称（设置面板 / 详情面板 / 事件流） */
    val CATEGORY_LABELS: Map<String, String> = CATEGORIES.associate { it.id to it.label }

    /** 分类 id → 时间轴图例短标签 */
    val CATEGORY_SHORT_LABELS: Map<String, String> = CATEGORIES.associate { it.id to it.labelShort }

    /** 合法分类 id 集合（设置校验） */
    val CATEGORY_IDS: Set<String> = CATEGORIES.map { it.id }.toSet()

    /** 播放速度档位 → tickMs(ms) */
    val SPEED_TICK_MS: Map<String, Long> = mapOf(${spdPairs})
    const val SPEED_TICK_NORMAL: Long = ${ktLong(t.speeds.normal)}
    val SPEED_IDS: Set<String> = SPEED_TICK_MS.keys
}
`;
}

const jsContent = renderJs(tokens);
const ktContent = renderKt(tokens);

// ---------- 模式：--check / --write ----------
const mode = process.argv[2] === '--check' ? 'check' : 'write';

if (mode === 'write') {
  writeFileSync(JS_OUT, jsContent, 'utf8');
  writeFileSync(KT_OUT, ktContent, 'utf8');
  console.log(`[contract-tokens] 已写入（契约 version ${tokens.version}）：`);
  console.log(`  ${JS_OUT}`);
  console.log(`  ${KT_OUT}`);
} else {
  let ok = true;
  const pairs = [
    [JS_OUT, jsContent, 'client/src/contract-tokens.js'],
    [KT_OUT, ktContent, 'android/.../ContractTokens.kt'],
  ];
  for (const [path, expected, label] of pairs) {
    if (!existsSync(path)) {
      ok = false;
      console.error(`  ✗ ${label} 缺失（请先运行 npm run contract:tokens:write）`);
      continue;
    }
    const current = readFileSync(path, 'utf8');
    if (current === expected) {
      console.log(`  ✓ ${label} 与契约一致`);
    } else {
      ok = false;
      console.error(`  ✗ ${label} 与 contract/tokens.json 不一致（请运行 npm run contract:tokens:write 重新生成）`);
    }
  }
  if (ok) {
    console.log('[contract-tokens] PASS：双端契约产物与 contract/tokens.json 完全一致');
  } else {
    process.exit(1);
  }
}
