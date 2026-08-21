import { Router } from 'express';
import { all } from '../db.js';
import { getPeriodsIndex } from '../data/geo/historical/periods.js';

const router = Router();

/**
 * GET /api/meta?dynasty=song
 * 返回朝代元信息（起止年 + 时期边界列表）。
 * 时期边界来自 periods.json（数据驱动），前端不写死 960/1127。
 */
router.get('/', async (req, res) => {
  const dynasty = req.query.dynasty || 'song';
  try {
    const rows = await all(
      'SELECT id, name, start_year, end_year FROM dynasties WHERE id = ?',
      [dynasty]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: `未知朝代: ${dynasty}` });
      return;
    }
    const row = rows[0];

    // 时期边界：读 periods.json（共享单例，与 overlay 路由同源），
    // id 去掉朝代前缀后返回给前端
    let periods = [];
    const index = getPeriodsIndex();
    if (index) {
      periods = (index.periods || [])
        .filter((p) => p.id.startsWith(`${dynasty}-`))
        .filter((p) => p.start !== undefined && p.end !== undefined)
        .map((p) => ({
          id: p.id.replace(`${dynasty}-`, ''),
          label: p.label,
          start: p.start,
          end: p.end
        }));
    }

    res.json({
      dynasty: row.id,
      name: row.name,
      startYear: row.start_year,
      endYear: row.end_year,
      periods
    });
  } catch (err) {
    console.error('[meta] 查询失败:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

export default router;
