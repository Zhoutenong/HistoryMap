# AGENTS.md

本项目为 ZCode 智能体提供工作区级指引。先读本文件，再动代码。

## 项目用途

**HistoryMap** —— 基于 three.js 的「中国历史地图」交互式可视化。
首期聚焦 **宋朝（960–1279）**：

- 主画面是一张中国地图（three.js 渲染）。
- 下方时间轴，从宋朝建国（960）到覆灭（1279），可拖动。
- 默认自动播放，可暂停。
- 时间推进到事件年份时，地图对应位置弹出「事件泡泡」（显示事件简称）。
- 点击泡泡查看事件详情。
- 顶栏朝代下拉可在已播种的朝代间切换（数据驱动，前端无需改常量）。

**前后端解耦**：后端 Node + Express + SQLite 提供 JSON API，前端 three.js 通过 `fetch` 消费。后端契约平台无关，**Android 原生版已落地**（Kotlin + Compose + GLES2 自研渲染器，数据层 Room + assets GeoJSON，与 Web 版同契约），详见「Android 原生版」章节。

## 目录结构

```
HistoryMap/
├── AGENTS.md                       # 本文件
├── README.md                       # 一键启动与说明
├── package.json                    # 根：concurrently 一键启动 + lint/test 脚本
├── eslint.config.mjs               # ESLint 扁平配置（client + server）
├── start-dev.bat / start-dev.ps1   # Windows 双击启动器（环境检查 + 拉起前后端）
├── stop-dev.bat  / stop-dev.ps1    # Windows 双击停止器
├── scripts/
│   ├── prepare-android.mjs         # 同步 client/dist + 后端数据 → android assets
│   ├── gen-android-icons.mjs       # 生成启动图标 fallback PNG（一次性）
│   └── …（check-build / contract / smoke 等）
├── android/                        # Android 原生版（Kotlin + Compose + GLES2，已弃用 WebView）
│   ├── build.gradle.kts            # AGP 8.7.3 / Kotlin 2.0.21 / Compose BOM 2024.12.01 / KSP
│   ├── gradlew / gradle/wrapper/   # Gradle 8.9 wrapper
│   └── app/src/main/
│       ├── AndroidManifest.xml
│       ├── java/com/historymap/app/
│       │   ├── MainActivity.kt     # Compose 入口 + 沉浸式全屏
│       │   ├── MapScreen.kt        # 主界面：顶栏/地图/泡泡/时间轴/图例/详情/事件流/设置
│       │   ├── MapRenderer.kt      # GLES2 渲染器：宣纸底/水彩纹理+接触阴影/河道带/相机/标签数据
│       │   ├── Projection.kt       # d3-geo geoMercator + fitSize 的 Kotlin 翻译（与 Web 版坐标一致）
│       │   ├── WatercolorTexture.kt# 水彩离屏生成（羽化/斑驳/边界/颗粒，对齐 TerritoryOverlay.js）
│       │   ├── RiverRibbons.kt     # 河道带几何（变宽三角带+弧长属性；着色器内三层河带/羽化/顺流微动画）
│       │   ├── OverlayParser.kt    # overlay JSON → 渲染模型（政权/河流/标签）
│       │   ├── MapRepository.kt    # 数据仓储（Room + OverlayLoader，等价 api.js 职责）
│       │   ├── TimelineController.kt # 「当前年份」唯一状态源（播放/暂停/拖动/完成）
│       │   ├── TimelineBar.kt      # 时间轴组件（两行布局/手势/刻度吸附）
│       │   ├── EventBubblesLayer.kt# 事件泡泡层（碰撞推挤/指向线/命中测试）
│       │   ├── Collisions.kt       # 碰撞推挤纯函数（翻译 collisions.js）
│       │   ├── EventLogSheet.kt    # 事件流抽屉（已出现列表/搜索）
│       │   ├── SettingsSheet.kt    # 设置面板（分类/速度/显隐）
│       │   ├── SettingsStore.kt    # 设置持久化（SharedPreferences）
│       │   ├── HistoryDb.kt        # Room（dynasties/events 对齐 schema.sql）+ seed 重放器
│       │   └── OverlayLoader.kt    # org.json 复刻 overlay.js 合并逻辑
│       ├── res/                    # 启动图标（adaptive + fallback PNG）
│       └── assets/                 # 数据（seed SQL + geo JSON，由 prepare-android.mjs 同步，gitignore）
├── server/                         # 后端（独立 package.json）
│   ├── index.js                    # Express 入口，挂载路由（含 /api/dynasties）
│   ├── db.js                       # better-sqlite3 连接 + 建表 + seed + 自动迁移
│   ├── routes/
│   │   ├── map.js                  # GET /api/map         基础地图 GeoJSON
│   │   ├── overlay.js              # GET /api/map/overlay  朝代疆域叠加层（按时期）
│   │   ├── events.js               # GET /api/events       朝代事件（含 place 字段）
│   │   ├── meta.js                 # GET /api/meta         朝代起止年 + 时期边界
│   │   └── dynasties.js            # GET /api/dynasties    朝代列表（顶栏下拉）
│   ├── data/
│   │   ├── schema.sql              # 建表语句（含 events.place / impact / category）
│   │   ├── seed/
│   │   │   └── 01-song-events.sql  # 宋朝 seed（30 条事件，换朝代加新文件）
│   │   └── geo/china.json          # 基础地图（静态托管）
│   └── history.db                  # SQLite 持久化文件（gitignore，自动生成）
└── client/                         # 前端（独立 package.json，Web + Android WebView 双端共用）
    ├── index.html                  # 含顶栏朝代下拉、事件流抽屉、设置面板
    ├── vite.config.js              # base './' + target 'chrome83'；/api → localhost:3001 代理
    └── src/
        ├── main.js                 # 装配入口（loadDynasty 装配函数 + 相机取景/聚焦）
        ├── api.js                  # 【数据层】封装所有数据访问（fetch / Android bridge 自动切换）
        ├── dom.js                  # 旧 WebView 兼容工具（clearChildren 等）
        ├── theme.js                # 古典水墨·宣纸主题
        ├── styles.css              # 含移动端 @media (max-width:640px) 适配
        ├── map/
        │   ├── ChinaMap.js         # GeoJSON → three mesh + 导出 project()
        │   ├── TerritoryOverlay.js # 历史疆域叠加层（时期切换 + 淡入）
        │   └── Legend.js           # 政权配色图例
        ├── timeline/
        │   ├── Timeline.js         # 时间轴：自动播放/暂停/拖动/事件刻度点
        │   ├── calc.js             # 纯函数：年份↔轨道百分比、刻度步长
        │   └── __tests__/calc.test.js
        ├── events/
        │   ├── EventBubbles.js     # 泡泡层：CSS2DObject + 同屏折叠(+N) + 指向线
        │   ├── EventLog.js         # 右侧事件流抽屉（搜索框 + 未读徽标）
        │   ├── collisions.js       # 纯函数：屏幕空间碰撞推挤算法
        │   └── __tests__/collisions.test.js
        └── settings/
            ├── SettingsMenu.js     # 分类/速度/自动播放/底图显隐设置面板
            └── store.js            # 设置持久化 + SPEED_MAP / CATEGORIES 常量
```

