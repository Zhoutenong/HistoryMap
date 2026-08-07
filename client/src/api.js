// 前端数据层：所有后端访问集中在本文件。
// 业务代码只调函数、不写 URL，便于：
//   1. 统一加 loading/error 处理
//   2. 未来 Android WebView 移植时，整体替换为原生 bridge 调用只改这一个文件
// 开发期 /api 由 Vite proxy 转发到后端 3001（见 vite.config.js）

const BASE = '/api';

async function handle(res) {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

/** 获取基础地图 GeoJSON（现代中国边界） */
export function getMap() {
  return fetch(`${BASE}/map`).then(handle);
}

/** 获取朝代历史疆域叠加层（按时期） */
export function getOverlay(dynasty = 'song', period = '1111') {
  return fetch(`${BASE}/map/overlay?dynasty=${dynasty}&period=${period}`).then(handle);
}

/** 获取朝代全部历史事件 */
export function getEvents(dynasty = 'song') {
  return fetch(`${BASE}/events?dynasty=${dynasty}`).then(handle);
}

/** 获取朝代元信息（起止年） */
export function getMeta(dynasty = 'song') {
  return fetch(`${BASE}/meta?dynasty=${dynasty}`).then(handle);
}

/** 获取全部朝代列表（顶栏朝代下拉） */
export function getDynasties() {
  return fetch(`${BASE}/dynasties`).then(handle);
}
