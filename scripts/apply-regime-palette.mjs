#!/usr/bin/env node
/**
 * 政权配色统一刷新（阶段② 色彩调参，2026-08-22）。
 *
 * 三个色源一次对齐（幂等可重跑）：
 *   1. server/data/geo/historical/periods.json  entities[].color（图例/回退链）
 *   2. server/data/geo/historical/*.json        政权 feature.properties.color（优先级最高，
 *      penpot-render / Web 程序化回退 / Android WatercolorTexture 都先读它）
 *   3. artifacts/penpot/styles.json             bake 三层样式（fill = 新色 + 明度/透明度分档）
 *
 * 设计原则（docs/technical/texture-bake-plan.md §更新日志 2026-08-22）：
 *   - 主政权给独立色相族（宋朱红/辽石青/金赭金/西夏橄榄/吐蕃紫褐/大理青绿/蒙古元赭褐），
 *     同屏相邻政权拉开「色相 + 饱和度 + 明度」至少两个维度；
 *   - 饱和度整体提到 40–60%（旧 Palette 平均 19–39%，是画面「发闷」主因之一）；
 *   - 次要政权（高棉/占婆/蒲甘等边缘小邦）保持灰调并降 body 透明度，不与主角争夺注意力；
 *   - 修复旧表重复色：大理=蒲甘=回鹘、辽=渤海、高丽=新罗、西辽=日本、蒙古=元(有意保留)。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const histDir = path.join(root, 'server/data/geo/historical');

/** 主政权（主角叙事）：body 0.80 / bloom 0.32 */
const MAJOR = new Set(['宋', '辽', '金', '西夏', '吐蕃', '大理', '蒙古', '元', '唐']);
/** 中坚政权：body 0.65 */
const MID = new Set(['高丽', '西辽', '回鹘', '渤海', '南诏', '新罗']);

/** 新色相族表（entity → hex）。旧值留档见本文件 git 历史。 */
const PALETTE = {
  '宋': '#b03a2e',   // 朱红（设计色，保持）
  '唐': '#a8322a',   // 朱红（唐朝本体）
  '辽': '#33688f',   // 石青（旧 #4a6a8a 饱和不足）
  '渤海': '#5d83a6', // 浅石青（旧与辽同色）
  '金': '#a87a2c',   // 赭金
  '西夏': '#6f7a3d', // 橄榄墨绿（旧 #b08d4f 与金同色相）
  '吐蕃': '#7d5266', // 紫褐
  '大理': '#4e7d64', // 青绿（加深旧 #6a8a5f）
  '蒙古': '#8a6a44', // 赭褐（旧 #6a4a3a 过暗，1279 大片死闷）
  '元': '#8a6a44',   // 与蒙古同色（政权连续性，同屏不冲突）
  '高丽': '#5f87ab', // 淡靛
  '新罗': '#86a0b8', // 浅蓝（旧与高丽同色）
  '日本': '#7a8a9a', // 青灰（旧与西辽同色）
  '西辽': '#7a6a8a', // 灰紫
  '回鹘': '#9a8a6a', // 驼灰（旧与大理同色）
  '南诏': '#8a5a7a', // 梅紫
  '大越': '#708a8a', // 青灰绿
  '高棉': '#8a6a5a', // 褐（保持）
  '占婆': '#a84a5a', // 玫红（保持）
  '蒲甘': '#7a8a55', // 茶绿（旧与大理同色）
  '真腊': '#9a8a4e', // 黄褐（旧与大越同色）
  '海南': '#8f7a5e', // 灰褐（旧近宋红，喧宾夺主）
};

const regimeFiles = [
  'regimes-800.json', 'regimes-1100.json', 'regimes-1200.json',
  'regimes-1279.json', 'regimes-1300.json',
  'jin-1120.json', 'jin-1142.json', 'jin-1200.json',
];

// 1. periods.json
const periodsPath = path.join(histDir, 'periods.json');
const periods = JSON.parse(fs.readFileSync(periodsPath, 'utf8'));
let periodsChanged = 0;
(periods.entities || []).forEach((e) => {
  if (PALETTE[e.name] && e.color !== PALETTE[e.name]) {
    e.color = PALETTE[e.name];
    periodsChanged += 1;
  }
});
fs.writeFileSync(periodsPath, JSON.stringify(periods, null, 2) + '\n', 'utf8');
console.log(`periods.json: ${periodsChanged} 处更新`);

// 2. 政权 geojson feature color（优先级最高的色源）。
// jin-*.json 为 2 空格缩进且顶层 properties 带 color（按 properties.name 匹配）；
// regimes-*.json 为压缩单行——按文件原格式写回，避免整文件 diff。
for (const file of regimeFiles) {
  const full = path.join(histDir, file);
  if (!fs.existsSync(full)) { console.warn(`  ! 缺文件 ${file}`); continue; }
  const raw = fs.readFileSync(full, 'utf8');
  // 缩进探测兼容 CRLF 工作区（Windows checkout 后行尾为 \r\n）
  const pretty = raw.startsWith('{\n') || raw.startsWith('{\r\n');
  const geo = JSON.parse(raw);
  let n = 0;
  const applyColor = (props) => {
    if (!props) return;
    const key = props.entity || props.name;
    if (key && PALETTE[key] && props.color !== PALETTE[key]) {
      props.color = PALETTE[key];
      n += 1;
    }
  };
  applyColor(geo.properties);
  (geo.features || []).forEach((f) => applyColor(f.properties));
  if (n) fs.writeFileSync(full, JSON.stringify(geo, null, pretty ? 2 : 0) + '\n', 'utf8');
  console.log(`  ${file}: ${n} 处更新（顶层+features）`);
}

// 3. styles.json（全政权三层；宋模板参数推广到分档 body/bloom）
const styles = [];
for (const [entity, hex] of Object.entries(PALETTE)) {
  const body = MAJOR.has(entity) ? 0.8 : MID.has(entity) ? 0.65 : 0.55;
  const bloom = MAJOR.has(entity) ? 0.32 : MID.has(entity) ? 0.28 : 0.24;
  styles.push({ entity, layer: 'bloom', fill: hex, fillOpacity: bloom, blur: 22, stroke: null, strokeOpacity: 0, strokeWidth: 0 });
  styles.push({ entity, layer: 'body', fill: hex, fillOpacity: body, blur: 4, stroke: null, strokeOpacity: 0, strokeWidth: 0 });
  styles.push({ entity, layer: 'edge', fill: hex, fillOpacity: 0.25, blur: 0, stroke: null, strokeOpacity: 0, strokeWidth: 0 });
}
const stylesPath = path.join(root, 'artifacts/penpot/styles.json');
fs.writeFileSync(stylesPath, JSON.stringify(styles, null, 2) + '\n', 'utf8');
console.log(`styles.json: ${styles.length} 条（${Object.keys(PALETTE).length} 政权 × 3 层）`);
console.log('完成：三个色源已对齐新色相族表');
