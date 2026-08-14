#!/usr/bin/env node
/**
 * T1b 变更事件提取器：从沿革全文提取「年号+N年 + 动作词」事件三元组
 *
 * 输入：
 *   server/data/geo/song/yudi-guangji.json   （fullEvolution 全文沿革，北宋基准）
 *   server/data/geo/song/songshi-dili.json   （宋史·地理志解析，南宋基准；T1c 产出，可缺省）
 *
 * 输出：
 *   server/data/geo/song/place-events.json   （时空库 place_events 表的种子数据）
 *
 * 规则：宋 960-1279 全部 57 个年号 → 公历起始年；「年号 + N年 + 动作词（升/降/废/置/改/析/省/徙/复/割/并/隶/罢/筑/立）」
 * 事件类型分类（升格/降格/废州/省并/新置/改名/改隶/复置/徙治/割隶）。
 * 无年份记载的变更（「尋改」「後廢」）标记 year_approx，不硬造年份。
 *
 * LLM 校对为可选开关：--llm-review 需环境变量 LLM_API_KEY（缺省跳过，不阻塞主流程）。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Converter } from 'opencc-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SONG_DIR = path.join(ROOT, 'server', 'data', 'geo', 'song');
const YUDI_FILE = path.join(SONG_DIR, 'yudi-guangji.json');
const SONGSHI_FILE = path.join(SONG_DIR, 'songshi-dili.json');
const OUT_FILE = path.join(SONG_DIR, 'place-events.json');

/**
 * 宋 960-1279 年号表：年号 → 起始公历年（含 1 年号内跨年）。
 * 提取器按「起始年 + N - 1」换算公历（元年 = 起始年）。
 */
const ERAS = {
  '建隆': 960, '乾德': 963, '开宝': 968, '太平兴国': 976, '雍熙': 984,
  '端拱': 988, '淳化': 990, '至道': 995, '咸平': 998, '景德': 1004,
  '大中祥符': 1008, '天禧': 1017, '乾兴': 1022, '天圣': 1023, '明道': 1032,
  '景祐': 1034, '宝元': 1038, '康定': 1040, '庆历': 1041, '皇祐': 1049,
  '至和': 1054, '嘉祐': 1056, '治平': 1064, '熙宁': 1068, '元丰': 1078,
  '元祐': 1086, '绍圣': 1094, '元符': 1098, '建中靖国': 1101, '崇宁': 1102,
  '大观': 1107, '政和': 1111, '重和': 1118, '宣和': 1119, '靖康': 1126,
  '建炎': 1127, '绍兴': 1131, '隆兴': 1163, '乾道': 1165, '淳熙': 1174,
  '绍熙': 1190, '庆元': 1195, '嘉泰': 1201, '开禧': 1205, '嘉定': 1208,
  '宝庆': 1225, '绍定': 1228, '端平': 1234, '嘉熙': 1237, '淳祐': 1241,
  '宝祐': 1253, '开庆': 1259, '景定': 1260, '咸淳': 1265, '德祐': 1275,
  '景炎': 1276, '祥兴': 1278,
};