## 常用命令

```bash
# 首次：安装根、server、client 三处依赖
npm run install:all

# 一键启动前后端（concurrently 同时跑）
npm run dev
#   后端 : http://localhost:3001
#   前端 : http://localhost:5173（自动开浏览器）

# 单独启动
npm run dev:server     # 仅后端
npm run dev:client     # 仅前端

# 生产构建前端
npm run build          # 输出到 client/dist/

# 静态检查（ESLint，扫描 client/src 与 server）
npm run lint

# 单元测试（vitest，client 内 11 个用例：collisions 7 + calc 4）
npm run test

# ===== Android（详见 README「Android 版」章节）=====
npm run build                    # 先构建前端（base './' 相对路径产物）
node scripts/prepare-android.mjs # 同步 dist + 数据 → android/app/src/main/assets/
cd android && ./gradlew assembleDebug   # 构建 APK（Gradle 8.9 wrapper）
adb install -r app/build/outputs/apk/debug/app-debug.apk   # 安装到真机
```

## API 契约（平台无关 — Web 后端 / Android bridge 双实现）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/map` | 基础中国地图 GeoJSON（FeatureCollection）|
| GET | `/api/map/overlay?dynasty=song&period=1111` | 朝代疆域叠加层（按时期返回政权 FeatureCollection，`period` 取 `1111/1200/1279`）|
| GET | `/api/events?dynasty=song` | 朝代全部事件数组（含 `place` 字段；可选 `&category=` 过滤）|
| GET | `/api/meta?dynasty=song` | 朝代元信息（起止年 + 时期边界 periods）|
| GET | `/api/dynasties` | 全部朝代列表（顶栏下拉数据源，按 start_year 升序）|
| GET | `/api/health` | 健康检查（返回 `{ ok: true }`）|

