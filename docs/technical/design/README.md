# 用生图 AI 重新设计界面与地图 —— 操作手册

本目录是「让专业生图 AI 帮 HistoryMap 做视觉升级」的完整素材包：
**现状截图** + **可直接粘贴的现状描述** + **设计提示词模板** + **AI 出图后的落地方法**。

---

## 一、给 AI 看的现状截图（共 8 张）

| 文件 | 状态 | 截图内容 |
|---|---|---|
| `shot-01-main.png` | 主界面 | 960 年北宋极盛时期全貌：宣纸底色、历史疆域叠加层、事件泡泡、底部时间轴 |
| `shot-02-detail.png` | 详情面板 | 点击「陈桥兵变」泡泡后：右侧滑入详情卡 + 地图聚焦 + 泡泡高亮 |
| `shot-03-settings.png` | 设置面板 | 顶栏下拉设置：分类开关（朱砂/紫檀/赭石/竹绿/黛蓝色点）、速度、底图开关 |
| `shot-04-eventlog.png` | 事件流抽屉 | 右侧事件流：随播放实时累积的条目列表（年份 + 事件名） |
| `shot-05-era-banner.png` | 朝代转场 | 跨过 1127 靖康之变时：全屏压暗 + 朱砂横幅「北宋极盛 → 南宋·绍兴和议」 |
| `shot-06-nansong-1127.png` | 南宋疆域 | 1127 年南宋时期：宋金对峙的新疆域轮廓 + 详情面板 |
| `shot-07-main-nansong.png` | 主界面（南宋） | 南宋疆域 + 事件泡泡 + 图例（左下）的干净主视图 |
| `shot-08-playing.png` | 播放中 | 自动播放推进中：年份水印、时间轴进度条、泡泡出现动画 |

> 用法：把全部 8 张图直接拖进生图 AI（Midjourney / DALL·E / 即梦 / 可灵 / Stable Diffusion 均可）。
> 支持「图生图 / 参考图」的工具（即梦、MJ `--cref`、SD img2img）效果最好；
> 纯文生图工具则把下面「第二节」的描述一并粘贴。

---

## 二、现状描述（可直接粘贴给生图 AI）

### 中文版

```
这是一个中国宋代（960–1279）历史地图互动应用，Web 3D 渲染（three.js）。
当前视觉主题：古典水墨·宣纸风格。
- 底色：米白宣纸 #f2ecdc，带极淡的纤维/水渍径向渐变；
- 主色：墨色 #2e2a24，点缀色为朱砂红 #b03a2e（印章、年份、进度条起点）；
- 字体：标题与年份用衬线宋体/楷体，正文用无衬线；
- 顶栏：左侧「历史地图」标题 + 朱砂印章「宋」，右侧「事件」「设置」按钮；
- 地图：现代中国省界为米色薄板 extruded 3D 地形（默认隐藏），其上叠加半透明历史疆域
  叠加层（各政权不同古色：宋朱砂、辽黛蓝、西夏赭金、吐蕃土褐、大理竹绿等），
  边界用墨色虚线，政权名用衬线小标签直接贴在图上；
- 事件：地图上以「笺条」样式泡泡标注（米白底 + 墨字 + 分类色左竖线），
  点击后相机平滑飞向事件位置，右侧滑出详情卡片；
- 右下角有超大透明年份水印（如「1127年」）；
- 底部中央悬浮时间轴控制条：播放/暂停按钮 + 朱砂→赭金渐变进度条 + 事件刻度点 + 年份刻度；
- 左侧下图例：各政权色块对照；
- 朝代更替时有全屏转场横幅（压暗 + 朱砂色条幅）。
```

### English version（给不懂中文的 AI）

