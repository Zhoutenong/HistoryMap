# HistoryMap 重构需求文档（Android 单端版）

> 本文档从现有代码库（Web 端 client/ + 服务端 server/ + Android 原生端 android/ + 数据管线 scripts/）中反向提炼全部需求，作为重构的需求基线。
> **重构目标形态：只保留 Android 原生端（Kotlin + Jetpack Compose + 自研 GLES2 渲染器），全离线运行；Web 前端与 Express 服务端运行时退役；Node 数据管线与数据文件作为独立资产保留。**
> 每条需求标注来源与现状：【已实现-Android】原生版已落地；【已实现-Web】Web 版已落地、Android 未迁移（重构需决策去留）；【管线】数据管线能力。

---

## 一、产品概述

### 1.1 产品定位

**HistoryMap · 中国历史地图**——基于时间轴自动播放的交互式历史可视化：

- 主画面是一张宣纸水墨风格的中国历史地图；
- 底部时间轴沿朝代起止年推进，默认自动播放；
- 时间推进到事件年份时，地图对应位置弹出「事件泡泡」（笺条样式）；
- 点击泡泡查看事件详情（正文 / 影响 / 地点 / 相关事件）；
- 顶栏朝代下拉在已播种朝代间切换（数据驱动，加朝代不改代码）；
- 跨过时期边界（如 1127 北宋→南宋）时自动重载疆域并弹出转场横幅。

当前已接入 **5 个朝代**（数据来自 `server/data/seed/*.sql`）：

| 朝代 id | 名称 | 起止年 | 事件数 | 时期划分（periods.json） |
|---|---|---|---|---|
| song | 宋朝 | 960–1279 | 30 | 1111 北宋极盛 / 1142 南宋·绍兴和议 / 1279 崖山·元朝建立 |
| liao | 辽朝 | 916–1125 | 21 | 1111 辽·鼎盛 |
| jin | 金朝 | 1115–1234 | 24 | 1120 灭辽前期 / 1142 南北对峙 / 1200 大定至灭亡 |
| yuan | 元朝 | 1271–1368 | 20 | 1279 一统天下 / 1300 大都时代 |
| tang | 唐朝 | 618–907 | 25 | 800 盛唐气象 |

### 1.2 设计宪法（视觉红线，重构必须原样继承）

来源 `docs/technical/android-visual-polish-ai-pipeline.md`：

- **宋代文人美学**：宣纸、水墨、留白、朱砂印章、淡金点缀；
- 饱和度 ≤ 35%；禁霓虹色、纯黑纯白、玻璃拟态、多层阴影；
- 中文一律衬线字体（Noto Serif SC），字距宽松，有「古籍刻本」的疏朗感；
- 地图内容永远是底层「纸面内容」，控件是浮在纸面上的「笺条 / 印章」，不遮挡地图叙事；
- 实现约束：无外部视觉依赖；允许的效果仅 solidColor / alpha / linearGradient / radialGradient / 单层阴影 / 虚线 / 圆角 / 淡入淡出 / 位移动画 / 缩放动画。

### 1.3 目标设备与性能基准

- **基准机型：华为 P20**（Android 10 / API 29 / 1080×2244 @480dpi，设计画布 1:1）；
- 实测基线：自动播放全功能 55–59 fps（渲染器每 5 秒输出一次 FPS 日志，tag `HistoryMap`）；
- minSdk 24（Android 7.0），targetSdk 34，applicationId `com.historymap.app`。

---

## 二、功能需求

### FR-1 地图渲染层

自研 GLES2 渲染器（GLSurfaceView，EGL 8/8/8/8 + 16 深度 + 8 模板），不依赖任何地图/游戏引擎第三方库。【已实现-Android】

**FR-1.1 图层与绘制顺序**（自下而上）：

1. **宣纸底**（全屏 NDC quad 片元着色器）：`paper-texture.jpg` 纤维纹理 × 暖纸色混合 → `paper-grain.png` 颗粒（GL_REPEAT，512×512 POT，uv×1.2 采样）→ 中心提亮 → 暖褐径向暗角；暗角/提亮的径向中心竖屏取**地图区中心**（token mapTop/mapBottom 中点）、横屏取屏幕中心；整体乘 GL_BRIGHTNESS 对齐 Compose 亮度（GLSurfaceView 无 sRGB 管理）。纹理缺失时退化为纯色，不崩溃。
2. **山脉纹理层**（画在水彩之下）：淡墨干笔山脊线（有 path 时描山脊 + halo 长虚线），点位山脉生成确定性山形笔触。
3. **水彩疆域纹理层**：政权多边形 CPU 离屏生成水彩纹理（详见 FR-1.3）。
4. **河流纹理层**（画在水彩之上）：主干河流三层笔触（wash 宽水痕 + body 主体 + spine 脊线），Chaikin 二次平滑；支流两层（wash + body）。

**FR-1.2 投影**：Kotlin 翻译 d3-geo `geoMercator` + `fitSize([1000,800])`，与原 Web 版 `project()` 输出完全一致（坐标语义不变）。投影以 overlay 全体要素（政权环 + 河流 + 山脉）**首次加载时标定一次**；之后时期切换不重标定（保证切换前后坐标连续），仅朝代切换（calibrate=true）重新标定。事件/标注坐标一律经投影函数转换，禁止手算。

**FR-1.3 水彩疆域纹理生成**（CPU 离屏，IO 线程）：多边形填充带 `fillOpacity` 与孔洞处理；效果包含：边缘羽化（bloomBlur）、主体晕染、斑驳噪点（明/暗双 variant）、边界渗墨描边、干笔边缘（dry edge）、边缘积色（pooling）、颗粒；alpha 下限 0.72–0.75（保证色块不过淡）。政权威色经 tint 钳制（s×0.95 / l×0.92，钳 [0.28, 0.55]）。

**FR-1.4 山水分层**：山脉与河流拆为两张独立纹理，与水彩共用同一 worldBox 保证叠加对齐。

**FR-1.5 相机**：正交投影，世界坐标约 ±500×±400（投影 fit 1000×800 标定）。

