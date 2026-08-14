# Android 视觉验收资料（P4）

> 依据 `docs/android-visual-polish-ai-pipeline.md` 第二阶段 P4 建立。
> 设计目标：`docs/design_optimize/design-tokens.json`（唯一设计输入）+ `history_map_android_prototype.html` + `prompt_1/4/5.png`。

## 测试环境

| 项 | 值 |
|---|---|
| 设备 | 华为 P20（EML-AL00，刘海屏） |
| Android | 10（API 29，EMUI 10） |
| 屏幕 | 1080 × 2244 px @ 480dpi（与设计画布 1:1） |
| APK | `android/app/build/outputs/apk/debug/app-debug.apk`（debug，约 10.8 MB） |
| 截图时间 | 2026-08-13 |
| 数据 | assets 本地同步（`node scripts/prepare-android.mjs`） |

## 截图清单

> R3 起使用 `node scripts/capture-acceptance.mjs` 一键自动化截图（adb 驱动真机，
> 含动态定位轨道/播放按钮/事件流首条，输出到 `artifacts/acceptance/`）。

| 文件 | 状态 | 说明 |
|---|---|---|
| `main.png` | ✅ R3 | 主界面默认（朝代=宋，地图 + 顶栏 + 图例 + 时间轴） |
| `legend-expanded.png` | ✅ R3 | 图例展开（朱砂「政权」小笺 + 纸面卡片，水彩短色条） |
| `bubble.png` | ✅ R3 | 事件泡泡（标题 + 年份 + 摘要纸笺，年份约 1130） |
| `timeline-playing.png` | ✅ R3 | 时间轴播放中（42px 年份、轨道、滑块、五分类图例） |
| `timeline-complete.png` | ✅ R3 | 播放完成（「本朝历史播放完毕」小横幅，年份 1279） |
| `detail.png` | ✅ R3 | 详情抽屉（事件流首条进入；徽章 + 标题 + 正文 + 影响 + 相关） |
| `event-log.png` | ✅ R3 | 事件流（搜索 + 列表 + 「当前 N 年 · 已出现 N 个」） |
| `settings.png` | ✅ R3 | 设置面板（事件分类 / 播放速度 / 显示） |
| `era-banner.png` | ✅ R3 | 时期转场横幅（拖拽跨 1126→1127 边界，「南宋·绍兴和议」金边） |
| `landscape.png` | ✅ R3 | 横屏（2244×1080，强制关自动旋转后旋转） |
| `background-resume.png` | ✅ R3 | 后台恢复（HOME → 重进，地图/泡泡/时间轴完整） |

### R3 截图自动化要点（踩坑记录）

1. **固定坐标不可靠**：P20 沉浸模式导航栏显隐不稳定，时间轴 y 会在 ~1880 与
   ~1570 之间漂移。脚本用像素扫描定位轨道（朱砂进度线最宽水平带）与播放按钮。
2. **轨道 tap 会吸附事件点开详情**：`TimelineBar` 轨道 tap 在 24dp 内命中事件
   刻度点时执行 `onEventClick`（打开详情）。固定年份 tap 易落在事件点附近误开详情，
   因此设置年份统一改用**拖拽**（dragging 路径不吸附）。
3. **拖拽末位 MOVE 可能低于目标**：`input swipe` 最后一个 MOVE 事件落在目标
   x 前，UP 不触发 setYear → 年份可能停在目标前一年。拖拽需**明显越过**目标
   （如跨时期边界拖到 1150，而非恰在 1127）。
4. **completed 仅播放路径置 true**：`TimelineController.completed` 只有自动播放
   自然到达 endYear 才置 true（`setYear` 会置 false）。完成态需「拖到 1278 →
   点播放 → 自然推进到 1279」。
5. **横屏需先关自动旋转**：`accelerometer_rotation=1` 会覆盖 `user_rotation`；
   必须先 `settings put system accelerometer_rotation 0` 再设 `user_rotation 1`，
   且应用运行中旋转（先启动再旋转）。
6. **detail 用事件流首条**：地图泡泡位置随年份变化，固定坐标易失配；改从事件流
   列表动态定位首条分类条点击（onPick 跳年 + 开详情），确定性强。

## 已知偏差 / 设备限制

1. **顶部黑色带状区域（0-85px）**：本机（P20/EMUI10）显示器 cutout inset=85px（顶部），
   该区域在显示层渲染为黑色，**系统桌面 launcher 同样如此**，属设备硬件/EMUI 特性，
   应用无法消除。已做的应用侧处理：宣纸 windowBackground + 宣纸状态栏颜色兜底、
   沉浸式标志（FULLSCREEN/HIDE_NAVIGATION/IMMERSIVE_STICKY）；内容保持在 cutout
   下方开始，顶栏标题完整可见。若需真正无黑边，需换无刘海机型验证。
2. **水彩政权色块偏淡**：按设计 token（watercolorBody 117 × fillOpacity 0.3-0.4
   ≈ 0.18 有效 alpha）渲染，偏淡是设计本意（与 Web 端一致）；P1-1 已将 alpha 下限
   从 0.3-0.4 提升到 0.72-0.75，色块可区分但整体仍属「低饱和水彩」风格。
3. **地图标签偏小**：P0-2 修复 density 二次放大后，标签为设计 13px（P20 上 1:1），
   较旧版（42px）明显收敛，个别标签可读性略降但符合设计 token。
