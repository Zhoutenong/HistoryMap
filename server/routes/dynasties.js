import { Router } from 'express';
import { all } from '../db.js';

const router = Router();

/**
 * GET /api/dynasties
 * 返回全部朝代列表（供前端顶栏朝代下拉）。
 * 新朝代只需在 data/seed/ 加 02-xxx.sql，此接口自动出现。
 */
router.get('/', async (_req, res) => {
  try {
    const rows = await all('SELECT id, name, start_year, end_year FROM dynasties ORDER BY start_year ASC');
    res.json(rows.map((r) => ({
      id: r.id,
      name: r.name,
      startYear: r.start_year,
      endYear: r.end_year,
    })));
  } catch (err) {
    console.error('[dynasties] 查询失败:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

export default router;
