/**
 * 从 aourednik/historical-basemaps 抓取并精简宋朝及周边政权疆域数据。
 *
 * 数据源：https://github.com/aourednik/historical-basemaps (GPL-3.0)
 *   - world_1100.geojson  北宋极盛期（960-1126 用）
 *   - world_1200.geojson  南宋期（1127-1270 用）
 *   - world_1279.geojson  元朝期（1271-1279 用，此时南宋已亡）
 *   - world_1300.geojson  元朝中期（1280-1368 用）
 *
 * 输出：server/data/geo/historical/regimes-{1100|1200|1279|1300}.json
 *   每个文件是 FeatureCollection，features 为筛选后的政权，
 *   properties 注入 entity(中文名) / color / fillOpacity / regime(英文原名)。
 *
 * 用法：node server/scripts/fetch_historical_basemaps.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HISTORICAL_DIR = path.join(__dirname, '..', 'data', 'geo', 'historical');
const SOURCE_DIR = path.join(HISTORICAL_DIR, 'source');
const BASE_URL =
  'https://raw.githubusercontent.com/aourednik/historical-basemaps/master/geojson';

// ── 政权配色表（大地色系，与现有主题一致）──────────────────────────
// key = historical-basemaps 里的 NAME 字段；中文 entity / 颜色 / 不透明度
// 注意 1200 年数据源把金朝领土错标为 "Liao"，用 regimes 表把它的中文名改成"金"。
const ENTITY_STYLE = {
  'Song Empire':       { entity: '宋',   color: '#b03a2e', fillOpacity: 0.38 },
  'Liao':              { entity: '辽',   color: '#4a6a8a', fillOpacity: 0.35 },
  'Jin':               { entity: '金',   color: '#a8873a', fillOpacity: 0.35 },
  'Xixia':             { entity: '西夏', color: '#b08d4f', fillOpacity: 0.35 },
  'Tibet':             { entity: '吐蕃', color: '#8a6a4a', fillOpacity: 0.30 },
  'Nan Chao':          { entity: '大理', color: '#6a8a5f', fillOpacity: 0.35 },
  'Dali':              { entity: '大理', color: '#6a8a5f', fillOpacity: 0.35 },
  'Đại Việt':          { entity: '大越', color: '#8a9a5a', fillOpacity: 0.35 },
  'Khmer Empire':      { entity: '高棉', color: '#8a6a5a', fillOpacity: 0.30 },
  'Champa':            { entity: '占婆', color: '#a84a5a', fillOpacity: 0.30 },
  'Champa City States':{ entity: '占婆', color: '#a84a5a', fillOpacity: 0.30 },
  'Korea':             { entity: '高丽', color: '#5a7a9a', fillOpacity: 0.35 },
  'Goryeo':            { entity: '高丽', color: '#5a7a9a', fillOpacity: 0.35 },
  'Mongols':           { entity: '蒙古', color: '#6a4a3a', fillOpacity: 0.32 },
  'Mongol Empire':     { entity: '蒙古', color: '#6a4a3a', fillOpacity: 0.32 },
  'Great Khanate':     { entity: '元',   color: '#6a4a3a', fillOpacity: 0.38 },
  'Pagan':             { entity: '蒲甘', color: '#6a8a5f', fillOpacity: 0.30 },
  'Bagan':             { entity: '蒲甘', color: '#6a8a5f', fillOpacity: 0.30 },
  'Hainan':            { entity: '海南', color: '#a04a3a', fillOpacity: 0.30 },
  'Kara Khitai Khaganate': { entity: '西辽', color: '#7a6a8a', fillOpacity: 0.30 },
};

// ── 每个时期要纳入的政权 NAME 列表 ────────────────────────────────
// 1100 北宋：宋/辽/西夏/吐蕃/大理/大越/高棉/占婆/高丽 + 海南（宋领土）
// 1200 南宋：宋/金(数据源标 Liao)/西夏/吐蕃/大理/蒙古/大越/高棉/占婆/蒲甘/高丽/西辽
// 1279 元代：元(覆盖原宋金夏) / 吐蕃 / 大越 / 高棉 / 占婆 / 蒲甘 + 海南
//   注：1279 南宋已亡（1276 临安陷落），整段属元朝。
// 1300 元中后期：与 1279 相同的政权集合（1300 数据源无高丽/蒙古等政权）。
const PERIOD_REGIMES = {
  1100: [
    'Song Empire', 'Liao', 'Xixia', 'Tibet', 'Nan Chao',
    'Đại Việt', 'Khmer Empire', 'Champa', 'Korea', 'Hainan',
  ],
  1200: [
    'Song Empire', 'Liao', /* 实为金 */ 'Xixia', 'Tibet', 'Nan Chao',
    'Mongol Empire', 'Đại Việt', 'Khmer Empire', 'Champa City States',
    'Goryeo', 'Bagan', 'Kara Khitai Khaganate',
  ],
  1279: [
    'Great Khanate', 'Tibet', 'Đại Việt', 'Khmer Empire', 'Champa',
    'Pagan', 'Hainan',
  ],
  1300: [
    'Great Khanate', 'Tibet', 'Đại Việt', 'Khmer Empire', 'Champa',
    'Pagan', 'Hainan',
  ],
};

