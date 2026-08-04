import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { all } from '../db.js';

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 历史边界数据目录（与 overlay 路由共用）
const HISTORICAL_DIR = path.join(__dirname, '..', 'data', 'geo', 'historical');

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

    // 时期边界：读 periods.json，id 去掉朝代前缀后返回给前端
    let periods = [];
    try {
      const indexPath = path.join(HISTORICAL_DIR, 'periods.json');
      const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      periods = (index.periods || [])
        .filter((p) => p.start !== undefined && p.end !== undefined)
        .map((p) => ({
          id: p.id.replace(`${dynasty}-`, ''),
          label: p.label,
          start: p.start,
          end: p.end
        }));
    } catch {
      // periods.json 缺失/损坏时返回空列表，前端回退到默认时期
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
