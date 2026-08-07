# HistoryMap · 中国历史地图

基于 three.js 的中国历史地图交互式可视化，首期为**宋朝（960–1279）**。

主画面是一张中国地图，下方时间轴自动播放（可暂停/拖动），时间推进时地图上弹出历史事件泡泡，点击查看详情。

前后端解耦：**Express + SQLite 后端** + **three.js 前端**。后端 API 契约平台无关，未来可整体用 Kotlin/Room 重写为原生 Android，前端零改动。

## 快速开始

### 方式一：双击启动器（推荐，Windows）

```text
1. 首次使用：在项目根目录打开终端执行  npm run install:all
2. 双击  start-dev.bat    —— 检查环境后自动启动前后端并打开浏览器
3. 双击  stop-dev.bat    —— 停止前后端服务
```

启动器会检查 Node.js / 依赖 / 端口占用，缺什么会提示；前后端各开一个独立窗口。

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

## 单独运行

```bash
npm run dev:server     # 仅后端
npm run dev:client     # 仅前端
npm run build          # 构建前端到 client/dist/
```

## 快捷键

- `空格` 播放 / 暂停时间轴
- `← / →` 逐年前进 / 后退
- `Esc` 关闭详情 / 设置面板

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/map` | 中国地图 GeoJSON |
| GET | `/api/events?dynasty=song` | 朝代事件 |
| GET | `/api/meta?dynasty=song` | 朝代起止年 |
| GET | `/api/map/overlay?dynasty=song` | 疆域叠加层（预留，首期为空）|

## 项目结构

```
HistoryMap/
├── server/      # Express + sql.js 后端
│   ├── routes/  # 四个 API 路由
│   └── data/    # schema.sql + seed/*.sql + geo/china.json
└── client/      # three.js 前端
    └── src/
        ├── api.js              # 数据层（封装所有 fetch）
        ├── map/                # 地图层
        ├── timeline/           # 时间轴
        └── events/             # 事件泡泡层
```

详细架构、约定、已知坑见 [AGENTS.md](./AGENTS.md)。

## 加新朝代

1. `server/data/seed/` 加 `02-xxx.sql`（INSERT dynasties + events）
2. 前端 `client/src/main.js` 把 `DYNASTY` 常量改成新朝代 id
3. 地图/泡泡/时间轴代码无需改动

## 技术栈

- 前端：three.js + d3-geo + Vite
- 后端：Express + sql.js（纯 WASM SQLite，零编译跨平台）
