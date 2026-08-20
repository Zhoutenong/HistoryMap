# 资源贴图替换计划（Texture Bake Plan）

> 目标：把「效果图的地图描画」从 LLM 识图+程序化编码（难以对齐）改为**图片资源**——
> 美术/AI 负责画，代码只负责贴。程序化渲染保留为回退与模板生成器。
> 本文件是唯一计划源，**每次完成一步必须更新**（见「更新日志」）。

## 一、方案：哪些层换贴图，哪些保留

| 层 | 策略 | 理由 |
|---|---|---|
| **水彩疆域层**（政权色块/晕染/干边） | ✅ **烘焙贴图**（每时期一张） | 最难程序化仿真的部分；视觉静态（每时期固定） |
| 河流宽淡水痕 | ⚠️ 候选（可烘焙为独立层或保持程序化） | 细线层程序化确定性好；独立烘焙需多一张贴图 |
| 州府描边（z=7.02） | ❌ 不烘焙 | 细线描边无美术难度；数据含 CHGIS 派生坐标，烘焙产物有许可红线 |
| 政权/城市/州府标签 | ❌ 不烘焙（CSS2D 交互层） | 可点击、缩放不失真 |
| 事件泡泡/时间轴/详情/顶栏 | ❌ 不烘焙（DOM/Compose） | 本来就是 DOM 层，CSS/token 控制 |
| 现代底图 3D mesh | ❌ 不烘焙 | 「现代对比层」交互式显隐 |

**配准纪律**：贴图只负责"画什么"；"放哪"由运行时 `worldBox`（geojson + `project()`）决定。
`scripts/bake-overlay-textures.mjs` 与 `TerritoryOverlay.js` 用同一投影、同一 6% 边距算法，
生成时输出 `fit-geojson.json`（全时期 bbox 矩形），浏览器端用它统一标定投影 —— 双端必然对齐。

## 二、贴图清单（当前状态）

生成命令：`npm run bake:textures [-- --width 2048]`（占位版）/ `node scripts/penpot-render-textures.mjs [--styles artifacts/penpot/styles.json]`（水彩版）

| # | 贴图文件 | 覆盖时期 | 尺寸 | 状态 | 说明 |
|---|---|---|---|---|---|
| 1 | `regimes-1100.png` | song-1111 / liao-1111 | 2048×1679 | 🟡 **penpot-v1** | 水彩管线渲染（bloom+body+斑驳+干边）；宋政权用 Penpot 样式，余默认 token |
| 2 | `regimes-1200.png` | song-1142 | 2048×1556 | 🟡 **penpot-v1** | 同上（样式全默认 token） |
| 3 | `regimes-1279.png` | song-1279 / yuan-1279 | 2048×2077 | 🟡 **penpot-v1** | 同上 |
| 4 | `regimes-1300.png` | yuan-1300 | 2048×2077 | 🟡 **penpot-v1** | 同上 |
| 5 | `regimes-800.png` | tang-800 | 2048×1578 | 🟡 **penpot-v1** | 同上 |
| 6 | `jin-1120.png` | jin-1120 | 2048×1541 | 🟡 **penpot-v1** | 同上 |
| 7 | `jin-1142.png` | jin-1142 | 2048×1541 | 🟡 **penpot-v1** | 同上 |
| 8 | `jin-1200.png` | jin-1200 | 2048×1541 | 🟡 **penpot-v1** | 同上 |

状态含义：
- 🔴 `placeholder-rework`：占位版（纯色填充+描边），**必须由美术/AI 重做**
- 🟡 `penpot-v1`：Penpot 管线渲染的水彩版（几何/对齐已验证），**视觉待人眼调参**（在 Penpot 里调样式 → 提取 styles.json → 重渲染）
- 🟢 `done`：定稿（人眼比对效果图通过）

辅助文件（由脚本自动更新，**不要手改**）：
- `client/public/textures/overlay/manifest.json` —— periodId→贴图映射 + 状态标注（运行时读取）
- `client/public/textures/overlay/fit-geojson.json` —— 全时期 bbox，统一投影标定数据

## 三、管线

