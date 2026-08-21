import { Router } from 'express';
import { all } from '../db.js';

const router = Router();

/**
 * GET /api/events?dynasty=song[&category=era,military]
 * 返回该朝代全部事件。前端自行按 year/year_end 时间窗口过滤显隐。
 * coord 字段输出为 [lng, lat]（与 GeoJSON 一致，AGENTS.md 坐标约定）。
 * category 为可选过滤，逗号分隔多分类；不传则返回全部（前端做组合过滤更顺）。
 *
 * relatedPersons（P1 人物视角，可选字段，老字段不变）：
 * [{ id, name, title, role }]，role = lead 主导 / involved 牵连。
 * 无关联人物的事件返回空数组（json_group_array 空集为 null，此处归一为 []）。
 */
router.get('/', async (req, res) => {
  const dynasty = req.query.dynasty || 'song';
  const categoryParam = req.query.category;
  try {
    let sql = `SELECT e.id, e.dynasty_id, e.year, e.year_end, e.lng, e.lat, e.short, e.title, e.detail, e.impact, e.place, e.category, e.source, e.confidence, e.license,
                  (SELECT json_group_array(json_object('id', p.id, 'name', p.name, 'title', p.title, 'role', ep.role))
                   FROM event_person ep JOIN persons p ON p.id = ep.person_id
                   WHERE ep.event_id = e.id) AS related_persons
               FROM events e WHERE e.dynasty_id = ?`;
    const params = [dynasty];
    if (categoryParam) {
      const cats = String(categoryParam).split(',').map((s) => s.trim()).filter(Boolean);
      if (cats.length > 0) {
        sql += ` AND e.category IN (${cats.map(() => '?').join(',')})`;
        params.push(...cats);
      }
    }
    sql += ' ORDER BY e.year ASC';
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
      impact: r.impact || '',
      place: r.place || '',
      category: r.category,
      relatedPersons: r.related_persons || [],
      source: r.source || '',
      confidence: r.confidence || 'medium',
      license: r.license || '公版古籍'
    })));
  } catch (err) {
    console.error('[events] 查询失败:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

export default router;
