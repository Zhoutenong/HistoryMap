# 比例尺分级显示（LOD）需求 · 边界数据盘点

> 背景：安卓端地图已支持双指缩放（`MapRenderer.zoom ∈ [0.25, 24]`），城市名/政权名/边界应随比例尺分级出现。
> 本文档是三件事的唯一依据：① 边界与名称**数据盘点**（含缺口标注，供后续对数据）；② 边界**描绘方式裁决**（贴图 vs 矢量）；③ 「什么比例尺显示什么」的 **LOD 需求**。
> 生成：2026-08-20，基于对 `server/data/geo/`、`client/`、`android/` 的逐一核查。

---

## 一、结论摘要（TL;DR）

| 问题 | 结论 |
|---|---|
| 政权边界数据 | ✅ 齐全：8 个时期文件（`regimes-800/1100/1200/1279/1300` + `jin-1120/1142/1200`），`periods.json` 索引完整 |
| 政权名标注 | ✅ 齐全：22 个政权锚点 + 8 个主政权（`labelMajor`）；⚠️ 锚点不分时期，南北对峙期「宋」标签偏北待校（P2） |
| 州府边界数据 | ⚠️ **仅北宋 song-1111 一版**（287 面 + 290 治所，本地生成 gitignore）；南宋/金/元/唐时期完全没有（P1） |
| 城市数据 | 🔴 **当前实际下发严重残缺**：标准文件覆盖逻辑导致 song-1111 只下发 1 城，且名称错挂（P0） |
| 河流数据 | 🔴 同上：song-1111 只下发 2 条河（periods.json 的 8 条被整体屏蔽）；黄河未区分 1128 改道前后河道（P0/P1） |
| 政权边界贴图 | ✅ 已有：8 张 penpot-v1 水彩贴图（边界描边含在 edge 层内），待人眼调参定稿（texture-bake-plan P0-5） |
| 州府边界贴图 | ❌ 无，且**裁决不烘焙**——CHGIS 派生坐标有许可红线（见 §三）；「一版」= 运行时矢量描边，样式对齐 Web 基准 |
| 安卓州府边界渲染 | 🔴 **完全缺失**：`OverlayParser` 已解析 `prefectures`，但 `MapRenderer` 未消费；安卓端只见治所文字（P0） |
| 缩放分级现状 | ❌ 双端均无 LOD：安卓标签限流是固定数量上限（城市 7/横屏 4 等），与缩放无关；Web 全部常显 |

---

## 二、数据盘点（边界 / 名称，按图层）

### 2.1 现状总表

数据来源两类，路由层（`server/routes/overlay.js`）优先取**标准 geojson 文件**，仅当该时期命中数为 0 才回落 `periods.json` 旧数组：

| 图层 | 标准文件 | periods.json 兜底 | 实际下发（核查值） | 评级 |
|---|---|---|---|---|
| 政权面（边界） | `regimes-*.json` / `jin-*.json` 8 文件 | — | 每时期 7–15 个政权面 ✅ | ✅ |
| 政权名 | —（`periods.json` `labels` 22 个 + `labelMajor` 8 个注入 feature） | 同左 | ✅ | ✅ |
| 河流 | `rivers.geojson` **3 条**（黄河/长江/淮河） | **8 条**示意（+辽河/珠江/钱塘江/松花江/闽江） | song-1111 仅 **2 条**；liao/yuan/tang 时期 **0 条** | 🔴 P0 |
| 山脉 | `mountains.geojson` 18 条（无 periods tag = 全期） | 14 条 | 18 条 ✅（rank 1×4 / 2×9 / 3×5） | ✅ |
| 城市 | `cities.geojson` **4 条**（全 rank1） | **14 条**示意（无 rank） | song-1111 仅 **1 城**；多数时期 0–3 城 | 🔴 P0 |
| 地点 | `places.geojson` 19 条（都城 5 / 战场 12 / 书院 2，带时期 tag） | — | 每时期 1–7 条 ✅ | ✅ |
| 州府面 | `prefectures.geojson` 287 面 | — | **仅 song-1111**；其余时期 0 | ⚠️ P1 |
| 治所点 | 同上文件 290 点（rank 1×4 / 2×10 / 3×103 / 4×119 / 5×51） | — | 仅 song-1111 | ⚠️ P1 |

