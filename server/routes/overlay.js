import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildOverlayResponse, buildAllPeriodsOverlay } from '../data/geo/historical/overlay-merge.js';
import { getPeriodsIndex } from '../data/geo/historical/periods.js';

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 历史边界数据目录
const HISTORICAL_DIR = path.join(__dirname, '..', 'data', 'geo', 'historical');

/**
 * 带 mtime 校验的 JSON 文件缓存：
 * 首次读取后缓存解析结果；文件 mtime 变化（开发期改数据）时自动重读。
 * 下游只读缓存对象（不得就地修改），buildOverlayResponse 每次构造新对象。
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
    // 文件损坏：清除缓存，返回 null（合并层按空数据处理）
    fileCache.delete(filePath);
    return null;
  }
}

/**
 * 结果级缓存（A3）：`${dynasty}-${period}` -> { body, stamps }。
 * 命中时不再重跑过滤/合并/注入（州府 287 面 + 辅助层的每请求全量合并曾是热点）；
 * stamps 记录构建时实际读过的文件 mtime，请求时重 stat 比对——文件变动
 * （开发期改数据）后首次请求自动重建，保住旧「改数据即时生效」语义。
 * stat 几个文件远廉于全量合并，兼顾缓存与新鲜度。
 */
const overlayCache = new Map();
let cacheStats = { hits: 0, misses: 0 };

function stampOf(filePath, stamps) {
  try {
    stamps.push({ filePath, mtimeMs: fs.statSync(filePath).mtimeMs });
  } catch {
    // 文件缺失（readCachedJSON 返回 null）：无需失效戳，重建时同样读不到
  }
}

function buildWithCache(dynasty, period) {
  const cacheKey = `${dynasty}-${period}`;
  const hit = overlayCache.get(cacheKey);
  if (hit && !hit.stamps.some(({ filePath, mtimeMs }) => {
    try { return fs.statSync(filePath).mtimeMs !== mtimeMs; } catch { return true; }
  })) {
    cacheStats.hits += 1;
    return hit.body;
  }
  cacheStats.misses += 1;
  if (process.env.OVERLAY_CACHE_DEBUG) {
    console.log(`[overlay-cache] miss/rebuild key=${cacheKey} hits=${cacheStats.hits} misses=${cacheStats.misses}`);
  }

  const stamps = [];
  const readHistorical = (filename) => {
    const filePath = path.join(HISTORICAL_DIR, filename);
    const data = readCachedJSON(filePath);
    stampOf(filePath, stamps);
    return data;
  };
  // periods.json 走共享单例（meta 路由与本路由同源，mtime 失效自动重读）
  const periodsIndex = getPeriodsIndex();
  stampOf(path.join(HISTORICAL_DIR, 'periods.json'), stamps);

  const body = buildOverlayResponse({ periodsIndex, dynasty, period, readFile: readHistorical });
  overlayCache.set(cacheKey, { body, stamps });
  return body;
}

/**
 * GET /api/map/overlay/all?year=1111
 * 全时期模式（P2）：给定年份返回当时全部政权疆域（宋/辽/西夏/金/吐蕃等同屏）。
 * 与 / 共用文件级缓存与「构建期文件戳」失效机制；按年结果级缓存。
 * properties._range 为命中集合稳定的年份区间，年份未出区间时前端无需重取。
 */
router.get('/all', (req, res) => {
  const year = Number.parseInt(req.query.year, 10);
  if (!Number.isFinite(year)) {
    return res.status(400).json({ error: '需要合法 year 参数' });
  }
  const cacheKey = `all-${year}`;
  const hit = overlayCache.get(cacheKey);
  if (hit && !hit.stamps.some(({ filePath, mtimeMs }) => {
    try { return fs.statSync(filePath).mtimeMs !== mtimeMs; } catch { return true; }
  })) {
    cacheStats.hits += 1;
    return finish(res, hit.body);
  }
  cacheStats.misses += 1;
  if (process.env.OVERLAY_CACHE_DEBUG) {
    console.log(`[overlay-cache] miss/rebuild key=${cacheKey} hits=${cacheStats.hits} misses=${cacheStats.misses}`);
  }

  const stamps = [];
  const readHistorical = (filename) => {
    const filePath = path.join(HISTORICAL_DIR, filename);
    const data = readCachedJSON(filePath);
    stampOf(filePath, stamps);
    return data;
  };
  const periodsIndex = getPeriodsIndex();
  stampOf(path.join(HISTORICAL_DIR, 'periods.json'), stamps);

  const body = buildAllPeriodsOverlay({ periodsIndex, year, readFile: readHistorical });
  overlayCache.set(cacheKey, { body, stamps });
  finish(res, body);
});

function finish(res, body) {
  res.set('Cache-Control', 'public, max-age=60');
  res.json(body);
}

/**
 * GET /api/map/overlay
 * 返回指定时期的所有历史疆域叠加层（FeatureCollection）。
 * 合并逻辑在 ../data/geo/historical/overlay-merge.js（纯函数，双端 golden 契约入口）。
 */
router.get('/', (req, res) => {
  const dynasty = req.query.dynasty || 'song';
  const period = req.query.period || '1111';
  const body = buildWithCache(dynasty, period);
  res.set('Cache-Control', 'public, max-age=60');
  res.json(body);
});

/**
 * GET /api/map/overlay/periods
 * 返回可用时期列表（含缓存命中计数，?stats=1 时返回 cacheStats 供 A3 验收打点）
 */
router.get('/periods', (req, res) => {
  if (req.query.stats === '1') {
    return res.json(cacheStats);
  }
  const data = getPeriodsIndex();

  if (!data) {
    return res.json({ periods: [] });
  }

  res.json(data.periods);
});

export default router;
