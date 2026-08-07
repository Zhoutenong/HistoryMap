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

**前后端解耦**：后端 Node + Express + SQLite 提供 JSON API，前端 three.js 通过 `fetch` 消费。后端契约平台无关，未来可整体用 Kotlin/Room 重写为原生 Android，前端零改动。

## 目录结构

```
HistoryMap/
├── AGENTS.md                       # 本文件
├── README.md                       # 一键启动与说明
├── package.json                    # 根：concurrently 一键启动 + lint/test 脚本
├── eslint.config.mjs               # ESLint 扁平配置（client + server）
├── start-dev.bat / start-dev.ps1   # Windows 双击启动器（环境检查 + 拉起前后端）
├── stop-dev.bat  / stop-dev.ps1    # Windows 双击停止器
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
└── client/                         # 前端（独立 package.json）
    ├── index.html                  # 含顶栏朝代下拉、事件流抽屉、设置面板
    ├── vite.config.js              # 含 /api → localhost:3001 代理
    └── src/
        ├── main.js                 # 装配入口（loadDynasty 装配函数 + 相机取景/聚焦）
        ├── api.js                  # 【数据层】封装所有 fetch（含 getDynasties）
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
```

## API 契约（平台无关 — 未来 Kotlin/Room 重写后端按此实现）

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

`/api/map/overlay` 响应顶层 `properties` 透传 `rivers`（河流示意）、`mountains`（山脉示意），供前端水彩辅助层叠加绘制。

**约定**：`coord` 为 `[lng, lat]`（经度在前，与 GeoJSON 一致）。事件在 `[year, yearEnd]` 时间窗口内显示，过期消失。

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

## Android 移植指南（未来）

后端契约平台无关，移植步骤：

1. **后端**：用 Kotlin + Ktor（或 Retrofit 服务端）+ Room(SQLite) 重写全部 `/api/*` 接口，返回完全相同的 JSON。
2. **前端**：three.js 代码用 Android `WebView` 加载。把 `client/src/api.js` 整体替换为 WebView JavaScript Interface（原生 bridge 调用 Room），其余前端代码零改动。
3. **数据**：Room schema 对齐 `server/data/schema.sql`，seed 数据导入相同事件。

## 扩展指南（后续加朝代）

新朝代只需：
1. 在 `server/data/seed/` 加 `02-xxx.sql`（INSERT dynasties + events，含 place/category 字段）。
2. （可选）在 `server/data/geo/historical/` 加该朝代疆域文件并更新 `periods.json`。
3. 顶栏朝代下拉会自动出现新朝代（来自 `/api/dynasties`），**无需改前端常量**。

地图层、泡泡层、时间轴**无需改动**——这是当前架构的核心扩展点。

## 工程规范

- **Lint**：`npm run lint`（ESLint flat config，扫描 `client/src` 与 `server`；`no-unused-vars` 为 warn，`_` 前缀变量/参数忽略）。测试文件目录（`__tests__/**`）被忽略。
- **单测**：`npm run test`（vitest，client 内 11 用例：`events/__tests__/collisions.test.js` 7 个 + `timeline/__tests__/calc.test.js` 4 个）。纯函数（`collisions.js` / `calc.js`）已从业务模块抽出，便于复用与测试。改算法时同步更新对应测试。
