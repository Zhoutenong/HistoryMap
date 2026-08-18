# 识图 → 数据驱动重绘 · 演示（prompt_4.png）

**目标**：不复制粘贴，仅凭「识图 + 项目真实数据」把设计稿 `docs/design_optimize/prompt_4.png`
完整重绘为可运行的 HTML 界面，并用截图闭环验证。

## 产物

| 文件 | 说明 |
|---|---|
| `prompt4-redraw.html` | 最终重绘（872×1804 物理像素 = 2×逻辑 dp，浏览器直接打开） |
| `prompt4-redraw.png`   | 用无头 Chromium 渲染出的成片截图 |
| `build.mjs`           | 重绘生成器：从真实数据 + 版式参数生成 HTML |
| `shot.mjs`            | 截图脚本（playwright） |
| `crop-regions.mjs` / `crops/` | 区域特写裁剪（供二次识图核对细节） |

## 五步管线（本演示的实际执行记录）

1. **全图识图**（modlens）：OCR 全文 / 版面结构 / 语义 / 不确定项。
   产出：组件树（顶栏、图例、地图、3 事件卡、底部面板）、全部文案、设计标注（44×44、安全区 28dp）。
2. **像素级采样**（`scripts/analyze-image.mjs`）：图 872×1804；宣纸底 `#e8d8c8` 系；
   顶栏/图例/时间轴分区坐标；地图主色 `#c89080`（宋朱砂叠纸）；泡泡区米白 `#f8e8c8`。
3. **区域特写识别**（裁剪 5 块再识图）：顶栏=左侧「政权」朱砂钮 + 右侧 3 个 44×44 图标占位；
   图例=左列竖排色点；泡泡=白卡+朱砂描边+虚线指向线+锚点圆点；底部=米白圆角面板、
   播放钮+大号年份+范围、轨道+描红滑块+轨道下分类色点、5 个「色点+文字」页签、底部红色虚线与安全区标注。
4. **数据驱动重绘**（`build.mjs`）：一切几何来自真实数据，不猜像素——
   - 疆域：`server/data/geo/historical/regimes-1100.json`（10 个政权路径，
     与 `artifacts/penpot/regimes-1100.svg` 同管线同源，数量核对一致）；
   - 投影：`client/public/textures/overlay/fit-geojson.json` → geoMercator fitSize + 居中
     （与 bake/penpot 管线同配方）；
   - 配色：`periods.json` 官方政权色；分类色：`client/src/settings/store.js` 的 CATEGORIES；
   - 河流/城市/政权标签：`periods.json` 真实路径与坐标；事件锚点：seed 真实经纬度。
5. **验证闭环**：`shot.mjs` 渲染成图 → modlens 二次识图 + `analyze-image` 像素对比 →
   发现并修复 3 轮问题（地图竖向留白过大、坐标空间混用偏移、卡片重叠、黄河标签撞车）。

## 与源图的已知差异（如实清单）

- **文本未修正**：源图三张事件卡年份均写 1127（陈桥兵变实为 960、绍兴和议实为 1141），
  重绘按"还原源图"原则保留原文；如需史实修正只需改 `build.mjs` 中 `EVENTS` 的文字。
- **金**：1100 数据集无金疆域，图例/标签按源图保留金，但地图不画金色块。
- **顶部 3 个图标**：源图为灰色占位框 + 44×44 标注，重绘同样保留占位（可取消勾选"显示设计标注"隐藏标注）。
- **页签选中态**：源图未明示，按惯例选「政治」（朱砂高亮）。
- **水墨质感**：程序化生成（SVG 噪声纸纹 + 模糊晕染），非逐像素复制，笔触颗粒为同风格重画。

## 重跑命令

```bash
node docs/design_optimize/redraw/build.mjs   # 重新生成 HTML
node docs/design_optimize/redraw/shot.mjs    # 重新截图
```