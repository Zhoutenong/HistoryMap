#!/usr/bin/env node
/* eslint-disable no-irregular-whitespace -- 古籍原文含全角空格，正则需原样匹配 */
/**
 * P1 古籍解析管线（二）：《舆地广记》
 *
 * 从维基文库拉取《輿地廣記 (四庫全書本)》38 卷（MediaWiki API，UTF-8），
 * 抽取宋代府州军监条目（卷 5-38）：州名、卷次、县数、沿革摘要；
 * 并与《元丰九域志》解析结果（jiuyuzhi-1080.json）做州名交叉比对，
 * 输出 server/data/geo/song/yudi-guangji.json + 交叉比对报告。
 *
 * 使用：
 *   node scripts/fetch-yudi-guangji.mjs
 *
 * 说明：舆地广记成书于政和年间（1111-1117），州表与元丰九域志（1080）
 * 高度重合，但包含元丰后的沿革变化（如政和升府）；两源交叉可暴露
 * 各底本的缺文/讹字。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Converter } from 'opencc-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CACHE_DIR = path.join(ROOT, 'server', 'data', 'geo', 'historical', '_generated', 'cache');
const OUT_FILE = path.join(ROOT, 'server', 'data', 'geo', 'song', 'yudi-guangji.json');
const JIYUZHI_FILE = path.join(ROOT, 'server', 'data', 'geo', 'song', 'jiuyuzhi-1080.json');

const API = 'https://zh.wikisource.org/w/api.php';
const PAGE_BASE = '輿地廣記 (四庫全書本)/卷';
// 卷1-4 为历代疆域（上古-五代），卷5-38 为宋代府州军监（四京起）——只解析宋代部分
const JUAN_NUMS = ['05', '06', '07', '08', '09', '10',
  '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
  '21', '22', '23', '24', '25', '26', '27', '28', '29', '30',
  '31', '32', '33', '34', '35', '36', '37', '38'];

const toCn = Converter({ from: 'tw', to: 'cn' });
// opencc tw→cn 表外的异体字（四库本用字）
const VARIANT_MAP = { '䕫': '夔', '覊': '羁', '羈': '羁', '𦂳': '紧', '劒': '剑', '徳': '德', '寜': '宁', '髙': '高', '㢘': '廉', '卭': '邛' };
function toSimplified(text) {
  let s = text;
  for (const [k, v] of Object.entries(VARIANT_MAP)) s = s.split(k).join(v);
  return toCn(s);
}

/**
 * 政和改制州名 → 元丰名（舆地广记政和年间成书，部分州已升府/改名）。
 * 交叉比对与数据对齐时用元丰名作主键。仅收录已确认的映射。
 */
const SONG_NAME_ALIAS = {
  '袭庆府': '兖州',       // 政和三年升兖州为袭庆府
  '延安府': '延州',       // 政和六年升延州为延安府
  '北辅开德府': '开德府', // 政和五年升澶州为开德府（时称北辅）
  '东辅拱州': '拱州',     // 崇宁四年置拱州于襄邑（东辅）
  '郓州': '东平府',       // 舆地广记条目用旧名郓州（太平兴国三年已升东平府）
  '颍州': '顺昌府',       // 颍州升顺昌府（元丰次府）
  '许州': '颍昌府',       // 许州升颍昌府（元丰次府）
  '陈州': '淮宁府',       // 陈州升淮宁府（元丰次府）
  '润州': '镇江府',       // 润州升镇江府（元丰次府）
  '潞州': '龙德府',       // 潞州升隆德府（元丰次府，舆地广记用旧名潞州）
  '叙州': '戎州',         // 政和四年改戎州为叙州
};

// 沿革片段误提取的州名残渣（行首恰好匹配「X州」模式）
const JUNK_NAMES = new Set(['同下州', '下府', '军州', '山府', '年州', '州顺安军']);
const JUNK_PREFIX = /^(属|本|故|梁有|常乐郡本|鳯林|巴县本)/;

// 州府条目名清洗：剥 grade 前缀（与九域志同表）
const GRADE_PREFIX = /^(?:同下州|次府|大都督府|都督府|都督|中府(?!州)|下府(?!州)|東京|西京|南京|北京|次|上|中下|中|下|雄|望|緊|輔)*/u;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(juan) {
  const url = `${API}?action=parse&format=json&prop=wikitext&page=${encodeURIComponent(PAGE_BASE + juan)}`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    await sleep(900); // 维基文库 API 限流：每次请求间隔
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'HistoryMap-data-pipeline/0.1 (contact: local research)' } });
      if (res.status === 429 || res.status === 503) {
        await sleep(attempt * 4000);
        continue;
      }
      const text = await res.text();
      let d;
      try { d = JSON.parse(text); } catch { throw new Error(`非 JSON 响应（可能限流）: ${text.slice(0, 80)}`); }
      if (!d.parse) throw new Error(`页面不存在: ${PAGE_BASE + juan}`);
      return d.parse.wikitext['*'];
    } catch (err) {
      if (attempt === 4) throw err;
      await sleep(attempt * 3000);
    }
  }
  throw new Error(`卷${juan} 抓取失败`);
}

