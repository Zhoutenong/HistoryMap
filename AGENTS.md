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

**前后端解耦**（本次重构）：后端 Node + Express + SQLite 提供 JSON API，前端 three.js 通过 `fetch` 消费。后端契约平台无关，未来可整体用 Kotlin/Room 重写为原生 Android，前端零改动。

## 目录结构

```
HistoryMap/
├── AGENTS.md                       # 本文件
├── README.md                       # 一键启动与说明
├── package.json                    # 根：concurrently 一键启动前后端
├── server/                         # 后端（独立 package.json）
│   ├── index.js                    # Express 入口，挂载路由
│   ├── db.js                       # sql.js 连接 + 建表 + seed + 持久化
│   ├── routes/
│   │   ├── map.js                  # GET /api/map         基础地图 GeoJSON
│   │   ├── overlay.js              # GET /api/map/overlay  朝代疆域叠加层（预留）
│   │   ├── events.js               # GET /api/events       朝代事件
│   │   └── meta.js                 # GET /api/meta         朝代起止年
│   ├── data/
│   │   ├── schema.sql              # 建表语句
│   │   ├── seed/
│   │   │   └── 01-song-events.sql  # 宋朝 seed（换朝代加新文件）
│   │   └── geo/china.json          # 基础地图（静态托管）
│   └── history.db                  # SQLite 持久化文件（gitignore，自动生成）
└── client/                         # 前端（独立 package.json）
    ├── index.html
    ├── vite.config.js              # 含 /api → localhost:3001 代理
    └── src/
        ├── main.js                 # 装配入口，用 api.js 取数据
        ├── api.js                  # 【数据层】封装所有 fetch
        ├── map/ChinaMap.js         # GeoJSON → three mesh + 导出 project()
        ├── timeline/Timeline.js    # 时间轴：自动播放/暂停/拖动
        ├── events/EventBubbles.js  # 泡泡层：CSS2DRenderer + 点击交互
        └── styles.css
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
```

目前**无** lint / 单测配置。

## API 契约（平台无关 — 未来 Kotlin/Room 重写后端按此实现）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/map` | 基础中国地图 GeoJSON（FeatureCollection）|
| GET | `/api/map/overlay?dynasty=song` | 朝代疆域叠加层（首期返回空 features，预留扩展）|
| GET | `/api/events?dynasty=song` | 朝代全部事件数组 |
| GET | `/api/meta?dynasty=song` | 朝代元信息（起止年）|

事件对象格式：
```json
{
  "id": 1, "dynasty": "song",
  "year": 960, "yearEnd": 975,
  "coord": [114.35, 34.52],
  "short": "陈桥兵变",
  "title": "陈桥兵变 · 北宋建立",
  "detail": "后周大将赵匡胤……"
}
```

**约定**：`coord` 为 `[lng, lat]`（经度在前，与 GeoJSON 一致）。事件在 `[year, yearEnd]` 时间窗口内显示，过期消失。

## 架构边界（重要，改动时务必遵守）

### 渲染分层

1. **地图层**：`client/src/map/ChinaMap.js` 只负责把 GeoJSON 变成 three.js mesh。所有经纬度→屏幕坐标转换**只能**通过统一投影函数完成，事件层禁止手算坐标。
2. **事件层**：`EventBubbles.js` 不直接操作 three geometry，只通过 `CSS2DObject` 挂到 scene，位置由统一投影函数给出。
3. **时间轴**：`Timeline.js` 是唯一的「当前年份」状态源。地图/泡泡都不维护时间，只接受 `onChange` 回调。

### 数据分层（前后端解耦的核心）

1. **后端**：只管数据存储与查询，不关心渲染。
2. **前端数据层**：`client/src/api.js` 是前端访问后端的**唯一入口**，业务代码（main.js 等）不直接写 URL。换端（Android WebView bridge、mock）只改这一个文件。
3. **前端业务层**：main.js 只做装配，不放业务逻辑；从 api.js 取数据后喂给地图/时间轴/泡泡三模块。

