// overlay 合并纯函数：GET /api/map/overlay 的响应构造逻辑。
// 从 routes/overlay.js 抽出（A2 双端 golden 契约，见 docs/architecture/codebase-review-plan.md）：
//   - Web 端：routes/overlay.js 注入文件读取（readCachedJSON）后调用；
//   - Android 端：OverlayMerge.kt 逐行复刻本文件，双端用 contract/golden/overlay-merge.*.json
//     对同一固定输入做 golden 断言，任一端语义漂移测试即红。
// 本文件不触碰 express，数据文件一律经注入的 readFile 读取；唯一例外是模块加载期
// 读取 contract/tokens.json（A2 第二步双端共享契约）取得 PLACE_KINDS 白名单——
// 与 Web contract-tokens.js / Android ContractTokens.kt 同源，保证三端白名单不漂移。

import { readFileSync } from 'node:fs';
import { featureCollectionToLegacy, filterGeoJSONByPeriod, validateGeoJSON } from './geojson.js';

/** 双端共享契约（contract/tokens.json，A2 第二步）。 */
const CONTRACT_TOKENS = JSON.parse(
  readFileSync(new URL('../../../../contract/tokens.json', import.meta.url), 'utf8'),
);

/** 标准辅助地理文件清单（rivers/mountains/cities/places + 州府级两件） */
export const STANDARD_GEO_FILES = ['rivers.geojson', 'mountains.geojson', 'cities.geojson', 'places.geojson', 'prefectures.geojson', 'southern-song-routes.geojson'];

/**
 * 地点类要素 kind 白名单（places.geojson 中的点位要素；数值来自契约 contract/tokens.json
 * 的 placeKinds，与 Web TerritoryOverlay.js / Android ContractTokens.PLACE_KINDS 同源）。
 * 都城/战场/书院等按 kind 归入响应顶层 properties.places；
 * 白名单之外的未知 kind 会被安全忽略（历史问题：未知 kind 直接 500）。
 */
export const PLACE_KINDS = Object.freeze([...CONTRACT_TOKENS.placeKinds]);

function readStandardFeatures(periodId, readFile) {
  const features = [];
  STANDARD_GEO_FILES.forEach((filename) => {
    const data = readFile(filename);
    if (!data || !validateGeoJSON(data).valid) return;
    features.push(...filterGeoJSONByPeriod(data, periodId).features);
  });
  return features;
}

/**
 * 构造 overlay 响应（纯函数）。
 * @param {object} params
 * @param {object|null} params.periodsIndex periods.json 解析结果（null = 索引缺失）
 * @param {string} params.dynasty
 * @param {string} params.period
 * @param {(filename: string) => object|null} params.readFile 读取 historical/ 目录下
 *        指定文件的解析结果；缺失/损坏返回 null
 * @returns {object} FeatureCollection 响应体
 */
