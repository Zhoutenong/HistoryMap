#!/usr/bin/env node
/**
 * T1c 宋史·地理志抓取与解析（ctext.org 完整版，卷85-90 六章）
 *
 * 输入：ctext 6 个 chapter 页面（免费公开，无需登录）
 *   卷85 chapter=193757（京城+京畿+京东+京西）
 *   卷86 chapter=599528（河北+河东）
 *   卷87 chapter=945824（陕西诸路）
 *   卷88 chapter=282012（两浙+淮南+江南+荆湖——南宋核心区）
 *   卷89 chapter=154984（福建+成都府+潼川府+利州+夔州）
 *   卷90 chapter=559080（广南+燕山府路）
 *
 * 输出：server/data/geo/song/songshi-dili.json
 *   prefectures: [{ name, grade, route(路), juan, evolution(沿革全文) }]
 *
 * 条目格式（已确认规整）：「州府名，等级，郡名，军额。沿革（年号+N年+动作词）」，
 * 如「平江府，望，吳郡。太平興國三年，改平江軍節度。本蘇州，政和三年，升為府。」
 * ctext 页面为中文正文 + 英文翻译混排，脚本按「句末标点 + ASCII 占比」过滤英文段。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Converter } from 'opencc-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CACHE_DIR = path.join(ROOT, 'server', 'data', 'geo', 'historical', '_generated', 'cache');
const OUT_FILE = path.join(ROOT, 'server', 'data', 'geo', 'song', 'songshi-dili.json');

const CHAPTERS = [
  { juan: 85, chapter: '193757', routes: ['京畿路', '京東東路', '京東西路', '京西南路', '京西北路'] },
  { juan: 86, chapter: '599528', routes: ['河北東路', '河北西路', '河東路'] },
  { juan: 87, chapter: '945824', routes: ['永興軍路', '秦鳳路'] },
  { juan: 88, chapter: '282012', routes: ['兩浙西路', '兩浙東路', '淮南東路', '淮南西路', '江南東路', '江南西路', '荊湖北路', '荊湖南路'] },
  { juan: 89, chapter: '154984', routes: ['福建路', '成都府路', '潼川府路', '利州路', '夔州路'] },
  { juan: 90, chapter: '559080', routes: ['廣南東路', '廣南西路', '燕山府路'] },
];

const toCn = Converter({ from: 'tw', to: 'cn' });
const VARIANT_MAP = { '䕫': '夔', '劒': '剑', '徳': '德', '寜': '宁', '髙': '高' };
function toSimplified(text) {
  let s = text;
  for (const [k, v] of Object.entries(VARIANT_MAP)) s = s.split(k).join(v);
  return toCn(s);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 抓取一章 HTML（带缓存） */
