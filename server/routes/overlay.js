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
 * 读取 JSON 文件
 */
function readJSON(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * GET /api/map/overlay?dynasty=song&period=1111
 *
 * 返回指定时期的所有历史疆域叠加层（FeatureCollection）。
 * 从 historical/ 目录读取相应文件并合幵。
 */
router.get('/', (req, res) => {
  const dynasty = req.query.dynasty || 'song';
  const period = req.query.period || '1111';
  
  // 加载索引，确定要读哪些文件
  const periodsPath = path.join(HISTORICAL_DIR, 'periods.json');
  const periodsIndex = readJSON(periodsPath);
  
  if (!periodsIndex) {
    return res.json({
      type: 'FeatureCollection',
      features: [],
      _note: '索引文件未找到'
    });
  }

  // 查找匹配的 period
  const periodId = `song-${period}`;
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

  // 读取所有文件并合并 features
  const allFeatures = [];

  periodDef.files.forEach(filename => {
    const filePath = path.join(HISTORICAL_DIR, filename);
    const data = readJSON(filePath);
    if (!data || !data.features) return;

    data.features.forEach(feat => {
      const props = feat.properties || {};
      // 优先用 feature 自带值，其次查 entities 配色表，最后用中性灰兜底
      const fallback = entityStyle[props.entity] || {};
      feat.properties = {
        ...props,
        // 回退用通用名而不是文件名：避免图例里出现 "regimes-1100.json"
        entity: props.entity || '未知政权',
        color: props.color || fallback.color || '#888888',
        fillOpacity: props.fillOpacity !== undefined ? props.fillOpacity : 0.35,
      };
      allFeatures.push(feat);
    });
  });

  res.json({
    type: 'FeatureCollection',
    features: allFeatures,
    properties: {
      period: periodDef.label,
      year: periodDef.year,
      _periodId: periodDef.id
    }
  });
});

/**
 * GET /api/map/overlay/periods
 * 返回可用时期列表
 */
router.get('/periods', (_req, res) => {
  const periodsPath = path.join(HISTORICAL_DIR, 'periods.json');
  const data = readJSON(periodsPath);
  
  if (!data) {
    return res.json({ periods: [] });
  }
  
  res.json(data.periods);
});

export default router;