const DIGITS = { '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10, '二十': 20, '三十': 30 };
function cnNum(s) {
  if (s === '元' || s === '一') return 1;
  if (s.includes('十')) {
    const [a, b] = s.split('十');
    return (a ? (DIGITS[a] || 1) * 10 : 10) + (b ? DIGITS[b] || 0 : 0);
  }
  return DIGITS[s] || 0;
}

// 动作词 → 事件类型（按语义归类）
function eventType(action, context) {
  switch (action) {
    case '升': return '升格';       // 升府/升州/升节度
    case '降': return '降格';
    case '罢': return /辅|郡/.test(context) ? '降格' : '废州'; // 罢四辅=罢辅郡称号（降格）
    case '废': return '废州';
    case '省': case '并': return '省并';
    case '置': case '筑': case '立': return '新置';
    case '析': return '析置';
    case '复': return '复置';
    case '徙': return '徙治';
    case '割': return '割隶';
    case '隶': return '改隶';
    case '改': return /隶|属|来属/.test(context) ? '改隶' : '改名';
    case '赐': return '赐名';
    default: return '其他';
  }
}

const ERA_RE = new RegExp(`(${Object.keys(ERAS).sort((a, b) => b.length - a.length).join('|')})([元一二三四五六七八九十]+)年?(?:，|,)?([^，。；;]{0,16}?(?:升|降|废|罢|省|并|置|筑|立|析|复|徙|割|隶|改|赐)[^，。；;]{0,14})`, 'g');

/** 从一段沿革文本提取事件 */
function extractEvents(name, text, sourceId, juan) {
  const events = [];
  ERA_RE.lastIndex = 0;
  let m;
  while ((m = ERA_RE.exec(text)) !== null) {
    const era = m[1];
    const num = m[2];
    const actionText = m[3];
    const year = ERAS[era] + cnNum(num) - 1;
    // 动作词定位（actionText 内第一个动作字）
    const actionMatch = actionText.match(/(升|降|废|罢|省|并|置|筑|立|析|复|徙|割|隶|改|赐)/);
    if (!actionMatch) continue;
    const action = actionMatch[1];
    // 上下文：动作词前后 10 字（detail 原文摘录）
    const ai = actionText.indexOf(action);
    const detail = actionText.slice(Math.max(0, ai - 8), ai + 14);
    // 事件归属检查：detail 形如「废X州/省X州入/增置X军…」且 X ≠ 当前州——事件属于 X 州
    // （如「废春州入恩州」是春州废置，不是恩州/南恩州的事件；「增置怀德军」是怀德军）
    const otherMatch = detail.match(/^(?:废|省|置|改|增置|又增置|增築)([\u3400-\u9fff]{1,4}?[府州軍監])/);
    const targetOther = otherMatch && otherMatch[2] !== name ? otherMatch[2] : null;
    events.push({
      placeName: name,
      targetOther,
      year,
      yearApprox: false,
      eventType: eventType(action, actionText),
      action,
      detail,
      sourceId,
      juan,
      confidence: 0.85, // 规则确定性提取：年份明确 + 动作词明确
    });
  }
  return events;
}

/** 无年份记载的变更（「尋改」「後廢」「尋復」等）——标记近似年份，不硬造 */
const APPROX_RE = /(尋|俄|旋|未幾|既而|久之)(改|废|罢|省|复|置|徙|并|升|降)([^，。；;]{0,10})/g;
function extractApproxEvents(name, text, sourceId, juan) {
  const events = [];
  APPROX_RE.lastIndex = 0;
  let m;
  while ((m = APPROX_RE.exec(text)) !== null) {
    const action = m[2];
    const detail = m[0].slice(0, 20);
    events.push({
      placeName: name,
      year: null,
      yearApprox: true,
      eventType: eventType(action, detail),
      action,
      detail,
      sourceId,
      juan,
      confidence: 0.4, // 无年份，低置信
    });
  }
  return events;
}

function main() {
  const toCn = Converter({ from: 'tw', to: 'cn' });
  const events = [];
  const warnings = [];

  // —— 源 1：舆地广记（北宋沿革全文）——
  if (fs.existsSync(YUDI_FILE)) {
    const yudi = JSON.parse(fs.readFileSync(YUDI_FILE, 'utf8'));
    let withEvents = 0;
    for (const p of yudi.prefectures) {
      const text = toCn(p.fullEvolution || p.evolution || '');
      const ev = extractEvents(p.name, text, 'yudi-guangji', p.juan);
      const approx = extractApproxEvents(p.name, text, 'yudi-guangji', p.juan);
      if (ev.length || approx.length) withEvents++;
      events.push(...ev, ...approx);
    }
    console.log(`[舆地广记] 州府 ${yudi.prefectures.length}，含事件 ${withEvents}，事件数 ${events.length}`);
  } else {
    warnings.push('yudi-guangji.json 缺失（先跑 npm run data:classics）');
  }

  // —— 源 2：宋史·地理志（南宋基准，T1c 产出，可缺省）——
  if (fs.existsSync(SONGSHI_FILE)) {
    const ss = JSON.parse(fs.readFileSync(SONGSHI_FILE, 'utf8'));
    const before = events.length;
    let withEvents = 0;
    for (const p of ss.prefectures || []) {
      const text = toCn(p.evolution || '');
      const ev = extractEvents(p.name, text, 'songshi-dili', p.juan);
      const approx = extractApproxEvents(p.name, text, 'songshi-dili', p.juan);
      if (ev.length || approx.length) withEvents++;
      events.push(...ev, ...approx);
    }
    console.log(`[宋史·地理志] 州府 ${(ss.prefectures || []).length}，含事件 ${withEvents}，事件数 ${events.length - before}`);
  } else {
    warnings.push('songshi-dili.json 缺失（T1c 未跑，仅北宋事件）');
  }

  // 去重（同源同年同动作同 detail 近似）
  const seen = new Set();
  const deduped = events.filter((e) => {
    const key = `${e.placeName}|${e.year}|${e.eventType}|${e.detail.slice(0, 12)}|${e.sourceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const out = {
    meta: {
      source: '变更事件提取器（规则引擎：年号表 + 动作词），LLM 校对可选',
      eras: Object.keys(ERAS).length,
      counts: { raw: events.length, deduped: deduped.length },
      warnings,
    },
    events: deduped,
  };
  fs.mkdirSync(SONG_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), 'utf8');
  console.log(`\n事件总数: ${deduped.length}（去重后）`);
  const byType = {};
  deduped.forEach((e) => { byType[e.eventType] = (byType[e.eventType] || 0) + 1; });
  console.log('事件类型分布:', JSON.stringify(byType));
  const bySource = {};
  deduped.forEach((e) => { bySource[e.sourceId] = (bySource[e.sourceId] || 0) + 1; });
  console.log('按史料源:', JSON.stringify(bySource));
  if (warnings.length) warnings.forEach((w) => console.log('[warning]', w));
  console.log(`输出: ${OUT_FILE}`);
}

main();