- 手势：**单指拖动平移**（地图跟随手指）、**双指捏合缩放**（围绕焦点，焦点世界坐标保持不变，zoom 钳制 0.25–24）、**双击复位取景**；
- 默认取景（resetCamera）：竖屏先 contain-fit 到**地图区**（设计 token mapTop=154px / mapBottom=1410px 对应的屏幕分数），再乘 `CAMERA_FIT_BOOST≈1.4` 放大（纵向填满地图区，东西边缘政权允许部分出屏）；水平锚定**中原（宋政权域中心）**并钳制不出全图包围盒；横屏 contain 不裁切；
- Surface 尺寸「小变化」（<200px，系统栏显隐抖动）不重置相机，大变化（旋转）才重置。

**FR-1.6 纹理生命周期**：

- UI 线程生成 CPU 纹理（不碰 GL），GL 线程懒上传；旧 GL 纹理 ID 入队由 GL 线程删除（UI 线程不得调 glDeleteTextures）；
- **LRU 缓存**（上限 6 项 ≈ 两个时期 × 3 张纹理，key = overlay JSON 原文 + 视口尺寸 + density）：GL context 重建（退后台再回前台）后从缓存重新挂载，避免疆域闪空；
- **时期切换纹理交叉淡入**（350ms）：旧纹理淡出新纹理淡入，避免硬切；朝代切换（calibrate）先清空旧纹理故无交叉淡入，由转场横幅覆盖过渡。

**FR-1.7 图层显隐开关**（设置面板驱动，GL 线程每帧读取 volatile 标志）：水彩疆域（showTerritory，同时控制政权标签层与图例显隐）、河流与山脉（showRivers）。

**FR-1.8 年份水印**：地图右上方大字号当前年份「XXXX 年」（设计 120px / 字距 8 / 墨色 10% alpha / 衬线），位于标签与泡泡之下；随年份逐年更新。

**FR-1.9 现代底图对比层**：【已实现-Web】现代中国省界（china.json）作为可选对比层，默认隐藏。Android 端未实现（assets 已同步该文件），重构时决策是否保留此需求（建议降级为可选）。

### FR-2 地图标注层

Compose Canvas 屏幕空间绘制，与 GL 层通过 worldToScreen 对齐。【已实现-Android】

**FR-2.1 标注种类与来源**（全部数据驱动，来自 overlay 响应）：

| kind | 来源 | 样式 | 优先级 |
|---|---|---|---|
| regime 政权名 | feature entity + labelCoord（人工标定）或最大环顶点平均兜底 | 16px 加粗深墨 + 纸色 halo 双 pass | 最高（major 政权更高） |
| cities 城市 | properties.cities（rank 1 最重要） | 14px + 锚点「墨点 + 纸色细环」靶心 | rank≤2 优先 |
| prefecture 州府治所 | properties.prefectureSeats | 13.5px；rank≤2（京府/次府）为 major 大字 | 与城市同级 |
| mountains 山脉 | properties.mountains | 13px | 辅助 |
| rivers 河流名 | properties.rivers（取路径首点） | 13px；rank>1 不显示 | 辅助 |
| places 地点（都城/战场/书院） | properties.places | 13px | 辅助，rank>2 默认隐藏 |

**FR-2.2 布局算法**（纯函数，绘制与泡泡碰撞共用）：

- 优先级排序：主政权 > 政权 > 主要城市/京府次府 > 普通城市/州府 > 山脉 > 主干河流 > 地点；
- 候选位：锚点 + 上下左右偏移；选「不与已放置标签碰撞 + 不进 UI 禁区 + 不出屏 +（政权）位于本政权多边形域内 + 离锚点最近」的位置；全失败则隐藏；
- UI 禁区（实测屏幕矩形）：顶栏底边以下、图例小笺区、时间轴顶边以上、年份水印区；
- 移动端紧凑限流：竖屏城市 ≤7 / 地点 ≤5 / 辅助 ≤24；横屏 4/3/14；
- 被移出锚点超过阈值（8px）的标签画细淡虚线指向线连回锚点。

**FR-2.3 重算时机**：相机 zoom/cx/cy 变化、overlay 内容变化、Surface 尺寸变化、朝向变化时重算。

### FR-3 时间轴

`TimelineController` 是**「当前年份」唯一状态源**——播放/暂停/拖动/跳年/播放完毕全部经它，地图/泡泡/水印/时期切换只订阅。【已实现-Android】

**FR-3.1 状态与行为**：

- 自动播放：协程按 tickMs 逐年推进（+1 年/tick）；到达 endYear 进入「播放完毕」态（completed=true），自动停止；
- 播放完毕后点播放：从头（startYear）重新播放；
- 任何手动 setYear（拖动/跳年/事件点击）退出「播放完毕」态；年份钳制在 [startYear, endYear]；
- setTickMs 播放中生效（重建定时器）；
- 播放速度档位：slow=220ms / normal=110ms / fast=50ms 每年。

**FR-3.2 时间轴 UI（底部卡片）**：

- 三行结构：① 播放按钮（56px 视觉印章 / 44dp 触摸区；状态图标 ▶ / ❚❚ / ↻）+ 当前年份（42px 朱砂）+ 起止范围「960 — 1279」；② 轨道（6px 视觉线，44dp 触摸区；朱砂→金渐变进度；32px 滑块米白内芯 + 3px 朱砂描边；事件刻度点 ⌀10 按分类着色、同年去重、当前年份实心朱砂、1dp 米白外描边）；③ 五分类图例（色点 + 政治/人物/军事/经济/文化）；
- **轨道手势**：拖动实时定位年份（超过 touchSlop 判定拖动并自动暂停）；轻点（<slop）在 24dp 内吸附最近事件刻度点（触发事件点击），否则按位置跳年；
- **事件刻度点点击**：暂停 + setYear(事件年) + 打开详情（跳年必须发生，否则水印/泡泡停留旧年份）。