```
A Chinese history map web app for the Song Dynasty (960–1279), rendered in 3D (three.js).
Current visual theme: classical Chinese ink-wash painting on rice paper.
- Background: off-white rice paper #f2ecdc with faint fiber/water-stain radial gradients;
- Colors: ink black #2e2a24 primary, cinnabar red #b03a2e accent (seal, year, progress);
- Typography: serif (Song/Kai style) for titles and years, sans-serif for body;
- Top bar: "历史地图" title + a cinnabar red seal stamp "宋", buttons "事件" (events) and "设置" (settings);
- Map: modern China provinces as beige extruded 3D plates (hidden by default), overlaid with
  semi-transparent historical regime polygons (Song red, Liao blue, Xixia gold, Tubo brown, Dali green…)
  with dashed ink borders and serif regime labels directly on the map;
- Events: paper-slip style bubbles (cream background, ink text, colored left border by category),
  clicking flies the camera to the location and slides in a detail card on the right;
- Huge semi-transparent year watermark at bottom-right corner;
- Floating timeline control bar at bottom-center: play/pause button, cinnabar-to-gold progress bar,
  event tick markers, year ticks;
- Legend at bottom-left showing regime color swatches;
- Fullscreen era-transition banner when the year crosses a dynasty boundary.
```

---

## 三、设计提示词模板（复制后按需修改）

通用骨架（把 `【目标】` 替换即可）：

```
Redesign the UI of a Song-Dynasty Chinese historical map app. 【目标】。
Keep the classical ink-wash / rice-paper aesthetic but make it more refined and cinematic.
Provide: color palette (hex values), UI layout, map rendering style, typography suggestions.
Output as UI mockup / moodboard, 16:9 desktop, WebGL map in the center.
```

### A. 整体视觉方向探索（最推荐先做这张）

```
Chinese Song-dynasty interactive history map, dark-elegant ink-wash style upgrade.
Ultra-refined UI mockup, 16:9 desktop web app. Center: an aged paper map of China with
translucent colored historical territories (Song red, Liao blue, Jin gold), thin ink brush
coastlines, subtle mist and mountain texture in the background. Top: minimal top bar with
a vermillion seal logo. Bottom-center: floating glass-timeline bar with a gold progress line.
Right-bottom: giant translucent serif year watermark. Events as small paper-slip tags with
colored left borders. Color palette: aged parchment, ink black, cinnabar, antique gold,
jade green, muted indigo. Cinematic soft lighting, no harsh UI, no english text except numerals.
```

### B. 地图渲染风格（用于决定疆域层/底图的材质与光效）

```
Chinese historical map territory rendering styles, 3D map with subtle depth:
regime regions as translucent colored washes (traditional Chinese pigments: vermillion,
mineral blue, ochre gold) with ink-brush dashed borders and fine mountain hachures;
modern provinces faintly visible beneath; soft directional lighting, paper texture relief.
Show 4 style variations side by side: (1) flat ink-wash, (2) embossed paper relief,
(3) night amber lamp-light, (4) jade-and-gold court style.
```

### C. 事件泡泡 / 标签系统

```
Chinese history map event labels: small elegant tags shaped like vintage paper slips
(笺条), cream background, ink text, 3px colored left border in five traditional colors
(vermillion/purple/ochre/jade-green/indigo), subtle shadow, hover state slightly larger
with tinted fill. Show a grid of these tag designs with different sizes and states
(normal / hover / selected / dimmed).
```

### D. 时间轴控制条

```
Chinese history map bottom timeline control bar design: floating rounded translucent
parchment bar, a play/pause button styled like a vintage ink brush stamp, a progress
track with cinnabar-to-antique-gold gradient, small event dot markers with category
colors, year ticks in serif numerals. Minimal, elegant, unobtrusive.
```

---

## 四、AI 出图后，怎么用到项目里（关键）

### 4.1 最重要的一条：AI 图是「视觉参考」，不是「素材」

AI 生成的是位图。直接当 UI 皮肤（整张图铺背景/按钮图）会糊、会拉伸、没法响应式。
**正确流程**：AI 出图 → 你/我把图里的设计语言翻译成代码里可调的**参数**：

