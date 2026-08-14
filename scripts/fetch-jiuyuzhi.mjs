#!/usr/bin/env node
/* eslint-disable no-irregular-whitespace -- 古籍原文含全角空格，正则需原样匹配 */
/**
 * P1 古籍解析管线（一）：《元丰九域志》
 *
 * 从 kanripo KR2k0005（京都大学汉籍リポジトリ，文渊阁四库本纯文本）下载 11 卷，
 * 解析「路 → 府/州/军/监 → 县」三层结构，提取户口（主/客户）、土贡、属县等第、
 * 治所县、原文摘录。输出 server/data/geo/song/jiuyuzhi-1080.json。
 *
 * 使用：
 *   node scripts/fetch-jiuyuzhi.mjs
 *
 * 幂等：已下载的卷文件带缓存（server/data/geo/historical/_generated/cache/），
 * 重跑不会重复下载。验收闸门：与 ctext 提要核对州府/县总数（4 京府 + 10 次府 +
 * 242 州 + 37 军 + 4 监 + 1135 县），偏差输出 diff 州名清单（不中断，供人工核对）。
 *
 * 已知文本格式（实测确认）：
 * - 行以 ¶ 结尾、<pb:...> 为分页符、每卷头尾有「元豐九域志卷X」页眉页脚
 * - 路头 = 1-3 个全角空格 + 路名（可带 (注释)）；分路头如「東路」「西路」
 * - 州府头 = 2+ 全角空格 + [等级前缀]* + 州名，如「上青州北海郡鎮海軍節度(…)」
 * - 正文顶格：地里…/戸主X客Y/土貢…/縣N…/監N…/古跡…
 * - 卷首（KR2k0005_000.txt）为 GBK 双编码乱码，需 iconv 还原
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { Converter } from 'opencc-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CACHE_DIR = path.join(ROOT, 'server', 'data', 'geo', 'historical', '_generated', 'cache');
const OUT_FILE = path.join(ROOT, 'server', 'data', 'geo', 'song', 'jiuyuzhi-1080.json');
const SOURCE_BASE = 'https://raw.githubusercontent.com/kanripo/KR2k0005/master/';
const FILES = Array.from({ length: 11 }, (_, i) => `KR2k0005_${String(i).padStart(3, '0')}.txt`);

// 验收闸门（ctext 提要著录）
const EXPECTED = { 京府: 4, 次府: 10, 州: 242, 军: 37, 监: 4, 县: 1135 };

// 繁→简（opencc tw→cn）＋四库本异体字手动映射（opencc 表外）
const toCn = Converter({ from: 'tw', to: 'cn' });
const VARIANT_MAP = { '䕫': '夔', '覊': '羁', '羈': '羁', '𦂳': '紧', '劒': '剑', '徳': '德', '寜': '宁', '寕': '宁', '髙': '高', '㢘': '廉', '卭': '邛' };
function toSimplified(text) {
  let s = text;
  for (const [k, v] of Object.entries(VARIANT_MAP)) s = s.split(k).join(v);
  return toCn(s);
}

/** 中文数字 → 整数（支持「一十八萬三千七百七十」式，容忍 (缺/) 等注记） */
function cnToInt(raw) {
  const s = raw.replace(/[（）()缺/ \s]/g, '');
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

// —— 1. 下载（幂等缓存）——
async function ensureDownloaded() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  for (const f of FILES) {
    const fp = path.join(CACHE_DIR, f);
    if (fs.existsSync(fp) && fs.statSync(fp).size > 1000) continue;
    const res = await fetch(SOURCE_BASE + f);
    if (!res.ok) throw new Error(`下载失败 ${f}: HTTP ${res.status}`);
    fs.writeFileSync(fp, Buffer.from(await res.arrayBuffer()));
    console.log(`[下载] ${f}`);
  }
}