**FR-3.3 播放完毕提示**：时间轴卡片上方浮出「本朝历史播放完毕 · 点 ▶ 可重新播放」朱砂边胶囊，点击从头播放。

### FR-4 事件泡泡层

Compose Canvas 屏幕空间绘制，位置 = 投影(worldToScreen)。【已实现-Android】

**FR-4.1 显示窗口**：事件仅在 `[year, yearEnd]` 窗口内显示，过期消失；窗口内事件按分类设置过滤。

**FR-4.2 泡泡形态**（三种）：

| 形态 | 内容 | 高度（设计 px） | 视觉 |
|---|---|---|---|
| 普通 | 简称（15px/700）+ 年份（12px 朱砂）+ 一行首句摘要（≤18 字） | 76 | 米白纸笺 + 朱砂细描边 + 单层淡墨阴影 + 左侧分类色竖条（宽 6px） |
| 选中（详情打开时） | + 两行摘要（≤36 字，StaticLayout 截断） | 116 | 朱砂底白字 + 米色聚焦描边，始终最后绘制（最上层） |
| 聚合 | 「简称 +N」 | 44 | 紧凑纸笺 |

**FR-4.3 布局算法**（纯函数，绘制与命中共用同一计算）：

1. 每个事件独立成泡（**不预聚合**）；锚点 = 事件经纬度投影的屏幕坐标；
2. 地图标签（非河流）作为**固定障碍**参与碰撞；
3. 碰撞推挤规则：按年份升序，早出现者优先不动、晚出现者被推；优先向下推（≤64px），垂直超限改水平推（优先右）；固定障碍不可被推；
4. 安全区 clamp 回收：不进入顶栏底边以上、时间轴顶边以下（安全区用**实测** UI 边界而非固定 dp）；回屏后做二次碰撞消解；
5. 折叠：并查集按「推挤后仍重叠」聚簇，**簇 ≥3 才**收成「+N」聚合泡泡（2 个近邻事件由推挤分开，避免 1127 靖康之变类密集事件被过早合并）；聚合泡中心 clamp 回安全区，指向线锚点保留真实位置；
6. 指向线：被推挤（位移 >4px）的泡泡画朱砂虚线（1.2px / dash 8 / gap 7）+ 箭头（8×5）从泡泡指向事件真实位置；锚点画事件点（⌀10 朱砂圆 + 米白描边）。

**FR-4.4 动画**：新增泡泡 180ms 淡入 + 缩放（0.85→1.0，中心锚点含指向线）；消失泡泡以最后位置 180ms 淡出；平移/缩放相机不触发动画。

**FR-4.5 命中与交互**：点击命中测试与绘制共用布局；点中泡泡 → 暂停播放 + 打开详情。

**FR-4.6 性能约束**：布局计算在组合期完成，相机四元组（zoom/cx/cy/尺寸）为 key 缓存；单朝代事件量 ≤30 时全流程 55fps+。

### FR-5 事件详情面板

应用内底部抽屉（ModalBottomSheet 样式，不依赖系统 Popup）。【已实现-Android】

内容自上而下：

1. 元信息 chip 行（FlowRow 可换行）：年份徽章、分类徽章（时代格局/名人轨迹/军事·领土/经济变革/重要发明）；
2. 分享按钮（见 FR-12）；
3. 标题（≤2 行，朱砂 22px）；地点行「◆ 地点 {place}」（有 place 时）；
4. 正文 detail（14px/行高 24px）；
5. 「影 响」卡片（朱砂淡底 PaperCard，有 impact 时）；
6. 相关事件：**同分类**按年份距离取 3 条；点击 → 暂停 + setYear(相关事件年) + 切换详情内容（面板自动滚回顶部）；
7. 底部水墨山水插画（ink-landscape.png，55% alpha，加载失败静默）。

行为：打开时暂停播放；关闭后**保持暂停**（不自动恢复，与「点泡泡暂停」语义一致）；右上角独立关闭按钮 ≥44dp；打开/切换期间年份已同步（水印/泡泡/时期切换联动）。

【已实现-Web，Android 缺失，重构决策】打开详情时**相机平滑聚焦事件位置 + 地图缩小让位**（Web 版 focusOn + frameMap）。Android 版无此动效，建议列为 P2 增强。

### FR-6 事件流抽屉

顶栏「事件」按钮打开的底部抽屉。【已实现-Android】

- 标题行「历史事件」+ 副文本「**当前 XXXX 年 · 已出现 N / 总数 M 个**」；
- 搜索框（纸面胶囊）：按简称/标题/地点/正文/年份模糊匹配（忽略大小写）；空查询显示已出现事件，有搜索词搜索**全部**事件（含未出现）；显示「找到 N 个匹配」；
- 列表按年份升序：当前年份窗口内事件朱砂高亮；未出现（year > 当前年）灰显（文字 35% / 色条 30% 透明）；每条 = 分类色条 + 年份 + 简称；
- **自动定位**：年份推进时列表自动滚动跟随当前事件；用户手动滚动后停止自动定位，出现「回到当前 ▾」按钮（点击恢复跟随）；
- 点击条目：关闭抽屉 + 暂停 + setYear(事件年) + 打开详情；
- 已出现事件追踪语义：年份前进时首次进入窗口的事件加入；**重播/年份倒退时清空重新累积**。

【已实现-Web，Android 缺失，重构决策】顶栏「事件」按钮的**未读徽标**（抽屉关闭期间新出现事件计数）。建议 P1 补齐。

### FR-7 设置面板

底部抽屉；SharedPreferences 持久化（key `historymap.settings.v1`），重启保持。【已实现-Android】

Android 现有设置项：

| 设置 | 取值 | 默认 |
|---|---|---|
| 事件分类多选 | era / figure / military / economy / invention | era + military（默认开两类的理由：南宋后期事件全为 military，只开 era 会导致该时段无泡泡） |
| 播放速度 | slow / normal / fast | normal |
| 水彩疆域显隐 | bool | true |
| 河流与山脉显隐 | bool | true |

约束：分类至少保留一项（全取消时回落 era）；非法持久化值读取时回落默认。