| AI 图里的设计点 | 落地到项目的位置 |
|---|---|
| 配色 / 色板 | `client/src/theme.js` 的 `ink` 对象（所有 token 集中在这，一处改全站生效）|
| 背景纸质感（云纹/水渍） | `client/src/styles.css` 的 `body` 渐变 + 可加 `canvas` 纹理 |
| 疆域颜色 / 透明度 | `server/data/geo/historical/regimes-*.json` 的 `color/fillOpacity` |
| 泡泡样式 | `client/src/styles.css` 的 `.bubble-inner` 系列 |
| 时间轴样式 | `client/src/styles.css` 的 `#timeline` 系列 |
| 字体 | `styles.css` 的 `--font-serif/--font-sans`（本地字体栈，不引 webfont）|
| 印章/图标（播放、设置等） | `client/public/favicon.svg` 或新画 SVG 图标 |
| 3D 材质（纸面凹凸/光照） | `client/src/map/ChinaMap.js` 的材质参数 + `main.js` 光照 |

**落地示例**（假设 AI 给了一套「黛青 + 鎏金」新色板）：

```js
// theme.js —— 只改 token，不用动任何组件代码
const ink = {
  bg: '#1d2226',          // 深黛底色（夜间·鎏金风格）
  text: '#e8e2d2',
  accent: '#c9a227',      // 鎏金
  mapProvince: 0x2a3138,
  ...
};
```

### 4.2 可以真正当「素材」用的三种情况

1. **宣纸/云纹背景贴图**：让 AI 生成一张 2048×2048 无缝宣纸纹理 → 存到
   `client/public/textures/paper.jpg` → `main.js` 里 `scene.background` 换成
   `THREE.TextureLoader` 加载的纹理（或 CSS `body` 背景图）。注意保持底色与 CSS 变量一致，
   且纹理要淡（叠加半透明疆域后不能花）。
2. **印章/装饰 SVG 化**：AI 出的印章、回纹边框 → 用 AI 工具转 SVG 或手描 → 存
   `client/public/` 当图标/边框用（矢量，不会糊）。
3. **色卡提取**：AI 图直接喂给取色工具（或让 AI 自己给 hex），拿到的色值填进
   `theme.js` / `regimes-*.json`。

### 4.3 不建议做的

- ❌ 整屏 AI 图当背景 + 半透明控件叠上去 —— WebGL 场景上叠位图背景层级乱、文字可读性差；
- ❌ AI 图直接当按钮/图标位图 —— 放大糊、颜色对不上主题变量；
- ❌ 让 AI 生成「精确的中国地图」—— 地理轮廓 AI 画不准，地图轮廓必须用
  `server/data/geo/` 里的 GeoJSON 数据，AI 只定「风格」。

### 4.4 落地检查清单

- [ ] 换完色板后，开「现代底图」和「历史疆域」各看一眼，半透明叠加不糊成一片；
- [ ] 事件泡泡文字在深色/浅色底上都可读（注意 `--bubbleText` 与 `--bubble` 一起换）；
- [ ] 时间轴渐变两端对比度够（`--timelineProgressStart/End`）；
- [ ] 截图对比：把新截图放回 `docs/design_optimize/`，和旧图并排检查是否符合 AI 方案。

---

## 五、当前视觉参数速查（改设计时对照）

| Token | 值 | 含义 |
|---|---|---|
| `--bg` | `#f2ecdc` | 宣纸底色 |
| `--accent` | `#b03a2e` | 朱砂点缀（印章/年份/进度条）|
| `--timelineProgressEnd` | `#d49a2a` | 进度条渐变终点（赭金）|
| `mapProvince` | `0xe6dfc8` | 现代底图省份色 |
| `mapEdge` | `0x8a8272` | 省份边界线 |
| 事件分类色 | `#b03a2e` 朱砂 / `#6e5a7e` 紫檀 / `#a0622d` 赭石 / `#5f7d4f` 竹绿 / `#46647f` 黛蓝 | `.cat-*` 类 |
| 疆域填充 | 宋 `#b03a2e` / 辽 `#4a6a8a` / 西夏 `#b08d4f` / 吐蕃 `#8a6a4a` / 大理 `#6a8a5f` | `regimes-*.json`，opacity 0.3–0.38 |