/** 去掉 {{...}} 模板（保留其文本参数，如 {{YL|武德四年}} → 武德四年），供沿革摘要使用 */
function stripTemplates(text) {
  return text
    .replace(/\{\{(?:SKchar|SK notes)\|[^}]*\}\}/g, '')
    .replace(/\{\{(?:SK anchor|YL|SKQS header)\|([^}|]*)(?:\|[^}]*)?\}\}/g, '$1')
    .replace(/\{\{[^}]*\}\}/g, '');
}

/** 从 wikitext 行提取州府条目（两种格式：带 {{SK anchor|名}} 的缩进行 / 等第+州名直接行） */
function parseJuans(cacheDir) {
  const prefectures = [];
  const warnings = [];
  // 州府条目（无 anchor 格式）：等第前缀 + 州名 + 沿革文，如「　　望青州少昊之世…」
  const PREF_RE = new RegExp(
    `^　{2,}(?:(?:同下州|次府|大都督府|都督府|都督|東平大都督府|中府(?!州)|下府(?!州)|東京|西京|南京|北京|次|上|中下|中|下|雄|望|緊|輔)*)` +
    `([\\p{Script=Han}]{1,4}?[府州軍監縣])(?!路)`, 'u');
  // 等第 + {{SK anchor|名}} 格式，如「　　上{{SK anchor|丹州}}春秋時…」
  const ANCHOR_PREF_RE = new RegExp(
    `^　{2,}((?:同下州|次府|大都督府|都督府|都督|東平大都督府|中府(?!州)|下府(?!州)|東京|西京|南京|北京|次|上|中下|中|下|雄|望|緊|輔)*)\\{\\{SK anchor\\|([^}|]+)\\}\\}([\\s\\S]*)$`, 'u');

  for (const juan of JUAN_NUMS) {
    const fp = path.join(cacheDir, `yudi-v${juan}.txt`);
    if (!fs.existsSync(fp)) { warnings.push(`[卷缺失] 卷${juan}: 缓存不存在`); continue; }
    const text = fs.readFileSync(fp, 'utf8');
    let currentRoute = null;
    // 每行一个条目（<poem> 内）
    const lines = text.split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trimEnd();
      // —— 带 {{SK anchor|名}} 的缩进行 ——
      const anchorMatch = line.match(/^　*\{\{SK anchor\|([^}|]+)\}\}([\s\S]*)$/);
      if (anchorMatch) {
        const anchor = anchorMatch[1].trim();
        if (/路$/.test(anchor)) { currentRoute = anchor; continue; } // 路头
        if (/縣$/.test(anchor)) continue; // 县条目，跳过
        if (!/[府州軍監]$/.test(anchor)) continue; // 卷名行等
        const gradeMatch = anchor.match(GRADE_PREFIX);
        const grade = (gradeMatch && gradeMatch[0]) || '';
        const nameRaw = anchor.slice(grade.length);
        prefectures.push(buildEntry(nameRaw, anchor, grade, currentRoute, juan, anchorMatch[2] || ''));
        continue;
      }
      // —— 无 anchor 格式：等第 + 州名 + 沿革（如「　　望青州少昊之世…」）
      //    及 等第 + {{SK anchor|名}} + 沿革（如「　　上{{SK anchor|丹州}}春秋…」）——
      if (/^　{2,}右[古]?[一-龥]/.test(line)) continue; // 卷1-3 历代疆域「右X州/右古X州」统计行
      const m = line.match(PREF_RE);
      if (m) {
        // 县条目（无 anchor）：「巴縣本江州…」→ 名以「縣」结尾，跳过
        if (/縣$/.test(m[1])) continue;
        // 名过短 / grade 残件 / 沿革片段误提取
        if (m[1].length < 2 || JUNK_NAMES.has(m[1]) || JUNK_PREFIX.test(m[1])) continue;
        const gradeMatch = line.slice(0, m.index + m[0].length).match(GRADE_PREFIX);
        const grade = (gradeMatch && gradeMatch[0]) || '';
        const nameRaw = m[1];
        prefectures.push(buildEntry(nameRaw, nameRaw, grade, currentRoute, juan, line.slice(m.index + m[0].length)));
        continue;
      }
      // —— 等第 + {{SK anchor|名}} 格式 ——
      const anchorPref = line.match(ANCHOR_PREF_RE);
      if (anchorPref) {
        if (/縣$/.test(anchorPref[2])) continue;
        const nameRaw = anchorPref[2];
        prefectures.push(buildEntry(nameRaw, nameRaw, anchorPref[1] || null, currentRoute, juan, anchorPref[3] || ''));
      }
    }
  }
  return { prefectures, warnings };
}

