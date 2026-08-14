#!/usr/bin/env node
/**
 * 视觉 token 一致性校验：以 docs/design_optimize/design-tokens.json 为唯一设计输入，
 * 检查 Android 端 MapVisualTokens.kt 中是否存在对应值。
 *
 * 只校验可稳定映射的颜色、alpha、尺寸与字体数值：
 * - 颜色：design #RRGGBB → Kotlin Color(0xFFRRGGBB)
 * - alpha（0..255）/ 尺寸（设计 px）：design 数值 → Kotlin const val
 * - 字体：design size/weight/letterSpacing/lineHeight → Kotlin TypeSpec
 *
 * 白名单跳过：字体 serif 标志、Compose 类型、派生比例值（Map.* 浮点参数）、
 * 兼容层别名（PAPER_MAP get() 等）——避免脆弱的正则误报。
 *
 * 输出缺失 / 不一致 / 额外 token；不一致时退出码为 1。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const tokensPath = path.join(root, '..', 'docs', 'design_optimize', 'design-tokens.json');
const kotlinDir = () => path.join(
  root, '..', 'android', 'app', 'src', 'main', 'java', 'com', 'historymap', 'app',
);
const kotlinPath = path.join(kotlinDir(), 'MapVisualTokens.kt');

const tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
const source = fs.readFileSync(kotlinPath, 'utf8');

/** 从 source 中提取 object X { ... } 的正文（括号深度计数，容忍内部 mapOf/data class） */
function extractObjectBody(src, objectName) {
  const marker = `object ${objectName} {`;
  const start = src.indexOf(marker);
  if (start < 0) return null;
  // marker 已包含对象自身的开括号，depth 从 1 起算，首个闭合 } 即回到 0
  let depth = 1;
  for (let i = start + marker.length; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(start + marker.length, i);
    }
  }
  return null;
}

/** 校验项：{ path, name, expected, re } —— expected 是 Kotlin 源码中应出现的字面量 */
const checks = [];

const C = tokens.colors;
const colorChecks = [
  ['mapBackground', 'PAPER_MAP', C.mapBackground],
  ['panelBackground', 'PANEL', C.panelBackground],
  ['cardBackground', 'CARD', C.cardBackground],
  ['ink', 'INK', C.ink],
  ['inkSecondary', 'INK_SECONDARY', C.inkSecondary],
  ['inkFaint', 'INK_FAINT', C.inkFaint],
  ['vermilion', 'VERMILION', C.vermilion],
  ['gold', 'GOLD', C.gold],
  ['riverWash', 'RIVER_WASH', C.mapAux.riverWash],
  ['riverBody', 'RIVER_BODY', C.mapAux.riverBody],
  ['mountainInk', 'MOUNTAIN_INK', C.mapAux.mountainInk],
  ['paperGrain', 'PAPER_GRAIN', C.mapAux.paperGrain],
  ['warmWash', 'WARM_WASH', C.mapAux.warmWash],
];
for (const [designKey, name, hex] of colorChecks) {
  checks.push({
    path: `colors.${designKey}`,
    name,
    expected: `0xFF${hex.slice(1).toUpperCase()}`,
    re: new RegExp(`val ${name}\\s*=\\s*Color\\(0xFF${hex.slice(1).toUpperCase()}\\)`),
  });
}

// 政权色（map 条目：key + 色值成对出现）
for (const [entity, hex] of Object.entries(C.regime)) {
  checks.push({
    path: `colors.regime.${entity}`,
    name: `REGIME["${entity}"]`,
    expected: `0xFF${hex.slice(1).toUpperCase()}`,
    re: new RegExp(`"${entity}"\\s*to\\s*Color\\(0xFF${hex.slice(1).toUpperCase()}\\)`),
  });
}

// 事件分类色（design 键 → Web 语义键，色值一致）
const categoryKeyMap = { politics: 'era', people: 'figure', military: 'military', economy: 'economy', culture: 'invention' };
for (const [designKey, hex] of Object.entries(C.eventCategory)) {
  const webKey = categoryKeyMap[designKey];
  checks.push({
    path: `colors.eventCategory.${designKey}`,
    name: `EVENT_CATEGORY["${webKey}"]`,
    expected: `0xFF${hex.slice(1).toUpperCase()}`,
    re: new RegExp(`"${webKey}"\\s*to\\s*Color\\(0xFF${hex.slice(1).toUpperCase()}\\)`),
  });
}

