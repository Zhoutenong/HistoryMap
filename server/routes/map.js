import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// china.json 放在 server/data/geo/，作为静态资源由本路由直接读出返回。
// 不进 SQLite：大 JSON 进库查询慢、且 AGENTS.md 已写明 GeoJSON 走文件。
const CHINA_GEO_PATH = join(__dirname, '..', 'data', 'geo', 'china.json');

const router = Router();

/**
 * GET /api/map
 * 返回基础中国地图 GeoJSON（现代省级边界）。
 * 朝代历史疆域变化请用 /api/map/overlay 叠加，本接口恒返回现代边界。
 */
router.get('/', (_req, res) => {
  const geo = readFileSync(CHINA_GEO_PATH, 'utf8');
  res.type('application/json').send(geo);
});

export default router;