// —— 2. 编码还原（000 为 GBK 双编码：UTF-8 的「按GBK误读再按UTF-8保存」）——
function readSource(f) {
  const fp = path.join(CACHE_DIR, f);
  let text = fs.readFileSync(fp, 'utf8');
  if (text.includes('元豐九域志')) return text; // 正常 UTF-8
  const gbkBytes = execFileSync('iconv', ['-f', 'UTF-8', '-t', 'GBK', '-c'], { input: text, encoding: 'buffer' });
  const fixed = execFileSync('iconv', ['-f', 'GBK', '-t', 'UTF-8', '-c'], { input: gbkBytes, encoding: 'utf8' });
  if (!fixed.includes('元豐九域志')) throw new Error(`${f} 编码还原失败，需要人工处理`);
  return fixed;
}

// —— 3. 文本清理为行数组 ——
function cleanLines(text) {
  return text.split(/\r?\n/)
    .map((l) => l.replace(/¶$/, '').replace(/<pb:[^>]+>/g, '').trimEnd())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('<pb:'));
}

// —— 4. 结构识别 ——
// 汉字范围用 Unicode Script=Han（u flag）：䖍(U+4564 扩展A)/𦂳(U+26A03 扩展B) 等
// 生僻字都在范围外 [一-龥]，必须用 \p{Script=Han}
const HAN = '\\p{Script=Han}';
// 等级前缀（长词在前；「雄」等会回溯——JS 引擎在州名组失败时会放弃多余 grade）
// 「中府(?!州)」「下府(?!州)」：庆州/渭州/秦州 为「中府/下府」级，而「府州」（河东路）是州名
const GRADE_RE = /^(?:同下州|次府|大都督府|都督府|都督|中府(?!州)|下府(?!州)|東京|西京|南京|北京|次|上|中下|中|下|雄|望|緊|𦂳|輔)*/u;
const PREF_HEAD_RE = new RegExp(`^　{2,3}(?:(?:同下州|次府|大都督府|都督府|都督|中府(?!州)|下府(?!州)|東京|西京|南京|北京|次|上|中下|中|下|雄|望|緊|𦂳|輔)*)(${HAN}{1,4}?[府州軍監])(?!路)`, 'u');

/**
 * 四库本/kanripo 源文本讹字修正（维基文库同底本一致，属底本原始误刻，非解析错误）。
 * 修正州名并保留原文，note 标注。可追溯：nameRaw 保留原文。
 */
const SOURCE_FIXES = [
  { test: (p) => p.nameRaw === '峽州' && /巴陵/.test(p.headText), name: '岳州', note: '原文误刻为「峽州巴陵郡」（巴陵郡为岳州），据舆地广记/宋史校正为岳州' },
  { test: (p) => p.nameRaw === '方州' && /南浦/.test(p.headText), name: '萬州', note: '原文误刻为「方州南浦郡」（南浦郡为万州），据舆地广记/宋史校正为万州' },
];

/**
 * 溢出合并：県条目実得多于縣N 时，部分州属源文本縣数错（非下一州府头行缺失），
 * 溢出条目併回本州（countyCount 以实际为准）。
 */
const OVERFLOW_MERGE = { '河中府': true, '代州': true };

/**
 * 溢出占位州人工定名：四库本州府头行缺失（如邢州），据县条目归属与
 * 舆地广记交叉比对确认后命名。key = 溢出来源州名。
 */
const ORPHAN_NAMES = { '相州': '邢州' };

// 路名白名单（元丰 23 路 + 四京 + 卷十特殊节）
const TOTAL_ROUTES = ['四京', '京畿', '京東', '京西', '河北', '陜西', '陝西', '河東', '淮南', '江南', '荆湖', '荊湖', '廣南', '兩浙', '永興軍', '秦鳯', '秦鳳', '成都府', '梓州', '利州', '夔州', '䕫州', '福建'];
const FULL_ROUTES = ['京東路', '京西路', '河北路', '陜西路', '陝西路', '河東路', '淮南路', '江南路', '荆湖路', '荊湖路', '廣南路', '兩浙路', '福建路', '永興軍路', '秦鳯路', '秦鳳路', '成都府路', '梓州路', '利州路', '夔州路', '䕫州路', '京畿路'];
const BRANCH_ROUTES = ['東路', '西路', '南路', '北路'];
const SPECIAL_ROUTES = ['省廢州軍', '化外州', '覊縻州', '羈縻州', '羈糜州'];