// alpha（0..255）
const alphaNames = {
  topBar: 'TOP_BAR', legendBackground: 'LEGEND_BACKGROUND', bubbleBackground: 'BUBBLE_BACKGROUND',
  bubbleBorder: 'BUBBLE_BORDER', bubbleShadow: 'BUBBLE_SHADOW', yearWatermark: 'YEAR_WATERMARK',
  watercolorBody: 'WATERCOLOR_BODY', watercolorBloom: 'WATERCOLOR_BLOOM',
  watercolorMottleMin: 'WATERCOLOR_MOTTLE_MIN', watercolorMottleMax: 'WATERCOLOR_MOTTLE_MAX',
  boundary: 'BOUNDARY', dryEdge: 'DRY_EDGE', majorRiverWash: 'MAJOR_RIVER_WASH',
  majorRiverBody: 'MAJOR_RIVER_BODY', majorRiverSpine: 'MAJOR_RIVER_SPINE',
  minorRiverWash: 'MINOR_RIVER_WASH', minorRiverBody: 'MINOR_RIVER_BODY',
  mountain: 'MOUNTAIN', paperGrain: 'PAPER_GRAIN', vignette: 'VIGNETTE',
  centerLight: 'CENTER_LIGHT', timelineTrack: 'TIMELINE_TRACK', timelineShadow: 'TIMELINE_SHADOW',
};
for (const [designKey, name] of Object.entries(alphaNames)) {
  const value = tokens.alpha0to255[designKey];
  checks.push({
    path: `alpha0to255.${designKey}`,
    name: `Alpha.${name}`,
    expected: String(value),
    re: new RegExp(`const val ${name}\\s*=\\s*${value}\\b`),
  });
}

// 尺寸（设计 px；浮点字段用 f 后缀）
const dimensionNames = {
  topBarHeight: 'TOP_BAR_HEIGHT', legendX: 'LEGEND_X', legendY: 'LEGEND_Y',
  legendWidth: 'LEGEND_WIDTH', legendHeight: 'LEGEND_HEIGHT', mapTop: 'MAP_TOP', mapBottom: 'MAP_BOTTOM',
  eventBubbleWidth: 'EVENT_BUBBLE_WIDTH', eventBubbleHeight: 'EVENT_BUBBLE_HEIGHT',
  eventBubbleRadius: 'EVENT_BUBBLE_RADIUS', eventBubbleBorder: 'EVENT_BUBBLE_BORDER',
  eventCategoryBarWidth: 'EVENT_CATEGORY_BAR_WIDTH', leaderWidth: 'LEADER_WIDTH',
  leaderDashLength: 'LEADER_DASH_LENGTH', leaderGap: 'LEADER_GAP', arrowLength: 'ARROW_LENGTH',
  arrowWidth: 'ARROW_WIDTH', eventPointDiameter: 'EVENT_POINT_DIAMETER', timelineX: 'TIMELINE_X',
  timelineY: 'TIMELINE_Y', timelineWidth: 'TIMELINE_WIDTH', timelineHeight: 'TIMELINE_HEIGHT',
  timelineRadius: 'TIMELINE_RADIUS', timelineBottomSafeArea: 'TIMELINE_BOTTOM_SAFE_AREA',
  playButtonWidth: 'PLAY_BUTTON_WIDTH', playButtonHeight: 'PLAY_BUTTON_HEIGHT',
  trackHeight: 'TRACK_HEIGHT', thumbDiameter: 'THUMB_DIAMETER', thumbStroke: 'THUMB_STROKE',
  eventDotDiameter: 'EVENT_DOT_DIAMETER',
};
for (const [designKey, name] of Object.entries(dimensionNames)) {
  const value = tokens.dimensionsPx[designKey];
  checks.push({
    path: `dimensionsPx.${designKey}`,
    name: `Dimensions.${name}`,
    expected: String(value),
    re: new RegExp(`const val ${name}\\s*=\\s*${value}(?:f|\\b)`),
  });
}

// 字体（size/weight/letterSpacing/lineHeight → TypeSpec；serif 字段白名单跳过）
const typeNames = {
  topTitle: 'TOP_TITLE', dynasty: 'DYNASTY', menu: 'MENU', legendTitle: 'LEGEND_TITLE',
  legendItem: 'LEGEND_ITEM', mapLabel: 'MAP_LABEL', bubbleTitle: 'BUBBLE_TITLE',
  bubbleBody: 'BUBBLE_BODY', watermark: 'WATERMARK', timelineYear: 'TIMELINE_YEAR',
  timelineRange: 'TIMELINE_RANGE', timelineCategory: 'TIMELINE_CATEGORY',
};
for (const [designKey, name] of Object.entries(typeNames)) {
  const t = tokens.typographyPx[designKey];
  checks.push({
    path: `typographyPx.${designKey}`,
    name: `Typography.${name}`,
    expected: `TypeSpec(${t.size}, ${t.weight}, ${t.letterSpacing}, ${t.lineHeight})`,
    re: new RegExp(`val ${name}\\s*=\\s*TypeSpec\\(${t.size},\\s*${t.weight},\\s*${t.letterSpacing},\\s*${t.lineHeight}\\)`),
  });
}

// —— 执行校验 ——
const failures = [];
const missing = [];
for (const c of checks) {
  if (!c.re.test(source)) {
    failures.push(`${c.path} → ${c.name} 应为 ${c.expected}，源码中未匹配`);
  }
}