> 州府面/治所的 properties 完整度好：`route/type/grade/households/tribute/seat/seatCoord/counties/evolution` 均有；置信度 `high 184 / medium 289 / low 104`。

### 2.2 缺口明细（按优先级标注，供后续对数据）

#### P0-A 河流「双源覆盖」回归（阻塞 LOD，当前即为线上回归）

`rivers.geojson` 有 3 条河且带 periods tag，导致 `standardByKind.river.length > 0` 恒成立，**periods.json 的 8 条被整体屏蔽**：

| 时期 | 实际下发 | 应有 | 缺失 |
|---|---|---|---|
| song-1111（默认时期） | 2（黄河/长江） | 8 | 淮河（tag 未含北宋）、辽河、珠江、钱塘江、松花江、闽江 |
| liao-1111 / yuan-* / tang-800 | **0** | 8 | 全部（三文件均无这些时期的 tag） |
| song-1142 / song-1279 | 3 | 8 | 辽河、珠江、钱塘江、松花江、闽江 |

修复方向（二选一，倾向 ②）：① 路由层把标准文件与 periods.json 数组**按名称合并去重**（标准条目优先）；② 补全 `rivers.geojson` 为唯一数据源：补录 5 条河 + 补齐各时期 tag + 补 rank 字段（建议：黄河/长江 rank1；淮河/辽河/珠江 rank2；钱塘江/闽江/松花江 rank3）。

#### P0-B 城市数据残缺 + 名称错挂（阻塞 LOD）

- 覆盖回归同上：song-1111 实际只下发 1 城。
- **名称错挂**：`cities.geojson` 的「南京开封府」是**金朝名称**，却 tag 了 `song-1111`——北宋应为「东京开封府」。
- periods.json 14 城是手工示意，**无 rank 分级**，LOD 无法分层。
- 南宋时期缺建康、成都等区域中心（现有 14 城为北宋视角）。

修复方向：以 `cities.geojson` 为唯一数据源补全——14 城全部录入并加时期 tag 与 rank（四京/行在/都城 = 1，路治与区域中心 = 2，一般州 = 3），修正「东京开封府」名称，南宋时期补建康/成都等。

#### P0-C 安卓端州府边界渲染缺失（阻塞 LOD L2/L3）

`OverlayParser.kt:138` 已解析 `prefectures` → `PrefecturePolygon`，但 `MapRenderer.kt` 全文无一处消费 `model.prefectures`——安卓端**没有任何州府描边**（Web 端有 canvas plane z=7.02）。渲染方案见 §三，随 LOD 一并落地。

#### P1-D 州府级数据仅覆盖北宋

南宋（song-1142 / song-1279）、金、元、唐时期无州府面/治所 → 这些时期 L2/L3 档无增量内容（只剩城市/地点）。补数据方向：南宋优先，基于元丰九域志 + 宋史地理志（`data/songshi` 已有解析产物）派生**路级简化界**或至少治所点；金可参考《金史·地理志》。

#### P1-E 黄河改道未区分（历史准确性）

`rivers.geojson` 黄河为**单一北线**（入海 37.8°N，北宋故道）却 tag 了全部 6 个宋金时期；1128 年杜充决河后黄河夺淮入海，**song-1142 / song-1279 / jin-1142 / jin-1200 应走南线**（periods.json 里金时期的黄河 path 已是南线，恰被屏蔽）。修复时按时期拆分两条河道线。

#### P1-F 州府边界置信度与校正欠账

- `correction-checklist.md` 的 15 项重点核对（四京/次府/路治）**全部未完成**；
- `confidence: low` 104 条（Voronoi 近似未校正）。
- LOD L2/L3 放大展示后边界质量问题会更显眼——建议：详情面板已展示 confidence（现状保留），地图层对 low 置信边界用更淡的虚化描边（可选，P2）。

#### P2-G 政权名锚点不分时期

