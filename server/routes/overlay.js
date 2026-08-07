import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 历史边界数据目录
const HISTORICAL_DIR = path.join(__dirname, '..', 'data', 'geo', 'historical');

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
  const labels = periodsIndex.labels || {};
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
          // 政权名标签位（仅注入，不覆盖 feature 自带值）
          labelCoord: props.labelCoord || labels[props.entity] || null,
          labelMajor: props.labelMajor !== undefined ? props.labelMajor : labelMajorSet.has(props.entity),
        },
      });
    });
  });

  res.json({
    type: 'FeatureCollection',
    features: allFeatures,
    properties: {
      period: periodDef.label,
      year: periodDef.year,
      _periodId: periodDef.id,
      // 淡墨辅助元素（示意路径/点位，供前端水彩层叠加绘制）
      rivers: periodDef.rivers || periodsIndex.rivers || [],
      mountains: periodDef.mountains || periodsIndex.mountains || [],
      // 都会/重镇标注位（前端城市标签，与政权名标签区分层级）
      cities: periodDef.cities || periodsIndex.cities || [],
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