function stripComment(line) {
  // 路头可能带 (注释)，如「京東路(熈寧七年分東西路…)」
  return line.replace(/　/g, '').replace(/\(.+\)?$/, '');
}

// 县条目：等第前缀 + 县名。方位参照「州/京/軍/府/監 + (界|城)? + 方向」；
// 分支顺序：A 参照+方向 → A2 参照+数字（无方向，如「沁源軍一百五里」）→
// B 数字+鄉|鄉|有|行尾 → C 直接方向+数字（无参照，如「西水西一百二十里」）→
// D 剩余以 寨/堡/鎮/監 结尾（麟州「上新秦神堂靜羌二寨…」）
const COUNTY_RE = new RegExp(
  `^(?:次赤|次畿|赤|畿|望|緊|𦂳|上|中下|中|下)(${HAN}{1,5}?)(?:州|京|軍|府|監)(?:界|城)?[東西南北]+` +
  `|^(?:次赤|次畿|赤|畿|望|緊|𦂳|上|中下|中|下)(${HAN}{1,5}?)(?:州|京|軍|府|監)(?:界|城)?[一二三四五六七八九十百]+` +
  `|^(?:次赤|次畿|赤|畿|望|緊|𦂳|上|中下|中|下)(${HAN}{1,5}?)(?:[一二三四五六七八九十百]+鄉|鄉|有|$)` +
  `|^(?:次赤|次畿|赤|畿|望|緊|𦂳|上|中下|中|下)(${HAN}{1,5}?)[東西南北][一二三四五六七八九十百]+` +
  `|^(?:次赤|次畿|赤|畿|望|緊|𦂳|上|中下|中|下)(${HAN}{1,5}?)(?:[^鄉有]*?(?:寨|堡|鎮|監)$)`, 'u');

const COUNTY_GRADE_RE = /^(?:次赤|次畿|赤|畿|望|緊|𦂳|上|中下|中|下)/u;
function parseCountyLine(line) {
  const m = line.match(COUNTY_RE);
  if (!m) return null;
  const grade = line.match(COUNTY_GRADE_RE);
  // D 分支（寨/堡/鎮/監 结尾，m[5]）：名须 ≥2 字——「望五鎮」是上一条目拆行续文
  // （高望五鎮），名=「五」为 1 字误收；正常 1 字县名（如「鄒」）走方位/鄉 分支
  if (m[5] !== undefined && m[5].length < 2) return null;
  return { grade: grade ? grade[0] : null, name: m[1] || m[2] || m[3] || m[4] || m[5] };
}

// 監条目行：監名 + 方位（如「萊蕪州東北二百五十里」「阜財京北四十里」「鐵錢州城東二里」「茶州城内」）；
// &KR1291; 为 kanripo 缺字符标记，清洗掉
const MONOPOLY_RE = new RegExp(`^(.{1,10}?)(?:州|府|京|軍|監|城)(?:界|城)?[東西南北內内]+`, 'u');
function parseMonopolyLine(line) {
  const m = line.match(MONOPOLY_RE);
  if (!m) return null;
  return { name: m[1].replace(/&KR\d+;/g, '').replace(/[州府]$/, ''), note: line };
}