事件对象格式：
```json
{
  "id": 1, "dynasty": "song",
  "year": 960, "yearEnd": 975,
  "coord": [114.35, 34.52],
  "short": "陈桥兵变",
  "title": "陈桥兵变 · 北宋建立",
  "detail": "后周大将赵匡胤……",
  "impact": "结束五代十国乱局……",
  "place": "陈桥驿·开封",
  "category": "era"
}
```

`category` 取值：`era` 时代格局 / `figure` 名人轨迹 / `military` 军事·领土 / `economy` 经济变革 / `invention` 重要发明。

`/api/map/overlay` 响应顶层 `properties` 透传 `rivers`（河流示意）、`mountains`（山脉示意）、`cities`、`places`，供前端水彩辅助层叠加绘制；另透传 `prefectures`（州府面**完整 Feature 数组**，Polygon 保留 geometry）与 `prefectureSeats`（州府治所 legacy 点数组）——**州府级数据（元丰九域志基准）**，详见「州府级数据」章节。

**约定**：`coord` 为 `[lng, lat]`（经度在前，与 GeoJSON 一致）。事件在 `[year, yearEnd]` 时间窗口内显示，过期消失。

## 州府级数据（元丰九域志基准，北宋 song-1111）

数据管线（scripts/，均为幂等可重跑）：

```bash
npm run data:classics     # 古籍解析：元丰九域志（kanripo KR2k0005）→ server/data/geo/song/jiuyuzhi-1080.json
                          #            + 舆地广记（维基文库四库本 38 卷）→ yudi-guangji.json（含政和改名交叉比对）
npm run data:seats        # 治所坐标：复旦 TGaz（CHGIS）按治所县名查询 yr=1080 + scripts/manual-seats.song.json
                          #   人工标定兜底 → _generated/song-seats-1080.json（gitignore）
npm run data:prefectures  # Voronoi 近似州府面（d3-delaunay + polygon-clipping 与宋政权轮廓求交）
                          #   → server/data/geo/historical/prefectures.geojson（gitignore）
npm run data:check        # 校验：GeoJSON 结构/数量/坐标范围/名称交叉
```

**许可红线**：`prefectures.geojson` 含 CHGIS 派生坐标（不可再分发、非商用），**不入 git**——`server/data/geo/historical/_generated/` 已 gitignore，克隆后需本地重跑上述管线。古籍解析结果（九域志/舆地广记 JSON）与人工标定坐标表（manual-seats.song.json）为公版/事实数据，**随仓库提交**。

