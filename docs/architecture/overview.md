# HistoryMap 架构总览

> 本文是 HistoryMap 的架构入口文档：先读它建立全局认知，再按需深入各专题文档。
> 状态：**持续演进**（Web 桌面版 + Android 原生版双端并行，同数据契约）。

## 1. 项目定位

HistoryMap 是基于 three.js 的中国历史地图交互式可视化，首期聚焦**宋朝（960–1279）**，
后续已扩展金、辽、元等朝代（数据驱动，无需改前端常量）：

- 主画面是一张中国地图，下方时间轴自动播放（可暂停/拖动）。
- 时间推进到事件年份时，地图对应位置弹出「事件泡泡」；点击查看详情。
- 顶栏朝代下拉可在已播种的朝代间切换。
- 事件流抽屉、设置面板（分类/速度/显隐）、图例、详情面板一应俱全。
- 移动端（<640px）有专门适配。

## 2. 总体架构：双端同契约

前后端解耦，且后端 API 契约平台无关，由此衍生出**两个对等实现**：

```text
┌─────────────────────────────┐     ┌──────────────────────────────┐
│  Web 端（client/）           │     │  Android 原生版（android/）    │
│  three.js + d3-geo + Vite   │     │  Kotlin + Compose + GLES2    │
│  fetch 消费 JSON API         │     │  Room + assets GeoJSON       │
└──────────┬──────────────────┘     └──────────────┬───────────────┘
           │       同一份数据契约（字段/坐标/语义）        │
           ▼                                        ▼
┌─────────────────────────────────────────────────────────────┐
│  后端（server/）：Express + better-sqlite3（静态 GeoJSON 直读） │
│  /api/map  /api/map/overlay  /api/events  /api/meta  /api/dynasties │
│  + 可选时空库（PostgreSQL + PostGIS，/api/places，503 静默降级）       │
└─────────────────────────────────────────────────────────────┘
```

- **Web 端**：桌面浏览器，three.js 渲染，通过 `fetch` 消费后端。
- **Android 端**：原生实现（2026-08 由 WebView 壳重构而来），渲染与 UI 全部原生，
  数据层为 Room + assets 同步数据（`scripts/prepare-android.mjs`），与 Web 端同契约。
- **数据源同源**：Android 的 seed SQL、GeoJSON、烘焙贴图均由服务端 `server/data/`
  同步进 `android/app/src/main/assets/`，保证双端一致。

## 3. 渲染分层（Web 端）

1. **地图层**：`client/src/map/ChinaMap.js` 只负责把 GeoJSON 变成 three.js mesh。
   所有经纬度→屏幕坐标转换**只能**通过统一投影函数完成，事件层禁止手算坐标。
2. **疆域叠加层**：`client/src/map/TerritoryOverlay.js` 按时期渲染政权面（水彩纹理 quad）、
   河流、山脉等辅助层，跨时期自动重载并淡入。
3. **事件层**：`EventBubbles.js` 不直接操作 three geometry，只通过 `CSS2DObject`
   挂到 scene；同屏挤压由 `collisions.js` 推挤或折叠成 `+N` 聚合泡泡；
   指向线（`bubble-leaders` SVG）每帧在 `animate()` 里 `syncLeaders()` 跟随。
4. **时间轴**：`Timeline.js` 是唯一的「当前年份」状态源，地图/泡泡不维护时间，
   只接受 `onChange` 回调。

> **LOD 分级**：地图要素按缩放档位分 L4 级准入（`../requirements/zoom-lod-requirements.md` §4），
> Web 端与 Android 端同源决策矩阵（`LodLevel.kt` / `TerritoryOverlay.js`）。

## 4. 数据分层（前后端解耦的核心）

1. **后端**：只管数据存储与查询，不关心渲染。
2. **前端数据层**：`client/src/api.js` 是前端访问后端的**唯一入口**
   （`getMap/getOverlay/getEvents/getMeta/getDynasties/getPlaces`），
   业务代码不直接写 URL；换 mock 或数据源只改这一个文件。
3. **前端业务层**：`main.js` 只做装配，核心装配函数 `loadDynasty(dynastyId)`
   统一处理初始加载与朝代切换（重建 overlay/泡泡/时间轴范围）。
4. **Android 数据层**：`MapRepository.kt`（Room + OverlayLoader）等价 Web 版 `api.js` 职责；
   `OverlayLoader.kt` 用 org.json 复刻服务端 overlay 合并/注入逻辑。

## 5. 坐标与投影

- 单一投影实例在 `ChinaMap.js` 导出的 `project([lng, lat])` 中，
  事件层 `import { project } from '../map/ChinaMap.js'` 复用；Android 端为
  `Projection.kt`（d3-geo geoMercator + fitSize([1000,800]) 的 Kotlin 翻译）。
- `project()` 返回**居中后**的坐标，地图 mesh 与事件泡泡共用，位置天然对齐。
- 投影用历史疆域（覆盖中国及周边）做 `fitProjection` 标定，保证现代底图即便隐藏，投影仍有效。
- 事件/坐标字段 `[lng, lat]`（经度在前，与 GeoJSON 一致）。

## 6. 时间模型

- 年份用整数公历年份（首期 960–1279），由后端 `/api/meta` 给出，前端不写死。
- 时期边界（如北宋/南宋切换点 1127）数据驱动，来自 `/api/meta` 的 `periods` 字段，
  跨过边界时自动重载疆域叠加层并弹出时期转场横幅。
