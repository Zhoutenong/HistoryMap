import { Router } from 'express';
import { all } from '../db.js';

const router = Router();

/**
 * GET /api/events?dynasty=song[&category=era,military]
 * 返回该朝代全部事件。前端自行按 year/year_end 时间窗口过滤显隐。
 * coord 字段输出为 [lng, lat]（与 GeoJSON 一致，AGENTS.md 坐标约定）。
 * category 为可选过滤，逗号分隔多分类；不传则返回全部（前端做组合过滤更顺）。
 */
router.get('/', async (req, res) => {
  const dynasty = req.query.dynasty || 'song';
  const categoryParam = req.query.category;
  try {
    let sql = `SELECT id, dynasty_id, year, year_end, lng, lat, short, title, detail, category
               FROM events WHERE dynasty_id = ?`;
    const params = [dynasty];
    if (categoryParam) {
      const cats = String(categoryParam).split(',').map((s) => s.trim()).filter(Boolean);
      if (cats.length > 0) {
        sql += ` AND category IN (${cats.map(() => '?').join(',')})`;
        params.push(...cats);
      }
    }
    sql += ' ORDER BY year ASC';
    const rows = await all(sql, params);
    res.json(rows.map((r) => ({
      id: r.id,
      dynasty: r.dynasty_id,
      year: r.year,
      yearEnd: r.year_end,
      coord: [r.lng, r.lat],
      short: r.short,
      title: r.title,
      detail: r.detail,
      category: r.category
    })));
  } catch (err) {
    console.error('[events] 查询失败:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

export default router;