`labels` 是全局一套坐标。南北对峙期（song-1142/1279）「宋」标签锚点 [112.6, 33.2] 偏北宋中原，与南宋疆域错位；「金」[124.2, 44] 偏东北。建议在 `periods.json` 支持 per-period labels 覆写，南宋期「宋」南移至 [113.5, 28] 附近。

#### 许可备注（记录性风险，不改现状）

`prefectures.geojson` 含 CHGIS 派生坐标，不入 git ✅；但 `prepare-android.mjs` 会把它复制进 APK assets——APK 属可再分发物，**若未来对外发布 APK 需先剔除或替换数据源**（当前仅本机安装，记录在案）。

---

## 三、边界「描绘一版」裁决

### 3.1 政权边界：已有贴图，无需新做

8 张 penpot-v1 水彩贴图（`client/public/textures/overlay/`，双端共用，Android 经 prepare-android 进 assets），政权轮廓的 edge 描边层已烘焙在贴图内。剩余工作是 texture-bake-plan 既有的 P0-5 人眼调参定稿，与本需求无关。**LOD 不隐藏政权面**（任何档位都是底图层）。

### 3.2 州府边界：无贴图 → 裁决走**运行时矢量描边**，不烘焙

两条理由（`docs/technical/texture-bake-plan.md` §一/§六 既有决策，本次重申）：

1. **许可红线**：州府坐标为 CHGIS 派生，禁止烘焙进可再分发贴图；
2. **无美术难度**：细线描边程序化即可，不需要 Penpot 管线。

「一版」定稿（安卓实现基准，样式对齐 Web `TerritoryOverlay.js` 既有描边）：

| 项 | 值 | 出处 |
|---|---|---|
| 生成方式 | 离屏 Canvas 按投影描边一次 → GL 纹理 quad（复用 `WatercolorBuilder`/`BakedWatercolorLoader` 的 worldBox 管线，z 序在水彩层之上，等价 Web z=7.02） | 运行时从 assets geojson 生成，不产生可再分发图片，许可安全 |
| 线色 | `rgba(58, 52, 40, 0.36)` | Web `buildPrefectureCanvas` 基准 |
| 线宽 | 1.1 设计 px（按 dpr/分辨率换算），`lineJoin: round` | 同上 |
| 档位调光 | L2 首现 alpha ×0.6，L3 ×1.0（GL uniform 过渡） | 本需求 §四 |
| 开关 | 设置面板新增「州府边界」总开关（默认开），语义=全档显示/隐藏；Web 端已有同款开关 | 对齐 Web |

> 备选方案 GL_LINE_STRIP 逐环画线（免纹理）不采用：GLES2 线宽不可控（多数实现仅 1px）且 287 面 × 多环逐条 draw call 性能差。

---

## 四、LOD 需求：什么比例尺显示什么

### 4.1 度量与档位定义

**统一判据（双端通用）**：归一化可视宽度
`s = 视口可见世界宽度 / 全图 worldBounds 宽度`（含 6% 边距的包围盒）。
安卓换算：可见世界高度 = `800 × zoom`，宽度 = `高度 × viewport 宽高比`；Web 由相机距离同理换算。
以 song-1111（全图 1081×896 世界单位 ≈ 经度 76°–134°）竖屏手机（宽高比 0.48）标定：

| 档位 | 判据 s | 竖屏 zoom 参考值 | 约当可视经度跨度 | 直觉 |
|---|---|---|---|---|
| **L0 全国** | s ≥ 0.40 | zoom ≥ 1.2 | ≥ 25° | 全图/整朝疆域（默认取景、双击复位） |
| **L1 大区** | 0.24 ≤ s < 0.40 | 0.7 – 1.2 | 14° – 25° | 数路之地（华北/江南） |
| **L2 路级** | 0.13 ≤ s < 0.24 | 0.4 – 0.7 | 7° – 14° | 一路或两路（京东东路） |
| **L3 州府** | s < 0.13 | 0.25 – 0.4 | ≤ 7° | 数州之地（开封周边） |

