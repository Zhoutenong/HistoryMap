# HistoryMap 全库评审与改进计划

> 用途：汇总 2026-08-20 对全项目（Web 端 / Android 原生端 / 后端 / 数据管线 / 产品）的评审结论，
> 将架构与产品两方面的意见落成可执行、可验收的改进任务。
>
> 状态：`[ ]` 未开始　`[~]` 进行中　`[x]` 已完成　`[-]` 暂缓
>
> 最后更新：2026-08-20

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
| H2 | **WebView 残留死代码 + 文档脱节** | `ApiBridge.kt` 与 `assets/web/`（Vite 产物 ~1MB+）为 WebView 时代遗留，当前 MainActivity 已走原生渲染，无挂载点；`api.js` 的 bridge 分支与注释仍称「双端同跑」。 |
| H3 | **后端每请求全量重算** | `/api/map` 每请求同步读文件无缓存；`/api/map/overlay` 过滤/合并/逐坐标校验每请求全量执行，且 287 个州府 Polygon 完整 geometry 塞进 `properties.prefectures`；`meta.js` 与 `overlay.js` 各读各的 `periods.json`。 |
| H4 | **db.js 迁移语义自相矛盾** | 每次启动全量重放所有 seed + 仅首次记版本；seed 为 `INSERT OR IGNORE`，对已修改行无效；`category/impact/place` 三列迁移未并入 `MIGRATIONS` 版本数组。 |
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

### A1（P0）清理 WebView 残留死代码

- **现状**：`ApiBridge.kt` 无挂载点；`assets/web/` 含 Vite 打包产物（~1MB+）打进 APK。
- **目标**：删除死代码，消除「三端并存」表述。
- **改动范围**：
  - 删除 `android/.../ApiBridge.kt` 及引用；
  - 从 APK 打包中移除 `assets/web/`（`prepare-android.mjs` 停止同步 Vite 产物）；
  - `client/src/api.js` 移除 bridge 检测分支，注释改述为「Web fetch / Android 原生 MapRepository 双实现」；
  - 同步 `overview.md` / `AGENTS.md` 相关表述。
- **验收**：`rg -i "bridge|webview"` 在 `android/` 与 `client/src/` 无有效命中；
  `assembleDebug` 产物体积下降；Web 端功能无回归（lint + test + Playwright 全绿）。

### A2（P1）双端契约 golden 文件 + 跨端一致性 CI

- **现状**：投影标定参数、LOD 阈值矩阵、碰撞常量、`PLACE_KINDS` 白名单、设置项 schema 双端硬编码。
- **目标**：把双端共享的数值/常量收进一份契约 JSON，两端构建时消费；CI 校验两端输出一致。
- **改动范围**：
  - 新建 `contract/`（或沿用 `design-tokens` 同类机制）共享 JSON：投影 fitSize/中心偏移、
    LOD 档位矩阵、碰撞参数、kind 白名单、设置项 schema；
  - Web 端从契约 JSON 导入常量；Android 端由构建脚本生成 `ContractTokens.kt`；
  - CI 新增一致性 job：同一输入（period=1111 overlay + 固定坐标集）比较
    `server/routes/overlay.js` 输出与 Android `OverlayLoader.kt` 输出（跑一个 Node 端复刻或
    对照 golden 快照）。
- **验收**：契约文件为两端数值唯一事实来源；新增跨端一致性 CI job 全绿；
  任一数值改动后，另一端构建或 CI 立即告警。

### A3（P1）后端结果级缓存

- **现状**：`/api/map` 每请求 `readFileSync`；overlay 过滤/合并/校验每请求全量执行；
  `meta.js` 与 `overlay.js` 各读各的 `periods.json`。
- **目标**：数据规模增长前的热点加固。
- **改动范围**：
  - `/api/map` 启动时读入内存，响应带 `ETag`；
  - overlay 按 `period` 结果级缓存（`Map<period, FeatureCollection>`），状态码响应头带缓存；
  - `periods.json` 抽为共享读取模块（`server/data/periods.js` 或 db.js 级单例）；
- **验收**：同一 period 连续请求第二次不再执行过滤/合并（可用打点日志验证）；
  `/api/map` 不再每请求读盘。

### A4（P2）db.js 迁移语义修正

- **现状**：启动全量重放所有 seed；seed 为 `INSERT OR IGNORE` 无法更新已修改行；
  三列迁移在 `MIGRATIONS` 数组之外。
- **目标**：迁移只针对「未应用版本」，seed 按身份 upsert，启动不重放已应用版本。
- **改动范围**：
  - `migrateData` 仅对 `!appliedVersions.has(version)` 的迁移执行 seed；
  - seed 语句改为按 `(dynasty_id, year, short)` 身份 upsert（对已应用版本可手工回滚后重放）；
  - 将 `category/impact/place` 列迁移并入 `MIGRATIONS` 版本数组；
- **验收**：全新库启动速度不随 seed 文件数线性增长；既有库升级无数据丢失；
  migration contract 测试更新后全绿。

### A5（P3）Android 单文件拆分

