# Android 原生重构方案（Kotlin + Compose，弃用 WebView）

> 状态：**已落地**（2026-08 由 WebView 壳重构为 GLES 自研 + Kotlin 投影 + Compose UI，Web 桌面版保留）。M1–M6 里程碑全部完成，P20 实测 55–59fps；见 `AGENTS.md`「Android 原生版」章节与 `docs/texture-bake-plan.md` M1/M2 视觉调优记录。
>
> 目标：Android 端从「WebView + three.js + JS bridge」改为 Kotlin 原生实现。
> 动机：P20 等低端机上 WebView 链路（JS 解释 + WebGL 桥接 + CSS2D 每帧 DOM 布局）性能差；
> 且用户未来可能在现有地图基础上做游戏，需要效果更好、更贴近效果图的渲染底座。
>
> 约束：**保留 Web 版**（桌面端 three.js 不动）；Room schema / GeoJSON 数据契约 / periods.json 全部复用；
> 数据来源仍为 server/data（seed SQL + geo JSON），构建期打包进 assets。

## 〇、定案结论（2026-08-10 确认）

| 决策项 | 结论 |
|---|---|
| 渲染层 | **GLSurfaceView + 自研 GLES2 渲染器**（效果优先，架构向游戏引擎演进） |
| 投影 | **Kotlin 重写**（d3-geo geoMercator + fitSize 公式翻译，与 Web 版同源） |
| UI 层 | **Compose**（时间轴/事件流/详情/设置/图例/泡泡/指向线） |
| Web 版 | **保留**（桌面端 three.js 不动，数据契约两端共用） |
| 数据层 | 复用 HistoryDb.kt（Room）+ OverlayLoader.kt（assets GeoJSON）+ seed SQL |

## 一、现状瓶颈分析（为什么性能差）

当前 Android 端 = WebView 跑整套 three.js 前端，数据走 `window.AndroidAPI` bridge。慢的根源不在 WebGL 本身，而在整条链路：

```
JS 源码 → 解析执行（JS 引擎） → WebGL 调用（桥接开销）
                                   ├─ CSS2D 标签：每帧 DOM 布局 + 合成
                                   ├─ 碰撞推挤：读 getBoundingClientRect（强制同步重排）
                                   └─ 与原生数据层：JSON.stringify/parse 序列化
```

- 麒麟 970（Mali-G72）跑这套链路，自动播放 + 碰撞重排 + 标签合成容易掉帧。
- 画面本身其实极简单：**10 个政权多边形 + 4 城市 + 19 地点 + 30 事件泡泡 + 一张水彩纹理**——没有任何真 3D 内容，是典型的 2D 平面可视化。

## 二、渲染引擎选型（效果优先）

| 方案 | 性能(P20) | 效果图还原度 | 未来游戏扩展 | 开发成本 | 结论 |
|---|---|---|---|---|---|
| **GLSurfaceView + 自研 GLES2 渲染器** | ★★★★★ | ★★★★★ 水彩/纸张/光效全部走 shader，最贴近效果图 | ★★★★☆ 渲染器架构天然是游戏引擎雏形（场景图→绘制队列→后处理） | ★★★☆☆ 只渲染地图层，UI/文本交给 Compose | **主推** |
| Filament（Google PBR 引擎） | ★★★★★ Vulkan/GLES3 | ★★★★★ 材质/后处理/光影最强 | ★★★★★ 3D 平滑演进 | ★★☆☆☆ 学习曲线陡，API 比 three.js 低层 | 备选（若确定要做 3D 游戏） |
| SurfaceView + Canvas（Skia） | ★★★★★ | ★★★★☆ 位图预渲染可达 90%，但动态光效/程序化水彩弱 | ★★★☆☆ 2D 游戏可行，3D 无路 | ★★★★★ 最快 | 快速落地备选 |
| 纯 Compose Canvas | ★★★★☆ 大画布重绘开销高 | ★★★★☆ | ★★★☆☆ | ★★★★★ | 不推荐（动画期间掉帧风险） |
| MapLibre GL Native | ★★★★★ | ★★★☆☆ 现代地图范式，手绘风定制成本极高 | ★★★☆☆ | ★★★☆☆ | 不推荐（定位不符） |

**推荐：GLSurfaceView + 自研 GLES2 渲染器，UI 层 Compose。**