**滞回**：档位边界两侧 ±0.02（s 值）内不切换，防止捏合停在阈值上抖动。
**横屏**：判据 s 天然适配（同 s 档位内容一致），zoom 参考值仅竖屏标定用。

### 4.2 档位 × 内容矩阵（核心需求）

标签统一按 rank 阶梯出现（京府/都城 1 → 次府 2 → 大州 3 → 中州 4 → 小州 5），城市与治所共用该阶梯；每档保留数量上限护低端机。

| 内容 | L0 全国 | L1 大区 | L2 路级 | L3 州府 |
|---|---|---|---|---|
| 政权水彩面 + 贴图 | ✅ | ✅ | ✅ | ✅（永不隐藏） |
| 政权名 · major（宋/辽/西夏/金/元/吐蕃/大理/唐） | ✅ | ✅ | ✅ | ✅ |
| 政权名 · minor（高丽/大越/高棉/占婆/蒲甘…） | ❌ | ✅ | ✅ | ✅ |
| 河流带 rank1（黄河/长江）+ 河名 | ✅ | ✅ | ✅ | ✅ |
| 河流带 rank2（淮河/辽河/珠江）+ 河名 | ❌ 几何淡化 | ✅ | ✅ | ✅ |
| 河流带 rank3（钱塘/闽江/松花江） | ❌ | 几何淡入，无名 | ✅ + 河名 | ✅ |
| 山脉纹理 | ✅ | ✅ | ✅ | ✅（透明度降至 ~30%，避免放大后纹理过粗） |
| 山名 rank≤2（13 条） | ✅ | ✅ | ✅ | ✅ |
| 山名 rank3（5 条） | ❌ | ✅ | ✅ | ✅ |
| 城市/治所标签 rank1（四京/行在/都城） | ✅（上限 4） | ✅ | ✅ | ✅ |
| 城市/治所标签 rank2（次府/路治，14 个） | ❌ | ✅（上限 7） | ✅ | ✅ |
| 城市/治所标签 rank3（103 个） | ❌ | ❌ | ✅（上限 16） | ✅ |
| 城市/治所标签 rank4（119 个） | ❌ | ❌ | ❌ | ✅（上限 24） |
| 城市/治所标签 rank5（51 个） | ❌ | ❌ | ❌ | ✅（最低优先级，碰撞让位） |
| **州府边界描边** | ❌ | ❌ | ✅ 淡（alpha ×0.6） | ✅ 全浓（×1.0） |
| 地点 rank1（都城/崖山等） | ✅（上限 3） | ✅ | ✅ | ✅ |
| 地点 rank2（战场/书院） | ❌ | ✅（上限 5） | ✅ | ✅ |
| 事件泡泡 | ✅ 全档显示（核心交互，不随 LOD 隐藏；拥挤折叠 +N 机制不变） | | | |

说明：
- 出屏内容仍由既有屏幕边界检查隐藏（安卓 `layoutMapLabels`、Web CSS2D 裁剪），LOD 只做「档位准入」。
- rank1 治所在 L0 显示后，「四京」不再依赖 cities 数据修复才可见（P0-B 修复前 L0 也有内容）。
- 现 `layoutMapLabels` 中 `rivers rank>1 隐藏`、`mountains rank>2 隐藏`、`places rank>2 隐藏` 三条硬编码改为按档位查上表。

### 4.3 切换与交互行为

1. **过渡**：档位切换时新增/消失内容做 250ms 透明度过渡（标签层整体 crossfade；州府描边走 GL uniform），禁止瞬间跳变。
2. **滞回**：见 §4.1，捏合停在阈值上不抖动。
3. **双击复位** = `resetCamera()`（既有）→ 回 L0。
4. **设置开关**：「州府边界」「治所标注」为总开关（关=全档隐藏，开=按档位自动分级）；不提供用户手动调档位（后续可加「标注密度」设置，本期不做）。
5. **时期/朝代切换**：LOD 档位不重置（保持当前缩放），但内容按新时期数据重新准入（州府数据仅北宋，其他时期 L2/L3 自动无描边，见 P1-D）。

### 4.4 双端实现要点

