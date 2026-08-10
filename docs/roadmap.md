# HistoryMap 未完成工作路线图

> 用途：记录当前未完成事项、实施顺序、验收标准与进度。
>
> 状态：`[ ]` 未开始　`[~]` 进行中　`[x]` 已完成　`[-]` 暂缓
>
> 最后更新：2026-08-10

## 当前状态摘要

- [x] 宋朝首期地图、时间轴、事件泡泡、详情面板
- [x] better-sqlite3 数据层迁移
- [x] 30 条宋朝事件、地点字段、figure/economy 分类
- [x] 朝代列表接口与顶栏下拉框架
- [x] 河流 8 条、山脉 14 个示意点、城市 14 个标注
- [x] 事件流搜索、碰撞避让、`+N` 折叠、指向线箭头
- [x] 移动端详情抽屉与设置全屏
- [x] ESLint、Vitest（44 个用例）、GitHub Actions CI
- [x] CI 已接入 npm 缓存、构建产物、GeoJSON/API contract、数据库迁移 contract、生产 smoke 检查与非阻塞 npm audit 报告
- [x] 辅助层已拆为独立 GeoJSON，保留兼容 fallback，并完成结构与坐标范围校验
- [x] 辅助层已支持独立 z 层级与河流/山脉/城市显隐开关
- [x] 全量事件搜索与 debounce
- [x] 增加第二个真实朝代数据，完成多朝代端到端验证（金朝）
- [x] 接入辽朝、元朝两个新朝代（含辽/元时期数据与疆域快照）
- [x] 地点要素（都城/战场/书院）与「地点」显隐开关，overlay 未知 kind 白名单修复
- [x] Playwright 桌面/移动 smoke 与朝代切换集成测试（8 用例全绿）
- [ ] 视觉回归截图基线（未实现：无截图基线比对机制）

---

## P0：质量闭环与当前阻塞项

### P0.1 CI 稳定性与发布检查

- [x] GitHub Actions 使用 Node 24
- [x] 根目录、client、server 三处依赖分别安装
- [x] CI 执行 lint、test、client build
- [x] npm 安装增加网络重试
- [ ] 连续多次 push/PR 验证 CI 稳定性（依赖外部 CI 多次运行历史，本工作区无法验证）
- [x] CI 输出 npm 缓存命中状态并检查构建产物
- [x] CI 执行 GeoJSON/API contract 与生产服务 smoke 检查
- [x] CI 报告根目录、client、server 的 high 级别 npm audit 结果（不阻塞已有漏洞）

**验收：** CI 连续 3 次成功；`npm run lint`、`npm run test`、`npm run build` 全绿。

### P0.2 生产构建与运行检查

- [x] 本地 Vite production build 通过
- [x] 本地 API health/events/overlay/dynasties 接口通过
- [x] 用生产构建静态服务实际打开页面
- [ ] 验证全新 clone 执行 `npm run install:all` 后可启动（需全新 clone 环境，无法在本工作区验证）
- [x] 检查 Windows 启动器在端口被占用、依赖缺失时的提示

**验收：** 全新目录可安装、启动、访问前端与后端 API。

---

## P1：历史地理辅助层（河流、山脉、城市）

### P1.1 独立 GeoJSON 数据结构

- [x] 新建 rivers、mountains、cities 独立 GeoJSON 数据文件
- [x] 将 `cities` 从 `periods.json` 独立为 GeoJSON
- [x] 保留当前数组结构作为兼容 fallback
- [x] 统一使用 `FeatureCollection / Feature / LineString / Point`
- [x] 每个要素增加 `id/name/kind/rank/style/source/confidence`
- [x] 增加 JSON 结构与坐标范围校验
- [ ] 补充真实历史数据来源、许可证与 attribution（当前为 periods.json legacy 示意数据，依赖真实历史数据源）

**验收：** overlay 返回的 `rivers/mountains/cities` 均可被统一 GeoJSON 解析器读取。

### P1.2 河流数据质量提升

- [x] 黄河、长江、淮河、辽河、珠江、钱塘江、松花江、闽江示意路径
- [ ] 校订主要河流路径，避免明显穿越错误区域
- [ ] 增加河流等级：主干/次干/支流
- [ ] 增加现代骨架与宋代历史校订说明
- [x] 补充数据来源、许可证与 attribution（要素已带 source/license/confidence/note，validateGeoJSON 强制校验）
- [ ] 评估黄河、淮河、钱塘江历史河道差异

**验收：** 主要河流连续、方向合理、不会压过政权色块和事件内容。

### P1.3 山脉数据质量提升

- [x] 14 个山系示意点与三峰符号
- [ ] 将山脉点位升级为 LineString 山脉走向
- [ ] 区分主山脉与次山脉样式
- [ ] 为关键山口/山峰增加可选符号
- [x] 标注数据来源与置信度（要素已带 source/confidence/note）