function buildEntry(nameRaw, nameRawFull, grade, route, juan, restText) {
  const name = toSimplified(nameRaw);
  const body = stripTemplates(restText || '');
  const countyMatch = body.match(/今縣([一二三四五六七八九十百]+)/);
  return {
    name, nameRaw: nameRawFull, grade: grade || null,
    route: route ? toSimplified(route) : null,
    juan: Number(juan),
    countyCount: countyMatch ? toCnNum(countyMatch[1]) : null,
    // 沿革摘要：取「今治…」前的内容（历代沿革主体），截前 120 字
    evolution: body.slice(0, 120),
  };
}

function toCnNum(s) {
  const DIGITS = { '〇': 0, '零': 0, '一': 1, '二': 2, '兩': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
  let total = 0, section = 0, digit = 0;
  for (const ch of s) {
    if (DIGITS[ch] !== undefined) digit = DIGITS[ch];
    else if (ch === '十') { section += (digit || 1) * 10; digit = 0; }
    else if (ch === '百') { section += (digit || 1) * 100; digit = 0; }
    else if (ch === '千') { section += (digit || 1) * 1000; digit = 0; }
    else if (ch === '萬' || ch === '万') { total += (section + digit) * 10000; section = 0; digit = 0; }
  }
  return total + section + digit;
}

/** 与九域志交叉比对（政和改名经 SONG_NAME_ALIAS 归并到元丰名） */
function crossCheck(yudi, jiuyuzhi) {
  const canon = (n) => SONG_NAME_ALIAS[n] || n;
  const yudiNames = new Set(yudi.prefectures.map((p) => canon(p.name)));
  const jyzNames = new Set(jiuyuzhi.prefectures.filter((p) => !p.missingName).map((p) => p.name));
  const jyzMissingNames = jiuyuzhi.prefectures.filter((p) => p.missingName).map((p) => p.name);
  const yudiOnly = [...yudiNames].filter((n) => !jyzNames.has(n)).sort();
  const jiuyuzhiOnly = [...jyzNames].filter((n) => !yudiNames.has(n)).sort();
  return {
    yudiCount: yudiNames.size,
    jiuyuzhiCount: jyzNames.size,
    matched: [...yudiNames].filter((n) => jyzNames.has(n)).length,
    aliasApplied: Object.keys(SONG_NAME_ALIAS),
    yudiOnly,           // 舆地广记有而九域志无（燕云/西夏/吐蕃州、政和新增、化外州）
    jiuyuzhiOnly,       // 九域志有而舆地广记无（异写/底本差异，供核对）
    jiuyuzhiMissing: jyzMissingNames, // 九域志占位州（沂州/邢州等）
  };
}

async function main() {
  // 先预热缓存（异步抓取），再同步解析
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  for (const juan of JUAN_NUMS) {
    const fp = path.join(CACHE_DIR, `yudi-v${juan}.txt`);
    if (!fs.existsSync(fp) || fs.statSync(fp).size <= 500) {
      try {
        const text = await fetchPage(juan);
        fs.writeFileSync(fp, text, 'utf8');
        console.log(`[下载] 卷${juan}`);
      } catch (err) {
        console.warn(`[卷缺失] 卷${juan}: ${err.message}`);
      }
    }
  }

  const { prefectures, warnings } = parseJuans(CACHE_DIR);
  console.log('===== 舆地广记解析 =====');
  console.log('州府条目数:', prefectures.length);

  let jiuyuzhi = null;
  if (fs.existsSync(JIYUZHI_FILE)) jiuyuzhi = JSON.parse(fs.readFileSync(JIYUZHI_FILE, 'utf8'));

  const out = {
    meta: {
      source: '舆地广记（维基文库·四库全书本，欧阳忞撰，政和年间成书）',
      year: 1111,
      note: '卷1-4 历代疆域沿革，卷5-38 宋代府州军监沿革；与元丰九域志同底本体系，可交叉校验',
    },
    prefectures,
    warnings,
  };
  if (jiuyuzhi) {
    const report = crossCheck(out, jiuyuzhi);
    out.crossCheck = report;
    console.log('\n===== 交叉比对（舆地广记 vs 元丰九域志）=====');
    console.log(`舆地广记州府: ${report.yudiCount} | 九域志州府: ${report.jiuyuzhiCount} | 重合: ${report.matched}`);
    console.log('\n[仅舆地广记有]（政和新增/底本異寫，供核对）:', report.yudiOnly.join('、'));
    console.log('\n[仅九域志有]（舆地广记缺文/異寫，供核对）:', report.jiuyuzhiOnly.join('、'));
    console.log('\n[九域志占位州]（四库本缺头行，待人工定名）:', report.jiuyuzhiMissing.join('、'));
  }
  if (warnings.length) {
    console.log('\n===== 警告 =====');
    warnings.forEach((w) => console.log('  ' + w));
  }
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), 'utf8');
  console.log(`\n输出: ${OUT_FILE}`);
}

main().catch((err) => {
  console.error('[fetch-yudi-guangji] 失败:', err);
  process.exit(1);
});
