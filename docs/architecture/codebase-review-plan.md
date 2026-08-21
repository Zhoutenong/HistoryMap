# HistoryMap 全库评审与改进计划

> 用途：汇总 2026-08-20 对全项目（Web 端 / Android 原生端 / 后端 / 数据管线 / 产品）的评审结论，
> 将架构与产品两方面的意见落成可执行、可验收的改进任务。
>
> 状态：`[ ]` 未开始　`[~]` 进行中　`[x]` 已完成　`[-]` 暂缓
>
> 最后更新：2026-08-21（执行批次落地：A1-A6 与 A2 两步、P1-P5 全部完成，
> 各节标题带 [x]/[~] 状态与执行备注；P5 真机触屏走查与 A5 真机 FPS 复测需 P20
> 设备，留待排期）

## 1. 评审背景

通读范围：`AGENTS.md`、`README.md`、`package.json`、`server/`（db、路由、schema、seed、数据管线）、
`client/src/`（main/api/map/events/timeline/settings）、`android/app/src/main/`（全部 Kotlin）、
`docs/`（overview、roadmap、architecture 各专题）、`scripts/` 数据管线。

总体判断：**架构骨架是同类项目里最好的之一**，契约分层、单一时间状态源、数据管线许可意识、
Android 工程质量均高于平均水平。核心风险不在新增能力，而在**双端一致性靠手工纪律维持**；
产品端处于「交互已齐、内容待深」的拐点。

## 2. 架构评审

### 2.1 值得保持的设计

1. **契约驱动的分层**：API 契约平台无关，Web fetch 与 Android Room/OverlayLoader 语义严格对齐。
2. **「当前年份」单一状态源**：`Timeline` / `TimelineController` 是唯一时间源，地图/泡泡/overlay 均被动订阅。
3. **数据管线工程化**：古籍解析 → 治所坐标 → Voronoi 州府面每步幂等可重跑；CHGIS 许可红线（不可再分发）
   明确约束并 gitignore；source/license/confidence/attribution 字段随要素走。
4. **Android 端细节质量**：GL/UI 线程分离、dynastyGen 竞态防护、LRU 贴图缓存、LOD 滞回、
   CSS2DObject 定位与动效分离等，均为踩坑后的设计。

### 2.2 核心隐患（按优先级）

| 编号 | 隐患 | 说明 |
|---|---|---|
| H1 | **双端手写复刻、无共享契约** | 投影（`Projection.kt` vs d3-geo）、overlay 合并（`OverlayLoader.kt` vs `overlay.js`）、LOD 矩阵、碰撞常量、设置项清单两端各写一份。任一端微调另一端不跟随，坐标/档位**静默漂移**，且这类 bug 不报错只错位，极难定位。 |
| H2 | **WebView 残留死代码 + 文档脱节** | `ApiBridge.kt` 与 `assets/web/`（Vite 产物，实测 **9.3MB**）为 WebView 时代遗留，当前 MainActivity 已走原生渲染，无挂载点（`ApiBridge.kt` 全仓零引用，已核实）；`api.js` 的 bridge 分支与注释仍称「双端同跑」。 |
| H3 | **后端每请求全量重算** | `/api/map` 每请求同步读文件无缓存；`/api/map/overlay` 过滤/合并/逐坐标校验每请求全量执行，且 287 个州府 Polygon 完整 geometry 塞进 `properties.prefectures`；`meta.js` 与 `overlay.js` 各读各的 `periods.json`。 |
| H4 | **db.js seed 自愈半残** | 启动全量重放 seed 是**有意设计**（db.js 注释：修复旧版部分 seed 的库），并非单纯 bug；真正的缺陷是重放用 `INSERT OR IGNORE` 只能补缺行、改不动已存在行——自愈只覆盖「缺」不覆盖「偏」，内容迭代一修订既有事件行就会撞上「改 seed 不生效」。另 `category/impact/place` 三列迁移未并入 `MIGRATIONS` 版本数组。 |
| H5 | **Android 单文件膨胀** | `MapScreen.kt` ~63KB、`MapRenderer.kt` ~58KB，Compose 状态/手势/布局/生命周期集中；Web 端模块化明显更健康。 |
| H6 | **文档与实际存在「三端并存」表述** | `api.js` 注释、`overview.md` 中 bridge/双端同跑描述与「Web three.js + Android 原生」实际不符，会误导后来者。 |