- 自动播放按「每 `tickMs` 推进一年」节奏。
- 事件只在 `[year, yearEnd]` 时间窗口内显示，过期消失。

## 7. 数据存储与管线

### 7.1 运行时数据

- **事件/朝代**：SQLite（`server/history.db`，better-sqlite3），seed 幂等重放，
  版本化迁移 `schema_migrations`（见 `server/data/schema.sql`）。
- **基础底图 GeoJSON**：静态文件 `server/data/geo/china.json`（现代省界），默认隐藏作对比层。
- **历史疆域 GeoJSON**：`server/data/geo/historical/`，按 `periods.json` 索引读取。

### 7.2 数据管线（均幂等可重跑）

| 管线 | 命令 | 产物 |
|---|---|---|
| 州府级数据 | `npm run data:classics` / `data:seats` / `data:prefectures` / `data:check` | `prefectures.geojson`（本地生成，gitignore） |
| 时空库 | `npm run data:songshi` / `data:temporal` / `data:temporal:check` | PostgreSQL（PostGIS）逐实体时间版本 |
| 贴图烘焙 | `npm run bake:overlay` / `penpot:svg` / `penpot:render` | `client/public/textures/overlay/` 水彩贴图 |

许可红线：含 CHGIS 派生坐标的文件（`prefectures.geojson` 等）**不入 git**，
克隆后需本地重跑管线；古籍解析结果与人工标定坐标为公版/事实数据，随仓库提交。

## 8. Android 原生架构

```
android/app/src/main/java/com/historymap/app/
├── MainActivity.kt              # Compose 入口 + 沉浸式全屏
├── MapScreen.kt                 # 主界面装配：顶栏/地图/泡泡/时间轴/图例/详情/事件流/设置
├── MapRenderer.kt               # GLES2 渲染器：宣纸底/水彩纹理+接触阴影/河道带/相机/标签数据
├── Projection.kt                # d3-geo geoMercator + fitSize 的 Kotlin 翻译（与 Web 一致）
├── WatercolorTexture.kt         # 水彩离屏生成（羽化/斑驳/边界/颗粒）
├── RiverRibbons.kt              # 河道带几何（变宽三角带 + 着色器三层 + 顺流微动画）
├── OverlayParser.kt / OverlayLoader.kt  # overlay JSON → 渲染模型（复刻服务端合并逻辑）
├── MapRepository.kt             # 数据仓储（Room + OverlayLoader）
├── TimelineController.kt        # 「当前年份」唯一状态源（播放/暂停/拖动/完成）
├── TimelineBar.kt / EventBubblesLayer.kt / Collisions.kt   # 时间轴 / 泡泡层 / 碰撞推挤
├── EventLogSheet.kt / SettingsSheet.kt / SettingsStore.kt  # 抽屉 / 设置面板 / 持久化
├── HistoryDb.kt                 # Room（schema 对齐后端 schema.sql）+ seed 重放
└── …（LodLevel.kt / PrefectureStrokeBuilder.kt / LabelPlacement.kt / DesignMetrics.kt 等）
```

关键设计决策：

- **手势收口**：地图区所有手势统一收口在 GLSurfaceView 的 touch listener
  （GestureDetector + ScaleGestureDetector），泡泡命中用 `hitTestBubble` 纯函数
  在 `onSingleTapConfirmed` 里做——这是 Compose interop 的已知大坑（见 AGENTS.md）。
- **视觉单源**：全部视觉参数以 `docs/design_optimize/design-tokens.json` 为唯一设计输入，
  由 `MapVisualTokens.kt` + `DesignMetrics.kt` 换算（详情见技术文档）。
- **LOD**：`LodLevel.kt` 状态机与 Web 端 `TerritoryOverlay.js` 同源决策。
- **离线**：完全离线运行；时空库详情接口未启用时 503 静默降级，不影响主流程。

## 9. 扩展点（加新朝代）

新朝代只需：

1. `server/data/seed/` 加 `NN-xxx.sql`（INSERT dynasties + events，含 place/category 字段）。
2. （可选）`server/data/geo/historical/` 加该朝代疆域文件并更新 `periods.json`。
3. 顶栏朝代下拉自动出现新朝代（来自 `/api/dynasties`），**无需改前端常量**。

地图层、泡泡层、时间轴**无需改动**——这是当前架构的核心扩展点。

## 10. 相关文档

| 类别 | 文档 |
|---|---|
| 需求 | `../requirements/refactor-requirements.md`（主需求基线）、`../requirements/zoom-lod-requirements.md`（LOD 需求）、`../requirements/roadmap.md`（路线图与验收）、`../requirements/android-mobile-optimization-plan.md`（移动端优化需求·历史） |
| 架构 | 本文（总览）、`android-native-rewrite-plan.md`（Android 原生方案）、`temporal-db-plan.md`（时空库）、`data-improvement-plan.md`（州府级数据管线）、`data-sources-research.md`（数据源调研） |
| 技术 | `../technical/data-contract.md`（API 与数据契约）、`../technical/texture-bake-plan.md`（贴图烘焙）、`../technical/android-visual-polish-ai-pipeline.md`（视觉 token 管线）、`../technical/design/`（视觉还原执行计划与生图 AI 操作手册）、`../technical/chatgpt-reconcile-prompt.md`（校准话术） |
| 入口 | `../README.md`（文档中心索引） |
