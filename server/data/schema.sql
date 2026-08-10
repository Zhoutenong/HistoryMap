-- HistoryMap 数据库 schema
-- 设计要点：
--   1. dynasties 表存朝代元信息（id 作为外键，前端按 id 查）
--   2. events 表存事件，coord 拆成 lng/lat 两列便于按地理范围查询
--   3. 索引覆盖最常见查询：按朝代 + 年份
--   4. 全部 IF NOT EXISTS，保证启动幂等

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     INTEGER PRIMARY KEY,
  applied_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dynasties (
  id          TEXT PRIMARY KEY,        -- 'song'，API 用的 dynasty 参数
  name        TEXT NOT NULL,           -- '宋朝'
  start_year  INTEGER NOT NULL,        -- 建国年
  end_year    INTEGER NOT NULL         -- 覆灭年
);

CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  dynasty_id  TEXT NOT NULL REFERENCES dynasties(id),
  year        INTEGER NOT NULL,        -- 事件起始年（公历整数）
  year_end    INTEGER NOT NULL,        -- 事件结束年，泡泡在 [year, year_end] 窗口内显示
  lng         REAL NOT NULL,           -- 经度（与 GeoJSON 一致，经度在前）
  lat         REAL NOT NULL,           -- 纬度
  short       TEXT NOT NULL,           -- 简称（显示在泡泡上）
  title       TEXT NOT NULL,           -- 详情面板标题
  detail      TEXT NOT NULL,           -- 详情正文
  impact      TEXT NOT NULL DEFAULT '', -- 事件影响（详情面板「影响」栏，可为空）
  place       TEXT NOT NULL DEFAULT '', -- 事件地点（详情面板「地点」徽章，如「陈桥驿·开封」）
  category    TEXT NOT NULL DEFAULT 'era'  -- 事件分类：era 时代格局 / figure 名人轨迹 / military 军事·领土 / economy 经济变革 / invention 重要发明
);

CREATE INDEX IF NOT EXISTS idx_events_dynasty_year
  ON events(dynasty_id, year);

CREATE INDEX IF NOT EXISTS idx_events_category
  ON events(dynasty_id, category);