## 3. 产品评审

### 3.1 现状定位

「视觉演示品 → 产品」过渡期：交互完整度高（时间轴、搜索、深链接、设置导入导出），
但内容深度停留在「一期验证」——5 个朝代、每朝 20-30 条事件、河流山脉为示意数据。

### 3.2 机会点

1. **内容深度决定产品价值**：用户留存取决于内容而非交互。优先做深宋朝（事件扩至百条级 +
   人物关系/因果链），而非横向加更多朝代。
2. **多政权并立的横切视角**：`periods.json` 已支持宋辽西夏金同时显示、图例多政权配色，
   缺的只是「全时期模式」产品叙事（给定年份看全东亚所有政权版图）。
3. **分享与传播是天然增长点**：深链接已有，可补事件卡片图生成（SVG：地图局部 + 年份水印 + 事件简述）。
4. **考据感是护城河**：source/license/confidence 已入库，但 UI 未显性化。详情面板
   「资料来源」展开古籍原文出处，对历史爱好者建立信任。
5. **收尾 roadmap 未完成项**：P2 移动端触屏测试、ARIA/键盘可达性、P4 视觉回归基线，
   决定项目是否像一个正式产品。

## 4. 改进计划

> 编号规则：A = 架构，P = 产品。验收标准对齐 `docs/requirements/roadmap.md` 的写法。

### A1（P0·已完成 [x]）清理 WebView 残留死代码

- **现状**：`ApiBridge.kt` 无挂载点（全仓零引用，已核实）；`assets/web/` 含 Vite 打包产物（实测 **9.3MB**，比早先估计的 1MB+ 严重得多）打进 APK。
- **目标**：删除死代码，消除「三端并存」表述。
- **改动范围**：
  - 删除 `android/.../ApiBridge.kt` 及引用；
  - 从 APK 打包中移除 `assets/web/`（`prepare-android.mjs` 停止同步 Vite 产物）；
  - `client/src/api.js` 移除 bridge 检测分支，注释改述为「Web fetch / Android 原生 MapRepository 双实现」；
  - 同步 `overview.md` / `AGENTS.md` 相关表述。
- **验收**：`rg -i "bridge|webview"` 在 `android/` 与 `client/src/` 无有效命中；
  `assembleDebug` 产物体积下降；Web 端功能无回归（lint + test + Playwright 全绿）。

### A2（P1·已完成 [x]）双端契约 golden 文件 + 跨端一致性 CI（分两步走）

- **现状**：投影标定参数、LOD 阈值矩阵、碰撞常量、`PLACE_KINDS` 白名单、设置项 schema 双端硬编码
  （`PLACE_KINDS` 在 `TerritoryOverlay.js` 与 `OverlayLoader.kt` 各写一份，已核实）。
- **目标**：把双端共享的数值/常量收进一份契约 JSON，两端构建时消费；CI 校验两端输出一致。
- **改动范围**（2026-08-21 核勘后拆为两步，先做廉价的 80%）：
  - **第一步（golden 数值测试，先行）**：不引入 codegen，双端各自对固定输入出 golden 断言——
    优先给 `Projection.kt`（d3-geo 手工翻译，漂移风险最高）加「固定经纬度集 → 期望投影坐标」
    测试，Web 端用同一数据集对照 `project()`；overlay 合并用固定 JSON 输入在
    `overlay.js` 与 `OverlayLoader.kt` 各出 golden 快照比对。无需构建期基础设施即可抓住
    绝大多数静默漂移。
  - **第二步（验证有效后再上，已落地 [x]）**：新建 `contract/tokens.json` 共享 JSON
    （投影 fitSize、LOD 档位矩阵、碰撞参数、kind 白名单、设置项 schema）；
    `scripts/gen-contract-tokens.mjs` 生成双端产物（Web `client/src/contract-tokens.js` +
    Android `ContractTokens.kt`），服务端参考实现 `overlay-merge.js` 也直接读契约文件——
    三端同源；CI 一致性以「生成物与契约 diff」+ 双端 golden 为主（`npm run contract:tokens`
    已并入 `npm run contract`，Web vitest 另有生成模块 ↔ 契约快照断言）。