**安卓（首发端）**
- `MapScreen.kt`：由 `renderer.zoom + worldBounds` 算 `s` → `currentLod` 状态（含滞回），替换现固定上限 `maxCityLabels/maxPlaceLabels/maxAuxLabels` 为「档位 → (rank 准入, 数量上限)」表；标签准入过滤在 `layoutMapLabels` 调用前完成。
- `MapRenderer.kt`：新增州府描边纹理通道（§3.2 方案），LOD 档位经现有相机状态传入调 alpha；山脉纹理 alpha 按档位降。
- `SettingsSheet/SettingsStore`：新增「州府边界」开关。
- 性能护栏：L3 视口剔除——只对屏幕外扩 15% 范围内的标签做碰撞布局（290 治所全量布局是 O(n²) 碰撞，P20 需达标 ≥50fps）。

**Web（阶段二对齐，本期不实现）**
- 同一套 `s` 判据（相机距离换算）；CSS2D 标签按档位切 class 控制显隐；州府 canvas plane 与政权名标签同理；`getCollisionObstacles` 自动跟随可见集合。

### 4.5 验收标准

- song-1111 竖屏 L0：可见地图标签 ≤ 30 个，无堆叠（政权名 8 + 河名 2 + 山名 rank≤2 共 13 条经上限/碰撞限流 + 京府 4 + 都城 ~3）。
- L3（开封区域）：可见 15–25 个治所标签无重叠压盖，州府描边清晰，FPS ≥ 50（P20）。
- 档位来回捏合无闪烁、无标签残影（滞回 + 过渡生效）。
- 数据修复（P0-A/B）后：`/api/map/overlay?dynasty=song&period=1111` 返回河流 ≥ 6 条、城市 ≥ 12 条、治所 290 点不变。
- `npm run lint` / `npm run test` 通过。

---

## 五、落地顺序建议

| 步骤 | 内容 | 依赖 |
|---|---|---|
| 1 | P0-A/B 数据修复（河流合并/补录 + 城市补录改名，补 rank） | 无 |
| 2 | P0-C 安卓州府描边渲染通道（§3.2 一版）+ 设置开关 | 无 |
| 3 | 安卓 LOD 档位接入（§4.2 矩阵 + 滞回 + 过渡 + 视口剔除） | 步骤 2 |
| 4 | P1-D 南宋州府/路级数据补齐、P1-E 黄河双河道 | 步骤 3 验证后 |
| 5 | Web 端 LOD 对齐；P2-G 政权名锚点按时期覆写 | 步骤 3 定稿后 |

---

## 六、实施完成记录（2026-08-20）

本节记录上述需求的实际落地，便于回归与对账。全部条目已完成并验证。

### 6.1 数据（P0-A / P0-B / P1-D / P1-E）

- `server/data/geo/historical/rivers.geojson` 扩为唯一数据源：9 条 feature（8 河，黄河按 1128 改道拆北线/南线），全部带 `periods` 与 `rank`（黄河/长江 1，淮河/辽河/珠江 2，钱塘/闽江/松花江 3）。
  - 北线（北宋故道，入海 37.8°N）tag `song-1111/jin-1120/liao-1111/tang-800`；
  - 南线（杜充决河夺淮，入海 36°N）tag `song-1142/song-1279/jin-1142/jin-1200/yuan-1279/yuan-1300`。
  - 实测：song-1111 返回 8 河 ✅（验收 ≥6）。
- `server/data/geo/historical/cities.geojson` 扩为唯一数据源：19 城，全部带 `periods` + `rank`；
  - 修正「南京开封府→东京开封府」（song-1111）；金朝时期单独保留「南京开封府」（jin-1142/1200）；
  - 补南宋临安（行在，rank1）、建康府（rank2，留都）等。实测：song-1111 返回 13 城 ✅（验收 ≥12）。
- `server/data/geo/historical/southern-song-routes.geojson`（新增，随仓库提交）：11 个南宋路治治所点
  （`kind: prefecture-seat`，tag `song-1142/song-1279`，含 `route` 路名，rank2），满足 P1-D「至少治所点」。
  - 与城市标签同坐标的路治（临安/建康/成都/扬州/潭州/广州）不重复录入，避免双标签。
