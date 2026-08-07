# HistoryMap · 中国历史地图

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

## 单独运行 / 构建 / 检查

```bash
npm run dev:server     # 仅后端
npm run dev:client     # 仅前端
npm run build          # 构建前端到 client/dist/
npm run lint           # ESLint 静态检查（client/src + server）
npm run test           # vitest 单元测试（client 内 11 用例）
```

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
| GET | `/api/map/overlay?dynasty=song&period=1111` | 朝代疆域叠加层（按时期；顶层 `properties` 透传 rivers/mountains）|

## 项目结构

```
HistoryMap/
├── eslint.config.mjs     # ESLint 扁平配置
├── start-dev.*           # Windows 双击启动/停止器
├── server/               # Express + better-sqlite3 后端
│   ├── routes/           # map / events / meta / overlay / dynasties
│   └── data/             # schema.sql + seed/*.sql + geo/（含 historical 疆域）
└── client/               # three.js 前端
    └── src/
        ├── api.js        # 数据层（封装所有 fetch）
        ├── map/          # 地图层（ChinaMap / TerritoryOverlay / Legend）
        ├── timeline/     # 时间轴 + calc.js（纯函数）+ __tests__
        ├── events/       # 事件泡泡 / 事件流 / collisions.js（纯函数）+ __tests__
        └── settings/     # 设置面板 + store
```

详细架构、约定、已知坑见 [AGENTS.md](./AGENTS.md)。

## 加新朝代

1. `server/data/seed/` 加 `02-xxx.sql`（INSERT dynasties + events，含 place/category 字段）。
2. （可选）`server/data/geo/historical/` 加该朝代疆域文件并更新 `periods.json`。
3. 顶栏朝代下拉会自动出现新朝代（来自 `/api/dynasties`），**无需改前端常量**。
4. 地图/泡泡/时间轴代码无需改动。

## 技术栈

- 前端：three.js + d3-geo + Vite；测试 vitest
- 后端：Express + better-sqlite3（原生同步驱动，Windows 预编译二进制免编译）；ESLint 静态检查