- **验收**：第一步：投影/overlay golden 测试双端落地，人为改动任一端数值测试即红；
  第二步：契约文件为两端数值唯一事实来源，任一数值改动后另一端构建或 CI 立即告警。
  （第二步实现详情见 §9 执行记录 A2 第二步。）

### A3（P1·已完成 [x]）后端结果级缓存

- **现状**：`/api/map` 每请求 `readFileSync`；overlay 过滤/合并/校验每请求全量执行；
  `meta.js` 与 `overlay.js` 各读各的 `periods.json`。
- **目标**：数据规模增长前的热点加固。
- **改动范围**：
  - `/api/map` 启动时读入内存，响应带 `ETag`；
  - overlay 按 `period` 结果级缓存（`Map<period, FeatureCollection>`），状态码响应头带缓存；
  - `periods.json` 抽为共享读取模块（`server/data/periods.js` 或 db.js 级单例）；
- **验收**：同一 period 连续请求第二次不再执行过滤/合并（可用打点日志验证）；
  `/api/map` 不再每请求读盘。

### A4（P1·已完成 [x]，先于 P1 内容加深落地）db.js seed 自愈修正（upsert 方案）

- **现状**：启动全量重放 seed 是**有意设计**（db.js 注释：修复旧版部分 seed 的库），并非单纯
  bug；真正的缺陷是重放用 `INSERT OR IGNORE` 只能补缺行、改不动已存在行——自愈只覆盖「缺」
  不覆盖「偏」，内容迭代一修订既有事件行就会撞上「改 seed 不生效」。另 `category/impact/place`
  三列迁移在 `MIGRATIONS` 数组之外。
- **方案**（2026-08-21 核勘调整，由 apply-once 改为 upsert 优先）：
  - **首选：保留 reconcile，seed 改 upsert**。唯一索引 `idx_events_seed_identity(dynasty_id, year, short)`
    已存在，seed 语句改写为 `INSERT ... ON CONFLICT(dynasty_id, year, short) DO UPDATE` 即可：
    既保住自愈能力，又让 seed 修订对既有库生效。改动小、无语义迁移风险。
  - 备选（暂不做）：`migrateData` 仅执行未应用版本（apply-once）。会丢自愈能力，需配套
    「手工回滚重放」流程，仅在 seed 规模显著增长、启动耗时成为问题后再评估。
- **改动范围**：
  - 五个 seed SQL 的 INSERT 语句改写为按 `(dynasty_id, year, short)` 身份 upsert；
  - 将 `category/impact/place` 列迁移并入 `MIGRATIONS` 版本数组；
  - migration contract 测试补「既有库 + 修订 seed → 行被更新」用例。
- **验收**：既有库启动时对已应用 seed 的修订生效（改一行 detail，重启后 API 可查到新值）；
  全新库与既有库升级均无数据丢失；migration contract 测试全绿。
  （注：全新库必然全量执行所有 seed，提速收益只针对既有库的重复启动路径。）

### A5（P3·已完成 [x]，真机 FPS 复测待排期 [~]）Android 单文件拆分

- **现状**：`MapScreen.kt` ~63KB、`MapRenderer.kt` ~58KB。
- **目标**：按职责拆分，降低单文件认知负担。
- **改动范围**：`MapScreen.kt` 拆出 `MapGestures`（手势收口）、`MapScreenState`（Compose 状态）、
  `MapUiBlocks`（顶栏/图例/横幅布局）；`MapRenderer.kt` 拆出独立的 pass/draw 辅助。
- **验收**：拆分后 lint 通过、P20 真机 FPS 无回退（55-59fps）；`MapScreen.kt` 单文件 < 40KB。

### A6（P3·已完成 [x]）文档一致性治理

- **现状**：`overview.md` / `AGENTS.md` 部分表述仍含 bridge/「双端同跑」旧语义。
- **目标**：文档与实际实现一致。
- **改动范围**：统一「Web three.js + Android 原生」双实现表述；清理 bridge 相关描述；
  在 `AGENTS.md`「架构边界」补「双端契约共享」条目（A2 落地后）。
