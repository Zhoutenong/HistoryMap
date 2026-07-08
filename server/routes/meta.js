import { Router } from 'express';
import { all } from '../db.js';

const router = Router();

/**
 * GET /api/meta?dynasty=song
 * 返回朝代元信息（起止年），供前端 Timeline 初始化用。
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
    res.json({
      dynasty: row.id,
      name: row.name,
      startYear: row.start_year,
      endYear: row.end_year
    });
  } catch (err) {
    console.error('[meta] 查询失败:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

export default router;
