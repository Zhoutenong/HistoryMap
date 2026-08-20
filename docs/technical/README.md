# 技术文档

本目录收录 HistoryMap 的实现细节、数据契约、工具与工艺。

## 文档列表

| 文档 | 内容 |
|---|---|
| [data-contract.md](data-contract.md) | **API 与数据契约参考**：端点、事件对象、overlay 结构、坐标约定、Schema、许可 |
| [texture-bake-plan.md](texture-bake-plan.md) | 水彩疆域贴图烘焙管线：状态标注（placeholder/penpot/done）、配准纪律、工作流 |
| [android-visual-polish-ai-pipeline.md](android-visual-polish-ai-pipeline.md) | Android 视觉优化管线：design-tokens 唯一视觉真相源、token 映射、验收流程 |
| [chatgpt-reconcile-prompt.md](chatgpt-reconcile-prompt.md) | 视觉校准话术（发送给 ChatGPT 的结构化 Prompt 模板） |
| [design/README.md](design/README.md) | 生图 AI 操作手册（与视觉执行计划的配合方式） |
| [design/implementation-plan.md](design/implementation-plan.md) | 视觉还原执行计划（从设计稿到渲染实现的拆解） |

## 阅读顺序

- 联调/改数据字段：`data-contract.md`；
- 改贴图/渲染视觉：`texture-bake-plan.md` → `android-visual-polish-ai-pipeline.md` → `design/`。

## 约定

- **贴图状态必须与 `texture-bake-plan.md` 同步**：每次改动贴图/管线后更新状态标注；
- 设计 token 以 `../design_optimize/design-tokens.json` 为唯一真相源，勿在代码里写同名魔法数；
- 改动契约字段时同步更新 `data-contract.md` 与 `npm run contract` 校验。