理由：
1. **效果图还原度最高**——水墨晕染、纸张纤维、暗角光晕用 fragment shader 程序化实现，还能做「疆域晕开」等动画；Skia 位图预渲染只能静态逼近。
2. **文本/UI 不与渲染引擎绑定**——政权/城市/事件标签放在 Compose 层（屏幕空间定位，等价于现有 CSS2D 思路），中文渲染用系统文本管线，质量最高；渲染层只画几何与水彩，职责干净。
3. **为游戏铺路**——渲染器按「场景图 + 绘制队列 + 相机 + 后处理」组织，未来加 3D 网格、灯光、粒子是往同架构里加东西；P20 的 Mali-G72 支持 GLES2/3 和 Vulkan 1.0，GLES2 起步无兼容风险。
4. **风险可控**——渲染层对外只暴露 `MapRenderer` 接口（`setTerritory(geojson)` / `setCamera()` / `render()`），若日后确定 3D 游戏方向，可整体替换为 Filament 而不动 UI 层和数据层。

## 三、目标架构

```
┌─────────────────────────────────────────────────┐
│ Compose UI 层                                   │
│  顶栏(朝代) · 时间轴(播放/拖动/刻度) · 事件流抽屉 │
│  详情面板 · 设置面板 · 图例(折叠) · 播放完毕提示  │
│  事件泡泡 + 指向线（Compose Canvas，屏幕空间）   │
│  触摸手势 → 相机控制（单指平移/双指缩放）        │
├─────────────────────────────────────────────────┤
│ 渲染层 MapRenderer（GLSurfaceView 子类）          │
│  ├─ 场景图：政权多边形 Mesh（VBO 一次上传）       │
│  ├─ 水彩 shader：噪声扰动 + 羽化边缘 + 透明晕染   │
│  ├─ 河流/山脉线：GL_LINE_STRIP                   │
│  ├─ 宣纸底 + 暗角：全屏纹理 + 径向渐变           │
│  └─ 后处理：颗粒噪声叠加（离屏 FBO）             │
├─────────────────────────────────────────────────┤
│ 数据层（复用现有契约）                           │
│  Room：dynasties / events（对齐 server/schema.sql │
│  assets：geo JSON（regimes-*/cities/places/…）   │
│  投影：GeoJSON lng/lat → 世界坐标（d3 geo 等价）  │
└─────────────────────────────────────────────────┘
```

### 分层职责（对齐现有 Web 版架构边界）

| Web 版 | 原生版 | 说明 |
|---|---|---|
| `main.js` 装配 | `MainActivity` + `MapViewModel` | 状态唯一来源：当前年份/朝代/播放状态 |
| `Timeline.js` | `TimelineViewModel` + Compose 组件 | 「当前年份」唯一状态源，Compose 侧 Flow 订阅 |
| `EventBubbles.js` + `collisions.js` | `BubbleLayout`（纯 Kotlin 算法） | 碰撞推挤/折叠/+N/出屏回收，**纯函数直接翻译** |
| `TerritoryOverlay.js` 水彩 canvas | GLES 水彩 shader | 多边形 → 世界坐标 → Mesh |
| `api.js` + bridge | Room + assets 直接读 | 去掉序列化链路 |
| `Legend.js` | Compose 图例组件 | 折叠/展开/政权高亮联动 |
| `styles.css` 主题 | Compose Theme（水墨色板 + 衬线字体） | 色板/字号/圆角一一对应 |

### 关键设计点

1. **投影**：现有 `project([lng,lat])` 是 d3-geo 的等距方位/拟合投影。原生端把 GeoJSON 一次编译成世界坐标数组（构建期或首帧），`d3-geo` 的 `geoAzimuthalEqualArea`/`geoMercator` 投影算法是公开公式，纯 Kotlin 实现约 200 行；也可直接复用服务器端已算好的投影结果（若后续服务端输出预投影坐标则彻底免计算）。
2. **水彩效果（效果图核心）**：fragment shader 方案——
   - 每个政权多边形 = 一个 Mesh，uniform 传入政权色；shader 内做 `fbm(noise)` 扰动 alpha，边缘羽化（基于到边界的距离，预计算顶点 UV 或贴图蒙版）；
   - 或「一图流」：所有政权一次绘制到离屏 FBO（类似现在 OffscreenCanvas 的思路），再叠加纸张颗粒，帧率更高（P20 上推荐此路线，一次合成 2 张纹理）。