### 坐标与投影

- 单一投影实例在 `ChinaMap.js` 导出的 `project([lng, lat])` 中，事件层 `import { project } from '../map/ChinaMap.js'` 复用。
- `project()` 返回**居中后**的坐标，地图 mesh 与事件泡泡共用，位置天然对齐。
- 事件/坐标字段 `[lng, lat]`（经度在前）。

### 时间

- 年份用整数公历年份（首期 960–1279，由后端 `/api/meta` 给出，前端不写死）。
- 自动播放按「每 `tickMs` 推进一年」节奏。
- 事件只在 `[year, yearEnd]` 窗口内显示，过期消失（这是当前实现；AGENTS 早期版本写过「出现并保留」，已废弃）。

## 数据存储

- **事件/朝代**：SQLite（首期用 `sql.js` 纯 WASM 实现，零编译跨平台；详见「已知坑」）。
- **地图 GeoJSON**：静态文件 `server/data/geo/china.json`，由后端路由直接读出返回。**不进数据库**——大 JSON 进库查询慢，且 GeoJSON 走文件更易替换。
- **seed**：`server/data/seed/*.sql`，按文件名排序执行。换朝代加新 SQL 文件即可。

## 已知坑 / 平台注意

- **Windows 路径**：工作区在 `E:\Code\myCode\HistoryMap`，但 Vite 配置和 import 全部用 POSIX 相对路径，不要混入反斜杠。
- **SQLite 驱动选型**：原计划用 `better-sqlite3`（同步、更快），但它是原生模块，需 node-gyp 编译，在无 VS 构建工具的 Windows 上 `npm install` 失败。本项目改用 **`sql.js`**（纯 WASM，零编译，跨平台）。代价：数据在内存、需手动持久化到 `history.db` 文件；首期数据量小，性能影响可忽略。若部署到生产或数据量增大，可换回 better-sqlite3，只改 `server/db.js` 一个文件，路由层不变。
- **GeoJSON 加载**：前端用 `fetch('/api/map')` 走后端，不要用 `import` 直接引入大 JSON（Vite 会警告体积）。
- **CSS2DRenderer 事件**：泡泡 DOM 上的点击事件要 `stopPropagation`，否则会和地图射线拾取冲突。
- **CSS2DRenderer transform**：`CSS2DRenderer` 每帧用 `.event-bubble` 的 `style.transform` 定位，所以**脉冲/hover 等任何动效都不能写在这个元素上**，否则动画期间定位被覆盖、标签塌到容器原点（左上角）。所有动效放在内层 `.bubble-inner`。
- **顶层 await**：esbuild 默认 target 不支持顶层 await，main.js 用 async IIFE 启动。
- **OrbitControls**：地图允许旋转/缩放，但事件泡泡是 HTML 层，拖动时标签会跟随相机重投影；不要禁用 `CSS2DRenderer` 的更新循环。

## Android 移植指南（未来）

后端契约平台无关，移植步骤：

1. **后端**：用 Kotlin + Ktor（或 Retrofit 服务端）+ Room(SQLite) 重写四个 `/api/*` 接口，返回完全相同的 JSON。
2. **前端**：three.js 代码用 Android `WebView` 加载。把 `client/src/api.js` 整体替换为 WebView JavaScript Interface（原生 bridge 调用 Room），其余前端代码零改动。
3. **数据**：Room schema 对齐 `server/data/schema.sql`，seed 数据导入相同事件。

## 扩展指南（后续加朝代）

新朝代只需：
1. 在 `server/data/seed/` 加 `02-xxx.sql`（INSERT dynasties + events）。
2. （可选）在 `server/data/geo/` 加该朝代疆域文件，实现 overlay 路由。
3. 前端 `client/src/main.js` 把 `DYNASTY` 常量改成新朝代 id。

地图层、泡泡层、时间轴**无需改动**——这是当前架构的核心扩展点。