- **验收**：`rg -i "webview|bridge" docs/ AGENTS.md` 无过期命中；`overview.md` 架构图与代码一致。

### P1（P1·已完成 [x]）宋朝内容加深

- **现状**：30 条事件、无人物关系/因果链。
- **目标**：内容深度优先于朝代数量。
- **改动范围**：
  - 宋朝事件扩至百条级（seed 文件拆分或追加，走 `schema_migrations` 新版本；
    A4 落地后直接修订既有 seed 文件亦对既有库生效）；
  - 新增 `persons` / `event_person` 表（人物轨迹 + 主导/牵连关系），`/api/events` 事件对象附带
    `relatedPersons`（可选字段，**不破坏现有契约**）；
  - 「人物视角」浏览：按人物点亮其事件轨迹（Web 端 `EventBubbles` 增加人物过滤，Android 端同步）。
- **验收**：宋朝事件 ≥ 100 条；人物轨迹过滤可用；`/api/events` 老字段兼容（contract 测试通过）；
  双端新增功能行为一致。

### P2（P2·已完成 [x]）全时期模式

- **现状**：`periods.json` 已支持多政权并立、图例多政权配色，但产品上仅按朝代单一切换。
- **目标**：给定年份展示当时全部政权版图。
- **改动范围**：顶栏增加「全时期模式」开关；该模式下时间轴范围取所有朝代并集，
  overlay 按年份取所有相关时期政权层（服务端按年选时期 + 前端合并政权面）；
  Android 端同步开关与渲染。
- **验收**：1111 年同时显示宋/辽/西夏政权；图例展示全部政权；朝代模式行为不变。

### P3（P2·已完成 [x]）事件卡片图与分享

- **现状**：深链接 `?dynasty=&year=&event=` 已有，止于「打开页面」。
- **目标**：生成可传播的事件卡片图。
- **改动范围**：详情面板「分享卡片」按钮 → SVG 合成（地图局部静态截图 + 年份水印 + 事件简述），
  可下载 PNG / 复制到剪贴板；分享文案带深链接。
- **验收**：Web 端可生成并下载卡片图；深链接打开定位到事件并弹详情。

### P4（P3·已完成 [x]）考据感 UI 显性化（范围核勘修正）

- **现状**（2026-08-21 核勘修正）：州府详情面板**已**通过时空库 `/api/places` 展示
  「史料来源 + 置信度」（main.js，时空库 503 时静默降级），旧表述「UI 未展示」不成立。
  真实缺口：① 事件详情与 overlay 政权要素的 source/license/confidence 无展示；
  ② 现有州府来源展示硬依赖本机 PostgreSQL 启用，未启用时退化为无来源。
- **目标**：考据信息覆盖事件维度，且不硬依赖时空库可用性。
- **改动范围**：事件详情增加「资料来源」折叠区（source/license/confidence）；州府来源展示
  增加 SQLite/GeoJSON 侧回退（`evolution`/`tribute`/`sourceFix` 随要素走、不依赖 PG）；
  Web + Android 双端。
- **验收**：时空库未启用时，宋朝任一事件与任一州府详情仍可看到来源/置信度；
  启用后州府展示更完整（生命周期/变更事件）；双端一致。

### P5（P3·已完成 [x]，真机触屏项待排期 [~]）产品收尾项（对齐 roadmap P2/P4）

- **现状**：移动端触屏测试、ARIA/键盘可达性、视觉回归基线均未完成。
- **目标**：补齐「最后一公里」，让项目呈现正式产品形态。
- **改动范围**：按 `docs/requirements/roadmap.md` P2（移动端与可访问性）与 P4（视觉回归）
  执行：事件流抽屉移动端/键盘测试、图例折叠、ARIA role/label/focus 管理、对比度检查、
  截图基线比对机制。
- **验收**：390×844 与 768×1024 视口核心流程可完成；键盘可达性检查通过；
  视觉回归 CI 基线建立。

## 5. 优先级总表