export function buildOverlayResponse({ periodsIndex, dynasty, period, readFile }) {
  if (!periodsIndex) {
    return { type: 'FeatureCollection', features: [], _note: '索引文件未找到' };
  }

  // 查找匹配的 period
  const periodId = `${dynasty}-${period}`;
  const periodDef = periodsIndex.periods.find(p => p.id === periodId);

  if (!periodDef) {
    return { type: 'FeatureCollection', features: [], _note: `未找到时期: ${periodId}` };
  }

  // entities 配色表：按中文名（entity）兜底查色，统一管理政权颜色
  // （fillOpacity 不在此表——feature 自带，缺省走下方统一默认值）
  const entityStyle = {};
  (periodsIndex.entities || []).forEach((e) => {
    entityStyle[e.name] = { color: e.color };
  });

  // 政权名标签位：labelCoord 为人工标定的视觉中心（[lng, lat]），
  // labelMajor 用于前端区分主叙事政权（字号/墨色更重）。缺省回落几何质心。
  // labelsByPeriod 支持按时期覆写（如南宋「宋」锚点南移到 [113.5, 28]）：
  // 优先级 feature 自带 labelCoord > 时期覆写 > 全局 labels > null。
  const labels = periodsIndex.labels || {};
  const labelsByPeriod = periodsIndex.labelsByPeriod?.[periodDef.id] || {};
  const labelMajorSet = new Set(periodsIndex.labelMajor || []);

  // 读取所有文件并合并 features
  const allFeatures = [];

  periodDef.files.forEach(filename => {
    const data = readFile(filename);
    if (!data || !data.features) return;

    data.features.forEach(feat => {
      const props = feat.properties || {};
      // 优先用 feature 自带值，其次查 entities 配色表，最后用中性灰兜底
      const fallback = entityStyle[props.entity] || {};
      // 构造新对象（不就地修改缓存里的源对象）：
      // 缓存跨请求复用，就地修改会让后续请求拿到被污染的 properties
      allFeatures.push({
        type: feat.type,
        geometry: feat.geometry,
        properties: {
          ...props,
          // 回退用通用名而不是文件名：避免图例里出现 "regimes-1100.json"
          entity: props.entity || '未知政权',
          color: props.color || fallback.color || '#888888',
          fillOpacity: props.fillOpacity !== undefined ? props.fillOpacity : 0.35,
          // 政权名标签位（仅注入，不覆盖 feature 自带值；时期覆写优先于全局）
          labelCoord: props.labelCoord || labelsByPeriod[props.entity] || labels[props.entity] || null,
          labelMajor: props.labelMajor !== undefined ? props.labelMajor : labelMajorSet.has(props.entity),
        },
      });
    });
  });

  // 标准化辅助地理数据优先；缺失或校验失败时保留 periods.json 旧数组兼容。
  // 按 kind 白名单分组：未知 kind（如 typo 或未来新增类型）直接忽略，
  // 不再像旧实现那样对未初始化的分组 push 导致 500。
  const standardFeatures = readStandardFeatures(periodDef.id, readFile);
  const KNOWN_KINDS = ['river', 'mountain', 'city', 'prefecture', 'prefecture-seat', ...PLACE_KINDS];
  const standardByKind = standardFeatures.reduce((groups, feature) => {
    const kind = feature.properties?.kind;
    if (kind && KNOWN_KINDS.includes(kind)) groups[kind].push(feature);
    return groups;
  }, Object.fromEntries(KNOWN_KINDS.map((kind) => [kind, []])));
  const legacy = featureCollectionToLegacy(standardFeatures);
  const legacyByKind = (kind) => legacy.filter((item) => item.kind === kind);
  // 标准文件优先；缺失（tang-800/yuan-* 等未覆盖时期）回落 periods.json 旧数组。
  // 回落条目需补 kind（legacy 数组本身无 kind 字段），否则前端 tierAdmits 的
  // LOD 准入矩阵走 default 分支全部全档显示——rank/kind 齐备矩阵才生效。
  const rivers = standardByKind.river.length
    ? legacyByKind('river')
    : (periodDef.rivers || periodsIndex.rivers || []).map((r) => ({ kind: 'river', ...r }));
  const mountains = standardByKind.mountain.length
    ? legacyByKind('mountain')
    : (periodDef.mountains || periodsIndex.mountains || []).map((m) => ({ kind: 'mountain', ...m }));
  const cities = standardByKind.city.length
    ? legacyByKind('city')
    : (periodDef.cities || periodsIndex.cities || []).map((c) => ({ kind: 'city', ...c }));
  // 地点（都城/战场/书院等）：标准文件优先，其次 periods.json 旧数组兼容
  const places = PLACE_KINDS.some((kind) => standardByKind[kind].length > 0)
    ? legacy.filter((item) => PLACE_KINDS.includes(item.kind))
    : (periodDef.places || periodsIndex.places || []).map((p) => ({ kind: 'capital', ...p }));
  // 州府级（元丰九域志基准）：
  // - prefectures：Polygon 面**保留完整 feature**（geometry 供前端画边界，
  //   featureCollectionToLegacy 会剥掉 Polygon 的 geometry，不能走 legacy 通道）
  // - prefectureSeats：治所 Point → legacy（coord 供前端 CSS2D 标注）
  const prefectures = standardByKind.prefecture;
  const prefectureSeats = legacyByKind('prefecture-seat');

  return {
    type: 'FeatureCollection',
    features: allFeatures,
    properties: {
      period: periodDef.label,
      year: periodDef.year,
      _periodId: periodDef.id,
      rivers,
      mountains,
      cities,
      places,
      prefectures,
      prefectureSeats,
    }
  };
}

/**
 * 构造「全时期模式」响应（P2）：给定年份，返回当时**所有政权**的疆域叠加层。
 * 逻辑：periods.json 中凡 start <= year <= end 的时期全部命中；其 files 去重后
 * 合并 features（同一文件只读一次，避免 song-1111/liao-1111 同指 regimes-1100.json
 * 时政权面重复）；注入链路与 buildOverlayResponse 一致（entities 配色 / labels /
 * labelMajor，labelsByPeriod 按命中时期顺序合并查询）。
 * 辅助层（河流/山脉/城市/州府）按「periods 数组与命中时期集合有交集」过滤。
 *
 * properties 额外返回：
 *   - _matchedPeriods：命中的时期 id 列表（调试/前端展示）
 *   - _range：[start, end] —— 命中集合保持不变的年份区间（供前端判断是否需要
 *     重新请求：年份仍在区间内则响应不会变化）
 */