**验收：** 秦岭、太行、南岭、昆仑等山系具有连续走向，视觉上保持淡墨低对比。

### P1.4 城市按时期显示

- [x] 14 个城市标注
- [x] 给城市增加 `start/end` 或 `visiblePeriods`（实现为 `periods` 数组 + 服务端按时期过滤；`isVisibleAt` 兼容 `visiblePeriods`/`start`/`end`）
- [x] 东京开封府、临安等按历史时期显示/隐藏（960 开封、1127 后临安）
- [x] 都城与普通城市分级（rank 字段 + `data-rank` 接入；当前 4 城均为 rank 1）
- [x] 城市标签接入统一碰撞避让（作为固定障碍参与推挤）
- [x] 设置面板增加城市显示开关

**验收：** 960 年显示东京开封府；1127 年后显示临安；城市不遮挡政权名和事件泡泡。

### P1.5 辅助层渲染分层

- [x] 从 `buildWatercolorCanvas()` 拆出独立 auxiliary layer
- [x] 统一 z 层级：wash 7、river 7.1、mountain 7.15、regime 7.2、city 7.3、event 12
- [x] 河流/山脉/城市分别支持显隐
- [ ] 低端设备仅保留主河流与都城
- [ ] 按 `period + viewport + dpr` 缓存辅助纹理

**验收：** 切换时期或开关某层时不重建无关图层，地图帧率稳定。

---

## P1：多朝代数据与端到端切换

### P1.6 增加第二个真实朝代

- [x] 新增一个完整朝代 seed（金朝）
- [x] 包含 dynasties、事件、place、category、year_end
- [x] 准备该朝代历史疆域 GeoJSON
- [x] 配置该朝代 periods、labels、rivers、mountains、cities
- [x] 从顶栏下拉切入该朝代
- [x] 验证时间轴范围、事件流、详情、图例、overlay 全部重建
- [x] 验证朝代切换时播放状态、未读数和搜索状态处理

**验收：** 宋朝 ↔ 第二朝代双向切换至少 10 次无残留标签、旧事件、旧图层或异常年份。

### P1.7 朝代切换状态管理

- [x] `loadDynasty()` 统一装配入口
- [x] overlay、泡泡、图例、事件流清理/重建
- [x] 切换时取消上一朝代未完成的 fetch（AbortController）
- [x] 防止快速连续切换产生旧请求覆盖新状态（请求序号守卫）
- [x] 切换时保留或明确重置播放/分类/搜索设置（设置保留、搜索词清空、时间轴沿用）
- [x] 增加 loading、失败、空数据状态

---

## P2：事件体验完善

### P2.1 全量事件搜索

- [x] 事件流搜索输入框
- [x] 简称、标题、年份模糊匹配
- [x] 空结果提示
- [x] 搜索索引使用全部 API 事件，而不只是已经出现的事件
- [x] 搜索结果点击时自动跳转年份并打开详情
- [x] 朝代切换时清空搜索词
- [x] 搜索输入增加 100–200ms debounce

**验收：** 未播放到的事件也能被搜索并打开详情；搜索结果与当前朝代一致。

### P2.2 事件泡泡布局

- [x] 两泡泡碰撞避让
- [x] 政权标签作为不可移动障碍
- [x] `+N` 折叠与点击展开
- [x] 指向线、分类色、箭头
- [x] 相机拖动结束后 debounce 重排
- [ ] 折叠泡泡在真实大量事件数据下的边界测试
- [ ] 移动端优化泡泡最大宽度和可点击区域
- [ ] 城市标签加入同一碰撞系统

### P2.3 详情面板安全与可读性

- [x] 年份、分类、时期、地点、影响、相关事件
- [x] 桌面右侧面板与移动端底部抽屉
- [x] 对事件文本使用 `textContent`/DOM 安全构造，避免直接 `innerHTML` 注入（2026-08-10）
- [ ] 详情面板与时期转场横幅增加状态互斥
- [ ] 相关事件跨时期跳转回归测试
- [ ] 加 Escape、遮罩、返回按钮的自动化测试

---

## P2：移动端与可访问性

- [x] 详情面板底部抽屉
- [x] 设置面板全屏
- [x] 时间轴紧凑布局
- [ ] 事件流抽屉移动端布局与搜索键盘测试
- [ ] 图例移动端折叠/展开按钮
- [ ] 触摸拖动、缩放、时间轴拖动测试
- [ ] 朝代下拉在窄屏下不遮挡顶栏
- [ ] 详情/设置/事件流增加合理的 ARIA role、label、focus 管理
- [ ] 检查颜色对比度与键盘可达性

**验收：** 390×844 和 768×1024 两种视口下核心流程可完成。

---

## P3：渲染性能与可维护性

### P3.1 指向线性能

