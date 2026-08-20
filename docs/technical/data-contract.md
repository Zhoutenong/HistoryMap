# HistoryMap 数据契约参考

> 前后端（Web / Android 原生）共同遵守的数据契约。契约平台无关：
> 后端 Express 提供 JSON API，Android 端由 Room + assets 数据 + `OverlayLoader.kt`
> 复刻实现，双端语义一致。修改字段前先改本文档 + 契约校验脚本（`npm run contract`）。

## 1. API 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/map` | 基础中国地图 GeoJSON（现代省界，FeatureCollection） |
| GET | `/api/map/overlay?dynasty=song&period=1111` | 朝代疆域叠加层（按时期返回政权 FeatureCollection） |
| GET | `/api/map/overlay/periods` | 可用时期列表（periods.json 原始数组） |
| GET | `/api/events?dynasty=song[&category=era,military]` | 朝代全部事件（含 `place` 字段；`category` 逗号分隔多分类过滤） |
| GET | `/api/meta?dynasty=song` | 朝代元信息（起止年 + 时期边界） |
| GET | `/api/dynasties` | 全部朝代列表（顶栏下拉数据源，按 start_year 升序） |
| GET | `/api/health` | 健康检查（返回 `{ ok: true }`） |
| GET | `/api/places[?year=&type=&name=&route=]` | 时空库：按年/类型/名称/路查有效版本（**可选**，未启用时 503） |
| GET | `/api/places/:id` | 时空库：实体详情 + 事件时间线（可选） |
| GET | `/api/places/sources` | 时空库：史料源列表（可选） |

## 2. 事件对象

`GET /api/events` 返回事件数组，按 `year` 升序。事件在 `[year, yearEnd]` 时间窗口内显示，过期消失。

```json
{
  "id": 1,
  "dynasty": "song",
  "year": 960,
  "yearEnd": 975,
  "coord": [114.35, 34.52],
  "short": "陈桥兵变",
  "title": "陈桥兵变 · 北宋建立",
  "detail": "后周大将赵匡胤……",
  "impact": "结束五代十国乱局……",
  "place": "陈桥驿·开封",
  "category": "era"
}
```

字段说明：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | number | 事件主键（与 DB 行 id 一致） |
| `dynasty` | string | 朝代 id（如 `song`） |
| `year` / `yearEnd` | number | 事件起止公历年份（年份整数） |
| `coord` | `[number, number]` | **经度在前** `[lng, lat]`，与 GeoJSON 一致 |
| `short` | string | 事件简称（泡泡显示） |
| `title` | string | 事件标题（详情标题） |
| `detail` | string | 事件详述 |
| `impact` | string | 历史影响（可空串） |
| `place` | string | 地点描述（详情地点徽章，如「陈桥驿·开封」） |
| `category` | string | 分类，见下 |

`category` 取值：`era` 时代格局 / `figure` 名人轨迹 / `military` 军事·领土 / `economy` 经济变革 / `invention` 重要发明。

## 3. 朝代与元信息

### 3.1 `GET /api/dynasties`

```json
[{ "id": "song", "name": "宋朝", "startYear": 960, "endYear": 1279 }]
```

### 3.2 `GET /api/meta?dynasty=song`

```json
{
  "dynasty": "song",
  "name": "宋朝",
  "startYear": 960,
  "endYear": 1279,
  "periods": [
    { "id": "1100", "label": "北宋·元丰", "start": 960, "end": 1126 },
    { "id": "1127", "label": "南宋·绍兴", "start": 1127, "end": 1279 }
  ]
}
```

`periods` 来自 `periods.json`（数据驱动），id 已去掉朝代前缀。前端跨过边界时自动重载疆域并弹时期转场横幅。

## 4. 疆域叠加层

### 4.1 `GET /api/map/overlay?dynasty=song&period=1111`

