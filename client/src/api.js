// 前端数据层：所有后端访问集中在本文件。
// 业务代码只调函数、不写 URL，便于：
//   1. 统一加 loading/error 处理
//   2. Android WebView 移植：检测到原生 bridge（window.AndroidAPI）时改走
//      bridge 同步调用，否则走 fetch——同一份代码双端运行，Web 版零影响
// 开发期 /api 由 Vite proxy 转发到后端 3001（见 vite.config.js）

const BASE = '/api';

// Android 原生 bridge：MainActivity 通过 addJavascriptInterface 注入，
// 5 个同步方法返回 JSON 字符串，结构与后端 API 完全一致
const bridge = typeof window !== 'undefined' ? window.AndroidAPI : null;

async function handle(res) {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  try {
    return await res.json();
  } catch (err) {
    throw new Error(`响应不是有效 JSON: ${err.message}`, { cause: err });
  }
}

function request(path, signal) {
  return fetch(`${BASE}${path}`, { signal }).then(handle);
}

// bridge 调用包装：原生侧同步返回 JSON 字符串，JS 侧包成 Promise（语义与 fetch 一致）；
// 原生抛出的异常会自然传播为 Promise 拒绝
function bridgeCall(name, ...args) {
  return Promise.resolve(JSON.parse(bridge[name](...args)));
}

/** 获取基础地图 GeoJSON（现代中国边界） */
export function getMap(options = {}) {
  if (bridge) return bridgeCall('getMap');
  return request('/map', options.signal);
}

/** 获取朝代历史疆域叠加层（按时期） */
export function getOverlay(dynasty = 'song', period = '1111', options = {}) {
  if (bridge) return bridgeCall('getOverlay', dynasty, period);
  return request(`/map/overlay?dynasty=${encodeURIComponent(dynasty)}&period=${encodeURIComponent(period)}`, options.signal);
}

/** 获取朝代全部历史事件 */
export function getEvents(dynasty = 'song', options = {}) {
  if (bridge) return bridgeCall('getEvents', dynasty);
  return request(`/events?dynasty=${encodeURIComponent(dynasty)}`, options.signal);
}

/** 获取朝代元信息（起止年） */
export function getMeta(dynasty = 'song', options = {}) {
  if (bridge) return bridgeCall('getMeta', dynasty);
  return request(`/meta?dynasty=${encodeURIComponent(dynasty)}`, options.signal);
}

/** 获取全部朝代列表（顶栏朝代下拉） */
export function getDynasties(options = {}) {
  if (bridge) return bridgeCall('getDynasties');
  return request('/dynasties', options.signal);
}
