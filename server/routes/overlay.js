import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { featureCollectionToLegacy, filterGeoJSONByPeriod, validateGeoJSON } from '../data/geo/historical/geojson.js';

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 历史边界数据目录
const HISTORICAL_DIR = path.join(__dirname, '..', 'data', 'geo', 'historical');
// prefectures.geojson：州府级数据（元丰九域志基准，本地生成，含 CHGIS 派生坐标——见 docs/data-improvement-plan.md）
const STANDARD_GEO_FILES = ['rivers.geojson', 'mountains.geojson', 'cities.geojson', 'places.geojson', 'prefectures.geojson', 'southern-song-routes.geojson'];

/**
 * 地点类要素 kind 白名单（places.geojson 中的点位要素）。
 * 都城/战场/书院等按 kind 归入响应顶层 properties.places；
 * 白名单之外的未知 kind 会被安全忽略（历史问题：未知 kind 直接 500）。
 */
const PLACE_KINDS = ['capital', 'battlefield', 'academy'];

function readStandardFeatures(periodId) {
  const features = [];
  STANDARD_GEO_FILES.forEach((filename) => {
    const data = readCachedJSON(path.join(HISTORICAL_DIR, filename));
    if (!data || !validateGeoJSON(data).valid) return;
    features.push(...filterGeoJSONByPeriod(data, periodId).features);
  });
  return features;
}

/**
 * 带 mtime 校验的 JSON 文件缓存：
 * 首次读取后缓存解析结果；文件 mtime 变化（开发期改数据）时自动重读。
 * 下游只读缓存对象（不得就地修改），见 GET / 中对 feat.properties 的处理。
 */
const fileCache = new Map(); // 绝对路径 -> { mtimeMs, data }
function readCachedJSON(filePath) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    fileCache.delete(filePath);
    return null;
  }
  const hit = fileCache.get(filePath);
  if (hit && hit.mtimeMs === stat.mtimeMs) return hit.data;
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    fileCache.set(filePath, { mtimeMs: stat.mtimeMs, data });
    return data;
  } catch {
    // 文件损坏：清除缓存，返回 null（路由层按空数据处理）
    fileCache.delete(filePath);
    return null;
  }
}

/**
 * GET /api/map/overlay?dynasty=song&period=1111
 *
 * 返回指定时期的所有历史疆域叠加层（FeatureCollection）。
 * 从 historical/ 目录读取相应文件并合并。
 */
router.get('/', (req, res) => {
  const dynasty = req.query.dynasty || 'song';
  const period = req.query.period || '1111';
  
  // 加载索引，确定要读哪些文件
  const periodsPath = path.join(HISTORICAL_DIR, 'periods.json');
  const periodsIndex = readCachedJSON(periodsPath);
  
  if (!periodsIndex) {
    return res.json({
      type: 'FeatureCollection',
      features: [],
      _note: '索引文件未找到'
    });
  }

  // 查找匹配的 period
  const periodId = `${dynasty}-${period}`;
  const periodDef = periodsIndex.periods.find(p => p.id === periodId);
  
  if (!periodDef) {
    return res.json({
      type: 'FeatureCollection',
      features: [],
      _note: `未找到时期: ${periodId}`
    });
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
    const filePath = path.join(HISTORICAL_DIR, filename);
    const data = readCachedJSON(filePath);
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
  const standardFeatures = readStandardFeatures(periodDef.id);
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

  res.json({
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
  });
});

/**
 * GET /api/map/overlay/periods
 * 返回可用时期列表
 */
router.get('/periods', (_req, res) => {
  const periodsPath = path.join(HISTORICAL_DIR, 'periods.json');
  const data = readCachedJSON(periodsPath);
  
  if (!data) {
    return res.json({ periods: [] });
  }
  
  res.json(data.periods);
});

export default router;