响应为 FeatureCollection，`features` 为各政权面，顶层 `properties` 透传辅助层：

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Polygon", "coordinates": [] },
      "properties": {
        "entity": "北宋",            // 政权名（图例/标签）
        "color": "#c0392b",         // 政权配色
        "fillOpacity": 0.35,        // 填充透明度
        "labelCoord": [114.35, 34.5], // 政权名标签位（人工标定，缺省回落质心）
        "labelMajor": true          // 主叙事政权（字号/墨色更重）
      }
    }
  ],
  "properties": {
    "period": "北宋·元丰",
    "year": 1111,
    "_periodId": "song-1111",
    "rivers": [],          // 河流示意点数组
    "mountains": [],       // 山脉示意点数组
    "cities": [],          // 城市点数组
    "places": [],          // 地点（都城/战场/书院，kind: capital|battlefield|academy）
    "prefectures": [],     // 州府面：完整 Feature 数组（Polygon 保留 geometry）
    "prefectureSeats": []  // 州府治所 legacy 点数组
  }
}
```

关键约定：

- 政权 feature 的 `properties` 由路由层注入默认值（`entity`/`color`/`fillOpacity`/`labelCoord`/`labelMajor`），不覆盖 feature 自带值。
- 辅助层数据源：标准文件（`rivers.geojson`/`mountains.geojson`/`cities.geojson`/`places.geojson`/`prefectures.geojson`/`southern-song-routes.geojson`）优先，缺失时期回落 `periods.json` 旧数组（回落条目需补 `kind` 字段，否则 LOD 准入矩阵走 default 分支）。
- **州府面必须保留完整 Feature**（geometry 供前端画边界）；治所走 legacy 通道（coord 供前端标注）。
- 未知 `kind` 会被安全忽略（不再 500）。

### 4.2 时期索引 `periods.json`

```json
{
  "periods": [
    { "id": "song-1111", "label": "北宋·元丰", "year": 1111, "start": 960, "end": 1126,
      "files": ["regimes-1100.json"], "rivers": [], "mountains": [], "cities": [], "places": [] }
  ],
  "entities": [{ "name": "北宋", "color": "#c0392b" }],
  "labels": { "北宋": [114.35, 34.5] },
  "labelsByPeriod": { "song-1127": { "宋": [113.5, 28] } },
  "labelMajor": ["北宋", "金"]
}
```

`labelCoord` 优先级：feature 自带 > 时期覆写（`labelsByPeriod`）> 全局（`labels`）> null（回落几何质心）。

## 5. 坐标与投影约定

- **经度在前**：所有 `coord` / GeoJSON 坐标均为 `[lng, lat]`。
- 单一投影实例：Web 端 `ChinaMap.js` 导出的 `project([lng, lat])`；Android 端 `Projection.kt`（d3-geo geoMercator + fitSize([1000,800]) 翻译），双端输出一致。
- 投影用历史疆域做 `fitProjection` 标定，即使现代底图隐藏投影仍有效。

## 6. 数据库 Schema

### 6.1 SQLite（运行时主库，`server/history.db`）

- `dynasties`：`id` / `name` / `start_year` / `end_year`
- `events`：`id` / `dynasty_id` / `year` / `year_end` / `lng` / `lat` / `short` / `title` / `detail` / `impact` / `place` / `category`，唯一索引 `(dynasty_id, year, short)`
- `schema_migrations`：版本化迁移表（seed 幂等，`INSERT OR IGNORE`）

建表语句见 `server/data/schema.sql`；Android 端 Room schema 对齐（`HistoryDb.kt`），首次建库重放同源 seed。

### 6.2 PostgreSQL + PostGIS（可选时空库）

- `sources`（史料源）/ `places`（实体稳定身份）/ `place_versions`（valid_from/valid_to 生命周期 + PostGIS geom，版本不重叠 trigger）/ `place_events`（变更事件，可溯源）
- Schema：`server/data/schema-temporal.sql`；未配置 `DATABASE_URL` 时相关 API 返回 503，不影响主流程。

## 7. 数据文件（静态 GeoJSON）

| 文件 | 内容 | 许可 |
|---|---|---|
| `server/data/geo/china.json` | 现代省界底图（默认隐藏对比层） | — |
| `server/data/geo/historical/regimes-*.json` | 历史政权轮廓（宋/辽/西夏/金/吐蕃/大理/蒙古等） | GPL-3.0（aourednik/historical-basemaps） |
| `server/data/geo/historical/rivers.json` 等 | 河流/山脉/城市/地点辅助层 | — |
| `server/data/geo/historical/southern-song-routes.geojson` | 南宋 11 路治治所（公版事实坐标，随仓库提交） | — |
| `server/data/geo/historical/prefectures.geojson` | 州府近似边界 + 治所（含 CHGIS 派生坐标，**本地生成，不入 git**） | CHGIS 非商用 |

许可矩阵详见 `../architecture/data-improvement-plan.md`。

## 8. 相关文档

- 架构：`../architecture/overview.md`、`../architecture/data-improvement-plan.md`、`../architecture/temporal-db-plan.md`
- 需求：`../requirements/refactor-requirements.md`（含契约不变式验收）、`../requirements/zoom-lod-requirements.md`
- 校验：`npm run contract`（`scripts/` 契约检查脚本）
