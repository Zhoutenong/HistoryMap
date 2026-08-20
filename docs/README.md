# HistoryMap 文档中心

项目文档按**需求 / 架构 / 技术**三类组织（另有设计资产与归档目录），
新会话从 [架构总览](architecture/overview.md) 读起。

## 文档目录

```
docs/
├── README.md                    # 本文件：文档中心索引
├── requirements/                # 需求文档：做什么、为什么、验收标准
│   ├── README.md
│   ├── refactor-requirements.md          # 主需求基线（Android 单端版）
│   ├── zoom-lod-requirements.md          # LOD 分级显示需求
│   ├── roadmap.md                        # 未完成工作路线图（优先级 + 验收）
│   └── android-mobile-optimization-plan.md  # 移动端优化需求（历史，WebView 时代）
├── architecture/                # 架构文档：怎么设计、模块边界、数据管线
│   ├── README.md
│   ├── overview.md                       # ★ 架构总览（入口）
│   ├── android-native-rewrite-plan.md    # Android 原生重构方案（已落地）
│   ├── temporal-db-plan.md               # 宋代时空数据库（PostgreSQL + PostGIS）
│   ├── data-improvement-plan.md          # 州府级数据管线（元丰九域志基准）
│   └── data-sources-research.md          # 数据源调研
├── technical/                   # 技术文档：实现细节、契约、工具、工艺
│   ├── README.md
│   ├── data-contract.md                  # ★ API 与数据契约参考
│   ├── texture-bake-plan.md              # 水彩疆域贴图烘焙管线
│   ├── android-visual-polish-ai-pipeline.md  # Android 视觉 token 管线
│   ├── chatgpt-reconcile-prompt.md       # 视觉校准话术
│   └── design/                           # 视觉还原执行计划 + 生图 AI 操作手册
├── design_optimize/            # 设计资产（canonical token / HTML 原型 / 截图）
│   └── design-tokens.json                # ★ 唯一视觉真相源（脚本依赖，勿移动）
└── _archive/                    # 归档（历史草稿，冻结勿改）
```

## 阅读建议

| 目的 | 看哪里 |
|---|---|
| 快速上手 / 启动构建 | 根目录 `README.md` |
| 全局认知 / 架构边界 | `architecture/overview.md` → `AGENTS.md` |
| 改动数据契约 | `technical/data-contract.md` + `npm run contract` |
| 开发新朝代 | `requirements/refactor-requirements.md` 扩展章 + `AGENTS.md`「扩展指南」 |
| 视觉/贴图相关 | `technical/design/` + `technical/android-visual-polish-ai-pipeline.md` |
| 数据许可红线 | `architecture/data-improvement-plan.md` 许可矩阵 |
| 待办与验收 | `requirements/roadmap.md` |

## 约定

- `design_optimize/` 与 `_archive/` 为资产/归档目录：前者被脚本引用（勿移动文件），后者为历史快照（勿改内容）。
- 移动文档时同步更新本索引、各分类 `README.md`、`AGENTS.md` 与根 `README.md` 中的引用。
