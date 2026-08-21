# HistoryMap — 历史疆域数据

唐宋元时期及周边政权的真实历史疆域 GeoJSON，供 `/api/map/overlay` 路由读取。

## 数据来源与许可

**主数据源**：[aourednik/historical-basemaps](https://github.com/aourednik/historical-basemaps) (GPL-3.0, 772★)

从其 `geojson/world_{800,1100,1200,1279,1300}.geojson` 中筛选相关政权，注入中文名与配色后输出。每政权为 100-400 顶点的真实历史轮廓（不再是现代省界的裁剪）。

**许可声明**：地图数据衍生自 GPL-3.0 项目，按许可要求衍生作品须沿用 GPL-3.0。本项目地理数据部分以此许可发布。

**精度说明**：historical-basemaps 是社区维护的世界历史政区数据集，精度足以呈现政权并立的宏观格局，但不及学术级 CHGIS（哈佛中国历史 GIS）。如需"路"一级行政区划（北宋 15 路 / 南宋 17 路）的精确边界，需另引入 CHGIS V6 数据，作为后续二期工作。

## 文件结构

```
historical/
├── periods.json                 时期索引 + 政权配色表（路由读取入口）
├── regimes-800.json             唐朝（618-907）10 政权
├── regimes-1100.json            北宋极盛（960-1126）10 政权
├── regimes-1200.json            南宋并立（1127-1270）12 政权
├── regimes-1279.json            元代（1271-1279）7 政权
├── regimes-1300.json            元中后期（1280-1368）7 政权
├── rivers.geojson               河流示意（标准辅助层）
├── mountains.geojson            山脉示意（标准辅助层）
├── cities.geojson               城市示意（标准辅助层）
├── places.geojson               地点示意：都城/战场/书院（kind=capital/battlefield/academy）
├── source/                      原始全球文件（world_*.geojson，备查）
│   ├── world_800.geojson
│   ├── world_1100.geojson
│   ├── world_1200.geojson
│   ├── world_1279.geojson
│   └── world_1300.geojson
└── _archive_v1_chinaclip/       旧版（v1，基于现代省界裁剪，已弃用，保留可回溯）
```

## 时期定义

| periodId | 年份范围 | 标签 | 包含政权 |
|---|---|---|---|
| `tang-800` | 618-907 | 唐·盛唐气象 | 唐 / 吐蕃 / 回鹘 / 渤海 / 南诏 / 新罗 / 日本 / 真腊 / 占婆 / 海南 |
| `song-1111` | 960-1126 | 北宋极盛 | 宋 / 辽 / 西夏 / 吐蕃 / 大理 / 大越 / 高棉 / 占婆 / 高丽 / 海南 |
| `liao-1111` | 916-1125 | 辽·鼎盛 | 辽 / 宋 / 西夏 / 吐蕃 / 大理 / 大越 / 高棉 / 占婆 / 高丽 / 海南 |
| `song-1142` | 1127-1270 | 南宋·绍兴和议 | 宋 / 金 / 西夏 / 吐蕃 / 大理 / 蒙古 / 大越 / 高棉 / 占婆 / 高丽 / 蒲甘 / 西辽 |
| `song-1279` | 1271-1279 | 崖山·元朝建立 | 元 / 吐蕃 / 大越 / 高棉 / 占婆 / 蒲甘 / 海南 |
| `yuan-1279` | 1271-1279 | 元·一统天下 | 元 / 吐蕃 / 大越 / 高棉 / 占婆 / 蒲甘 / 海南 |
| `yuan-1300` | 1280-1368 | 元·大都时代 | 元 / 吐蕃 / 大越 / 高棉 / 占婆 / 蒲甘 / 海南 |

注：1271 年忽必烈建元朝，1276 年临安陷落，1279 年崖山海战南宋彻底灭亡。故 1271 年后无"宋"政权。辽朝与元朝分别复用 1100 / 1279、1300 年快照（同一快照可供多个朝代的时期共用）。唐朝时期复用 800 年快照（盛唐疆域，覆盖 618-907 全期）。

## 数据字段

`regimes-*.json` 是标准 GeoJSON FeatureCollection。每个 feature 的 `properties`：

| 字段 | 说明 |
|---|---|
| `entity` | 中文政权名（渲染/图例用，如"宋""辽"） |
| `color` | 十六进制填充色 |
| `fillOpacity` | 填充不透明度（0-1） |
| `regime` | 规范化英文政权名（如 `Jin`，已修正数据源标签错误） |
| `sourceName` | 原始数据源的 NAME（如 1200 年金朝被标为 `Liao`） |
| `year` | 数据快照年份 |

## 重新生成

```bash
node server/scripts/fetch_historical_basemaps.js
```

脚本会：
1. 下载（如缺失）`world_{800,1100,1200,1279,1300}.geojson` 到 `source/`
2. 按 `PERIOD_REGIMES` 配置筛选政权、修正标签（如 1200 年 `Liao` → `Jin`）
3. 注入中文名与配色，输出 `regimes-{800,1100,1200,1279,1300}.json`

改政权配色/中文名 → 编辑脚本顶部的 `ENTITY_STYLE`；改纳入哪些政权 → 编辑 `PERIOD_REGIMES`。
800 年（唐朝）数据源的政权命名与 1100+ 不同，配色/中文名在 `STYLE_OVERRIDE_BY_YEAR` 中按年份覆盖
（如 800 年 `Nan Chao` 是南诏而非大理、`Tibetan Empire` 即吐蕃），不要误改 `ENTITY_STYLE` 里的公共映射。

## 辅助地理数据（标准 GeoJSON）

`rivers.geojson` / `mountains.geojson` / `cities.geojson` / `places.geojson` 是 overlay 响应的标准辅助层：
按 feature 的 `properties.periods` 字段过滤时期（缺省则全时期生效），路由将其转为
`properties.rivers/mountains/cities/places` 旧格式数组（periods.json 顶层数组作缺失时的兜底）。

地点要素 kind 取值：`capital`（都城）/ `battlefield`（战场）/ `academy`（书院学府）。
新 kind 需加入 `contract/tokens.json` 的 `placeKinds` 白名单（A2 第二步双端共享契约）并重跑
`npm run contract:tokens:write`——`server/data/geo/historical/overlay-merge.js`、`client/src/map/TerritoryOverlay.js`
（经 `client/src/contract-tokens.js`）与 `android/.../ContractTokens.kt` 三端同源消费，
白名单外的未知 kind 会被安全忽略（不报 500）。

## 州府级数据（元丰九域志基准，二期扩展）

`prefectures.geojson` 是北宋元丰（1080）州府级数据（`server/data/geo/song/jiuyuzhi-1080.json`
古籍解析 + CHGIS 治所坐标 + Voronoi 近似边界），由 `scripts/build-song-prefectures.mjs` 生成：

- **本地生成**：文件含 CHGIS 派生坐标（不可再分发），**不入 git**（见
  `docs/architecture/data-improvement-plan.md` 许可矩阵）；克隆后需先跑
  `npm run data:classics && npm run data:seats && npm run data:prefectures`。
- **kind 取值**：
  - `prefecture`：州府面（Polygon，Voronoi 近似 + 宋政权轮廓裁剪，`style: stroke-only`）
  - `prefecture-seat`：州府治所点（Point，CHGIS/人工标定）
- **properties**（对齐 `REQUIRED_PROPERTIES`）：`id/name/kind/rank/style/source/license/confidence/note`
  之外含 `route`（路）、`type`（府州军监）、`grade`、`households`（主/客户，元丰九域志）、
  `tribute`（土贡）、`seat`/`seatCoord`、`countyCount`/`counties`（属县）、`evolution`（舆地广记沿革）、
  `periods`（当前 `song-1111`）。
- **overlay 响应**：`properties.prefectures`（**保留 geometry 的完整 Feature 数组**——Polygon 不能走
  `featureCollectionToLegacy` 通道，该通道会剥掉 geometry）与 `properties.prefectureSeats`（legacy 点数组）。
- **rank**：1 京府 / 2 次府 / 3 户口≥5万 / 4 ≥1万 / 5 其他（前端按 rank 控制字号与碰撞优先级）。
- **精度**：边界为 Voronoi 近似（confidence low/medium），治所为真实坐标；重点州府人工校正清单见
  `_generated/correction-checklist.md`（生成物）。

## 已知数据源瑕疵

- **800 年命名与 1100+ 不同**：唐朝快照里吐蕃叫 `Tibetan Empire`（1100+ 叫 `Tibet`），回鹘拼作 `Ouighurs`，新罗为 `Silia`，真腊为 `Chen-La`；且 800 年的 `Nan Chao` 是云南的南诏政权，而 1100/1200 年的 `Nan Chao` 实为大理前身。脚本用 `STYLE_OVERRIDE_BY_YEAR` 按年份覆盖，避免错标。
- **1200 年 "Liao" 实为金朝**：1115-1234 年金朝统治原辽+北宋北方，数据源误标为 Liao。脚本用 `NAME_OVERRIDE` 重映射为 Jin。
- **1279 年无 Song Empire**：南宋已于 1276 年临安陷落；1279 年整个东亚属元朝 Great Khanate。
- **精度不均**：部分政权（如高丽 Goryeo 在 1200 年）顶点上千、精度极高；部分政权（如西夏 Xixia）只有 25 顶点、轮廓粗略。