- **现状**：`MapScreen.kt` ~63KB、`MapRenderer.kt` ~58KB。
- **目标**：按职责拆分，降低单文件认知负担。
- **改动范围**：`MapScreen.kt` 拆出 `MapGestures`（手势收口）、`MapScreenState`（Compose 状态）、
  `MapUiBlocks`（顶栏/图例/横幅布局）；`MapRenderer.kt` 拆出独立的 pass/draw 辅助。
- **验收**：拆分后 lint 通过、P20 真机 FPS 无回退（55-59fps）；`MapScreen.kt` 单文件 < 40KB。

### A6（P3）文档一致性治理

- **现状**：`overview.md` / `AGENTS.md` 部分表述仍含 bridge/「双端同跑」旧语义。
- **目标**：文档与实际实现一致。
- **改动范围**：统一「Web three.js + Android 原生」双实现表述；清理 bridge 相关描述；
  在 `AGENTS.md`「架构边界」补「双端契约共享」条目（A2 落地后）。
- **验收**：`rg -i "webview|bridge" docs/ AGENTS.md` 无过期命中；`overview.md` 架构图与代码一致。

### P1（P1）宋朝内容加深

- **现状**：30 条事件、无人物关系/因果链。
- **目标**：内容深度优先于朝代数量。
- **改动范围**：
  - 宋朝事件扩至百条级（seed 文件拆分或追加，走 `schema_migrations` 新版本）；
  - 新增 `persons` / `event_person` 表（人物轨迹 + 主导/牵连关系），`/api/events` 事件对象附带
    `relatedPersons`（可选字段，**不破坏现有契约**）；
  - 「人物视角」浏览：按人物点亮其事件轨迹（Web 端 `EventBubbles` 增加人物过滤，Android 端同步）。
- **验收**：宋朝事件 ≥ 100 条；人物轨迹过滤可用；`/api/events` 老字段兼容（contract 测试通过）；
  双端新增功能行为一致。

### P2（P2）全时期模式

- **现状**：`periods.json` 已支持多政权并立、图例多政权配色，但产品上仅按朝代单一切换。
- **目标**：给定年份展示当时全部政权版图。
- **改动范围**：顶栏增加「全时期模式」开关；该模式下时间轴范围取所有朝代并集，
  overlay 按年份取所有相关时期政权层（服务端按年选时期 + 前端合并政权面）；
  Android 端同步开关与渲染。
- **验收**：1111 年同时显示宋/辽/西夏政权；图例展示全部政权；朝代模式行为不变。

### P3（P2）事件卡片图与分享

- **现状**：深链接 `?dynasty=&year=&event=` 已有，止于「打开页面」。
- **目标**：生成可传播的事件卡片图。
- **改动范围**：详情面板「分享卡片」按钮 → SVG 合成（地图局部静态截图 + 年份水印 + 事件简述），
  可下载 PNG / 复制到剪贴板；分享文案带深链接。
- **验收**：Web 端可生成并下载卡片图；深链接打开定位到事件并弹详情。

### P4（P3）考据感 UI 显性化

- **现状**：source/license/confidence 已随要素入库，UI 未展示。
- **目标**：详情面板展示资料来源。
- **改动范围**：详情面板「资料来源」折叠区：事件/州府要素的 source、license、confidence、
  古籍原文出处（`evolution`/`tribute` 已有数据可直接展示）；Web + Android 双端。
- **验收**：宋朝任一事件与任一州府详情可看到资料来源；双端一致。

### P5（P3）产品收尾项（对齐 roadmap P2/P4）

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
| P1 | A2 | 双端契约 golden 文件 + 一致性 CI | 架构（防漂移） | ~2-3 天 |
| P1 | A3 | 后端结果级缓存 | 架构（为数据增长铺路） | ~1 天 |
| P1 | P1 | 宋朝内容加深（百条事件 + 人物视角） | 产品 | ~3-5 天 |
| P2 | A4 | db.js 迁移语义修正 | 架构 | ~1 天 |
| P2 | P2 | 全时期模式 | 产品（数据已就绪） | ~2 天 |
| P2 | P3 | 事件卡片图与分享 | 产品增长 | ~1-2 天 |
| P3 | A5 | Android 单文件拆分 | 架构维护 | ~1-2 天 |
| P3 | A6 | 文档一致性治理 | 文档 | ~0.5 天 |
| P3 | P4 | 考据感 UI 显性化 | 产品信任度 | ~1 天 |
| P3 | P5 | 移动端/可访问性/视觉回归收尾 | 产品收尾 | ~3-5 天 |

## 6. 建议执行顺序

1. **A1**（半天清理，降低噪音）→ **A2**（先做契约 golden，为后续所有改动提供双端一致性基座）
   → **A3**（缓存加固，为数据增长铺路）。
2. 产品端并行推进 **P1**（内容加深，最大杠杆）→ **P2**（全时期模式，数据已就绪）→ **P3**（分享增长）。
3. 收尾：**A4/A5/A6** 与 **P4/P5** 按排期填充。

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
