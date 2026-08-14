/**
 * 时空实体查询路由：GET /api/places
 *
 * - GET /api/places?song&year=1100&type=prefecture&name=陈留&route=京畿路
 *   查询指定年份有效的实体版本：
 *   [{ id, name, nameAtTime, type, validFrom, validTo, geometry(GeoJSON),
 *      sources:[{id,title,juan}], confidence, route }]
 * - GET /api/places/:id       实体详情（全部版本 + 事件时间线）
 * - GET /api/places/sources   史料源清单
 *
 * 数据契约对齐「宋代时空数据库」设计（valid_from/valid_to + geometry + sources + confidence）。
 * 时空库未启用（DATABASE_URL 未配置）时返回 503，不影响其他 API。
 */
import { Router } from 'express';
import { getPool, isTemporalDbReady, geometryToGeoJSON } from '../db-pg.js';

const router = Router();

/** 实体版本查询（year 过滤 + type/name/route 筛选） */
async function queryVersions({ year, type, name, route }) {
  const pool = getPool();
  const conditions = [];
  const params = [];
  if (year !== undefined) {
    params.push(Number(year));
    conditions.push(`v.valid_from <= $${params.length} AND (v.valid_to IS NULL OR v.valid_to >= $${params.length})`);
  }
  if (type) {
    params.push(type);
    conditions.push(`p.type = $${params.length}`);
  }
  if (name) {
    params.push(`%${name}%`);
    conditions.push(`p.name LIKE $${params.length}`);
  }
  if (route) {
    params.push(route);
    conditions.push(`p.route = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `
    SELECT p.id, p.name, p.type, p.route, p.confidence AS place_confidence, p.source_ids,
           v.valid_from, v.valid_to, v.name_at_time, v.confidence AS version_confidence, v.note,
           ST_AsGeoJSON(v.geom) AS geom_json
    FROM place_versions v
    JOIN places p ON p.id = v.place_id
    ${where}
    ORDER BY p.name, v.valid_from
    LIMIT 500`;
  const { rows } = await pool.query(sql, params);
  return rows;
}

/** 实体详情（全部版本 + 事件时间线） */
async function queryPlaceDetail(id) {
  const pool = getPool();
  const place = await pool.query(
    'SELECT id, name, name_variants, type, dynasty, route, parent_id, confidence, source_ids FROM places WHERE id = $1',
    [id],
  );
  if (place.rows.length === 0) return null;
  const versions = await pool.query(
    `SELECT valid_from, valid_to, name_at_time, confidence, note, ST_AsGeoJSON(geom) AS geom_json
     FROM place_versions WHERE place_id = $1 ORDER BY valid_from`,
    [id],
  );
  const events = await pool.query(
    `SELECT e.year, e.year_approx, e.event_type, e.detail, e.confidence, s.title AS source_title
     FROM place_events e LEFT JOIN sources s ON s.id = e.source_id
     WHERE e.place_id = $1 ORDER BY e.year NULLS LAST`,
    [id],
  );
  const sources = await pool.query(
    'SELECT id, title, juan, url FROM sources WHERE id = ANY($1)',
    [place.rows[0].source_ids || []],
  );
  return { ...place.rows[0], versions: versions.rows, events: events.rows, sources: sources.rows };
}

router.get('/sources', async (_req, res) => {
  const ready = await isTemporalDbReady();
  if (!ready.ok) return res.status(503).json({ error: '时空库未启用', reason: ready.reason });
  try {
    const { rows } = await getPool().query('SELECT id, title, juan, edition, url, license FROM sources ORDER BY id');
    res.json(rows);
  } catch (err) {
    console.error('[places] /sources 查询失败:', err.message);
    res.status(500).json({ error: '查询失败' });
  }
});

router.get('/:id', async (req, res) => {
  const ready = await isTemporalDbReady();
  if (!ready.ok) return res.status(503).json({ error: '时空库未启用', reason: ready.reason });
  try {
    const detail = await queryPlaceDetail(req.params.id);
    if (!detail) return res.status(404).json({ error: `实体不存在: ${req.params.id}` });
    res.json({
      id: detail.id,
      name: detail.name,
      nameVariants: detail.name_variants || [],
      type: detail.type,
      dynasty: detail.dynasty,
      route: detail.route,
      parentId: detail.parent_id,
      confidence: detail.confidence,
      sources: detail.sources,
      versions: detail.versions.map((v) => ({
        validFrom: v.valid_from,
        validTo: v.valid_to,
        nameAtTime: v.name_at_time,
        confidence: v.confidence,
        note: v.note,
        geometry: geometryToGeoJSON(v.geom_json),
      })),
      events: detail.events.map((e) => ({
        year: e.year,
        yearApprox: e.year_approx,
        eventType: e.event_type,
        detail: e.detail,
        confidence: e.confidence,
        source: e.source_title,
      })),
    });
  } catch (err) {
    console.error(`[places] /${req.params.id} 查询失败:`, err.message);
    res.status(500).json({ error: '查询失败' });
  }
});

router.get('/', async (req, res) => {
  const ready = await isTemporalDbReady();
  if (!ready.ok) return res.status(503).json({ error: '时空库未启用', reason: ready.reason });
  try {
    const { year, type, name, route } = req.query;
    const rows = await queryVersions({
      year: year !== undefined ? Number(year) : undefined,
      type,
      name,
      route,
    });
    res.json(rows.map((r) => ({
      id: r.id,
      name: r.name,
      nameAtTime: r.name_at_time,
      type: r.type,
      route: r.route,
      validFrom: r.valid_from,
      validTo: r.valid_to,
      geometry: geometryToGeoJSON(r.geom_json),
      confidence: r.version_confidence ?? r.place_confidence,
      note: r.note,
      sources: r.source_ids || [],
    })));
  } catch (err) {
    console.error('[places] 查询失败:', err.message);
    res.status(500).json({ error: '查询失败' });
  }
});

export default router;