async function fetchChapter(juan, chapter) {
  const fp = path.join(CACHE_DIR, `songshi-v${juan}.html`);
  if (fs.existsSync(fp) && fs.statSync(fp).size > 100000) return fs.readFileSync(fp, 'utf8');
  const url = `https://ctext.org/wiki.pl?if=gb&chapter=${chapter}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    await sleep(1500);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (HistoryMap data pipeline)' } });
      const text = await res.text();
      if (text.length > 100000) {
        fs.writeFileSync(fp, text, 'utf8');
        console.log(`[下载] 卷${juan} (${(text.length / 1024).toFixed(0)}KB)`);
        return text;
      }
      console.warn(`[重试] 卷${juan} 内容过短 (${text.length})`);
    } catch (err) {
      console.warn(`[重试] 卷${juan}: ${err.message}`);
    }
    await sleep(attempt * 3000);
  }
  throw new Error(`卷${juan} 抓取失败`);
}

/** 提取 ctext 中文正文（过滤英文翻译段——英文句夹在中文句之间，需先按英文句点切分） */
function extractChineseText(html) {
  const cells = [...html.matchAll(/<td class="ctext">([\s\S]*?)<\/td>/g)].map((m) => m[1]);
  const text = cells
    .map((c) => c.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&'))
    .join('');
  // 先按英文句点+空格切分（ctext 中英对照：英文翻译句以 ". " 结尾后接中文句），
  // 再按中文标点切分；每段按 ASCII 占比过滤英文。
  const parts = text.split(/(?<=[。！？；\n]|\.\s)/);
  const chinese = parts.filter((s) => {
    const ascii = (s.match(/[A-Za-z]/g) || []).length;
    const total = s.replace(/\s/g, '').length;
    if (total < 2) return false;
    return ascii / total < 0.15;
  }).join('');
  return chinese;
}

/**
 * 州府条目解析：条目以「州府名，等级，郡名，军额。」开头，
 * 后续为沿革（含年号+N年+动作词）。条目前缀可带路名（如「京東東路。」）。
 * grade 用白名单（望/紧/上/中/下/次府/都督府等），路名用白名单——沿革叙述
 * 中的「取綏州」「本屬東路」等片段不会误配。
 */
// 路名白名单（北宋 23 路 + 南宋 17 路 + 卷目标题）
const ROUTE_NAMES = [
  '京畿路', '京東東路', '京東西路', '京西南路', '京西北路',
  '河北東路', '河北西路', '河東路', '永興軍路', '秦鳳路',
  '兩浙西路', '兩浙東路', '兩浙路', '淮南東路', '淮南西路',
  '江南東路', '江南西路', '荊湖北路', '荊湖南路', '福建路',
  '成都府路', '潼川府路', '梓州路', '利州路', '夔州路',
  '廣南東路', '廣南西路', '燕山府路', '陝西路', '陝西諸路',
  '京西路', '河北路', '京城', '京東路', '廣南路',
];
const GRADE_WORDS = '望|緊|上|中下|中|下|次府|大都督府|都督府|同下州|軍事|團練|防禦|節度|雄|輔|畿|赤';
// 条目格式：「名，等级，…」（臨安府，大都督府）或「名，本X州，等级，…」（紹興府，本越州，大都督府）
// 名排除「本/舊/初/又/復」等前綴（沿革叙述「本越州」不会被误配为条目名）
const PREF_RE = new RegExp(
  `(?!本|舊|初|又|復|尋|乃|遂|而|則|既|亦|仍|別|別)([\\u3400-\\u9fff]{1,4}?[府州軍監])，(?:本[\\u3400-\\u9fff]{1,4}?[府州軍監]，)?(${GRADE_WORDS})[，。]`,
);
const ROUTE_RE = new RegExp(`^(${ROUTE_NAMES.join('|')})([，。]|$)`);

function parseChapter(chinese, juan, _knownRoutes) {
  // 路名切分预处理：ctext 章节标题路名连写无标点（「京城京畿路京東路京西路」），
  // 按路名白名单（长词优先）前后加句号，使 split('。') 后路名独立成句。
  const routeNamesSorted = [...ROUTE_NAMES].sort((a, b) => b.length - a.length);
  const segmented = chinese.replace(new RegExp(`(${routeNamesSorted.join('|')})`, 'g'), '。$1。');
  // 去空格
  const text = segmented.replace(/\s+/g, '');
  // 按「。」切句，逐句识别州府条目起点
  const sentences = text.split('。').filter((s) => s.length > 0);
  const prefectures = [];
  let currentRoute = null;
  let cur = null;
  const flush = () => { if (cur) { prefectures.push(cur); cur = null; } };

  for (const sentence of sentences) {
    // 子路头（宋史「京東路。東路：……西路：……」分述格式）：与当前路名合并
    // （京東路 + 東路 = 京東東路）
    const subRouteMatch = sentence.match(/^([東西南北]路)[，。]/);
    if (subRouteMatch && currentRoute && /^[\u3400-\u9fff]{2,6}路$/.test(currentRoute)) {
      currentRoute = toSimplified(currentRoute.replace(/路$/, '') + subRouteMatch[1]);
      flush();
      continue;
    }
    // 路头（如「京東東路」独立句 或 「京東東路，……。」）
    const routeMatch = sentence.match(ROUTE_RE);
    if (routeMatch) {
      currentRoute = toSimplified(routeMatch[1]);
      flush();
      continue;
    }
    // 州府条目起点：句首「X府/州/軍/監，等级，…」
    const m = sentence.match(PREF_RE);
    if (m && !/[路縣鎮寨監]$/.test(m[1])) {
      flush();
      const nameRaw = m[1];
      cur = {
        nameRaw,
        name: toSimplified(nameRaw),
        grade: m[2] || null,
        route: currentRoute ? toSimplified(currentRoute) : null,
        juan,
        evolution: sentence, // 本条完整沿革（含句号恢复）
      };
      continue;
    }
    // 沿革续句
    if (cur) cur.evolution += `。${sentence}`;
  }
  flush();
  return prefectures;
}

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const all = [];
  for (const { juan, chapter, routes } of CHAPTERS) {
    const html = await fetchChapter(juan, chapter);
    const chinese = extractChineseText(html);
    const prefectures = parseChapter(chinese, juan, routes);
    console.log(`卷${juan}: ${prefectures.length} 个州府条目`);
    all.push(...prefectures);
  }

  // 按名去重（跨卷重复条目取第一个）
  const seen = new Set();
  const deduped = all.filter((p) => {
    if (seen.has(p.name)) return false;
    seen.add(p.name);
    return true;
  });

  const out = {
    meta: {
      source: '宋史·地理志（卷85-90，ctext.org 完整版）',
      year: 1279,
      note: '以北宋末政和/宣和区划为骨架、南宋沿革为补记；沿革含建炎/绍兴/乾道/淳熙/嘉定年号变更记载',
      counts: { raw: all.length, deduped: deduped.length },
    },
    prefectures: deduped,
  };
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), 'utf8');
  console.log(`\n州府总数: ${deduped.length}`);
  const byRoute = {};
  deduped.forEach((p) => { const r = p.route || '?'; byRoute[r] = (byRoute[r] || 0) + 1; });
  Object.entries(byRoute).sort().forEach(([r, n]) => console.log(`  ${r}: ${n}`));
  // 抽查南宋条目（确认绍兴年号记载）
  const southern = deduped.filter((p) => /绍兴|乾道|淳熙|嘉定/.test(p.evolution));
  console.log(`含南宋年号记载的条目: ${southern.length}`);
  const s = southern.find((p) => p.name === '临安府') || southern[0];
  if (s) console.log(`样例 ${s.name}: ${s.evolution.slice(0, 120)}…`);
  console.log(`输出: ${OUT_FILE}`);
}

main().catch((err) => {
  console.error('[fetch-songshi-dili] 失败:', err);
  process.exit(1);
});