【已实现-Web，Android 缺失，重构决策】Web 版另有：自动播放开关（autoplay）、现代底图显隐（showBaseMap，默认关）、疆域/河流/山脉/城市/地点/州府边界/县治**分图层独立显隐**（showCounties 默认关，1135 县防拥挤）、设置导入/导出（JSON 文本 + `?s=base64url` URL 分享）。建议：分图层显隐按需裁剪；设置导入/导出随 Web 退役放弃（或改Android 深链接方案）。

### FR-8 政权图例

左上角（状态栏下 194px 设计位）。【已实现-Android】

- 手机端**默认折叠**为朱砂「政权 ▾」小笺；点击展开纸面卡片（173×292 限高滚动）；
- 每行 = 水彩短色条（竖向渐变圆角，模拟渗色）+ 政权名；按 fillOpacity 降序（主政权在前且加粗）；
- 数据 = 当前 overlay 政权按 entity 去重（同政权多 feature 只一行）；随时期切换刷新；
- 受「水彩疆域」开关控制显隐。

### FR-9 朝代切换

顶栏「历史地图」标题 + 朱砂印章式朝代按钮（米白底朱砂描边字）+ 事件/设置按钮。【已实现-Android】

- 朝代列表来自本地数据库 dynasties 表（start_year 升序）；
- **应用内嵌下拉菜单**（全屏点击层 + 绝对定位面板）——不得用 DropdownMenu/Popup（会在华为设备触发系统栏闪现）；
- 切换流程（loadDynasty）：取初始时期（朝代 startYear 落在哪个 period）→ 读 overlay + 事件 + periods → 重标定投影 + 立即取景 → 重建时间轴（起止年换新）→ 清空已出现事件记录 → IO 线程生成纹理后挂接；
- **竞态防护**：代际计数（dynastyGen），旧朝代的异步结果（overlay/纹理）到达时若已再切换则丢弃；朝代切换时 dispose 旧时间轴播放协程；
- 打开菜单时暂停播放。

**状态恢复**（进程被杀/Activity 重建）：当前朝代 id 与年份经 rememberSaveable 持久化；恢复时**回到保存年份并保持暂停**（不自动播放）；冷启动（无恢复值）才自动播放。

### FR-10 时期切换与转场

【已实现-Android】

- 年份推进/跳年跨过 periods 边界时自动重载该时期 overlay：投影保持首次标定；纹理交叉淡入（FR-1.6）；图例/标签刷新；
- **时期转场横幅**：屏幕中上部金边纸卡（朱砂竖线装饰 + 淡入 300ms / 淡出 500ms），显示新时期 label（如「南宋·绍兴和议」），约 2.6s 自动消失；
- 加载去重（periodLoading）：异步加载期间同时期不重复触发；加载完成后**重评估当前年份**（加载期间可能已跨入下一时期，保证收敛）；
- 加载耗时打点（adb logcat tag HistoryMap）。

【已实现-Web，Android 缺失，重构决策】Web 横幅含「前时期 → 后时期」文案与年份。建议 Android 横幅补充「北宋极盛 → 南宋·绍兴和议」格式（数据已有，纯 UI 改动，P2）。

### FR-11 州府级数据（元丰九域志基准，宋 1111 时期）

**FR-11.1 渲染**：【已实现-Android】州府 Voronoi 近似面仅描边（隐约肌理：低 alpha + 干笔虚线，画在水彩层内）；治所标注 `kind=prefecture`（rank≤2 京府/次府 major 大字）。

**FR-11.2 府州详情面板**：【已实现-Web，Android 缺失，重构决策（docs/architecture/data-improvement-plan.md 已列为「Web 验证交互后移植 Android」）】点击州府治所标注打开，内容：

- 头部：路（route）· 类型（府/州/军/监）+ 等级（grade）徽章；标题「{名} · 府州详情」；
- 治所行：治所县名 + 坐标；
- 「户 口 · 元丰九域志」卡：主户/客户/合计户数；
- 「土 贡 · 元丰九域志」卡；
- 「沿 革 · 舆地广记」卡；
- 「属 县 · N」卡（>14 县截断加省略号）；
- 相关事件（事件 place 与州府名前缀匹配，≤6 条）；
- 数据说明脚注：置信度（medium=治所已人工校订 / low=Voronoi 近似边界）+ 数据源；
- 底部水墨插画。

**FR-11.3 时空库详情增强**：【已实现-Web】面板打开后异步请求 `/api/places/song-{名}`，追加：生命周期（全部时间版本 validFrom—validTo + nameAtTime）、变更事件时间线（升/废/置/改…，≤8 条 + 总数，`yearApprox` 显示「约」）、史料来源（书名 + 卷次）、数据置信度（百分比）。**时空库不可用（503/404）时静默降级**，基础详情不受影响。Android 当前全离线，消费方式见「开放问题 Q1」。

### FR-12 分享

【已实现-Android】事件详情「分享」按钮：系统分享面板（ACTION_SEND 纯文本），文本 = 标题 + 年份 + 地点 + 正文；无可用分享应用时静默忽略。

【已实现-Web，随 Web 退役失效，重构决策】Web 深链接分享 URL `?dynasty=&year=&event=`（打开直达详情）与设置分享 `?s=`。Android 若需等价能力需另行设计（App Link / 剪贴板协议），建议列为 backlog。

### FR-13 系统集成与生命周期

【已实现-Android】

- **沉浸式全屏**：Android 11+ 隐藏状态栏/导航栏（轻扫临时露出）+ 刘海 SHORT_EDGES 延伸；Android 10-（P20/EMUI10）只隐藏导航栏、状态栏保持可见（EMUI 状态栏区域恒黑，隐藏只会得到死黑带）；窗口强制 OPAQUE + 系统栏宣纸色（EMUI 会把含 SurfaceView 的窗口标 TRANSLUCENT 导致黑透）；窗口重获焦点/.onResume 时重新应用沉浸；
- **返回键层级**（统一 BackHandler）：详情 → 设置 → 事件流 → 朝代菜单 → 系统退出；
- **后台**：ON_PAUSE 暂停自动播放（防后台空跑/回来年份突跳），回前台**不自动恢复播放**（用户手动点播放）；
- **横竖屏**：manifest 声明 configChanges（旋转不重建 Activity）；横屏适配——标签限流收紧（FR-2.2）、暗角中心取屏幕中心（FR-1.1）、地图区为整屏 contain 取景（FR-1.5）；
- 触摸目标 ≥44dp；播放按钮 44dp 触摸区 / 56px 视觉。

