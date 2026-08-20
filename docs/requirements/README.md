# 需求文档

本目录收录 HistoryMap 的需求、范围与验收标准。

## 文档列表

| 文档 | 内容 | 状态 |
|---|---|---|
| [refactor-requirements.md](refactor-requirements.md) | **主需求基线**：产品概述、功能需求、非功能需求、验收标准、范围边界（Android 单端版） | 有效（基线） |
| [zoom-lod-requirements.md](zoom-lod-requirements.md) | LOD 分级显示需求：L4 档位矩阵、准入规则、渲染裁决 | 有效 |
| [roadmap.md](roadmap.md) | 未完成工作路线图：优先级、验收标准、进度标记 | 持续更新 |
| [android-mobile-optimization-plan.md](android-mobile-optimization-plan.md) | 移动端优化需求（早期 WebView 时代方案） | 历史（已被原生版取代） |

## 阅读顺序

1. 先读 `refactor-requirements.md` 建立需求基线；
2. 涉及地图要素显隐/缩放表现，再读 `zoom-lod-requirements.md`；
3. 当前进度与未完成项看 `roadmap.md`。

## 约定

- 需求变更需同步更新基线文档与 `roadmap.md` 的验收项；
- 历史文档（`android-mobile-optimization-plan.md`）仅作演进记录，不再作为实现依据。
