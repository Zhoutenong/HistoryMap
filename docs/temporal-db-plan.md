# 宋代时空数据库实施记录（PostgreSQL + PostGIS）

> 状态：已实施（2026-08-14）。与 `docs/data-improvement-plan.md`（州府级数据管线）为姊妹篇：
> 前者是渲染数据（单时点快照 + Voronoi 面），本文是**时间版本化时空库**（逐实体生命周期）。

## 一、目标与设计

把「单时点州府快照」升级为逐实体时间版本化的时空数据库：
每实体带 `valid_from/valid_to` 生命周期、PostGIS 几何、结构化史料 Source、数值化 Confidence，
API 直供 Web 与 Android（`GET /api/places`）。

```json
{
  "id": "song-拱州",
  "name": "拱州",
  "type": "prefecture",
  "validFrom": 1114, "validTo": null,
  "geometry": { "type": "Polygon", ... },
  "sources": ["songshi-dili"],
  "confidence": 0.3
}
```

## 二、部署（本机）

| 组件 | 版本 | 说明 |
|---|---|---|
| PostgreSQL | 16.4（zip 免安装，`C:/pg16`） | initdb 数据目录 `C:/pgdata`，端口 5432，超级用户 postgres（trust） |
| PostGIS | 3.6.2（bundle zip 拷贝扩展 + 依赖 dll 到 C:/pg16） | `CREATE EXTENSION postgis` |
| 数据库 | `historymap` | `server/data/schema-temporal.sql` 建表 |

启动：`C:/pg16/bin/pg_ctl.exe -D C:/pgdata -l C:/pgdata/server.log -o "-p 5432" start`
连接：`server/.env` → `DATABASE_URL=postgres://postgres@localhost:5432/historymap`

## 三、Schema（四表）

```sql
sources(id, title, juan, edition, url, license)               -- 史料源
places(id, name, name_variants[], type, dynasty, route,       -- 实体稳定身份
       parent_id, confidence, source_ids[])
place_versions(id, place_id, valid_from, valid_to,            -- 生命周期区间 + 几何
       name_at_time, geom GEOMETRY, confidence, source_ids[], note)
  + GIST (geom) + (valid_from, valid_to) + 版本不重叠 trigger
place_events(id, place_id, year, year_approx, event_type,     -- 变更事件（可溯源）
       detail 原文摘录, source_id, confidence)
```

版本语义：`valid_to NULL` = 宋亡（1279）仍存或未知；`year_approx` = 无年份记载（如「寻复立」）。

## 四、数据管线（npm scripts）

```bash
npm run data:classics        # ① 元丰九域志（1080 快照）+ 舆地广记（fullEvolution 沿革全文）
npm run data:songshi         # ② 宋史·地理志（ctext 6 章，224 州府）+ 变更事件提取（1107 事件）
npm run data:seats           # ③ 治所坐标（CHGIS TGaz + 人工标定）
npm run data:prefectures     # ④ Voronoi 州府面（渲染层，含 CHGIS 派生坐标 gitignore）
npm run data:temporal        # ⑤ 三源合并 → 时空库写入 PG（需 DATABASE_URL）
npm run data:temporal:check  # ⑥ 时间线一致性校验（区间合法/不重叠/1080 全覆盖/年份合理）
```

数据流：三源（九域志快照 + 舆地广记北宋沿革 + 宋史南宋沿革）→ 变更事件（年号表 57 个 + 动作词规则）
→ 逐州府生命周期切分（升府/废州/新置/复置/改名）→ PG upsert。

### 关键规则（经验沉淀）

- **年号→公历**：`起始年 + N - 1`（建隆 960 … 祥兴 1278），「元年」= 起始年
- **事件归属**：detail 形如「废X州/增置X军」且 X ≠ 当前州 → 事件属于 X（targetOther，不切分当前州）
- **县级甄别**：废州/省并宾语须为「X州/府/军/监」（`^废X州` 正则）；新置 detail 含 县/镇/寨/砦/监/堡/关/城/使/帅府/乡/筑 → 县级或职能机构
- **军额 vs 政区**：「升X军节度/改为X军/军废/并为军」是等级/军额变化，不切分生命周期
- **短 detail（<3 字）**：上下文丢失（单字「废」），不切分
- **快照优先**：九域志（1080）有载的州府，事件切分不覆盖 1080 时合并为 [960, 宋亡]（当代记录优先于后世沿革叙述），warning 记录供人工裁决
- **手工补录**：宋史无独立条目但叙述中有完整生命周期的实体（如拱州：1105 建→1110 废→1114 复→1120 罢辅）手工补进 `songshi-dili.json`

## 五、API（`GET /api/places`）

| 端点 | 说明 |
|---|---|
| `GET /api/places?year=1100&type=prefecture&name=&route=` | 按年份查有效版本（valid_from<=year<=valid_to），返回 geometry(GeoJSON)/sources/confidence |
| `GET /api/places/:id` | 实体详情：全部时间版本 + 事件时间线 + 史料源 |
| `GET /api/places/sources` | 史料源清单 |

时空库未启用（DATABASE_URL 未配置）时返回 503，**不影响** SQLite 的 overlay/events 等既有 API。
前端 `client/src/api.js` 新增 `getPlaces/getPlace/getPlaceSources`；州府详情面板异步加载
生命周期/史料/置信度（时空库 503 时静默降级，保留基础详情）。

## 六、当前数据规模（2026-08-14）

| 指标 | 值 |
|---|---|
| 实体（州府） | 332（九域志 290 + 宋史独有 42，如拱州/延安府/袭庆府/恭州/叙州） |
| 时间版本 | 380（多版本实体 42 个——有升府/废复/改名生命周期） |
| 变更事件 | 1088（舆地广记 93 + 宋史 995；12 种类型） |
| 几何覆盖 | 319/380（83.9%）——州府面 Voronoi 近似（confidence 0.35）/ 治所点精确（0.9） |
| 1080 快照覆盖 | 全部 290 九域志州府 ✓ |

## 七、校验（data:temporal:check）

- 版本区间合法（valid_from <= valid_to）
- 版本不重叠（schema trigger + 校验双保险）
- 1080 年命中全部九域志州府（快照优先保证）
- 事件年份 960-1279 内
- 已知 2 条史料差异（渭州/河州：宋史称崇宁/政和升置 vs 九域志 1080 有载）——快照优先已合并，warning 记录

## 八、扩展期（预留）

- **县级生命周期**（1135 县）：变更记载稀疏，需《宋会要辑稿·方域》（维基文库卷097-105 部分可用）与《文献通考·舆地考》（ctext 卷315-323）补充
- **实体改名映射**：延州→延安府 等同一实体多身份的版本 name_at_time 精化
- **LLM 校对**：extract-place-events 的 `--llm-review` 开关（需 LLM_API_KEY）对低置信事件人工审核
- **Android 消费**：places API 的 Android 网络层（现 Android 全离线走 assets）
- **辽/金/元/唐**：复用管线（古籍源换《辽史·地理志》《金史·地理志》等）
