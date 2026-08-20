# HistoryMap · 中国历史地图

![CI](https://github.com/Zhoutenong/HistoryMap/actions/workflows/ci.yml/badge.svg)

基于 three.js 的中国历史地图交互式可视化，首期为**宋朝（960–1279）**。

主画面是一张中国地图，下方时间轴自动播放（可暂停/拖动），时间推进时地图上弹出历史事件泡泡，点击查看详情。顶栏朝代下拉可在已播种的朝代间切换。

前后端解耦：**Express + SQLite 后端** + **three.js 前端**。后端 API 契约平台无关，未来可整体用 Kotlin/Room 重写为原生 Android，前端零改动。

## 快速开始

### 方式一：双击启动器（推荐，Windows）

```text
1. 首次使用：在项目根目录打开终端执行  npm run install:all
2. 双击  start-dev.bat    —— 检查环境后自动启动前后端并打开浏览器
3. 双击  stop-dev.bat    —— 停止前后端服务
```

启动器（`start-dev.ps1` / `stop-dev.ps1`）会检查 Node.js / 依赖 / 端口占用，缺什么会提示；前后端各开一个独立窗口。

### 方式二：命令行

```bash
# 1. 安装三处依赖（根 / server / client）
npm run install:all

# 2. 一键启动前后端
npm run dev
```

启动后：
- 前端：http://localhost:5173 （自动打开）
- 后端：http://localhost:3001

## Android 版（原生 APK）

Android 端为 **Kotlin + Jetpack Compose + 自研 GLES2 渲染器**的原生实现（已弃用早期 WebView 壳），与 Web 版共用同一份数据契约与数据源：渲染（`MapRenderer.kt`，宣纸底/水彩疆域/河道带/山脉）、UI（`MapScreen.kt` 时间轴/泡泡/详情/设置）、数据层（Room + assets GeoJSON，`MapRepository.kt`）。详见 `AGENTS.md`「Android 原生版」章节。

构建流程（不需要先构建 Web 前端；数据由脚本同步进 assets）：

```bash
# 1. 同步服务端数据（seed SQL + geo JSON + 烘焙贴图）到 android/app/src/main/assets/（只复制不加工）
node scripts/prepare-android.mjs

# 2. 构建 APK（Gradle wrapper 8.9 + AGP 8.7.3 + Kotlin 2.0.21 + Compose BOM + KSP）
cd android && ./gradlew assembleDebug

# 3. 安装并启动（真机需开启 USB 调试）
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.historymap.app/.MainActivity
```

要点：

- **数据层**：Room（`HistoryDb.kt`）schema 对齐 `server/data/schema.sql`；首次建库时重放 `assets/seed/*.sql`（与后端同一份 SQL，`INSERT OR IGNORE` 幂等）；`OverlayParser` / `OverlayLoader`（Kotlin/org.json）复刻服务端 overlay 合并/注入逻辑，输出与 `/api/map/overlay` 完全一致的 JSON 契约。
- **渲染**：GLSurfaceView + 自研 GLES2 渲染器（`MapRenderer.kt`）——宣纸底、水彩疆域纹理、河道带几何、山脉纹理、正交相机（单指拖动/双指缩放/双击复位）；投影 `Projection.kt` 翻译 d3-geo geoMercator + fitSize，与 Web 版 `project()` 输出一致。
- **贴图**：水彩疆域层优先使用 `client/public/textures/overlay/` 烘焙贴图（经 `prepare-android.mjs` 同步进 assets），失败静默回退程序化渲染；`watercolorWorldBox` 与 Web 同逻辑保证对齐。
- **离线**：完全离线运行，无网络依赖；时空库详情接口（`/api/places`）未启用时 503 静默降级，不影响主流程。
- 地理数据源自 [aourednik/historical-basemaps](https://github.com/aourednik/historical-basemaps)（GPL-3.0），随 App 一并分发。

## 单独运行 / 构建 / 检查

```bash
npm run dev:server     # 仅后端
npm run dev:client     # 仅前端
npm run build          # 构建前端到 client/dist/
npm run lint           # ESLint 静态检查（client/src + server + scripts）
npm run test           # vitest 单元测试（client 内 44 用例）
npm run check:build    # 检查 client/dist/index.html 与打包 assets
npm run contract       # 校验历史 GeoJSON 与可选 API overlay 契约
npm run contract:db-migration  # 校验数据库版本化 seed 迁移契约
npm run smoke          # 检查运行中的生产服务页面与关键 API
npm run e2e            # Playwright 桌面/移动 smoke（需先 npm run build 并启动后端 :3001）
npm audit              # 查看根目录依赖安全报告（CI 以 high 级别报告，不阻塞）
```

## 州府级数据管线（北宋州府边界 + 治所标注 + 府州详情）

地图的北宋州府级数据（元丰九域志 1080 基准：287 个州府近似边界 + 290 个治所 + 户口/土贡/沿革）由古籍与 CHGIS 派生，**克隆后需先本地生成**（含 CHGIS 派生坐标的文件不入 git，见 `docs/data-improvement-plan.md` 许可矩阵）：

```bash
npm run data:classics     # ① 古籍解析：元丰九域志（kanripo）+ 舆地广记（维基文库，交叉比对）
npm run data:seats        # ② 治所坐标：复旦 TGaz（CHGIS）查询 + 人工标定兜底
npm run data:prefectures  # ③ Voronoi 近似州府面 + 宋政权轮廓裁剪 → prefectures.geojson
npm run data:check        # ④ 数据校验（数量/坐标/名称交叉）
```

生成后重启后端即可在 Web 与 Android 双端看到：州府淡墨边界、治所名标注（点击打开府州详情面板：户口/土贡/沿革/属县）、设置面板「州府边界」开关。

CI 依次执行三处依赖安装、lint、Vitest、生产构建、构建产物检查、GeoJSON/API contract 检查和生产服务 smoke；同时报告根目录、client、server 的 `npm audit --audit-level=high` 结果。npm 缓存命中状态会在 CI 日志中输出。

## 生产部署

先构建前端，再由后端进程同时提供静态页面和 `/api/*` 接口：

```bash
npm run build
npm --prefix server start
npm run smoke
```

默认访问 `http://localhost:3001`。部署到其他端口时设置 `PORT`，例如 `PORT=8080 npm --prefix server start`；smoke 检查也可传入服务地址：`npm run smoke -- http://localhost:8080`。生产启动前必须存在 `client/dist/`，否则请先执行构建。

## 快捷键

- `空格` 播放 / 暂停时间轴
- `← / →` 逐年前进 / 后退
- `Esc` 关闭详情 / 设置面板

## 交互

- 顶栏朝代下拉：切换朝代（数据来自 `/api/dynasties`，无需改代码）。
- 事件泡泡：点击查看详情；同屏拥挤时折叠为 `+N` 聚合泡泡，带指向线箭头。
- 右侧事件流抽屉：顶栏 ☰ 开关，含搜索框（按简称/标题模糊匹配）与未读徽标。
- 详情面板：显示地点徽章、事件影响、相关事件；打开时地图缩小让位并相机聚焦。
- 移动端（<640px）：详情面板改为底部抽屉，设置面板全屏化。

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/map` | 中国地图 GeoJSON（现代省界）|
| GET | `/api/events?dynasty=song` | 朝代全部事件（含 `place` 字段；可选 `&category=` 过滤）|
| GET | `/api/meta?dynasty=song` | 朝代起止年 + 时期边界 periods |
| GET | `/api/dynasties` | 全部朝代列表（顶栏下拉数据源）|
| GET | `/api/map/overlay?dynasty=song&period=1111` | 朝代疆域叠加层（按时期；顶层 `properties` 透传 rivers/mountains/cities/places）|

## 项目结构

```
HistoryMap/
├── eslint.config.mjs     # ESLint 扁平配置
├── start-dev.*           # Windows 双击启动/停止器
├── scripts/              # 构建/契约检查脚本（含 prepare-android.mjs 数据同步）
├── android/              # Android 原生版（Kotlin + Compose + GLES2 自研渲染器）
│   └── app/src/main/
│       ├── java/com/historymap/app/   # MainActivity / MapScreen / MapRenderer / Projection / HistoryDb / OverlayLoader 等
│       └── assets/                    # seed SQL + GeoJSON + 烘焙贴图（prepare-android.mjs 同步）
├── server/               # Express + better-sqlite3 后端
│   ├── routes/           # map / events / meta / overlay / dynasties
│   └── data/             # schema.sql + seed/*.sql + geo/（含 historical 疆域）
└── client/               # three.js Web 前端（桌面端；Android 原生版与 Web 共用同源数据契约）
    └── src/
        ├── api.js        # 数据层（fetch 访问后端 API；早期也兼容 Android bridge 自动切换）
        ├── dom.js        # DOM 兼容工具（clearChildren，兼顾旧 WebView 时代）
        ├── map/          # 地图层（ChinaMap / TerritoryOverlay / Legend）
        ├── timeline/     # 时间轴 + calc.js（纯函数）+ __tests__
        ├── events/       # 事件泡泡 / 事件流 / collisions.js（纯函数）+ __tests__
        └── settings/     # 设置面板 + store
```

详细架构、约定、已知坑见 [AGENTS.md](./AGENTS.md)。
当前未完成工作、优先级、验收标准与进度标记见 [docs/roadmap.md](./docs/roadmap.md)。

## 已接入朝代

当前已接入宋朝（960—1279）、金朝（1115—1234）、辽朝（916—1125）与元朝（1271—1368）：

- 金朝：24 条事件、3 个历史时期及对应疆域/辅助层数据
- 辽朝：21 条事件、1 个历史时期（复用 1100 年疆域快照）
- 元朝：20 条事件、2 个历史时期（1279 与 1300 年疆域快照）

均可通过顶栏朝代下拉切换。地点要素（都城/战场/书院）以 `places.geojson` 提供，按时期过滤后经 overlay 响应 `properties.places` 透传渲染。

新增 seed 通过版本化迁移（`schema_migrations`）在服务启动时自动应用到已有数据库，无需删除 `server/history.db`；seed 使用 `INSERT OR IGNORE` + 事件唯一索引 `(dynasty_id, year, short)` 保证幂等。

## 加新朝代

1. `server/data/seed/` 加 `NN-xxx.sql`（INSERT dynasties + events，含 place/category 字段；参照 01-04 现有文件）。
2. （可选）`server/data/geo/historical/` 加该朝代疆域文件并更新 `periods.json`。
3. 顶栏朝代下拉会自动出现新朝代（来自 `/api/dynasties`），**无需改前端常量**。
4. 地图/泡泡/时间轴代码无需改动。

## 设计 Token（唯一视觉真相源）

Android 原生版的全部视觉参数以 **`docs/design_optimize/design-tokens.json`** 为唯一设计输入（canonical）：

- Kotlin 单源：`android/.../MapVisualTokens.kt` 分层组织 `Colors / Alpha / Dimensions / Typography / MapParams / Bubble / Timeline`；
- 校验：`npm run check:tokens`（`scripts/check-visual-tokens.mjs`）逐项核对 token 值，并软告警渲染代码中的视觉魔法数；
- 尺寸换算：`DesignMetrics.kt` 把设计画布（1080×2244 @480dpi）换算为 dp/sp/px，禁止把设计 px 直接写成同名 dp；
- `docs/_archive/design-tokens.json` 为**已废弃的旧像素采样草稿**（`_meta.status=superseded`），已归档仅作历史参考，勿引用其数值。

## 技术栈

- 前端：three.js + d3-geo + Vite；测试 vitest
- 后端：Express + better-sqlite3（原生同步驱动，Windows 预编译二进制免编译）；ESLint 静态检查
- Android：Kotlin + Jetpack Compose + GLES2 自研渲染器 + Room（KSP）；Gradle 8.9 / AGP 8.7.3

## 宋代时空数据库（PostgreSQL + PostGIS，时间版本化）

在州府渲染数据之上，另有一套**逐实体时间版本化**的时空库（`docs/temporal-db-plan.md`）：
每个州府实体带 `valid_from/valid_to` 生命周期（升府/废州/新置/复置/改名切分）、PostGIS 几何、
史料 Source（元丰九域志/舆地广记/宋史·地理志）、数值化 Confidence。

```bash
npm run data:songshi         # 宋史·地理志（ctext）+ 变更事件提取（年号表+动作词规则）
npm run data:temporal        # 三源合并 → 写入 PostgreSQL（需 server/.env 的 DATABASE_URL）
npm run data:temporal:check  # 时间线一致性校验
```

查询示例：`GET /api/places?year=1100&name=拱州` → 返回 1100 年有效的实体版本
（几何/史料/置信度）。时空库未配置时该端点返回 503，不影响地图与事件等基础功能。