4. **主政权标签缺失（辽/金等）**：默认相机居中取景中原，地图为横构图、屏幕为竖屏，
   边缘政权（辽/金/吐蕃/高丽）在默认缩放时位于屏幕外；平移/缩放后可看到（见
   `main.png` 中宋/西夏/大理/大越标签）。这是竖屏取景的固有裁剪，非数据缺失。

## 本轮（第二阶段）变更摘要

- P0-1 全屏：宣纸主题（windowBackground/statusBarColor/navigationBarColor）+
  沉浸式标志；设备 cutout 黑带记录为已知限制。
- P0-2 标签 density：`labelTextPaints` 改用 `DesignMetrics.designToPx(设计px, scale)`，
  不再乘 density（13px 设计字号不再变 39px）。
- P0-3 token 单一来源：`docs/design-tokens.json` 标记废弃；`check:tokens` 升级
  扫描渲染代码视觉魔法数（软告警）。
- P1-1 水彩层级：`MapParams.watercolorOpacity()` 提高 alpha 下限，保留主/次差异。
- P1-2 连续山水：`mountains.geojson` 补 14 条 LineString 山脊（太行/秦岭/昆仑/天山/
  大兴安岭等）+ 4 个孤立峰；`TerrainTexture` 渲染山体晕染 + 山脊 + 皴法短线；
  `geojson.js`/`OverlayLoader` 转换兼容 LineString 山脉（path + coord）。
- P1-3 renderer 参数全量 token 化（blur/斑驳/宽度/alpha/纹理尺寸上限）。
- P1-泡泡：普通=标题+年份+摘要（260×112 设计比例）、聚合=简称+N（紧凑 44px）、
  选中置顶、安全区回收（不进入顶栏/时间轴）。
- P1-顶栏：朝代按钮朱砂印章式；图例 y 坐标按设计比例 + 主要政权优先 + 水彩短色条。
- P2-字体：打包 Noto Serif SC 精简子集（OFL-1.1，1400+ CJK 字符，400/700 双字重，
  共约 1.3MB），`Fonts.kt` 一处接入 Compose + Canvas。
- P2-事件流：已出现 N/总数、回到当前、自动定位/手动滚动暂停、未出现事件灰显。
- P2-详情：相关事件（同分类按年份远近）、元信息 chip FlowRow 换行、布局扩展位。
- P2-返回键：统一 sheet 状态栈（详情→设置→事件流→菜单→退出）。
- P3-GL：纹理 CPU 生成放 `Dispatchers.IO`（loadDynasty/时期切换均含耗时日志）、
  mipmap 生成、旧纹理删除 + uniform/attribute 缓存（上轮已做）。

## R3 视觉调优（2026-08-13，基于 P20 逐轮像素采样）

上轮评审问题：底纸偏灰褐、政权色块过淡且互不可分、河流山脉抢眼。本轮以
`scripts/analyze-image.mjs`（PNG 像素采样）+ `picture-reg` 视觉识别逐轮校准：

| 问题 | 根因 | 修复 |
|---|---|---|
| 底纸灰褐、暖黄不足 | `paper-texture.jpg` 偏冷灰（RGB≈225,219,204 vs 目标 230,216,181），shader 完全采用纹理；GLSurfaceView 无 sRGB 管理比 Compose 暗 ~12% | shader 暖纸色与纹理按 `PAPER_TEXTURE_STRENGTH=0.25` 混合 + 纹理暖化 `*vec3(1.02,1,0.92)` + 两个片元着色器统一 `GL_BRIGHTNESS=1.08`；暗角 0.38→0.28 起点外推 |
| 政权区整体过暗（内部 alpha 0.6-0.8） | **bloom 羽化层用 fill 模糊，覆盖内部后与 body 层 alpha 叠加**（105+74→~150）；mipmap 对透明黑背景渗色 | body 层改 `PorterDuff.SRC` 覆盖内部（恰为 body alpha）；`TEXTURE_MIPMAP=false` |
| 政权色相趋同、米褐滤镜 | 暖色罩 soft-light（alpha 110）把政权色统一推向米褐；tint 过度降饱和压暗 | 暖罩 110→40；tint 保留更多原色（s×0.98、明度贴近原色）；`watercolorOpacity` 下限 0.74→0.90 |
| 政权边界不清 | 边界/干边用政权 tint 色（浅） | 改设计墨色 `#3A3428`（boundary 0.478 / dryEdge 0.278），加粗至 3px/1.4px |
| 河流偏浓 | 蓝青河色在暖纸对比强；wash/body/spine 三层叠加 | 宽度减细 25-35%（170/360/1200 除数）；wash/body/spine alpha 乘 0.8/0.7/0.6 |
| 山脉笔触堆叠偏重 | 山脊 4-7px + halo 4× + 皴法 | 山脊 880→1000 除数、halo 2×、alpha ×0.72、皴法 1/3、glyph 减细 |

最终采样（P20，1080×2244）：底纸 (232,223,190) 接近设计 (230,216,181)；
政权色块出现色相分离（西夏黄褐 170 vs 辽灰蓝 150 等）；河流/山脉降到辅助层对比度。
完整对比图：`artifacts/acceptance/main.png`。

## 复现命令

```bash
npm run check:tokens        # 89 项 token 校验 + 魔法数软告警
npm run lint && npm run test && npm run build && npm run check:build
npm run contract && npm run contract:db-migration
cd android && ./gradlew testDebugUnitTest assembleDebug --offline
adb install -r app/build/outputs/apk/debug/app-debug.apk

# 11 状态自动化截图（需 P20 已连接 + 已安装最新 APK）
node scripts/capture-acceptance.mjs [--serial CLB0218A10005491] [--out artifacts/acceptance]
```
