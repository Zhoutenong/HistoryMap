# 架构文档

本目录收录 HistoryMap 的架构设计、模块边界与数据管线。

## 文档列表

| 文档 | 内容 | 状态 |
|---|---|---|
| [overview.md](overview.md) | **架构总览（入口）**：双端同契约、渲染分层、数据分层、坐标投影、时间模型、数据管线、Android 架构、扩展点 | 持续演进 |
| [android-native-rewrite-plan.md](android-native-rewrite-plan.md) | Android 原生重构方案：M1–M6 里程碑、渲染/UI/数据层设计 | 已落地 |
| [temporal-db-plan.md](temporal-db-plan.md) | 宋代时空数据库：PostgreSQL + PostGIS 逐实体时间版本化、Schema、事件提取规则 | 已实施 |
| [data-improvement-plan.md](data-improvement-plan.md) | 州府级数据管线：古籍解析 → 治所坐标 → Voronoi 州府面、许可矩阵 | 已实施 |
| [data-sources-research.md](data-sources-research.md) | 数据源调研：古籍/历史地图/坐标源评估与选型 | 调研记录 |
| [codebase-review-plan.md](codebase-review-plan.md) | 全库评审与改进计划：双端一致性、缓存、迁移语义、内容加深、分享、考据感等 A1-A6/P1-P5 任务 | 待实施 |

## 阅读顺序

1. 从 `overview.md` 建立全局认知；
2. 关注 Android 端设计读 `android-native-rewrite-plan.md`；
3. 关注数据读 `data-improvement-plan.md` + `temporal-db-plan.md`；
4. 数据选型依据见 `data-sources-research.md`。

## 约定

- 架构决策（尤其涉及契约/渲染分层）需在 `overview.md` 或对应专题文档中记录；
- 与 `AGENTS.md` 的「架构边界」章节互为印证，改动时保持两者一致。