- [x] 指向线内容 key 缓存
- [x] 复用 SVG `line/polygon/circle` 节点，避免 `innerHTML` 重建
- [x] 仅在相机变化或布局变化时更新坐标
- [x] 事件数量 100/500/1000 的性能基准

### P3.2 水彩纹理性能

- [x] Canvas 按视口与 DPR 动态尺寸
- [x] 2048 尺寸上限
- [x] 低端设备跳过斑驳层
- [ ] 按时期与尺寸缓存 CanvasTexture
- [ ] 切换时期时取消/复用重复生成任务
- [ ] 记录地图初始化耗时与内存占用

### P3.3 构建与依赖

- [x] better-sqlite3 预编译安装
- [x] ESLint flat config
- [x] Vitest 单测与 benchmark（EventLog、Settings、build、contract 等）
- [x] GitHub Actions CI
- [x] three.js、详情模块、设置模块按需分包
- [ ] 处理 Vite chunk 体积警告（当前约 557KB）
- [ ] 增加依赖安全扫描与 lockfile 更新策略
- [ ] server 开发环境启用 `node --watch` 或 nodemon

---

## P4：测试体系

- [x] 碰撞纯函数测试
- [x] 时间轴换算纯函数测试
- [x] EventLog 搜索单测
- [x] SettingsMenu 持久化单测
- [x] overlay 数据解析与 GeoJSON contract
- [x] build contract 与数据库 migration contract
- [x] API 路由 smoke 检查
- [x] Playwright 桌面端 smoke test
- [x] Playwright 移动端 smoke test
- [x] 朝代切换集成测试（宋 ↔ 金双向）
- [ ] 视觉回归截图基线（未实现：无截图基线比对机制，仅失败时截图）

---

## P5：数据与产品扩展

- [x] 增加辽、元等更多朝代数据（辽 21 条、元 20 条事件；seed 迁移 v3/v4，e2e / smoke / contract 同步覆盖）
- [ ] 增加唐等更多朝代数据
- [ ] 增加真实历史河流/山脉 GeoJSON 数据源
- [ ] 记录每个地理要素的 source、license、confidence、note
- [x] 增加都城、战场、书院等地点类型（`places.geojson`：kind=capital/battlefield/academy，按时期过滤经 overlay `properties.places` 透传；设置面板新增「地点」开关 `showPlaces`）
- [x] 辽/元历史时期数据（`periods.json` 新增 `liao-1111`、`yuan-1279`、`yuan-1300`；新增 `regimes-1300.json` 元中后期疆域快照）
- [x] 修复 overlay 未知 kind 直接 500（`server/routes/overlay.js` 按 kind 白名单过滤，未知类型安全忽略；`geojson.js` 点位类 kind 统一挂 `coord`）
- [x] 增加事件搜索结果排序与高亮（相关度排序 + `<mark>` 高亮）
- [x] 增加事件详情分享链接/深链接（`?dynasty=&year=&event=` + history 路由）
- [x] 增加用户设置导入/导出（JSON 文本/文件/URL 参数三种载体）
- [x] 增加数据版本号与 seed 迁移机制，避免新增 seed 必须删库（schema_migrations + 幂等 seed）

---

## 建议下一步顺序

1. **P0.1/P0.2 质量闭环**：连续 CI、全新 clone 安装与构建检查
2. **P2/P4 组件、API、Playwright 集成测试与视觉回归**
3. **P1.2/P1.3/P1.4 辅助地理层历史数据质量、时期显示与城市碰撞**
4. **P3 性能收尾**：纹理缓存与构建产物体积治理
5. **P5 更多朝代、真实数据源与产品功能**

> 已完成的 CI contract/smoke/build 检查不替代尚未验证的 Playwright、视觉回归或更多真实朝代验收。

> 顺序更新时间：2026-08-10。P1.6 已完成，不再作为下一步事项；P2.3 事件文本安全处理已完成。
>
> 2026-08-10 依据代码审查与本地验证（lint / 44 单测 / Playwright 8 用例）勾选 P2.1、P1.4、P1.7、P4、P5 对应项；依赖真实数据源或外部 CI 历史的项保持未完成并注明原因。
>
> 2026-08-10 依据工作区代码核对勾选：辽/元朝代（seed 03/04、迁移 v3/v4）、辽/元时期（liao-1111、yuan-1279、yuan-1300、regimes-1300.json）、地点类型（places.geojson + showPlaces）与 overlay 未知 kind 白名单修复（overlay.js / geojson.js）。真实历史数据源、视觉回归基线、连续 CI 历史与全新 clone 验证仍保持未完成并注明原因。

每完成一项，更新本文件对应复选框，并在提交信息中引用路线图编号，例如：

```text
feat(P1.6): add Jin dynasty seed and end-to-end dynasty switching
fix(P2.1): search all events before timeline appearance
perf(P3.1): reuse leader SVG nodes
```