数据要点：
- 州府面 `kind: prefecture`（`style: stroke-only`，Voronoi 近似边界，`confidence: low/medium`）；
  治所点 `kind: prefecture-seat`（CHGIS/人工标定坐标）。`rank`：1 京府 / 2 次府 / 3 户口≥5万 / 4 ≥1万 / 5 其他。
- properties 含 `route`（路）、`type`（府州军监）、`grade`、`households`（主/客户，元丰九域志）、
  `tribute`（土贡）、`seat`/`seatCoord`、`countyCount`/`counties`（属县）、`evolution`（舆地广记沿革）。
- 渲染：Web 端州府描边走独立 canvas plane（z=7.02，「州府边界」开关独立控制），治所标注为
  `.prefecture-label`（rank<=2 加 `.major`，可点击打开府州详情面板）；Android 端 WatercolorBuilder
  同款仅描边分支 + Compose 标签层。
- 四库本底本缺文记录：九域志缺邢州头行（占位州已定名）、部分州缺「縣N」行/治所注記（warning 输出）；
  岳州/万州为四库本误刻（峽州巴陵郡/方州南浦郡），已按舆地广记校正并保留 `sourceFix`。

## 架构边界（重要，改动时务必遵守）

### 渲染分层

1. **地图层**：`client/src/map/ChinaMap.js` 只负责把 GeoJSON 变成 three.js mesh。所有经纬度→屏幕坐标转换**只能**通过统一投影函数完成，事件层禁止手算坐标。
2. **事件层**：`EventBubbles.js` 不直接操作 three geometry，只通过 `CSS2DObject` 挂到 scene，位置由统一投影函数给出。同屏挤压时由 `collisions.js` 推挤或折叠成 `+N` 聚合泡泡；指向线（`bubble-leaders` SVG）每帧在 `animate()` 里 `syncLeaders()` 跟随。
3. **时间轴**：`Timeline.js` 是唯一的「当前年份」状态源。地图/泡泡都不维护时间，只接受 `onChange` 回调。

### 数据分层（前后端解耦的核心）

1. **后端**：只管数据存储与查询，不关心渲染。
2. **前端数据层**：`client/src/api.js` 是前端访问后端的**唯一入口**（含 `getMap/getOverlay/getEvents/getMeta/getDynasties`），业务代码（main.js 等）不直接写 URL。换端（Android WebView bridge、mock）只改这一个文件。
3. **前端业务层**：main.js 只做装配；核心装配函数 `loadDynasty(dynastyId)` 统一处理初始加载与朝代切换（重建 overlay/泡泡/时间轴范围），从 api.js 取数据后喂给地图/时间轴/泡泡三模块。

### 坐标与投影

- 单一投影实例在 `ChinaMap.js` 导出的 `project([lng, lat])` 中，事件层 `import { project } from '../map/ChinaMap.js'` 复用。
- `project()` 返回**居中后**的坐标，地图 mesh 与事件泡泡共用，位置天然对齐。
- 投影用历史疆域（覆盖中国及周边）做 `fitProjection` 标定，保证现代底图即便隐藏，投影仍有效。
- 事件/坐标字段 `[lng, lat]`（经度在前）。

### 时间

- 年份用整数公历年份（首期 960–1279，由后端 `/api/meta` 给出，前端不写死）。
- 时期边界（如北宋/南宋切换点 1127）同样数据驱动，来自 `/api/meta` 的 `periods` 字段，跨过边界时自动重载疆域叠加层并弹出时期转场横幅。
- 自动播放按「每 `tickMs` 推进一年」节奏。
- 事件只在 `[year, yearEnd]` 窗口内显示，过期消失。

## 数据存储