---

## 三、数据需求

### 3.1 朝代与事件（SQLite / Room）

表结构（`server/data/schema.sql`，Room 端 `HistoryDb.kt` 对齐同 schema）：

```
dynasties(id TEXT PK, name TEXT, start_year INT, end_year INT)
events(id INTEGER PK AUTOINCREMENT, dynasty_id TEXT FK, year INT, year_end INT,
       lng REAL, lat REAL, short TEXT, title TEXT, detail TEXT,
       impact TEXT DEFAULT '', place TEXT DEFAULT '', category TEXT DEFAULT 'era')
索引：(dynasty_id, year)、(dynasty_id, category)、唯一种子标识 (dynasty_id, year, short)
```

事件对象字段语义：

| 字段 | 语义 |
|---|---|
| id / dynasty_id | 主键 / 所属朝代 |
| year / year_end | 显示窗口 [year, year_end]（公历整数年份；泡泡此窗口内显示，过期消失） |
| lng / lat | 事件坐标，**经度在前**（与 GeoJSON 一致） |
| short | 泡泡简称（≤6 字为宜） |
| title | 详情标题 |
| detail | 详情正文（泡泡摘要取首句） |
| impact | 影响栏（可空） |
| place | 地点徽章，格式「地名（今地名）」（可空；也是州府详情相关事件匹配键） |
| category | era / figure / military / economy / invention |