```
npm run bake:textures            # ① 用当前 GeoJSON 生成纯色占位贴图（幂等可重跑）
                                 #    （占位版保留作几何基准，勿删除）

node scripts/penpot-prepare-svg.mjs          # ② 疆域 GeoJSON → 简化 SVG（同投影同 worldBox，
                                             #    画布 1000×800），输出 artifacts/penpot/*.svg
Penpot（连接 MCP）                           # ③ 新建 Board tex-<period>（1000×800）→ 导入 SVG →
                                             #    每政权自动三层化（bloom 晕染/body 主体/edge 描边）
                                             #    → 在 Penpot 里调 fill/blur/透明度（可视化）
                                             #    （效果图可拖入同一文件作参考层）
node scripts/penpot-extract-styles.mjs       # ④（可选脚本化）从 Penpot 提取样式 → styles.json
node scripts/penpot-render-textures.mjs      # ⑤ 读 geojson 几何 + styles.json（无则默认 token）
                                             #    → 水彩渲染（bloom+body+斑驳+干边）→ 覆盖 PNG
                                             #    → manifest status=penpot
# ④⑤ 可重复：在 Penpot 里改样式 → 重提取 → 重渲染（数据变更后先重跑 ①+②）
```

**规范**：重做的贴图必须保持与占位版**同尺寸、同宽高比、同 worldBox 范围**，
否则运行时 plane 会拉伸/错位（worldBox 由代码计算，贴图只提供像素）。已验证
penpot-v1 版对齐：canvas 宽高比 1.220 == worldBox 宽高比，非空像素 bbox 覆盖率 91.6%。

## 四、接入状态

| 端 | 状态 | 说明 |
|---|---|---|
| Web（TerritoryOverlay.js） | ✅ 已接入 | manifest 命中时异步替换 wash 材质贴图；失败静默回退程序化渲染 |
| Web（main.js） | ✅ 已接入 | `ensureProjection()` 用 fit-geojson.json 统一标定投影 |
| Android（assets 同步） | ✅ 已接入 | prepare-android.mjs 自动同步贴图目录（验证：10 文件 ~1.7MB 进 assets） |
| Android（渲染接入） | ✅ 已接入 | MapRenderer 水彩纹理烘焙优先：BakedWatercolorLoader 读 assets 贴图（manifest byPeriod → PNG），worldBox 由 watercolorWorldBox 计算（与 Web 同逻辑）；失败回退 WatercolorBuilder |
| Android（州府描边） | ✅ 已接入 | 独立运行时通道 PrefectureStrokeBuilder（离屏 Canvas → GL 纹理 quad），**不烘焙**（CHGIS 派生坐标许可红线）；WatercolorBuilder 原 4e 州府描边分支已移除，贴图永不含州府线（2026-08-20） |
| Penpot 制作（MCP） | ✅ 已接入 | 双端共用同一投影管线：penpot-prepare-svg.mjs（几何 SVG）+ 三层化样式 + 参数提取 → 本地渲染 |

## 五、后续步骤（TODO）

- [x] P0-1 烘焙脚本 + 8 张纯色占位贴图 + manifest + fit-geojson（2026-08-17）
- [x] P0-2 Web 端接入（wash 材质替换 + 统一投影标定）—— 投影对齐验证 0 差异（2026-08-17）
- [x] P0-3 Android 构建链验证（build → prepare-android → assembleDebug → 真机安装运行）
      P20 实测：loadDynasty 成功、FPS 53-59、无崩溃；截图 artifacts/baked/（2026-08-17）
- [x] P1 Android 渲染接入：OverlayModel.periodId + BakedWatercolorLoader（assets 贴图优先，
      程序化回退）+ MapRenderer 接线。P20 实测：song-1111/1279 贴图加载成功、
      loadDynasty 1424ms→748ms、时期切换 189ms、FPS 51-59（2026-08-17）
- [x] P0-4 Penpot 制作管线：SVG 生成（同投影同 worldBox）→ Penpot 三层水彩样式（bloom/body/edge，
      可视化可调）→ 参数提取 styles.json → 本地水彩渲染（斑驳/干边补齐）→ 8 张 PNG 全部渲染。
      对齐验证：宽高比 1.220 一致、覆盖率 91.6%（2026-08-17）
- [ ] P0-5 人眼调参：对照效果图在 Penpot 里调 8 张图的 fill/blur/透明度 → 重提取重渲染 → 定稿 done
- [ ] P0-6 效果图导入 Penpot 作参考层（remote MCP 无本地文件通道，需手动拖入 prompt_*.png）
- [ ] P1 河流层评估（候选：独立烘焙一张淡墨水痕贴图，或维持程序化）
- [ ] P1 bake 脚本支持 --width 4096（桌面高分辨率档，manifest 标注分辨率）
- [ ] P1 验收截图 SOP：重渲染后截图对比效果图，更新本文档

## 六、已知风险

- **数据变更 → 需重烘焙**：改疆域/配色/加时期后重跑 `npm run bake:textures` + `penpot-prepare-svg.mjs` + `penpot-render-textures.mjs`
- **缩放保真**：2048 上限（Android 内存约束）放大后糊；桌面可烘焙 4096 档（TODO）
- **许可**：疆域轮廓源自 GPL-3.0 basemaps，贴图是衍生作品，再分发需保留署名；
  禁止把 CHGIS 派生数据（州府描边）烘焙进贴图