// 1200 年数据源标签修正：NAME="Liao" 的实际是金朝领土（1115-1234 金统治该区域）
const NAME_OVERRIDE = {
  1200: { 'Liao': 'Jin' },
};

// ── 下载工具 ──────────────────────────────────────────────────────
async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败 ${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
}

// ── 主流程 ────────────────────────────────────────────────────────
async function main() {
  fs.mkdirSync(SOURCE_DIR, { recursive: true });

  for (const yr of [1100, 1200, 1279, 1300]) {
    const srcPath = path.join(SOURCE_DIR, `world_${yr}.geojson`);
    if (!fs.existsSync(srcPath)) {
      process.stdout.write(`下载 world_${yr}.geojson ... `);
      const size = await download(`${BASE_URL}/world_${yr}.geojson`, srcPath);
      console.log(`${(size / 1024).toFixed(0)} KB`);
    } else {
      console.log(`已存在 world_${yr}.geojson，跳过下载`);
    }
  }

  // 汇总所有时期缺失的政权，最后统一报告（M2：上游改名时不被静默吞掉）
  const missingRegimes = [];

  for (const [yr, regimeNames] of Object.entries(PERIOD_REGIMES)) {
    const year = Number(yr);
    const srcPath = path.join(SOURCE_DIR, `world_${year}.geojson`);
    // 源文件损坏时给出可操作的提示，而不是原始解析报错（M4）
    let src;
    try {
      src = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
    } catch {
      console.error(
        `[错误] ${path.basename(srcPath)} 解析失败（可能下载中断导致损坏）。\n` +
        `      请删除该文件后重跑本脚本，会重新下载。`,
      );
      process.exit(1);
    }
    const overrides = NAME_OVERRIDE[year] || {};

    const features = [];
    for (const name of regimeNames) {
      const matches = src.features.filter((f) => f.properties.NAME === name);
      if (matches.length === 0) {
        console.warn(`  [警告] ${year} 年未找到政权: ${name}`);
        missingRegimes.push(`${year}: ${name}`);
        continue;
      }
      // 数据源标签修正后的"规范名"，用于查 ENTITY_STYLE
      const canonicalName = overrides[name] || name;
      const style = ENTITY_STYLE[canonicalName] || ENTITY_STYLE[name];
      if (!style) {
        console.warn(`  [警告] ${year} 年 ${name} 无配色配置，跳过`);
        continue;
      }
      matches.forEach((f) => {
        features.push({
          type: 'Feature',
          geometry: f.geometry,
          properties: {
            // 渲染契约字段（overlay.js / TerritoryOverlay.js / Legend.js 消费）
            entity: style.entity,
            color: style.color,
            fillOpacity: style.fillOpacity,
            // 元信息（调试/未来扩展用）
            regime: canonicalName,
            sourceName: name,
            year,
          },
        });
      });
    }

    const out = {
      type: 'FeatureCollection',
      features,
      properties: { year, source: 'historical-basemaps (GPL-3.0)' },
    };
    const outPath = path.join(HISTORICAL_DIR, `regimes-${year}.json`);
    fs.writeFileSync(outPath, JSON.stringify(out));
    console.log(
      `${year}: ${features.length} 个政权 → ${path.basename(outPath)} (${(
        fs.statSync(outPath).size / 1024
      ).toFixed(0)} KB)`,
    );
  }

  if (missingRegimes.length > 0) {
    console.error(
      `\n[警告] ${missingRegimes.length} 个政权在数据源中缺失（上游可能已改名/删除）：\n` +
        missingRegimes.map((m) => `  - ${m}`).join('\n') +
        '\n生成的文件不含这些政权。若非预期，请检查 PERIOD_REGIMES 配置与数据源最新政权名。',
    );
    process.exitCode = 1;
  } else {
    console.log('\n完成。下一步：确认 periods.json 指向 regimes-*.json');
  }
}

main().catch((err) => {
  console.error('失败:', err);
  process.exit(1);
});