export function buildAllPeriodsOverlay({ periodsIndex, year, readFile }) {
  if (!periodsIndex) {
    return { type: 'FeatureCollection', features: [], _note: '索引文件未找到' };
  }
  const allPeriods = periodsIndex.periods || [];
  const matched = allPeriods.filter((p) => p.start !== undefined && p.end !== undefined
    && year >= p.start && year <= p.end);

  // 命中集合不变的年份区间：收集所有时期的边界点（start 与 end+1），
  // 找包含 year 的相邻边界之间那段。
  const boundaries = new Set();
  allPeriods.forEach((p) => {
    if (p.start === undefined || p.end === undefined) return;
    boundaries.add(p.start);
    boundaries.add(p.end + 1);
  });
  const sorted = [...boundaries].sort((a, b) => a - b);
  let rangeStart = -Infinity;
  let rangeEnd = Infinity;
  sorted.forEach((b) => {
    if (b <= year) rangeStart = Math.max(rangeStart, b);
    else rangeEnd = Math.min(rangeEnd, b - 1);
  });

  const entityStyle = {};
  (periodsIndex.entities || []).forEach((e) => {
    entityStyle[e.name] = { color: e.color };
  });
  const labels = periodsIndex.labels || {};
  // labelsByPeriod：按命中时期顺序合并（先命中者优先），再回落全局
  const labelsByPeriod = {};
  matched.forEach((p) => {
    const per = periodsIndex.labelsByPeriod?.[p.id] || {};
    Object.entries(per).forEach(([entity, coord]) => {
      if (labelsByPeriod[entity] === undefined) labelsByPeriod[entity] = coord;
    });
  });
  const labelMajorSet = new Set(periodsIndex.labelMajor || []);

  // 文件去重：同一文件可能被多个命中时期引用，只装载一次
  const files = [];
  const seen = new Set();
  matched.forEach((p) => (p.files || []).forEach((f) => {
    if (!seen.has(f)) { seen.add(f); files.push(f); }
  }));

  const allFeatures = [];
  files.forEach((filename) => {
    const data = readFile(filename);
    if (!data || !data.features) return;
    data.features.forEach((feat) => {
      const props = feat.properties || {};
      const fallback = entityStyle[props.entity] || {};
      allFeatures.push({
        type: feat.type,
        geometry: feat.geometry,
        properties: {
          ...props,
          entity: props.entity || '未知政权',
          color: props.color || fallback.color || '#888888',
          fillOpacity: props.fillOpacity !== undefined ? props.fillOpacity : 0.35,
          labelCoord: props.labelCoord || labelsByPeriod[props.entity] || labels[props.entity] || null,
          labelMajor: props.labelMajor !== undefined ? props.labelMajor : labelMajorSet.has(props.entity),
        },
      });
    });
  });

  // 辅助层：periods 数组与命中时期集合有交集（或为空 = 全时期）即保留
  const matchedIds = new Set(matched.map((p) => p.id));
  const standardFeatures = [];
  STANDARD_GEO_FILES.forEach((filename) => {
    const data = readFile(filename);
    if (!data || !validateGeoJSON(data).valid) return;
    filterGeoJSONByPeriodSet(data, matchedIds).features.forEach((f) => standardFeatures.push(f));
  });
  const KNOWN_KINDS = ['river', 'mountain', 'city', 'prefecture', 'prefecture-seat', ...PLACE_KINDS];
  const standardByKind = standardFeatures.reduce((groups, feature) => {
    const kind = feature.properties?.kind;
    if (kind && KNOWN_KINDS.includes(kind)) groups[kind].push(feature);
    return groups;
  }, Object.fromEntries(KNOWN_KINDS.map((kind) => [kind, []])));
  const legacy = featureCollectionToLegacy(standardFeatures);
  const legacyByKind = (kind) => legacy.filter((item) => item.kind === kind);

  return {
    type: 'FeatureCollection',
    features: allFeatures,
    properties: {
      period: `${year} 年 · 全时期`,
      year,
      _periodId: `all-${year}`,
      _matchedPeriods: matched.map((p) => p.id),
      _range: [Number.isFinite(rangeStart) ? rangeStart : year, Number.isFinite(rangeEnd) ? rangeEnd : year],
      rivers: legacyByKind('river'),
      mountains: legacyByKind('mountain'),
      cities: legacyByKind('city'),
      places: legacy.filter((item) => PLACE_KINDS.includes(item.kind)),
      prefectures: standardByKind.prefecture,
      prefectureSeats: legacyByKind('prefecture-seat'),
    }
  };
}

/** filterGeoJSONByPeriod 的集合版：periods 数组与命中集合有交集（或为空）即保留 */
function filterGeoJSONByPeriodSet(data, matchedIds) {
  if (!data || !Array.isArray(data.features)) return { type: 'FeatureCollection', features: [] };
  return {
    ...data,
    features: data.features.filter((feature) => {
      const periods = feature.properties?.periods;
      return !Array.isArray(periods) || periods.length === 0 || periods.some((id) => matchedIds.has(id));
    }),
  };
}
