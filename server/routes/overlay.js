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
 * 时期对应表：年份 → period id
 */
function getPeriodForYear(year) {
  if (year < 960) return null;
  if (year < 979) return 'song-960';
  if (year < 1127) return 'song-1111';   // 北宋稳定期
  if (year < 1234) return 'song-1142';   // 南宋·绍兴和议
  if (year < 1276) return 'song-1142';   // 继续宋金对峙（蒙古崛起中）
  return 'song-1142';                     // 最后阶段
}

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

  // 读取所有文件并合并 features
  const allFeatures = [];
  
  periodDef.files.forEach(filename => {
    const filePath = path.join(HISTORICAL_DIR, filename);
    const data = readJSON(filePath);
    if (!data || !data.features) return;

    // 从文件的 properties 获取颜色/不透明度
    const fcProps = data.properties || {};
    const defaultColor = fcProps.color || '#ffffff';
    const defaultOpacity = fcProps.fillOpacity !== undefined ? fcProps.fillOpacity : 0.3;
    const entityName = fcProps.name || filename;

    data.features.forEach(feat => {
      // 给每个 feature 注入渲染属性
      feat.properties = {
        ...feat.properties,
        entity: entityName,
        color: feat.properties.color || defaultColor,
        fillOpacity: feat.properties.fillOpacity !== undefined 
          ? feat.properties.fillOpacity : defaultOpacity,
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
