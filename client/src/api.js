// 前端数据层：所有后端访问集中在本文件。
// 业务代码只调函数、不写 URL，便于统一加 loading/error 处理；
// Android 原生版不共用本文件，由 MapRepository.kt（Room + OverlayLoader）
// 按同一 API 契约另行实现，双端契约见 AGENTS.md「API 契约」。
// 开发期 /api 由 Vite proxy 转发到后端 3001（见 vite.config.js）

const BASE = '/api';

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

/** 获取基础地图 GeoJSON（现代中国边界） */
export function getMap(options = {}) {
  return request('/map', options.signal);
}

/** 获取朝代历史疆域叠加层（按时期） */
export function getOverlay(dynasty = 'song', period = '1111', options = {}) {
  return request(`/map/overlay?dynasty=${encodeURIComponent(dynasty)}&period=${encodeURIComponent(period)}`, options.signal);
}

/** 全时期模式叠加层（P2）：给定年份返回当时全部政权（properties._range 为命中集合稳定区间） */
export function getAllOverlay(year, options = {}) {
  return request(`/map/overlay/all?year=${encodeURIComponent(year)}`, options.signal);
}

/** 获取朝代全部历史事件 */
export function getEvents(dynasty = 'song', options = {}) {
  return request(`/events?dynasty=${encodeURIComponent(dynasty)}`, options.signal);
}

/** 获取朝代元信息（起止年） */
export function getMeta(dynasty = 'song', options = {}) {
  return request(`/meta?dynasty=${encodeURIComponent(dynasty)}`, options.signal);
}

/** 获取全部朝代列表（顶栏朝代下拉） */
export function getDynasties(options = {}) {
  return request('/dynasties', options.signal);
}

/** 获取朝代人物列表（人物视角，按关联事件数降序） */
export function getPersons(dynasty = 'song', options = {}) {
  return request(`/persons?dynasty=${encodeURIComponent(dynasty)}`, options.signal);
}

/**
 * 时空实体查询（PostgreSQL + PostGIS 时空库，/api/places）：
 * 按年份返回 valid_from <= year <= valid_to 的实体版本。
 * @param {object} query { year, type, name, route }
 */
export function getPlaces(query = {}, options = {}) {
  const qs = new URLSearchParams();
  if (query.year !== undefined) qs.set('year', String(query.year));
  if (query.type) qs.set('type', query.type);
  if (query.name) qs.set('name', query.name);
  if (query.route) qs.set('route', query.route);
  const q = qs.toString();
  return request(`/places${q ? `?${q}` : ''}`, options.signal);
}

/** 时空实体详情（全部时间版本 + 事件时间线 + 史料源） */
export function getPlace(id, options = {}) {
  return request(`/places/${encodeURIComponent(id)}`, options.signal);
}

/** 史料源清单（时空库） */
export function getPlaceSources(options = {}) {
  return request('/places/sources', options.signal);
}
