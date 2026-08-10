// 设置持久化层（项目首个 localStorage 使用点）。
// 单一存取入口：业务层只调 loadSettings() / saveSettings(patch)，
// 不直接碰 localStorage，方便未来换端（Android WebView bridge）时替换实现。

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
 */
export const CATEGORIES = [
  { id: 'era', label: '时代格局', color: '#b03a2e' },      // 朱砂
  { id: 'figure', label: '名人轨迹', color: '#6e5a7e' },   // 紫檀
  { id: 'military', label: '军事·领土', color: '#a0622d' },// 赭石
  { id: 'economy', label: '经济变革', color: '#5f7d4f' },  // 竹绿
  { id: 'invention', label: '重要发明', color: '#46647f' } // 黛蓝
];

/** 播放速度档位 → tickMs 映射。 */
export const SPEED_MAP = { slow: 220, normal: 110, fast: 50 };

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
  showCities: true
};

/** 布尔开关字段清单（校验时逐个规整）。 */
const BOOL_KEYS = ['autoplay', 'showBaseMap', 'showOverlay', 'showRivers', 'showMountains', 'showCities'];

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
