import { Router } from 'express';
import { all } from '../db.js';

const router = Router();

/**
 * GET /api/persons?dynasty=song
 * 朝代人物列表（P1 人物视角）：按关联事件数降序，供前端人物筛选器。
 * 事件对象侧的 relatedPersons 见 /api/events。
 */
router.get('/', async (req, res) => {
  const dynasty = req.query.dynasty || 'song';
  try {
    const rows = await all(
      `SELECT p.id, p.name, p.title, p.birth_year, p.death_year, p.note,
              (SELECT COUNT(*) FROM event_person ep WHERE ep.person_id = p.id) AS event_count
       FROM persons p
       WHERE p.dynasty_id = ?
       ORDER BY event_count DESC, p.id ASC`,
      [dynasty]
    );
    res.json(rows.map((r) => ({
      id: r.id,
      dynasty,
      name: r.name,
      title: r.title || '',
      birthYear: r.birth_year,
      deathYear: r.death_year,
      note: r.note || '',
      eventCount: r.event_count
    })));
  } catch (err) {
    console.error('[persons] 查询失败:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

export default router;