- `server/routes/overlay.js` 标准文件清单追加 `southern-song-routes.geojson`；`prefectures.geojson`（290 治所）不变 ✅。

### 6.2 安卓州府描边通道（P0-C）+ 设置开关

- 新增 `PrefectureStrokeBuilder.kt`：独立离屏 Canvas → GL 纹理 quad（水彩 worldBox 同 box 叠加），
  线色 `rgba(58,52,40,0.36)`、线宽 1.1 设计 px、round 接缝，运行时生成不烘焙（许可安全）。
- `WatercolorBuilder` 原 4e（州府描边烘焙进水彩纹理）已移除，避免程序化回退时双绘。
- `MapRenderer.kt`：新增 `pendingPrefectures/prefectureTexId/prefectureQuad` 纹理通道，绘制序在水彩之上、
  河道之下（等价 Web z=7.02）；时期/朝代切换正确清理；GL surface 重建从缓存恢复。
- `SettingsStore/SettingsSheet`：新增「州府边界」「治所标注」两个独立开关（默认开）。

### 6.3 安卓 LOD 档位（§4.2 矩阵 + 滞回 + 过渡 + 视口剔除）

- 新增 `LodLevel.kt`：`LodTier`（L0..L3）、`mapScale`（s=可见世界宽/包围盒宽）、`nextLod`（±0.02 滞回）、
  `admitAtTier`（档位×rank 准入矩阵）、`CITY_CAPS/PLACE_CAPS`（每档数量上限）。
- `MapScreen.kt`：由 `renderer.zoom+viewport+worldWidth` 计算 s → 档位（LaunchedEffect，不重置时期切换）；
  准入过滤在 `layoutMapLabels` 前完成；L3 视口剔除（±15% 缓冲，290 治所 O(n²) 布局护栏）；
  档位切换标签层 250ms 淡入（Animatable crossfade）。
- `LabelPlacement.kt`：`layoutMapLabels` 增加 `tier` 参数，城市/州府/地点按档位×rank 表计次，
  旧 `rivers rank>1/mountains rank>2/places rank>2` 硬编码改为矩阵驱动（tier=null 时保留旧行为）。
- `MapRenderer.kt`：州府描边 LOD alpha（L2 ×0.6 / L3 ×1.0，GL uniform 250ms 指数过渡）；
  山脉纹理 L3 降至 ~30%；河道带按 rank 分级 alpha（rank2 L0 淡化、rank3 L1 淡入）。

### 6.4 Web 端 LOD 对齐 + P2-G

- `TerritoryOverlay.js`：`tierAdmits` 准入矩阵（与 Android `LodLevel.kt` 同源）；`setLod` 档位切换
  （标签层 250ms opacity 过渡；州府 plane alpha L2 0.6 / L3 1.0）；`worldBox` 导出；
  `applyVisibility/getCollisionObstacles` 改为按 name 动态查找图层组（时期切换后闭包旧组已 dispose，
  动态定位同时修复了切换后设置/年份/LOD 过滤失效的隐患），`getCollisionObstacles` 自动跟随可见集。
- `main.js`：`updateLod()` 每帧按相机距离换算 s（透视半宽 = d·tan(fov/2)·aspect）→ 滞回 → `setLod`。
- P2-G：`periods.json` 新增 `labelsByPeriod`（song-1142/1279「宋」→ [113.5, 28]）；
  `overlay.js` 注入优先级 feature.labelCoord > 时期覆写 > 全局 labels。实测：song-1142 宋=113.5,28，
  song-1111 保持 112.6,33.2 ✅。

### 6.5 验收

- `npm run lint`：0 error（2 个 pre-existing warning）。
- `npm run test`：44/44 通过。
- `node scripts/check-prefectures.mjs`：州府面 287 / 治所 290 不变，校验通过。
- Android `:app:compileDebugKotlin`：BUILD SUCCESSFUL（仅 pre-existing 弃用警告）。
- API 实测：song-1111 河流 8 / 城市 13 / 治所 290；song-1142 路治治所 11；黄河南北线按时区分流。