**Android 装载方式**：assets/seed/*.sql 首次建库时重放（INSERT OR IGNORE 幂等；SQL 切分器需处理单引号转义与 `--` 注释）。**seed 变更后需 bump Room version + Migration 或卸载重装**——重构应改为「seed 文件指纹比对自动重放」以消除此坑。

**加朝代扩展点**：新增 `NN-xxx.sql` seed + periods.json 时期条目 +（可选）疆域 GeoJSON 文件，顶栏下拉自动出现，**前端零代码改动**。此扩展契约必须保留。

### 3.2 疆域叠加层（overlay）

Android 端由 `OverlayLoader` 在本地复刻服务端合并逻辑，输出与原 `GET /api/map/overlay` 完全一致的 JSON（此合并在重构后是 Android 端数据层的核心职责）：

```
输入：assets/geo/historical/periods.json（索引）+ 政权文件（regimes-*.json / jin-*.json）
      + 标准辅助 GeoJSON（rivers / mountains / cities / places / prefectures）
合并规则：
  periodId = "{dynasty}-{period}"，按 periods[].files 合并政权 features；
  每个 feature properties 注入：entity（缺省「未知政权」）、color（feature 自带 →
      entities 配色表按中文名查 → #888888 兜底）、fillOpacity（缺省 0.35）、
      labelCoord（feature 自带 → labels 表 → null→前端质心兜底）、
      labelMajor（feature 自带 → labelMajor 列表）；
  辅助层按 feature.properties.periods 数组过滤时期（无 periods 字段 = 全时期），
      标准文件优先，缺失时回退 periods.json 时期内嵌数组；
  kind 白名单：river / mountain / city / prefecture / prefecture-seat /
      capital / battlefield / academy（地点类）；未知 kind 安全忽略；
  legacy 转换：river→path；Point→coord；山脊 LineString→path+coord(首点)；
      prefectures 面**保留完整 feature**（不走 legacy 剥 geometry 通道）。
输出：
{ type: 'FeatureCollection',
  features: [政权多边形…],
  properties: { period, year, _periodId,
    rivers[], mountains[], cities[], places[],
    prefectures[完整Feature], prefectureSeats[legacy点] } }
```

periods.json 索引结构：`periods[]`（id/year/start/end/label/files + 可选内嵌 rivers/mountains/cities）、`entities[]`（id/name/color，共 22 政权配色）、`labels{政权名→[lng,lat]}`（人工标定政权名位置）、`labelMajor[]`（8 个主叙事政权：宋辽西夏金元吐蕃大理唐）、顶层 fallback rivers（8 条：黄河/长江/淮河/辽河/珠江/钱塘江/松花江/闽江）/ mountains（14 座）/ cities（14 城）、`default`。

数据源与许可：regimes 轮廓来自 [aourednik/historical-basemaps](https://github.com/aourednik/historical-basemaps)（GPL-3.0，衍生数据须沿用 GPL-3.0），重新生成走 `server/scripts/fetch_historical_basemaps.js`。已知数据修复：**山东半岛北岸顶点偏低 0.1–0.2°，SHANDONG_NORTH_COAST_FIX 幂等锚定修补**（双端同源受益，重构必须保留）。

### 3.3 州府级数据管线（宋 1111）

数据基准：《元丰九域志》（1080 快照，kanripo KR2k0005 主源）+《舆地广记》（沿革，维基文库四库本 38 卷）+ 宋史·地理志（南宋沿革）。【管线】

| 命令 | 输出 | 说明 |
|---|---|---|
| `npm run data:classics` | song/jiuyuzhi-1080.json + yudi-guangji.json | 古籍解析（路→府州军监→县 + 户口/土贡/原文摘录 + 政和改名交叉比对）。入 git |
| `npm run data:seats` | _generated/song-seats-1080.json | 治所坐标：复旦 TGaz（CHGIS）按治所县名查 yr=1080 + scripts/manual-seats.song.json 人工标定兜底 |
| `npm run data:prefectures` | historical/prefectures.geojson | Voronoi 近似州府面（d3-delaunay + polygon-clipping 与宋政权轮廓求交） |
| `npm run data:check` | 校验报告 | GeoJSON 结构/数量/坐标范围/名称交叉；验收闸门：州府数 = 4 京府 + 10 次府 + 242 州 + 37 军 + 4 监，县数 1135 |

州府 feature properties：`kind`（prefecture / prefecture-seat）、`rank`（1 京府 / 2 次府 / 3 户口≥5万 / 4 ≥1万 / 5 其他）、`style: stroke-only`、`confidence`（low/medium）、`id/name/route/type/grade/households{main,guest}/tribute/seat/seatCoord/countyCount/counties/evolution/source/license/note`。

古籍底本已知缺文（管线 warning 记录，人工裁决）：九域志缺邢州头行（占位州已定名）、部分州缺「縣N」行/治所注记；岳州/万州为四库本误刻（峯州巴陵郡/方州南浦郡），已按舆地广记校正并保留 `sourceFix`。

### 3.4 时空数据库（PostgreSQL 16 + PostGIS，时间版本化）

与渲染数据平行的**逐实体时间版本化**体系。【管线 + Web 已消费，Android 未消费】

- Schema（`server/data/schema-temporal.sql`）：`sources`（史料源）/ `places`（实体稳定身份 + name_variants + confidence + source_ids）/ `place_versions`（valid_from/valid_to 生命周期 + PostGIS geom + name_at_time + 版本不重叠 trigger + GIST 索引）/ `place_events`（变更事件：year / year_approx / event_type / detail 原文摘录 / source_id / confidence）；
- 管线：`data:songshi`（宋史·地理志 ctext 6 章 224 州府 + 变更事件提取）→ `data:temporal`（三源合并写 PG）→ `data:temporal:check`（时间线一致性：版本区间合法、不重叠、1080 命中全部九域志州府、事件年 960–1279）；
- 当前规模：实体 332（九域志 290 + 宋史独有 42）、时间版本 380、变更事件 1088（12 种类型）、几何覆盖 83.9%；
- 事件提取经验规则（必须随管线保留）：年号→公历「起始年+N-1」；detail「废X州」宾语甄别（X≠当前州 → targetOther 不切分）；县级/军额变化不切分生命周期；短 detail（<3 字）不切分；**快照优先**（九域志 1080 有载的州府，切分不覆盖 1080，warning 供人工裁决）；宋史无独立条目但叙述完整的实体手工补录；
- 置信度模型：州府面 Voronoi ≈0.35 / 治所点 ≈0.9，三层表均带 confidence + source_ids 可溯源；
- API（`/api/places` 系列，Web 端消费）：按年/类型/名称/路查有效版本、实体详情（版本+事件+史料）、史料清单；**未启用时 503 静默降级不影响主流程**。

### 3.5 数据许可红线（不可违反）

| 数据 | 入 git | 商用 | 处置 |
|---|---|---|---|
| 古籍解析 JSON（九域志/舆地广记/宋史） | ✅ | ✅ | 公版 |
| 人工标定坐标（manual-seats.song.json） | ✅ | ⚠️ 建议标注 | 事实性数据 |
| **CHGIS 派生坐标/州府面** | ❌ gitignore | ❌ | 复旦协议：不可再分发、非商业——仓库只放脚本，数据本地重跑生成 |
| regimes-*.json | ✅ | — | GPL-3.0 沿用 |
| 谭图扫描/CCTS 瓦片 | ❌ | ❌ | 仅个人参考，不入任何分发物 |

### 3.6 数据同步链（保留资产）

`scripts/prepare-android.mjs`：**清空重建** android assets → 同步 seed SQL、geo/china.json、geo/historical/（.json/.geojson/README，排除 source/ 与 _archive_v1_chinaclip/）→（重构后去除 web 构建产物通道）。原则：**只复制不加工，数据单一来源在 server/data 与 seed**，Android 不手抄数据。

---

## 四、架构需求（重构后目标结构）

```
┌─ Compose UI 层 ──── 顶栏/时间轴/泡泡Canvas/标签Canvas/图例/详情/事件流/设置/横幅
├─ 渲染层 ─────────── GLSurfaceView + GLES2 自研渲染器（宣纸底/水彩/山水 quad + 相机）
│                     对外接口：setOverlay(model, calibrate, cacheKey) /
│                     buildTextures(IO线程) / setTextures / projectEvent /
│                     worldToScreen / pan·zoom·resetCamera / labels·regimeColors
├─ 布局纯函数层 ───── 碰撞推挤（collisions）/ 泡泡布局（layoutBubbles）/
│                     标签布局（layoutMapLabels）—— 可单测，无 Android 依赖
├─ 数据层 ─────────── MapRepository（唯一数据入口）：Room（dynasties/events，seed 重放）
│                     + OverlayLoader（periods.json 索引合并，等价原 API 契约）
└─ 资产 ───────────── assets: seed/*.sql + geo/**（prepare-android.mjs 同步）+ 字体 + 纸纹
```

必须遵守的架构边界（全部来自现实现踩坑沉淀）：

1. **时间轴是「当前年份」唯一状态源**；泡泡/水印/时期切换/事件流全部订阅，不得各自维护时间；
2. **投影单例语义**：首次（或朝代切换）标定一次，时期切换不得重标定；
3. **事件/标注坐标只能走统一投影**（projectEvent → worldToScreen），禁止手算经纬度；
4. **渲染器双线程模型**：UI 线程写 volatile 数据/生成 CPU 纹理，GL 线程读状态画帧 + 独占所有 GL 调用（含纹理删除）；
5. **相机状态（zoom/cx/cy）以 Compose 状态暴露**——UI 层观察它重算标签/泡泡屏幕布局，GL 线程读同一份画帧；
6. **纯函数可测**：碰撞/标签布局/年份换算保持无副作用纯函数（现 Web 端有 11 个 vitest 用例，重构后在 Kotlin 侧补等价单测）；
7. **UI 组件不得创建新窗口**（无 Popup/DropdownMenu/Dialog——华为系统栏闪现）；字体统一走 MapFonts 单一入口（打包 Noto Serif SC 精简子集，400/700 双字重，禁止 FontFamily.Serif 默认衬线）；
8. **设计 token 单源**：`docs/design_optimize/design-tokens.json` 为唯一真相源，代码侧 `MapVisualTokens.kt` 单源组织 Colors/Alpha/Dimensions/Typography/MapParams/Bubble/Timeline；`npm run check:tokens` 做 89 项 diff 校验（token 脚本保留）；
9. **尺寸换算纪律**：设计画布 1080×2244 @480dpi，DesignMetrics 换算 dp/sp/px；**禁止把设计 px 直接写成 dp**（density 二次放大事故）；Canvas 测量/绘制用屏幕像素 + designToPx，字号全局 ×FONT_SCALE 时布局与绘制必须同步。

---

## 五、视觉规格（关键 token，来源 design-tokens.json）

**颜色**：宣纸底 mapBackground `#E6D8B5` / 面板 `#F8F4E9` / 卡片 `#FDF8EC`；墨阶 `#3A3428 / #5B5141 / #807665`；朱砂 `#B03A2E` / 金 `#D6824A`。政权色（现行 periods.json entities 表为准）：宋 #b03a2e / 辽 #4a6a8a / 西夏 #b08d4f / 金 #a8873a / 吐蕃 #8a6a4a / 大理 #6a8a5f / 蒙古·元 #6a4a3a / 唐 #a8322a 等 22 个。分类色：政治 #B03A2E / 人物 #6E5A7E / 军事 #A0622D / 经济 #5F7D4F / 文化 #46647F。

**关键 Alpha（0–255）**：顶栏 224 / 图例底 184 / 泡泡底 238 / 泡泡描边 170 / 泡泡阴影 35 / 年份水印 26 / 水彩主体 117 / 边界 122 / 暗角 97 / 时间轴轨道 36。

**关键尺寸（设计 px）**：顶栏高 154 / 图例 (24,194) 173×292 / 地图区 y 154–1410 / 泡泡 260×112 r8 / 指向线 1.2 (dash8/gap7) / 箭头 8×5 / 事件点 ⌀10 / 时间轴卡 (42,1410) 996×280 r14 / 播放钮 56 / 轨道 6 / 滑块 ⌀32 描边 3 / 刻度点 ⌀10。

**字体**：全衬线；顶栏标题 18/字距4、朝代 15B/2、泡泡标题 14B、正文 11、年份水印 120/8、时间轴年份 42/3、分类 11。

**渲染参数**：水彩 bloomBlur24 / bodyBlur6 / mottle60 / edge1.8 / dryEdge0.8；河流主干 wash12/body3.2/spine1.1；纸 grain0.10 / vignette0.38 (0.36→0.86) / centerLight0.10；相机 FIT_BOOST 1.4。

**38 层图层叠放总序**（prompt_2.md）：宣纸底 → 中心提亮 → 暗角 → 颗粒 → 山脉 → 水彩晕染 → 水彩主体 → 斑驳 → 边界描边 → 干笔边缘 → 河流三层 → 城市/地点 → 地名 → 年份水印 → 图例 → 事件点/虚线/箭头 → 泡泡（阴影/纸面/描边/竖条/文字）→ 顶栏 → 时间轴 → 滑块/刻度。

---

## 六、非功能需求

| 类别 | 需求 |
|---|---|
| 性能 | P20 基准 55fps+（自动播放全功能）；渲染器每 5s 输出 FPS 日志；水彩/山水 CPU 生成放 IO 线程不阻塞主线程；纹理 LRU + 交叉淡入；标签/泡泡布局按相机状态缓存重算 |
| 离线 | **完全离线**：无任何网络依赖（时空库详情除外——若启用需保持 503 静默降级） |
| 兼容 | minSdk 24；EMUI10 特性规避（系统栏黑带/闪现/TRANSLUCENT 窗口，见 FR-13）；GLSurfaceView GLES2 |
| 稳定性 | 竞态防护：朝代切换代际作废、时期加载去重收敛、纹理回收不泄漏（LRU 淘汰/pending 覆盖/GL 线程删除队列）；资产缺失静默降级不崩溃 |
| 构建 | Gradle 8.9 + AGP 8.7.3 + Kotlin 2.0.21 + Compose BOM 2024.12.01 + KSP；离线可构建（依赖与本地缓存匹配）；`local.properties` sdk.dir 必须正斜杠 |
| 数据质量 | data:check / data:temporal:check / check:tokens 三道校验闸门保留 |
| 质量基线 | 11 张 acceptance 截图（scripts/capture-acceptance.mjs，adb 驱动真机自动化截图 + 像素扫描定位），重构后作为回归基线（截图清单见 §七） |

---

## 七、验收标准

验收基线 = `docs/design_optimize/acceptance/`（11 张真机截图，现全部通过，重构后逐张比对）：

1. `main.png` 主界面默认（宋：地图 + 顶栏 + 折叠图例 + 时间轴）
2. `legend-expanded.png` 图例展开（朱砂小笺 + 纸面卡片 + 水彩色条）
3. `bubble.png` 事件泡泡（标题 + 年份 + 摘要纸笺）
4. `timeline-playing.png` 播放中（42px 年份 / 轨道 / 滑块 / 五分类图例）
5. `timeline-complete.png` 播放完毕横幅（1279）
6. `detail.png` 详情抽屉（徽章 + 标题 + 正文 + 影响 + 相关）
7. `event-log.png` 事件流（搜索 + 列表 + 「当前 N 年 · 已出现 N 个」）
8. `settings.png` 设置（分类 / 速度 / 显示）
9. `era-banner.png` 时期转场横幅（跨 1126→1127）
10. `landscape.png` 横屏 2244×1080
11. `background-resume.png` 后台恢复（HOME → 重进，地图/泡泡/时间轴完整）

行为回归口径（android-mobile-optimization-plan 验收清单）：触摸目标 ≥44px；首屏可交互 ≤3s、朝代切换 ≤1.5s、时期切换 ≤1s；自动播放无卡顿；返回键分层正确；播放完毕提示 + 重播；点泡泡暂停、关详情保持暂停；事件流「已出现 N/总数」「回到当前」；设置开关与实际显示一致。

截图自动化踩坑（回归脚本须继承）：像素扫描定位取代固定坐标；轨道设年份用拖拽且明显越过目标（tap 会吸附事件点）；横屏先关加速度旋转再设 user_rotation；detail 从事件流首条动态进入。

已知可接受偏差：P20 顶部 cutout 黑带（硬件特性）；水彩偏淡为设计本意；边缘政权竖屏出屏为固有裁剪。

---

## 八、重构范围清单

**保留并延续**：
- `android/` 全部（作为重构起点或参照基线）；
- `server/data/`（schema.sql、schema-temporal.sql、seed/、geo/）+ `scripts/` 数据管线与校验（data:*、check:tokens、capture-acceptance、prepare-android.mjs——裁剪 web 通道）；
- `docs/design_optimize/design-tokens.json`（唯一设计真相源）与 acceptance 基线。

**退役**：
- `client/`（three.js Web 前端及其测试）、`server/index.js` + `server/routes/`（Express 运行时；overlay 合并的唯一实现已回到服务端 overlay-merge.js，Android OverlayMerge 为复刻方，双端由 golden 契约守护）、Playwright e2e、WebView 壳资产（assets/web/）与 ApiBridge.kt（✅ 后两者已于 2026-08-21 A1 删除）、`docs/technical/design/implementation-plan.md` 与 roadmap 中 Web 专属条目；
- 根 package.json 的 dev/dev:client/build/lint(client)/test(vitest) 脚本——数据管线脚本保留。

**迁移决策表（Web 有 / Android 无）**：

| 功能 | 建议 |
|---|---|
| 府州详情面板（FR-11.2） | **P1 迁移**（docs 已规划「Web 验证后移植」，数据已在 assets） |
| 时空库详情增强（FR-11.3） | 待 Q1 决策（离线导出 vs 网络层 vs 暂缓） |
| 事件流未读徽标 | P1 补齐（纯 UI） |
| 时期横幅「前→后」文案 | P2（纯 UI） |
| 详情打开相机聚焦/让位 | P2 增强（需与移动端抽屉布局协调） |
| 深链接分享 URL / 设置导入导出 | 随 Web 退役放弃，列 backlog |
| 现代底图对比层 | 可选（需求降级，需另做 GL 线层） |
| 分图层独立显隐（城市/地点/州府/县治…） | 裁剪为 疆域/山水 两项或按需扩展 |
| 自动播放开关设置 | 可选 P2 |

---

## 九、开放问题（重构前需拍板）

- **Q1 时空库消费方式**：PostgreSQL 时空库在 Android-only 架构下的出口——(a) 管线导出静态 JSON 进 assets（离线，推荐起步）；(b) 保留轻量 HTTP 服务（违背全离线原则）；(c) 暂缓。影响 FR-11.3。
- **Q2 Room seed 升级机制**：现「首次建库重放」导致 seed 更新需卸载重装；重构建议改为 seed 指纹版本化自动重放。
- **Q3 仓库形态**：退役后是否把 android/ 提升为仓库根（保留 scripts/ + server/data/ 数据区），还是维持现目录仅删除 client/server 运行时。
- **Q4 渲染器演进**：docs 记录长期动机是「向游戏引擎演进的渲染底座（场景图→绘制队列→后处理），未来做地图游戏」——重构是否顺带重排渲染层内部结构，或保持现状仅做工程收敛。
- **Q5 多朝代州府数据**：州府级（元丰九域志）与时空库目前仅宋；辽金元唐复用管线需换古籍源（辽史/金史/旧唐书地理志），是否纳入重构范围。

---

## 附：现有模块与文件对照（重构资产索引）

| 现文件 | 职责 | 重构处置 |
|---|---|---|
| android/…/MainActivity.kt | 入口 + 沉浸式系统栏 | 保留参照 |
| MapScreen.kt | 主界面装配（状态/加载/手势/顶栏/图例/横幅/抽屉编排） | 保留参照（可拆 ViewModel） |
| MapRenderer.kt | GLES2 渲染器（图层/相机/纹理/交叉淡入/FPS） | 保留 |
| Projection.kt | d3-geo Mercator fitSize Kotlin 版 | 保留（坐标兼容红线） |
| WatercolorTexture.kt / TerrainTexture.kt | 水彩/山山水 CPU 纹理生成 | 保留 |
| OverlayParser.kt / OverlayLoader.kt | overlay 契约解析与本地合并 | 保留（数据层核心） |
| MapRepository.kt / HistoryDb.kt | Room + seed 重放 | 保留（升级见 Q2） |
| TimelineController.kt / TimelineBar.kt | 时间轴状态源 + UI | 保留 |
| EventBubblesLayer.kt / Collisions.kt / LabelPlacement.kt | 泡泡/碰撞/标签纯函数与绘制 | 保留（补单测） |
| EventLogSheet.kt / SettingsSheet.kt / SettingsStore.kt / AppBottomSheet.kt / UiPrimitives.kt | 抽屉 UI 与设置持久化 | 保留 |
| MapVisualTokens.kt / DesignMetrics.kt / Fonts.kt | token 单源/尺寸换算/字体 | 保留（check:tokens 闭环） |
| ApiBridge.kt + assets/web/ | WebView 遗产 | 删除（✅ 已完成，2026-08-21 A1，见 docs/architecture/codebase-review-plan.md）|
| client/src/* | Web 前端（府州详情/深链接/设置导入等功能参考） | 退役，功能按 §八 决策表迁移 |
| server/routes/overlay.js · meta.js · places.js · db.js | API 契约定义（OverlayLoader 的语义源头）+ 时空库查询 | 运行时退役；places 查询逻辑随 Q1 决策保留或转导出脚本 |
| scripts/prepare-android.mjs · data:* · check:* · capture-acceptance.mjs | 数据同步/管线/校验/截图 | 保留（prepare 裁剪 web 通道） |
