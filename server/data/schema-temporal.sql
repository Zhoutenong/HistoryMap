-- ============================================================
-- 宋代时空数据库 schema（PostgreSQL + PostGIS）
-- 目标：逐实体时间版本化（valid_from/valid_to 生命周期）+ 史料 Source + Confidence
-- 执行：psql -f server/data/schema-temporal.sql
-- ============================================================

-- PostGIS 扩展（需 PG 安装 PostGIS 组件）
CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------- 史料源 ----------
CREATE TABLE IF NOT EXISTS sources (
  id       TEXT PRIMARY KEY,          -- 'jiuyuzhi' / 'yudi-guangji' / 'songshi-dili'
  title    TEXT NOT NULL,             -- 元丰九域志 / 舆地广记 / 宋史·地理志
  juan     TEXT,                      -- 卷次/范围
  edition  TEXT,                      -- 版本（四库全书本等）
  url      TEXT,
  license  TEXT
);

-- ---------- 历史实体（稳定身份，跨时间版本） ----------
CREATE TABLE IF NOT EXISTS places (
  id            TEXT PRIMARY KEY,     -- 'song-kaifengfu'
  name          TEXT NOT NULL,        -- 通名（简体）
  name_variants TEXT[] DEFAULT '{}',  -- 异写（九域志/舆地广记/宋史用字差异）
  type          TEXT NOT NULL,        -- route / prefecture / county / capital
  dynasty       TEXT NOT NULL DEFAULT 'song',
  route         TEXT,                 -- 所属路（元丰路名）
  parent_id     TEXT REFERENCES places(id),
  confidence    REAL NOT NULL DEFAULT 0.5,
  source_ids    TEXT[] DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_places_name ON places(name);
CREATE INDEX IF NOT EXISTS idx_places_type ON places(type);

-- ---------- 时间版本（生命周期区间 + 几何） ----------
CREATE TABLE IF NOT EXISTS place_versions (
  id           SERIAL PRIMARY KEY,
  place_id     TEXT NOT NULL REFERENCES places(id),
  valid_from   INTEGER NOT NULL,      -- 生命周期起点（公历）
  valid_to     INTEGER,               -- 终点；NULL = 宋亡（1279）仍存/未知
  name_at_time TEXT,                  -- 该区间内名称（如 澶州 → 开德府）
  geom         GEOMETRY,              -- PostGIS：Point 治所 / Polygon 州府面（Voronoi 近似）
  confidence   REAL NOT NULL DEFAULT 0.5,
  source_ids   TEXT[] DEFAULT '{}',
  note         TEXT
);
CREATE INDEX IF NOT EXISTS idx_versions_place ON place_versions(place_id);
CREATE INDEX IF NOT EXISTS idx_versions_time ON place_versions(valid_from, valid_to);
CREATE INDEX IF NOT EXISTS idx_versions_geom ON place_versions USING GIST (geom);

-- ---------- 变更事件（版本推导依据，可溯源） ----------
CREATE TABLE IF NOT EXISTS place_events (
  id           SERIAL PRIMARY KEY,
  place_id     TEXT NOT NULL REFERENCES places(id),
  year         INTEGER,               -- 事件年份；NULL = 无年份记载（year_approx）
  year_approx  BOOLEAN NOT NULL DEFAULT false,
  event_type   TEXT NOT NULL,         -- 升格/降格/废州/省并/新置/析置/改名/改隶/复置/徙治/割隶
  detail       TEXT,                  -- 原文摘录（可溯源）
  source_id    TEXT REFERENCES sources(id),
  confidence   REAL NOT NULL DEFAULT 0.5
);
CREATE INDEX IF NOT EXISTS idx_events_place ON place_events(place_id);
CREATE INDEX IF NOT EXISTS idx_events_year ON place_events(year);

-- 版本不重叠约束（同一实体时间区间不得交叉）
CREATE OR REPLACE FUNCTION check_version_overlap() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM place_versions v
    WHERE v.place_id = NEW.place_id AND v.id <> NEW.id
      AND v.valid_from <= COALESCE(NEW.valid_to, 9999)
      AND COALESCE(v.valid_to, 9999) >= NEW.valid_from
  ) THEN
    RAISE EXCEPTION '版本区间重叠: % (%-% vs 已有)', NEW.place_id, NEW.valid_from, NEW.valid_to;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_version_overlap ON place_versions;
CREATE TRIGGER trg_version_overlap
  BEFORE INSERT OR UPDATE ON place_versions
  FOR EACH ROW EXECUTE FUNCTION check_version_overlap();