// 额外 token：扫描四个核心 object 内的名称，凡不在上述映射中的都视为「额外」
const knownInCore = new Set([
  ...colorChecks.map(([, n]) => n),
  ...Object.values(alphaNames),
  ...Object.values(dimensionNames),
  ...Object.values(typeNames),
  // map 容器：条目已按 entity/分类逐项校验（REGIME["song"]、EVENT_CATEGORY["era"]）
  'REGIME',
  'EVENT_CATEGORY',
]);
const coreObjects = ['Colors', 'Alpha', 'Dimensions', 'Typography'];
for (const obj of coreObjects) {
  const body = extractObjectBody(source, obj);
  if (body == null) {
    failures.push(`object ${obj} 未找到`);
    continue;
  }
  // 提取 val / const val 名称（排除 data class 与内部 mapOf 键名干扰：仅顶层行）
  const nameRe = /^\s*(?:const\s+)?val\s+([A-Z][A-Z0-9_]*)/gm;
  let m;
  while ((m = nameRe.exec(body)) !== null) {
    if (!knownInCore.has(m[1])) {
      missing.push(`object ${obj} 的 ${m[1]} 在设计 token 中无对应项（若为有意派生值，请加入白名单）`);
    }
  }
}

console.log('=== check-visual-tokens ===');
for (const f of failures) console.log(`  [不一致] ${f}`);
for (const m of missing) console.log(`  [额外]   ${m}`);

// —— 魔法数扫描（P0-3 升级）：渲染代码中不应散落视觉硬编码 ——
// 扫描 MapVisualTokens.kt 之外的关键 UI/渲染文件，找 Color(0x…)、Color.argb(…)、
// 以及明显的视觉 alpha/尺寸字面量。白名单放行合法用途（scrim、copy(alpha=) 派生、
// GL 浮点、布局结构值），其余按「魔法数」报告（软告警，不阻断构建）。
const scannedFiles = [
  'MapScreen.kt', 'TimelineBar.kt', 'EventBubblesLayer.kt', 'EventLogSheet.kt',
  'SettingsSheet.kt', 'AppBottomSheet.kt', 'UiPrimitives.kt', 'WatercolorTexture.kt',
  'TerrainTexture.kt', 'LabelPlacement.kt', 'MapRenderer.kt',
];
const magicColorRe = /Color\(0x[0-9A-Fa-f]{8}\)/g;
const magicArgbRe = /Color\.argb\(/g;
// 白名单（子串匹配，命中即视为合法）：动态 alpha 派生 / 结构色 / GL 常量
const magicAllow = [
  'MapTokens.', 'MapFonts.', 'CATEGORY_COLORS', 'categoryColor(', 'PAPER_CARD', 'PAPER_PANEL',
  'PAPER_MAP', 'VERMILION', 'INK', 'GOLD', 'REGIME', 'EVENT_CATEGORY',
  'copy(alpha =', 'Color(0xFF000000)', 'Color(0x59000000)', // scrim 等固定遮罩
  '0x143A3428', '0x0A3A3428', '0x0B3A3428', '0x24B03A2E', '0x13B03A2E', '0x0F3A3428', '0x1A3A3428',
  'Color(0xCCFDF8EC)', '0xE63A3428', '0xB83A3428', '0x8C3A3428', '0xB33A3428', '0xD9FDF8EC',
];
const magicHits = [];
for (const f of scannedFiles) {
  const fp = path.join(kotlinDir(), f);
  if (!fs.existsSync(fp)) continue;
  const src = fs.readFileSync(fp, 'utf8');
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    if (!magicColorRe.test(line) && !magicArgbRe.test(line)) return;
    if (magicAllow.some((ok) => line.includes(ok))) return;
    // 噪声 tile 像素（gr/gg/gb 来自 MapTokens.Colors.PAPER_GRAIN，v 来自 Alpha.PAPER_GRAIN）
    if (/, gr, gg, gb\)/.test(line)) return;
    // 多行 Color.argb( 调用：向下看几行，若参数来自 MapTokens（token 驱动）则放行
    const block = lines.slice(i, i + 4).join(' ');
    if (/MapTokens\.|m\.WARM_WASH_ALPHA|m\.(WATERCOLOR|MOUNTAIN|RIVER)_|mountainRGB|washRGB|bodyRGB|tint\[/.test(block)) return;
    magicHits.push(`${f}:${i + 1}  ${line.trim().slice(0, 90)}`);
  });
}
for (const h of magicHits) console.log(`  [魔法数] ${h}`);

if (failures.length === 0 && missing.length === 0) {
  console.log(`PASS ${checks.length} 项 token 与 design-tokens.json 一致`);
  if (magicHits.length > 0) {
    console.log(`（软告警）${magicHits.length} 处疑似视觉魔法数，建议迁移到 MapTokens`);
  }
} else {
  console.log(`FAIL：${failures.length} 不一致，${missing.length} 额外`);
  process.exit(1);
}