| 优先级 | 编号 | 事项 | 类型 | 工作量估计 |
|---|---|---|---|---|
| P0 | A1 | 清理 WebView 残留死代码与表述 | 架构清理 | ~0.5 天 |
| P1 | A2 | 双端契约 golden（第一步 golden 测试 → 第二步 codegen） | 架构（防漂移） | ~1 天 + 1-2 天 |
| P1 | A3 | 后端结果级缓存 | 架构（为数据增长铺路） | ~1 天 |
| P1 | A4 | db.js seed 自愈修正（upsert） | 架构（P1 内容加深的前置） | ~0.5-1 天 |
| P1 | P1 | 宋朝内容加深（百条事件 + 人物视角） | 产品 | ~3-5 天 |
| P2 | P2 | 全时期模式 | 产品（数据已就绪） | ~2 天 |
| P2 | P3 | 事件卡片图与分享 | 产品增长 | ~1-2 天 |
| P3 | A5 | Android 单文件拆分 | 架构维护 | ~1-2 天 |
| P3 | A6 | 文档一致性治理 | 文档 | ~0.5 天 |
| P3 | P4 | 考据感 UI 显性化（扩至事件 + 去除时空库硬依赖） | 产品信任度 | ~1 天 |
| P3 | P5 | 移动端/可访问性/视觉回归收尾 | 产品收尾 | ~3-5 天 |

## 6. 建议执行顺序

1. **A1**（半天清理，降低噪音）→ **A2 第一步**（golden 数值测试，为后续所有改动提供双端一致性
   基座；codegen 第二步验证有效后再上）→ **A3**（缓存加固，为数据增长铺路）。
2. **A4 必须先于 P1 内容加深落地**：内容迭代要反复修订既有事件行，会直接撞上「改 seed 不生效」
   的坑，先修语义再写内容。随后产品端推进 **P1**（内容加深，最大杠杆）
   → **P2**（全时期模式，数据已就绪）→ **P3**（分享增长）。
3. 收尾：**A5/A6** 与 **P4/P5** 按排期填充。

## 7. 明确不做（暂缓）

- **3D 地形/视角飞入**：three.js 3D 能力目前克制是合理的，历史地图的确定性优先于立体感；
  留作远期选项（`[-]`）。
- **横向大量新增朝代**：在宋朝内容做深之前，横向加朝代对留存提升有限；但朝代框架保持
  「数据驱动 + 自动出现在下拉」不动，随时可加。

## 8. 相关文档

- 架构总览：`docs/architecture/overview.md`
- 功能路线图（含未完成项）：`docs/requirements/roadmap.md`
- Android 重构：`docs/architecture/android-native-rewrite-plan.md`
- 州府数据管线：`docs/architecture/data-improvement-plan.md`
- 时空数据库：`docs/architecture/temporal-db-plan.md`

## 9. 执行记录（2026-08-21 落地批次）

