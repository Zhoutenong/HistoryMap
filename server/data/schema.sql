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
  category    TEXT NOT NULL DEFAULT 'era',  -- 事件分类：era 时代格局 / figure 名人轨迹 / military 军事·领土 / economy 经济变革 / invention 重要发明
  source      TEXT NOT NULL DEFAULT '',  -- 史料来源（P4 考据感：详情面板「资料来源」栏）
  confidence  TEXT NOT NULL DEFAULT 'medium',  -- 置信度：high 史有明文 / medium 综合整理
  license     TEXT NOT NULL DEFAULT '公版古籍'   -- 来源许可（古籍均为公版）
);

CREATE INDEX IF NOT EXISTS idx_events_dynasty_year
  ON events(dynasty_id, year);

CREATE INDEX IF NOT EXISTS idx_events_category
  ON events(dynasty_id, category);

-- 人物（P1 内容加深）：人物轨迹 + 事件关联。
-- 身份为 (dynasty_id, name)（同朝代内人名唯一；跨朝代重名允许）。
CREATE TABLE IF NOT EXISTS persons (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  dynasty_id  TEXT NOT NULL REFERENCES dynasties(id),
  name        TEXT NOT NULL,             -- 姓名（如「赵匡胤」）
  title       TEXT NOT NULL DEFAULT '',  -- 身份/头衔（如「宋太祖·开国皇帝」）
  birth_year  INTEGER,                   -- 生年（可空，史实不详留 NULL）
  death_year  INTEGER,                   -- 卒年（可空）
  note        TEXT NOT NULL DEFAULT ''   -- 简介
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_persons_identity
  ON persons(dynasty_id, name);

-- 事件 ↔ 人物 关联：role = lead 主导 / involved 牵连
CREATE TABLE IF NOT EXISTS event_person (
  event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  person_id   INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'involved' CHECK (role IN ('lead', 'involved')),
  PRIMARY KEY (event_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_event_person_person
  ON event_person(person_id);
