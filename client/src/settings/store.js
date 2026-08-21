// 设置持久化层（项目首个 localStorage 使用点）。
// 单一存取入口：业务层只调 loadSettings() / saveSettings(patch)，
// 不直接碰 localStorage，方便未来替换存储实现。

import { CATEGORIES as CONTRACT_CATEGORIES, SPEEDS } from '../contract-tokens.js';

const KEY = 'historymap.settings.v1';

// Node/SSR and privacy-mode environments may not expose localStorage.
// Keep the store usable without a DOM while preserving browser persistence.
function getStorage() {
  try {
    return typeof globalThis.localStorage !== 'undefined' ? globalThis.localStorage : null;
  } catch {
    return null;
  }
}

/**
 * 事件分类定义（顺序即设置面板里的展示顺序，color 给泡泡 dot 用）。
 * id 与后端 events.category 取值一一对应。
 * 颜色为古典色系（与 styles.css 的 .cat-xxx 对应）。
 * id/label（及 Android 用到的 labelShort）来自契约 contract/tokens.json；
 * color 属视觉层（与 design-tokens.json / Android MapVisualTokens 同色系），
 * 在此本地维护，避免与既有视觉 token 管线双源冲突。
 */
const CATEGORY_COLORS = {
  era: '#b03a2e',        // 朱砂
  figure: '#6e5a7e',     // 紫檀
  military: '#a0622d',   // 赭石
  economy: '#5f7d4f',    // 竹绿
  invention: '#46647f',  // 黛蓝
};
// 契约新增分类但本地未配色时的兜底色（墨灰），避免 color 为 undefined 导致气泡无色
const CATEGORY_COLOR_FALLBACK = '#6b6b6b';
export const CATEGORIES = CONTRACT_CATEGORIES.map(({ id, label }) => ({
  id,
  label,
  color: CATEGORY_COLORS[id] ?? CATEGORY_COLOR_FALLBACK,
}));

/** 播放速度档位 → tickMs 映射（数值来自契约 contract/tokens.json speeds）。 */
export const SPEED_MAP = { ...SPEEDS };

export const defaultSettings = {
  // 默认开「时代格局 + 军事·领土」：南宋后期（1206-1279）事件全是 military
  // 分类，只开 era 会导致该时段地图上无任何事件泡泡
  categories: ['era', 'military'],
  speed: 'normal',
  autoplay: true,
  showBaseMap: false,   // 现代底图默认关闭
  showOverlay: true,    // 历史疆域叠加层默认显示
  showRivers: true,
  showMountains: true,
  showCities: true,
  showPlaces: true,     // 地点标注（都城/战场/书院等）
  showPrefectures: true, // 州府边界（独立描边层，L2+ 档位可见）
  showSeats: true,       // 州府/路治治所标注（与 Android 双开关对齐）
  showCounties: false    // 县治标注（数据量 1100+，默认关闭防拥挤）
};

/** 布尔开关字段清单（校验时逐个规整）。 */
const BOOL_KEYS = ['autoplay', 'showBaseMap', 'showOverlay', 'showRivers', 'showMountains', 'showCities', 'showPlaces', 'showPrefectures', 'showSeats', 'showCounties'];

/**
 * 校验并规整一份设置对象：合并默认值、过滤非法分类/速度/布尔值。
 * 导入（文本/URL 参数）与 localStorage 读取共用，保证任意来源的设置都合法。
 * @param {unknown} raw
 * @returns {object} 完整设置对象（永远包含全部字段）
 */
export function sanitizeSettings(raw) {
  const base = { ...defaultSettings };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const merged = { ...base, ...raw };
  merged.categories = Array.isArray(raw.categories)
    ? [...new Set(raw.categories.filter((id) => CATEGORIES.some((c) => c.id === id)))]
    : base.categories;
  merged.speed = SPEED_MAP[merged.speed] ? merged.speed : base.speed;
  BOOL_KEYS.forEach((key) => {
    if (typeof raw[key] !== 'boolean') merged[key] = base[key];
  });
  return merged;
}

/** 读取设置：合并默认值，容错坏数据。 */
export function loadSettings() {
  try {
    const storage = getStorage();
    const raw = storage?.getItem(KEY);
    if (!raw) return { ...defaultSettings };
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return { ...defaultSettings };
  }
}

/** 增量写入设置并返回合并后的完整对象。 */
export function saveSettings(patch) {
  const merged = { ...loadSettings(), ...patch };
  try {
    getStorage()?.setItem(KEY, JSON.stringify(merged));
  } catch {
    // localStorage 不可用（隐私模式等）时静默降级：设置仅当前会话有效。
  }
  return merged;
}