// —— 5. 解析主流程（跨文件共享路状态）——
function parseAll() {
  /** @type {{ base: string|null, full: string|null, type: string }} */
  let route = { base: null, full: null, type: 'none' }; // 最近总路头（跨卷继承）
  const prefectures = [];
  const orphans = []; // 県条目溢出生成的占位州（源文本州府头行缺失）
  const references = []; // 卷十 省废州军/化外州/羁縻州 的条目（不入正式州表）
  const warnings = [];

  for (let fi = 0; fi < FILES.length; fi++) {
    const f = FILES[fi];
    const juan = (fi === 0) ? '卷首' : `卷${['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][fi - 1]}`;
    const lines = cleanLines(readSource(f));
    let cur = null; // 当前州府条目

    const finish = () => { if (cur) { prefectures.push(cur); cur = null; } };

    for (const line of lines) {
      // 页眉页脚/标题行
      if (/^(欽定四庫全書|元豐九域志卷[首一二三四五六七八九十])/.test(line)) continue;

      const content = line.replace(/^　+/, ''); // 去前导全角空格
      const indent = line.match(/^　+/)?.[0]?.length || 0;

      // —— 四京短标题行（「　　東京」单独一行，下一行才是完整州府头）——
      if (indent >= 2 && /^(東京|西京|南京|北京)$/.test(content)) continue;

      // —— 覊縻州/化外州段统计行（「右五十四州𨽻黎州」「已上北江」）——
      if (indent >= 2 && /^(右[一二三四五六七八九十百]+州|已上)/.test(content)) continue;

      // —— 原缺領郡：州府头缺失的占位（京東東路沂州，四库本缺「領郡」两字，
      //    据舆地广记交叉比对与县条目归属（临沂/承/沂水/费/新秦）定名为沂州）——
      if (indent >= 2 && /^原缺領郡/.test(content)) {
        finish();
        cur = {
          nameRaw: '沂州', name: '沂州', type: '州', grade: null,
          juan,
          routeRaw: route.full ? route.full : null,
          route: route.full ? toSimplified(route.full) : null,
          headText: content, counties: [], monopolies: [], section: null,
          note: '四库本缺「領郡」两字（原缺領郡），据舆地广记与属县定名为沂州',
        };
        continue;
      }

      // —— 州府头 ——
      if (indent >= 2) {
        const m = line.match(PREF_HEAD_RE);
        if (m && !TOTAL_ROUTES.includes(content) && !FULL_ROUTES.includes(content)) {
          finish();
          const gradeMatch = content.match(GRADE_RE);
          const grade = (gradeMatch && gradeMatch[0]) || '';
          cur = {
            nameRaw: m[1], name: toSimplified(m[1]),
            type: m[1].slice(-1), // 府/州/軍/監
            grade: grade || null,
            juan,
            routeRaw: route.full ? route.full : null,
            route: route.full ? toSimplified(route.full) : null,
            headText: content,
            counties: [], monopolies: [],
            section: null,
          };
          continue;
        }
      }

      // —— 路头（1-3 空格，白名单）——
      const routeText = stripComment(line).trim();
      if (routeText && (TOTAL_ROUTES.includes(routeText) || FULL_ROUTES.includes(routeText)
        || BRANCH_ROUTES.includes(routeText) || SPECIAL_ROUTES.includes(routeText))) {
        finish();
        if (SPECIAL_ROUTES.includes(routeText)) {
          route = { base: null, full: routeText, type: 'special' };
        } else if (TOTAL_ROUTES.includes(routeText) || FULL_ROUTES.includes(routeText)) {
          // 总路头（含带「路」尾的，如 京東路 → base 京東，供分路头拼接）
          route = { base: routeText.replace(/路$/, ''), full: routeText, type: 'total' };
        } else {
          // 分路头：与最近总路头拼接（如 京東 + 東路 = 京東東路；無总路则独立）
          const base = route.base || routeText;
          const full = (route.base && route.full !== base) ? `${route.base}${routeText}` : routeText;
          route = { base: route.base, full, type: 'branch' };
        }
        continue;
      }

      // —— 卷十特殊节（省废/化外/羁縻）条目 ——
      if (route.type === 'special') {
        // 子路头（如 覊縻州/荆湖路）
        if (TOTAL_ROUTES.includes(content) || FULL_ROUTES.includes(content)) {
          route = { ...route, sub: content };
          continue;
        }
        if (indent === 0 && content && !/^(已上|右\d+州)/.test(content)) {
          if (route.full === '覊縻州' || route.full === '羈縻州' || route.full === '羈糜州') {
            // 覊縻州条目：一行 3 个州名（全角空格分隔）
            content.split(/　+/).filter(Boolean).forEach((n) => {
              references.push({ juan, route: `${route.full}${route.sub ? '/' + route.sub : ''}`, name: toSimplified(n), kind: '羁縻州' });
            });
          } else {
            // 省废州军/化外州条目：首词为名，全文为注
            const name = content.match(/^[一-龥]{1,6}?[府州軍監]/)?.[0] || content.slice(0, 4);
            references.push({ juan, route: `${route.full}${route.sub ? '/' + route.sub : ''}`, name: toSimplified(name), note: content.slice(0, 120), kind: route.full });
          }
        }
        continue;
      }

      // —— 正文段 ——
      if (!cur) continue; // 无当前州府（卷首提要等）忽略
      const body = content;
      // 州府头注記续行（「(…)」行）：治所「治X縣」多在此行，并入 headText
      if (cur.section === null && /^\(/.test(body)) {
        cur.headText += body;
        continue;
      }
      if (body.startsWith('地里')) { cur.section = 'dili'; continue; }
      if (/^[戸戶户]主/.test(body)) { cur.section = 'households'; cur.householdsRaw = body; continue; }
      if (body.startsWith('土貢')) { cur.section = 'tribute'; cur.tributeRaw = body; continue; }
      if (/^縣[一二三四五六七八九十百]+(?:$|[^十百千])/.test(body)) {
        cur.section = 'counties';
        cur.countyCountRaw = (body.match(/^縣([一二三四五六七八九十百]+)/) || [])[1];
        continue;
      }
      // 「監N」段标记：N 后须行尾或非数字/里/缺 注记，避免「監七十里」这类地里续行误判
      if (/^監[一二三四五六七八九十百]+(?:$|[^十百千里缺(（])/.test(body)) {
        cur.section = 'monopolies';
        cur.monoCountRaw = (body.match(/^監([一二三四五六七八九十百]+)/) || [])[1];
        continue;
      }
      // 秦州等边防州有「城/寨/堡」段（城二/寨七/堡三…），不是監条目，忽略
      if (/^(城|寨|堡|堡寨)[一二三四五六七八九十百]/.test(body)) { cur.section = 'notes'; continue; }
      if (body.startsWith('古跡')) { cur.section = 'notes'; continue; }

      // 续行/条目行
      if (cur.section === 'households') cur.householdsRaw += body;
      else if (cur.section === 'tribute') cur.tributeRaw += body;
      // 県条目行：等第开头即识别（无需「縣N」标记；四库本部分州缺「縣N」行）。
      // 仅在 土貢/縣 段之后识别——地里/戸主段（households 之前）的续行会以等第
      // 开头（如「河中府八十里」拆行成「中府八十里」），必须排除。
      else if ((cur.section === 'tribute' || cur.section === 'counties')
        && /^(?:次赤|次畿|赤|畿|望|緊|𦂳|上|中下|中|下)/.test(body)) {
        if (cur.section !== 'counties') cur.section = 'counties';
        cur.counties.push(body);
      }
      else if (cur.section === 'monopolies' && !/^(仍|𨽻|並|又)/.test(body)) cur.monopolies.push(body);
      // 其余（縣N 注記续行、地里续行、古跡内容）忽略
    }
    finish();
  }

  // —— 6. 条目内字段解析 ——
  const countyGradeMap = { '赤': '赤', '畿': '畿', '望': '望', '緊': '紧', '𦂳': '紧', '上': '上', '中下': '中下', '中': '中', '下': '下' };
  for (const p of prefectures) {
    // 治所：头部原文（含「(治X縣)」注記，跨行注記已并入 headText）。
    // 分页斜杠「／/」与括号先剥掉（如「治項/城縣」「(治開封祥符二縣)」）；「治X Y二縣」取首县。
    const headClean = (p.headText || '').replace(/[／/（）()]/g, '');
    const seatMatch = headClean.match(/治([^缺]{1,10}?)(二縣|兩縣|縣)$/);
    p.seat = seatMatch ? toSimplified(seatMatch[2] === '縣' ? seatMatch[1] : seatMatch[1].slice(0, 2)) : null;
    // 户口：戸主X客Y（「戸/戶/户」三种写法——四库本不同卷用字不一）
    const hh = p.householdsRaw ? p.householdsRaw.match(/[戸戶户]主(.+?)客(.+)$/) : null;
    if (hh) {
      p.households = {
        main: cnToInt(hh[1]),
        guest: cnToInt(hh[2]),
        raw: p.householdsRaw,
      };
    }
    delete p.householdsRaw;
    // 土贡：去前缀
    if (p.tributeRaw) { p.tribute = p.tributeRaw.replace(/^土貢/, ''); delete p.tributeRaw; }
    // 属县：counties 数组全为县条目行（等第开头），countyCountRaw 为「縣N」行
    const parsed = [];
    for (const cl of p.counties) {
      const c = parseCountyLine(cl);
      if (c) parsed.push({ name: toSimplified(c.name), grade: countyGradeMap[c.grade] || c.grade });
      else warnings.push(`[县条目未解析] ${p.name}: ${cl.slice(0, 30)}`);
    }
    p.countyCount = p.countyCountRaw ? cnToInt(p.countyCountRaw) : null;
    p.counties = parsed;
    if (p.countyCount !== null && p.countyCount !== parsed.length) {
      if (parsed.length > p.countyCount) {
        if (OVERFLOW_MERGE[p.name]) {
          // 源文本縣数错（实际县数多于「縣N」声明），溢出条目併回本州
          p.countyCount = parsed.length;
          warnings.push(`[县数注记] ${p.name} 縣${p.countyCount} 实得 ${parsed.length}（源文本縣数误，已按实际合并）`);
        } else {
          // 実得多于縣N：多出的行属下一个州府（源文本州府头行缺失，如邢州）。
          // 截断取前 N 个，溢出条目归入「(缺头行)」占位州，保留数据供人工命名。
          const extra = parsed.splice(p.countyCount);
          if (extra.length >= 2) {
            // 多条溢出：大概率是下一州府的県条目（州府头行缺失，如邢州），建占位州保留
            const orphanName = ORPHAN_NAMES[p.name] || '(缺頭行)';
            const orphan = {
              nameRaw: orphanName, name: orphanName, type: '州', grade: null,
              missingName: orphanName.startsWith('('),
              juan: p.juan,
              routeRaw: p.routeRaw, route: p.route,
              headText: '', counties: extra, monopolies: [],
              countyCount: extra.length,
            };
            if (orphanName.startsWith('(')) orphans.push(orphan);
            else warnings.push(`[占位州定名] ${orphanName}（原${p.name}溢出 ${extra.length} 条县条目，四库本缺头行）`);
          } else {
            // 单条溢出：多为上一条目拆行续文（如「望五鎮」），丢弃并提示
            warnings.push(`[溢出丢弃] ${p.name} 单条溢出「${extra.map((c) => c.name).join('、')}」非县条目（拆行续文），已丢弃`);
          }
          warnings.push(`[县数溢出] ${p.name} 縣${p.countyCount} 实得 ${parsed.length + extra.length}，多出 ${extra.length} 条（疑属下一州府）: ${extra.map((c) => c.name).join('、')}`);
        }
      } else {
        warnings.push(`[县数缺文] ${p.name} 縣${p.countyCount} 实得 ${parsed.length}（源文本缺文，如「以下X縣缺」）`);
      }
    }
    // 監：monopolies 数组首行为「監N」或監条目行
    const monos = [];
    for (const ml of p.monopolies) {
      const m = parseMonopolyLine(ml);
      if (m) monos.push({ name: toSimplified(m.name), note: m.note });
      else warnings.push(`[監条目未解析] ${p.name}: ${ml.slice(0, 30)}`);
    }
    p.monopolyCount = p.monoCountRaw ? cnToInt(p.monoCountRaw) : null;
    p.monopolies = monos;
  }

  // —— 7. 源文本讹字修正（岳州/萬州等）——
  for (const p of prefectures) {
    for (const fix of SOURCE_FIXES) {
      if (fix.test(p)) {
        p.name = toSimplified(fix.name);
        p.sourceFix = fix.note;
        break;
      }
    }
  }

  return { prefectures: [...prefectures, ...orphans], references, warnings };
}

// —— 7. 统计与闸门 ——
function summarize(prefectures) {
  const counts = { 京府: 0, 次府: 0, 府: 0, 州: 0, 军: 0, 监: 0, 县: 0 };
  for (const p of prefectures) {
    if (p.grade && /東京|西京|南京|北京/.test(p.grade)) counts.京府++;
    else if (p.grade && /次府/.test(p.grade)) counts.次府++;
    if (p.type === '府') counts.府++;
    else if (p.type === '州') counts.州++;
    else if (p.type === '軍') counts.军++;
    else if (p.type === '監') counts.监++;
    counts.县 += p.counties.length;
  }
  return counts;
}

// —— 8. 输出 ——
async function main() {
  await ensureDownloaded();
  const { prefectures, references, warnings } = parseAll();

  const counts = summarize(prefectures);
  console.log('===== 解析统计 =====');
  console.log(JSON.stringify(counts, null, 2));
  console.log('参考条目（卷十省废/化外/羁縻）:', references.length);

  const diff = [];
  if (counts.京府 !== EXPECTED.京府) diff.push(`京府 ${counts.京府} ≠ ${EXPECTED.京府}`);
  if (counts.次府 !== EXPECTED.次府) diff.push(`次府 ${counts.次府} ≠ ${EXPECTED.次府}`);
  if (counts.州 !== EXPECTED.州) diff.push(`州 ${counts.州} ≠ ${EXPECTED.州}`);
  if (counts.军 !== EXPECTED.军) diff.push(`军 ${counts.军} ≠ ${EXPECTED.军}`);
  if (counts.监 !== EXPECTED.监) diff.push(`监 ${counts.监} ≠ ${EXPECTED.监}`);
  if (counts.县 !== EXPECTED.县) diff.push(`县 ${counts.县} ≠ ${EXPECTED.县}`);

  if (warnings.length) {
    console.log('\n===== 警告（需人工核对）=====');
    warnings.forEach((w) => console.log('  ' + w));
  }
  if (diff.length) {
    console.log('\n===== 验收闸门差异 =====');
    diff.forEach((d) => console.log('  [DIFF] ' + d));
    // 列出州名清单便于人工核对
    const byType = { 府: [], 州: [], 军: [], 监: [] };
    for (const p of prefectures) {
      const key = p.type === '府' ? (p.grade && /京/.test(p.grade) ? '府' : '府') : p.type === '軍' ? '军' : p.type === '監' ? '监' : '州';
      byType[key].push(p.name);
    }
    for (const [k, v] of Object.entries(byType)) {
      console.log(`\n[${k} ${v.length}] ${v.join('、')}`);
    }
  }

  const out = {
    meta: {
      source: '元丰九域志（kanripo KR2k0005，文渊阁四库全书本，GBK 卷首已还原）',
      year: 1080,
      note: '元丰三年（1080）王存等奉敕撰，北宋路-府州军监-县建制的当代权威记录',
      counts,
      expected: EXPECTED,
      gatePassed: diff.length === 0,
    },
    prefectures,
    references,
  };
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), 'utf8');
  console.log(`\n输出: ${OUT_FILE}`);
  console.log(diff.length ? `闸门: 未通过（${diff.length} 项差异，数据已输出待核对）` : '闸门: 全部通过');
}

main().catch((err) => {
  console.error('[fetch-jiuyuzhi] 失败:', err.message);
  process.exit(1);
});
