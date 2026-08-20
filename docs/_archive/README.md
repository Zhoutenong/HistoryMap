# docs/_archive —— 归档说明

本目录存放 **已废弃 / 一次性调试 / 可重生成的中间产物**，仅作历史参考，**不参与当前文档主线**。

| 子目录 | 内容 | 来源/处置 |
|---|---|---|
| `design-tokens.json` | 早期「像素采样」design token 旧草稿（`_meta.status=superseded`） | 已被 `docs/design_optimize/design-tokens.json`（canonical）取代；无任何脚本引用 |
| `design-analyze/` | `_analyze_img*.py`（生图 AI 视觉升级实验的一次性图像分析脚本）+ `android-review-v3-*.png`（早期 Android review 截图） | 一次性调试遗留；`*.png` 已被 gitignore |
| `redraw-debug/` | `docs/design_optimize/redraw/` 的像素探针/坐标裁决/标签校验调试脚本（pixel-probe / probe-* / verify-* / adjudicate-* 等） | 一次性调试脚本；`redraw/` 核心产物 `build.mjs` / `shot.mjs` / `crop-regions.mjs` / README 仍保留在原处 |
| `design-optimize-intermediate/` | `prompt_1_*`、`pixelized_render` 等可重生成中间产物（SVG/PNG/TXT） | 由 `scripts/ascii-mockup.ps1`、`crop-sections.ps1`、`render-mockup-svg.mjs` 等工具重新生成；多已被 gitignore |

**约定**：
- 归档文件原则上不应被当前文档/脚本引用；若确有引用，请一并更新指向或移回。
- 想要恢复/查看历史时从本目录取回即可，不影响任何运行时行为。