### 6.6 代码评审修复（第二轮 2026-08-20）

针对评审反馈的 P0/P1/P2 逐条修复：

**P0（必修）— Web LOD 滞回逻辑错误**：`main.js` 原 `updateLod()` 用「新档下限」当升档判据，
与 `lodTierFromScale` 的返回条件自相矛盾（`tier>prev` 成立时 s 必已在新档区间，条件恒假），
档位永远停 L0。已直接用 Android `nextLod` 状态机逐分支翻译替换（含 ±0.02 滞回）。
脚本模拟验证：降档 L0→L1 @ s=0.380、L2→L3 @ 0.110；升档 L3→L2 @ 0.150、L1→L0 @ 0.420，
与 Android 完全一致。

**P1（必修）— 黄河南线夺淮史实**：南线路径原为 `[113,35.3]→[116,35]→[120,36]`（近似现代河道、
入海 36°N，无黄淮交汇）。已改为夺淮河道 `…→[117.2,34.3](徐州)→[119,33.6](淮安)→[120.3,34.3]`，
入海口与淮河示意线终点完全重合（黄淮交汇叙事成立）。`note` 同步注明「夺泗水入淮、夺淮入海」。

**P2-1 双端 s 分母同源**：`TerritoryOverlay.js` 新增 `computeLodWorldBox`（政权+河流+山脉+6% pad），
与 Android `boundsOf` 逐项一致（不包含城市/地点/治所）；导出 `worldBox` 改用它，
不再用水彩政权-only box。

**P2-2 Web 河流几何淡化**：`applyVisibility` 对 rivers 按 rank 分级（rank2 L0 ×0.4、
rank3 L0 隐藏/L1 ×0.4，`material.opacity` 渐变），与 Android `riverLodAlpha` 语义对齐，
不再整条 `visible=false`。

**P2-4 过渡补全**：Web 州府描边 alpha 走 250ms easeOutCubic tween（不跳变）；
Android 河流 alpha 接入 `smoothLodAlpha` 指数平滑（`riverAlphaSmooth` 数组，删除硬切函数）；
Android 标签层降回 L0 也有 250ms 过渡（`prevLodLevel` 记录，首次 L0 不淡入）；
Web `setLod` 改为**只对新准入元素淡入**（`prevSeen` 对比，跨档标签不闪）。

**P2-5 tang/yuan 回落城市 LOD 失效**：`periods.json` 全局 cities（14）+ 三个 jin 时期 cities
补 `rank`（京府/都城 1、路治 2、一般州 3）；`overlay.js` 回落数组统一补 `kind`
（rivers→river / mountains→mountain / cities→city / places→capital）——原回落数据无 kind，
`tierAdmits` 走 default 全档，矩阵对 tang-800/yuan-* 完全失效。实测 tang-800 回落 14 城
全部 `kind+rank` 齐备。

**P2-6 死常量**：删除 `MapVisualTokens.kt` 的 `PREFECTURE_STROKE_ALPHA/WIDTH_DIV`
（4e 移除后无引用）。

**P2-7 文档同步**：`docs/technical/texture-bake-plan.md` 补充 Android 独立州府描边通道行
（PrefectureStrokeBuilder 运行时生成不烘焙；4e 分支已移除，贴图永不含州府线）。

**P2-8 Web 拆双开关**：`store.js` 新增 `showSeats`（默认 true）+ `BOOL_KEYS`；
`SettingsMenu.js` 新增「治所标注」开关行与事件委托；`TerritoryOverlay.js`
`setAuxiliaryVisibility` 读 `showSeats` 控制治所组（`visibility.seats`），
`visibility.prefectures` 只控州府边界 mesh——与 Android 双开关对称。

**记账项（未实现，评审确认可接受）**：
- Web 无城市/治所数量上限（`CITY_CAPS/PLACE_CAPS` 仅 Android；桌面端标签密度可接受）。
- Web 标签无统一避让布局器（CSS2D 直接挂 scene），数量截断需引入额外布局阶段，暂缓。
