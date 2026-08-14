/**
 * 时空数据库连接（PostgreSQL + PostGIS）。
 * 与 SQLite（events/dynasties）平行：本模块只服务 /api/places 时空实体查询。
 * 连接信息来自 server/.env 的 DATABASE_URL；未配置或连接失败时
 * 各路由返回 503（不影响 SQLite 功能）。
 */
import 'dotenv/config';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

/** 惰性连接池（首次查询时建立） */
let pool = null;
let poolError = null;

export function getPool() {
  if (pool) return pool;
  if (!DATABASE_URL) {
    poolError = 'DATABASE_URL 未配置（server/.env）——时空库未启用，/api/places 返回 503';
    return null;
  }
  try {
    pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });
    pool.on('error', (err) => {
      console.error('[db-pg] 连接池错误:', err.message);
    });
    return pool;
  } catch (err) {
    poolError = `PostgreSQL 连接失败: ${err.message}`;
    console.error('[db-pg]', poolError);
    return null;
  }
}

/** 探测时空库是否可用（连接池 + 简单查询） */
export async function isTemporalDbReady() {
  const p = getPool();
  if (!p) return { ok: false, reason: poolError };
  try {
    await p.query('SELECT 1');
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

/** 查询辅助：几何 → GeoJSON（WGS84） */
export const geometryToGeoJSON = (geom) => (geom ? JSON.parse(geom) : null);