- **旧浏览器**：TextureLoader/IMG 贴图兼容 Chrome 83+，无新 API
- **Penpot 几何归一化**：Penpot 导入 SVG 会把形状居中到内容中心（bounds 中心），
  设计稿里位置仅供视觉参考；渲染对齐永远由本地管线（worldBox + toPx）保证

## 七、更新日志

| 日期 | 事项 |
|---|---|
| 2026-08-17 | P0-1 + P0-2 完成：脚本、8 张占位贴图、manifest、fit-geojson；Web 接入；投影对齐验证通过（差异 0）；lint/test 通过 |
| 2026-08-17 | P0-3 Android 构建链验证通过：build → prepare-android（贴图 10 文件进 assets）→ assembleDebug 19s → 真机安装运行，FPS 53-59 无崩溃；渲染接入仍为 P1 待办 |
| 2026-08-17 | P1 Android 渲染接入完成：OverlayParser 透传 _periodId → BakedWatercolorLoader（assets 贴图优先，程序化回退）→ MapRenderer 接线；P20 实测 song-1111/1279 贴图加载成功、loadDynasty 提速 ~47%、时期切换 189ms、FPS 51-59 |
| 2026-08-17 | P0-4 Penpot 制作管线完成：penpot-prepare-svg.mjs（8 个简化 SVG，同投影同 worldBox）+ Penpot 三层水彩样式（tex-1100/tex-1200 两 Board 已导入）+ penpot-render-textures.mjs（水彩渲染，斑驳/干边/羽化）→ 8 张 PNG 全部渲染并覆盖；对齐验证通过（宽高比/覆盖率）；styles.json 含宋政权示范样式 |
| 2026-08-17 | **修复 regimes-1100.png 风格不一致**：该图被一次占位 bake（1024 宽平涂）单独覆盖，与其余 7 张 penpot-v1 水彩版风格脱节（manifest 记录 2048×1679/893KB 与实际不符）。重跑 `node scripts/penpot-render-textures.mjs --styles artifacts/penpot/styles.json` 恢复水彩版（2048×1679 / 893KB，宽度比 1.220 与文档记录一致）；其余 7 张 PNG 逐字节哈希不变，回归通过。教训：bake 占位版是几何基准，**跑完 bake 必须立即重跑 penpot:render**，否则会以占位平涂覆盖水彩贴图 |
| 2026-08-18 | **M2 宋域色实测裁决**：P20 实机截图 `artifacts/audit/song-check.png`，宋域中心 6 点取样稳定值 `#9e4b3d`（RGB 158,75,61），vs 设计色 `#b03a2e`（H=6° S=59% L=44%）→ 实测 H=9° S=44% L=43%。色相偏移仅 3°可忽略；饱和度降 15%是「偏棕」观感根源。根因：`WatercolorTexture.watercolorTint()` TINT_SAT=0.95（饱和度×0.95）+ 宣纸底 alpha 混合额外去饱和 ~12%。结论：偏棕确实存在但不构成严重失真；TINT_SAT 位于 MapVisualTokens.kt（M1 授权范围），本次不改代码。建议供 M1 参考：TINT_SAT 0.95→1.00 消除 tint 层去饱和，或 regime-specific tint 方案 |
| 2026-08-18 | **M1/M2 修复落地（父级决断，子 agent 执行后合并）**：① MapVisualTokens.kt：Typography 字号全部回退 design-tokens 标称（消除与 FONT_SCALE=1.25 的双重放大 ≈35%）、TOP_TITLE weight 700→400、Bubble.HEIGHT 96→112、TIMELINE_BOTTOM_SAFE_AREA 18→24、河道 body/spine/支流回提（88→96 / 118→124 / 56→60）、VIGNETTE_STRENGTH 0.34→0.38；② 采纳 M2 方案 A：WATERCOLOR_TINT_SAT 0.95→1.00（作用于程序化回退路径）；③ styles.json 宋 body fillOpacity 0.72→0.82 并重跑 penpot-render —— 仅含宋政权的 regimes-1100/1200 两张变化，其余 6 张哈希逐字节不变；④ 重跑 build→prepare-android→assemble→装机。**教训：APK 贴图来自 client/dist，改贴图必须重跑 npm run build 再 prepare-android（首轮实测无变化即因此）**。实测：宋域主体色 #9e4b3d(s0.61)→#a34538(s0.66) 更红更饱和；顶栏/时间轴/分类页签无遮挡无回归；FPS 59 |