3. **标签（Compose 层）**：事件泡泡 = Compose Canvas 绘制 + 屏幕空间定位（相机矩阵反向投影，等价 CSS2DObject）；政权/城市标签 = 普通 Compose Text，与泡泡统一走碰撞推挤。
4. **时间轴**：Compose 组件 + `TimelineViewModel`（handler/flow 驱动），自动播放用 `Choreographer`/协程延时推进年份；播放完毕/重新播放状态进 ViewModel。
5. **返回键**：Compose `BackHandler` 按「详情 → 设置 → 事件流 → 退出」优先级关闭，天然解决 WebView 时代的痛点。
6. **持久化**：设置从 localStorage 迁移到 `SharedPreferences`（字段结构不变）。

## 四、效果图还原清单（水墨·宣纸）

| 效果 | 实现 |
|---|---|
| 宣纸底色 + 纸张颗粒 | 静态纹理（构建期生成的噪声 PNG / 运行时噪声纹理）+ 叠加混合 |
| 疆域水彩晕染 | 超采样离屏渲染 + 高斯模糊 + 噪声 alpha 扰动（Skia 版）；或 shader fbm（GL 版） |
| 四边暗角 / 聚光 | 径向渐变 overlay（Compose 或 shader 均可） |
| 大年份水印 | Compose Text（衬线体、低透明度、超大字号） |
| 朱砂印章泡泡 / 指向线 | Compose Canvas 矢量绘制 |
| 朝代转场横幅 | Compose 动画（透明度/缩放） |
| 字体 | 系统 Noto Serif CJK（Android 10 自带） |

## 五、里程碑（建议顺序）

1. **M1 渲染底座**：GLSurfaceView + 最小渲染器（宣纸底 + 一个政权多边形 + 相机平移缩放）；投影 Kotlin 化。
2. **M2 数据层**：Room 复用现有 seed；assets 打包 GeoJSON；`MapRepository` 提供与 Web 契约一致的数据模型。
3. **M3 水彩效果**：离屏 FBO 水彩合成 + 颗粒 + 暗角，达到效果图观感。
4. **M4 UI 骨架**：Compose 顶栏 + 时间轴（播放/拖动/刻度/事件点）+ 图例。
5. **M5 事件系统**：泡泡 + 碰撞推挤（翻译 collisions.js）+ 指向线 + 详情面板 + 事件流抽屉 + 设置面板。
6. **M6 产品化**：返回键、横竖屏、安全区、播放完毕/重播、性能回归（帧率记录）。

## 六、里程碑进度

- [x] 选型定案（渲染层 GLES 自研 / 投影 Kotlin 重写 / UI Compose / Web 版保留）
- [x] **M1 渲染底座**：GLSurfaceView + 宣纸底/暗角 + 政权 stencil 填充 + 相机（平移/缩放）+ Projection.kt
- [x] **M2 数据层接通**：OverlayParser/MapRepository（Room + OverlayLoader）→ 渲染器；朝代下拉切换；政权/城市/地点标签层
- [x] **M3 水彩效果**：WatercolorBuilder 离屏生成（羽化/斑驳/边界/颗粒/暖罩）→ GL 纹理 quad；移除 stencil 填充
- [x] **M4 叙事闭环**：时间轴（播放/拖动/刻度吸附/播放完毕/重播）+ 事件泡泡（碰撞推挤/指向线/出屏回收）+ 详情面板 + 图例
- [x] **M5 时期切换 + 事件流**：跨年自动重载疆域（投影保持首次标定）；事件流抽屉（已出现列表/当前年摘要/搜索）
- [x] **M5b 设置面板**：分类过滤（泡泡+刻度点联动）/ 播放速度 / 图层显隐
- [x] **M6 产品化**：设置持久化（SharedPreferences）、返回键分层（sheet 优先）、FPS 统计（P20 实测 55-59fps）、沉浸式修复
- [x] **M7 收尾**：WebView 壳下线（Android 已是原生实现，无 WebView 依赖；Web 桌面版保留）、构建流水线就位（prepare-android.mjs 同步数据 → gradlew assembleDebug）、P20 完整回归截图（`docs/design_optimize/acceptance/`）、性能压测（FPS 55–59）
