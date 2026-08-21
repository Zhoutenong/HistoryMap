import { Router } from 'express';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// china.json 放在 server/data/geo/，作为静态资源由本路由直接读出返回。
// 不进 SQLite：大 JSON 进库查询慢、且 AGENTS.md 已写明 GeoJSON 走文件。
const CHINA_GEO_PATH = join(__dirname, '..', 'data', 'geo', 'china.json');

const router = Router();

// 内存缓存（A3）：启动后首次请求读盘并缓存正文与 ETag，后续请求不再读盘；
// 文件 mtime 变化（开发期换底图）时自动重读。
let cache = null; // { mtimeMs, text, etag }

function getChinaGeo() {
  let stat;
  try {
    stat = statSync(CHINA_GEO_PATH);
  } catch {
    cache = null;
    return null;
  }
  if (cache && cache.mtimeMs === stat.mtimeMs) return cache;
  const text = readFileSync(CHINA_GEO_PATH, 'utf8');
  const etag = `"${createHash('md5').update(text).digest('hex')}"`;
  cache = { mtimeMs: stat.mtimeMs, text, etag };
  return cache;
}

/**
 * GET /api/map
 * 返回基础中国地图 GeoJSON（现代省级边界）。
 * 朝代历史疆域变化请用 /api/map/overlay 叠加，本接口恒返回现代边界。
 */
router.get('/', (req, res) => {
  const geo = getChinaGeo();
  if (!geo) {
    res.status(500).json({ error: 'china.json 读取失败' });
    return;
  }
  if (req.get('if-none-match') === geo.etag) {
    res.status(304).end();
    return;
  }
  res.set('ETag', geo.etag).set('Cache-Control', 'public, max-age=60')
    .type('application/json').send(geo.text);
});

export default router;