| 编号 | 结果 | 关键产物 |
|---|---|---|
| A1 | [x] | 删除 `ApiBridge.kt` 与 `assets/web/`（APK 20.7→11.3MB）；`api.js` 去 bridge 分支；README/AGENTS/overview 表述统一为「Web three.js + Android 原生」 |
| A2 第一步 | [x] | `contract/golden/`（projection + overlay-merge 的 fixture/expected）+ 生成器 `scripts/gen-*-golden.mjs` + 校验 `npm run contract:golden`；Web vitest `projection.golden.test.js`；Android `ProjectionGoldenTest` / `OverlayMergeGoldenTest`；顺带修复 3 处真实漂移（Android 文件清单漏 southern-song-routes、缺 labelsByPeriod 覆写、fallback 数组缺 kind 注入）。**备注（执行期发现）**：Web 生产标定（Polygon 输入 d3 fitSize）量的是整个墨卡托世界方块（scale 恒为 min(W,H)/2π，与数据无关），Android 用多边形点集 fit（scale 随数据变）——两端世界坐标实际不一致，靠各自相机取景与 bbox 相对贴图补偿视觉。golden 以**点集语义**（MultiPoint）锚定两端共享公式；生产输入分歧已在此记录，统一需真机/浏览器双端像素验证后另行立项。第二步见下行 |
| A2 第二步 | [x] | `contract/tokens.json`（投影 fitSize、LOD 档位矩阵、碰撞参数、kind 白名单、设置项 schema）+ 生成器 `scripts/gen-contract-tokens.mjs`（`--write`/`--check`）→ 双端产物：Web `client/src/contract-tokens.js`（ESM，main/collisions/EventBubbles/TerritoryOverlay/ChinaMap/store 改为消费契约）与 Android `ContractTokens.kt`（LodLevel/Collisions/OverlayLoader/Projection/SettingsStore/MapScreen/TimelineController/MapUiBlocks/SettingsSheet/TimelineBar 消费，顺带消除 Android 端 4 份重复的分类标签表）；服务端参考实现 `overlay-merge.js` 改读契约 `placeKinds`——三端同源。校验 `npm run contract:tokens`（生成物与契约 diff，已并入 `npm run contract`）+ Web vitest `contract-tokens.test.js`（生成模块 ↔ 契约快照）。验证：lint / vitest 61 用例 / vite build / contract-golden / Android compileDebugKotlin + testDebugUnitTest 全绿。颜色属视觉层（design-tokens/MapVisualTokens 管线）不入契约 |
| A3 | [x] | `/api/map` 启动读入内存 + md5 ETag（If-None-Match→304 实测）；overlay 按 period/year 结果级缓存（构建期文件戳失效，`/api/map/overlay/periods?stats=1` 打点：3 请求 = 1 miss + 2 hits）；`periods.json` 共享单例 `server/data/geo/historical/periods.js`（meta/overlay 同源） |
| A4 | [x] | 5 个 seed 改 `(dynasty_id, year, short)` upsert；dynasties 同步 upsert；`category/impact/place` 列迁移并入 MIGRATIONS v0；新增 v6（事件扩容）/v7（人物）/v8（考据列）；契约新增「修订 seed 对既有库生效 + 回退复原」用例。Android SeedImporter 带 SQLite<3.24 降级（upsert→INSERT OR IGNORE） |
| P1 | [x] | 宋朝事件 30→**109 条**（06 北宋 40 + 07 南宋 39）；`persons`(60) / `event_person`(~150) 表 + `/api/persons`；`/api/events` 附 `relatedPersons`（老字段兼容，contract 通过）；Web 设置面板「人物视角」下拉 + 泡泡过滤 + 详情人物徽章；Android SettingsSheet 人物芯片条 + 泡泡过滤 + 详情徽章 |
| P2 | [x] | `GET /api/map/overlay/all?year=`（文件去重合并 + `_range` 稳定区间）；Web 顶栏「全时期」开关（aria-pressed，时间轴并集 + 区间节流重取，1111 年实测宋/辽/西夏/吐蕃/大理等 10 政权同屏）；Android 顶栏章钮 + TimelineController.setRange + doEnsureAllPeriod |
| P3 | [x] | `client/src/events/EventCard.js`（SVG 卡片：WebGL 截图 + 年份水印 + 首句摘要 + 深链接脚注；PNG 1.5x 导出 + 剪贴板）+ 详情「卡片」按钮（下载 `historymap-song-<year>.png`，e2e 断言下载事件）+ vitest 8 用例 |
| P4 | [x] | events 加 `source/confidence/license`（v8 按分类标注正史出处）；双端事件详情「资料来源」栏；Web 州府详情补 sourceFix 校订栏；Android 新增治所标签点击→府州考据卡（户口/土贡/沿革/来源，数据随 GeoJSON 要素走，不依赖时空库） |
| A5 | [x] | `MapScreen.kt` 75.7KB→**40.6KB**（拆出 `MapScreenState.kt` / `MapTopBar.kt` / `MapUiBlocks.kt`）；`MapRenderer.kt` 拆出 `MapShaders.kt`（4 个 GLSL 常量）。compileDebugKotlin + 37 单测 + assembleDebug 全绿；**P20 真机 FPS 复测待排期** |
| A6 | [x] | 本节执行记录 + AGENTS.md（契约条目/命令/目录/测试数）+ overview/README 同步；`rg -i "webview\|bridge"` 过期命中清零（历史性表述保留于重写档案并标注已完成） |
| P5 | [x]（真机项 [~]） | e2e 扩容：`features.spec.js`（人物/全时期/卡片下载/深链接/ARIA/键盘）+ `visual.spec.js`（390×844 与 768×1024 视口矩阵核心流程 + 顶栏/时间轴/详情面板截图基线）；真机触屏走查待排期 |