- **事件/朝代**：SQLite，驱动为 **`better-sqlite3`**（原生同步驱动，Windows 上直接安装预编译二进制，无需 VS 构建工具；详见「已知坑」）。db.js 开启 WAL 模式，写入由驱动直接落盘，无需手动持久化。
- **基础底图 GeoJSON**：静态文件 `server/data/geo/china.json`（现代中国省界），由 `/api/map` 路由直接读出返回。**不进数据库**——大 JSON 进库查询慢，且 GeoJSON 走文件更易替换。默认隐藏，作"现代对比层"用。
- **历史疆域 GeoJSON**：`server/data/geo/historical/regimes-{1100,1200,1279}.json`，由 `/api/map/overlay` 路由按 `periods.json` 索引读取。**数据源**：[aourednik/historical-basemaps](https://github.com/aourednik/historical-basemaps) (GPL-3.0)，含宋/辽/西夏/金/吐蕃/大理/蒙古/高丽/大越/高棉/占婆/蒲甘等政权的真实历史轮廓。重新生成：`node server/scripts/fetch_historical_basemaps.js`。详见 `server/data/geo/historical/README.md`。
- **seed**：`server/data/seed/*.sql`，按文件名排序执行；以 dynasties 表是否有记录判定是否需要 seed。换朝代加新 SQL 文件即可（顶栏下拉会自动出现）。

## 前端能力概览

- **顶栏朝代下拉**：`#dynasty-select`，数据来自 `/api/dynasties`，切换朝代走 `loadDynasty()`（无需改代码常量）。
- **事件流抽屉**：`EventLog` 右侧抽屉，顶栏 ☰ 开关，含搜索框（按简称/标题模糊匹配）与未读徽标。
- **事件泡泡**：同屏拥挤时折叠为 `+N` 聚合泡泡；指向线（`bubble-leaders` SVG）从事件真实位置连到泡泡，带箭头，每帧 `syncLeaders()` 跟随。
- **详情面板**：含地点徽章（`place`）、影响栏、相关事件；打开时地图缩小左移让位并相机聚焦。
- **设置面板**：分类过滤、播放速度、自动播放、底图/疆域显隐。
- **移动端**：`@media (max-width: 640px)` 下详情面板改为底部抽屉（全宽、上圆角、60vh 滚动），设置面板全屏化。

## 已知坑 / 平台注意

- **Windows 路径**：工作区在 `E:\Code\myCode\HistoryMap`，但 Vite 配置和 import 全部用 POSIX 相对路径，不要混入反斜杠。
- **SQLite 驱动**：已从早期的 `sql.js`（纯 WASM）换为 **`better-sqlite3`**。better-sqlite3 现在提供 Node 预编译二进制，**Windows 上无需 VS 构建工具即可 `npm install`**，早期「无 VS 构建工具装不上」的结论已作废。better-sqlite3 同步 API 更简单、性能更好，持久化由驱动直接落盘，db.js 不再需要手动 export 写文件。若未来迁移原生 Android：用 Room/SQLite 替换 `server/db.js` 一个文件，路由层与 API 契约不变。
- **GeoJSON 加载**：前端用 `fetch('/api/map')` 走后端，不要用 `import` 直接引入大 JSON（Vite 会警告体积）。
- **CSS2DRenderer 事件**：泡泡 DOM 上的点击事件要 `stopPropagation`，否则会和地图射线拾取冲突。
- **CSS2DRenderer transform**：`CSS2DRenderer` 每帧用 `.event-bubble` 的 `style.transform` 定位，所以**脉冲/hover 等任何动效都不能写在这个元素上**，否则动画期间定位被覆盖、标签塌到容器原点（左上角）。所有动效放在内层 `.bubble-inner`。
- **顶层 await**：esbuild 默认 target 不支持顶层 await，main.js 用 async IIFE 启动。
- **OrbitControls**：地图锁定旋转、只保留缩放/平移；事件泡泡是 HTML 层，拖动/缩放时标签会跟随相机重投影（debounce 150ms 后重排碰撞）。不要禁用 `CSS2DRenderer` 的更新循环。
- **CSS2DObject 残留**：时期切换/朝代切换清空 overlay group 时，`CSS2DObject` 缓存不会自动清理已从 scene 移除对象的 DOM，需手动摘除（见 `clearOverlayGroup`），否则旧政权名标签残留。
- **WebView 兼容（Android 真机）**：部分真机自带 WebView 很旧（华为 P20 = Chrome 83）。前端因此做了两处兼容：① vite `build.target: 'chrome83'`（产物语法层面）；② `Element.replaceChildren()`（Chrome 86+）在 `client/src/dom.js` 提供 `clearChildren()` 兼容实现，禁止再引入 Chrome 86+ 的 DOM API 到业务代码。
- **Kotlin 注释陷阱**：KDoc 里写 `assets/seed/*.sql`、`/api/*` 会触发 Kotlin 嵌套块注释解析错误（Unclosed comment），文案改为「seed 目录的 .sql 文件」。
- **Android 本地构建**：机器需有 `android/local.properties`（sdk.dir 用正斜杠 `D:/Android/SDK`，反斜杠转义会致 `SdkLocator` 抛 IOException）；Gradle 8.9 + AGP 8.7.3 + Kotlin 2.0.21 + KSP 2.0.21-1.0.28 组合与本地缓存匹配，可离线构建。
- **AndroidView 手势收口（Compose interop 大坑）**：GLSurfaceView（AndroidView）之上只要叠任何全屏 Compose `pointerInput` modifier（哪怕手势不 consume 事件），Compose 就会接管整个手势流，GLSurfaceView 的 `setOnTouchListener` 收不到 down——地图拖动/缩放/双击**全部静默失效**（曾被误判为「时期切换导致视野变化」）。正确做法：地图区所有手势（泡泡 tap 命中/拖动/双指缩放/双击复位）**统一收口在 GLSurfaceView 的 touch listener**（GestureDetector + ScaleGestureDetector，pinch 期间 `isInProgress` 守卫跳过 scroll），泡泡命中用 `hitTestBubble` 纯函数在 `onSingleTapConfirmed` 里做，命中参数经 `bubbleHitArgs` 状态快照桥接组合期数据（见 MapScreen.kt）。地图区之上只允许无输入的层（Canvas/Text）。
- **Android 字体换算双语义**：`MapTokens.Typography` 与 Web 版 CSS px **同值**（viewport=width=device-width 下 1 CSS px ≈ 1sp，逻辑单位），换算用 `DesignMetrics.designToSp`（×宽度比例，**不除** BASE_DENSITY）/ `designToTextPx`（×density）；而 `MapTokens.Dimensions` 是 1080 物理画布 px（布局尺寸），换算用 `designToDp`（÷3）。曾因 Typography 误除 3 导致全部 UI/地图标签字号缩小 ~60%（P20 上顶栏仅 7.5sp），用 FONT_SCALE=1.25 打补丁治标不治本，2026-08 修正换算并归一 FONT_SCALE=1.0。

## Android 原生版（已落地，见 `android/`；2026-08 由 WebView 壳重构而来）

与 Web 版同数据契约、同交互语义，渲染与 UI 全部原生实现：

1. **渲染层**：GLSurfaceView + 自研 GLES2 渲染器（`MapRenderer.kt`）——宣纸底/暗角（片元着色器）、
   政权水彩纹理 quad（`WatercolorTexture.kt` 离屏生成：羽化/斑驳/边界/颗粒）+ 接触阴影 pass（贴图
   alpha 勾形、右下偏移，统一左上光向）、山脉纹理 quad、**河道带几何**（`RiverRibbons.kt`：变宽三角带
   [上游窄→入海口宽] + 着色器内水痕/主体/脊线三层与两岸羽化 + uTime 顺流微动画；河流不再走 CPU 纹理）。
   投影（`Projection.kt`）翻译 d3-geo geoMercator + fitSize([1000,800])，与 Web 版 `project()` 输出完全一致。
   （河道带/阴影借鉴 HoMM3 美术纪律：有机衔接、统一光向焙烧阴影、稀疏动画；token 见 MapTokens.MapParams
   RIVER_TAPER_*/RIVER_FLOW_*/REGIME_SHADOW_*）
2. **数据层**：`MapRepository.kt`（Room + OverlayLoader）等价 Web 版 api.js 职责；Room schema 与
   seed 重放机制同 WebView 时代（`HistoryDb.kt` 不变）；assets 数据由 `scripts/prepare-android.mjs` 同步。
3. **UI 层**：Compose——时间轴（`TimelineController` 是「当前年份」唯一状态源，播放/暂停/拖动/播放完毕/重播）、
   事件泡泡（碰撞推挤翻译 collisions.js + 指向线 + 出屏回收）、详情/事件流/设置（ModalBottomSheet）、
   图例、时期切换（跨年自动重载疆域，投影首次标定后不再变）。
4. **交互**：单指平移/双指缩放/双击复位；返回键由 sheet 优先消费（详情→设置→事件流→退出）；
   设置持久化 SharedPreferences；沉浸式全屏（focus 后重新隐藏系统栏）。
5. **性能**：P20 实测 55-59fps（自动播放全功能），渲染器每 5 秒输出 FPS 日志（`adb logcat -s HistoryMap`）。
6. **构建**：`cd android && ./gradlew assembleDebug`（离线可构建，依赖与本地缓存匹配）。
7. **数据更新**：改后端 seed / GeoJSON 后重跑 `node scripts/prepare-android.mjs` 重装即可。

## 资源贴图（水彩疆域层烘焙优先）

水彩疆域层已改为**资源贴图优先**：`npm run bake:textures` 用当前 GeoJSON 生成
纯色占位贴图（`client/public/textures/overlay/`），运行时 `TerritoryOverlay.js`
按 manifest.json 加载贴图替换程序化 canvas 纹理（失败静默回退程序化渲染）。
**配准纪律**：贴图只画"画什么"，位置由运行时 worldBox（geojson + project()）决定；
脚本与浏览器共用 `fit-geojson.json`（全时期 bbox）标定投影，保证精确对齐。

**水彩版（Penpot 管线）**：`npm run penpot:svg`（GeoJSON → 简化 SVG，同投影同 worldBox，
输出 `artifacts/penpot/*.svg`）→ 在 Penpot（MCP 已配置全局 opencode.json）里导入并三层化
（bloom 晕染/body 主体/edge 描边，样式可视化可调）→ 提取样式 → `npm run penpot:render`
（本地 `@napi-rs/canvas` 水彩渲染：斑驳/干边/羽化，覆盖贴图并更新 manifest status=penpot）。
当前 8 张均为 penpot-v1（水彩版），样式默认 token + 宋政权示范样式（`artifacts/penpot/styles.json`）。
**状态标注在 `docs/texture-bake-plan.md`**（占位=placeholder-rework，水彩=penpot-v1，定稿=done），
每次改动贴图/管线后必须更新该文档。数据变更后先重跑 bake 再走 penpot 两步，勿手改贴图。

## 扩展指南（后续加朝代）

新朝代只需：
1. 在 `server/data/seed/` 加 `02-xxx.sql`（INSERT dynasties + events，含 place/category 字段）。
2. （可选）在 `server/data/geo/historical/` 加该朝代疆域文件并更新 `periods.json`。
3. 顶栏朝代下拉会自动出现新朝代（来自 `/api/dynasties`），**无需改前端常量**。

地图层、泡泡层、时间轴**无需改动**——这是当前架构的核心扩展点。

## 工程规范

- **Lint**：`npm run lint`（ESLint flat config，扫描 `client/src` 与 `server`；`no-unused-vars` 为 warn，`_` 前缀变量/参数忽略）。测试文件目录（`__tests__/**`）被忽略。
- **单测**：`npm run test`（vitest，client 内 11 用例：`events/__tests__/collisions.test.js` 7 个 + `timeline/__tests__/calc.test.js` 4 个）。纯函数（`collisions.js` / `calc.js`）已从业务模块抽出，便于复用与测试。改算法时同步更新对应测试。

## 时空数据库（PostgreSQL + PostGIS，时间版本化）

与渲染数据（overlay GeoJSON）平行的一套**逐实体时间版本化**体系（`docs/temporal-db-plan.md`）：

- **存储**：本机 PostgreSQL 16.4（`C:/pg16`，数据目录 `C:/pgdata`）+ PostGIS 3.6.2，库 `historymap`；
  连接串在 `server/.env` 的 `DATABASE_URL`（gitignore）。启动：
  `C:/pg16/bin/pg_ctl.exe -D C:/pgdata -l C:/pgdata/server.log -o "-p 5432" start`
- **Schema**（`server/data/schema-temporal.sql`）：`sources`（史料源）/ `places`（实体稳定身份）/
  `place_versions`（valid_from/valid_to 生命周期 + PostGIS geom，版本不重叠 trigger）/
  `place_events`（变更事件，可溯源）
- **管线**：`npm run data:songshi`（宋史·地理志 ctext + 事件提取）→ `npm run data:temporal`
  （三源合并写 PG）→ `npm run data:temporal:check`（时间线一致性校验）。
  事件提取规则经验（年号表/县级甄别/军额vs政区/快照优先）见 `docs/temporal-db-plan.md` §四。
- **API**：`GET /api/places`（按年/类型/名称/路查有效版本）、`/api/places/:id`（详情+事件时间线）、
  `/api/places/sources`。时空库未启用（无 DATABASE_URL）时返回 503，**不影响** SQLite 既有 API。
- **前端**：`api.js` 的 `getPlaces/getPlace/getPlaceSources`；州府详情面板异步加载
  生命周期/史料/置信度（503 时静默降级）。
- **许可**：古籍解析（九域志/舆地广记/宋史）为公版可提交；治所坐标来自 CHGIS TGaz 查询
  （非商业学术，本地派生不入库）；`_generated/` 与 `prefectures.geojson` gitignore。

## 子 agent 模型路由（mimo-v2.5 备忘录，新会话免查证）

用户说「用 mimo / mimo-v2.5 做子 agent / 子任务」时，指本机已注册的模型 **`mimo-v2.5`**，
**无需再检查/查证**，按以下约定直接执行：

- **注册位置**：`~/.dsh/settings.yaml` → `llm-pi-ai.providers.opencode-go.models`（模型 id `mimo-v2.5`，
  API key 环境变量 `OPENCODE_GO_API_KEY`）。
- **唯一可用通道**：`workflow` 工具的 `agent()` 选项支持 per-agent 覆盖：
  `agent(prompt, { provider: 'opencode-go', model: 'mimo-v2.5' })`；
  整阶段统一指定则在 `meta.phases` 里给对应 phase 声明 `provider`/`model`。
  框架内部将其转为子代理 `agentOptions: { provider, model }`（继承父级后覆盖）。
- **不可用通道**：普通 `subagent` / `subagent_fork` 工具**无 model 参数**，子代理默认继承
  父级模型（本机默认 `opencode-go` / `deepseek-v4-flash`），不能直接指定 mimo。
- **子代理提示词必须自包含**：子代理看不到父会话上下文，任务里需写清文件路径、契约、输出格式。
- **成本**：走 opencode-go 提供方，消耗真实 API 额度；模型名/提供方写错时 workflow 直接报错中断。
- **角色分工**：父 agent 负责规划/拆解/验收，mimo-v2.5 只执行被派发的子任务；workflow 仅回收子代理最终文本。
