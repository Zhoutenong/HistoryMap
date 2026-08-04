# HistoryMap — 历史疆域数据

宋朝及周边政权的真实历史疆域 GeoJSON，供 `/api/map/overlay` 路由读取。

## 数据来源与许可

**主数据源**：[aourednik/historical-basemaps](https://github.com/aourednik/historical-basemaps) (GPL-3.0, 772★)

从其 `geojson/world_{1100,1200,1279}.geojson` 中筛选宋朝相关政权，注入中文名与配色后输出。每政权为 100-400 顶点的真实历史轮廓（不再是现代省界的裁剪）。

**许可声明**：地图数据衍生自 GPL-3.0 项目，按许可要求衍生作品须沿用 GPL-3.0。本项目地理数据部分以此许可发布。

**精度说明**：historical-basemaps 是社区维护的世界历史政区数据集，精度足以呈现政权并立的宏观格局，但不及学术级 CHGIS（哈佛中国历史 GIS）。如需"路"一级行政区划（北宋 15 路 / 南宋 17 路）的精确边界，需另引入 CHGIS V6 数据，作为后续二期工作。

## 文件结构

```
historical/
├── periods.json                 时期索引 + 政权配色表（路由读取入口）
├── regimes-1100.json            北宋极盛（960-1126）10 政权
├── regimes-1200.json            南宋并立（1127-1270）12 政权
├── regimes-1279.json            元代（1271-1279）7 政权
├── source/                      原始全球文件（world_*.geojson，备查）
│   ├── world_1100.geojson
│   ├── world_1200.geojson
│   └── world_1279.geojson
└── _archive_v1_chinaclip/       旧版（v1，基于现代省界裁剪，已弃用，保留可回溯）
```

## 时期定义

| periodId | 年份范围 | 标签 | 包含政权 |
|---|---|---|---|
| `song-1111` | 960-1126 | 北宋极盛 | 宋 / 辽 / 西夏 / 吐蕃 / 大理 / 大越 / 高棉 / 占婆 / 高丽 / 海南 |
| `song-1142` | 1127-1270 | 南宋·绍兴和议 | 宋 / 金 / 西夏 / 吐蕃 / 大理 / 蒙古 / 大越 / 高棉 / 占婆 / 高丽 / 蒲甘 / 西辽 |
| `song-1279` | 1271-1279 | 崖山·元朝建立 | 元 / 吐蕃 / 大越 / 高棉 / 占婆 / 蒲甘 / 海南 |

注：1271 年忽必烈建元朝，1276 年临安陷落，1279 年崖山海战南宋彻底灭亡。故 1271 年后无"宋"政权。

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
1. 下载（如缺失）`world_{1100,1200,1279}.geojson` 到 `source/`
2. 按 `PERIOD_REGIMES` 配置筛选政权、修正标签（如 1200 年 `Liao` → `Jin`）
3. 注入中文名与配色，输出 `regimes-{1100,1200,1279}.json`

改政权配色/中文名 → 编辑脚本顶部的 `ENTITY_STYLE`；改纳入哪些政权 → 编辑 `PERIOD_REGIMES`。

## 已知数据源瑕疵

- **1200 年 "Liao" 实为金朝**：1115-1234 年金朝统治原辽+北宋北方，数据源误标为 Liao。脚本用 `NAME_OVERRIDE` 重映射为 Jin。
- **1279 年无 Song Empire**：南宋已于 1276 年临安陷落；1279 年整个东亚属元朝 Great Khanate。
- **精度不均**：部分政权（如高丽 Goryeo 在 1200 年）顶点上千、精度极高；部分政权（如西夏 Xixia）只有 25 顶点、轮廓粗略。
