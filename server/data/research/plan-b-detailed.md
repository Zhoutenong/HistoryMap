# 方案 B 细化方案 —— 绘制宋朝历史疆域地图

> 从调研到实施的完整技术路线

---

## 一、调研结论

### 公开 GIS 数据可用性

| 数据源 | 可用性 | 格式 | 说明 |
|---|---|---|---|
| **CHGIS（哈佛）** | ✅ 可下载 | Shapefile | 需注册，含中国历代行政区划数据，含宋时期 |
| **Natural Earth** | ❌ 不含 | — | 只有现代数据 |
| **GitHub 开源项目** | ⚠️ 有限 | GeoJSON | 有零散项目但质量不一 |
| **历史地图数字化** | 需自行制作 | 多边形 | 基于谭其骧《中国历史地图集》或 Wikipedia map 矢量化 |

**结论**：CHGIS 最权威但需要下载 shapefile 再转换，且边界精度不一定优于我们自行制作。**最实用的方案是：利用现有 china.json 现代省份边界 + 手工调整边界线**。

### 现有资源

- ✅ `china.json` — 35 个省级行政区划的 WGS84 GeoJSON，25,240 个坐标点
- ✅ 详细的边界调研数据（关键关口、河流、山脉坐标）
- ✅ Python 3.14（仅 stdlib，无 shapely/geopandas）

---

## 二、技术方案总览

### 核心思路

```
现代省界多边形（china.json） → 筛选 → 裁剪 → 合并 → 宋朝历史边界
```

![流程图]
```
china.json (35省)
      ↓
省份隶属表（哪个省属宋/辽/夏/金）
      ↓
  ┌────┴────┐
  │ 全境纳入  │  裁剪部分  │
  │ (内核省)  │ (边界省)  │
  └────┬────┘
       ↓
  多边形合并 → Song/Liao/Xia/Jin/Dali GeoJSON
```

### 文件结构

```
server/data/geo/
├── china.json                    # 现代底图（已有）
├── README.md                     # 本目录说明
│
├── historical/                   # ★ 历史边界目录（新建）
│   ├── periods.json              # 时期索引（一键切换）
│   ├── README.md                 # 数据来源与使用说明
│   │
│   ├── northern-song-1111.json   # 北宋极盛期边界
│   ├── liao-1111.json            # 辽同期边界
│   ├── western-xia-1111.json     # 西夏同期边界
│   │
│   ├── southern-song-1142.json   # 南宋绍兴和议后边界
│   ├── jin-1142.json             # 金同期边界
│   ├── western-xia-1142.json     # 西夏同期（与1111相近）
│   │
│   ├── song-960.json             # 建国时的小边界（optional）
│   ├── song-1276.json            # 临安陷落前（optional）
│   └── dali.json                 # 大理（937-1253）
│
└── script/                       # 生成工具脚本
    ├── build_boundary.py         # 从 china.json 生成历史边界
    └── simplify.py               # 简化多边形顶点数
```

---

## 三、边界生成算法（纯 Python 实现）

### 3.1 省份隶属表

建立两宋时期**每个省份的控制状态**：

```python
# Northern Song control table (c.1111)
# FULL  = 完全控制，CLIP_N  = 需裁剪北部
# CLIP_S = 需裁剪南部，NONE  = 非控制
SONG_1111 = {
    '北京市': 'NONE',     # Liao territory (Yanyun)
    '天津市': 'NONE',     # Liao territory
    '河北省': 'CLIP_N',   # 北部属辽（燕云），南部属宋
    '山西省': 'CLIP_N',   # 北部属辽（大同），中南部属宋
    '内蒙古': 'NONE',     # Liao
    '辽宁省': 'NONE',     # Liao
    '吉林省': 'NONE',     # Liao
    '黑龙江': 'NONE',     # Liao
    '上海市': 'FULL',
    '江苏省': 'FULL',
    '浙江省': 'FULL',
    '安徽省': 'FULL',
    '福建省': 'FULL',
    '江西省': 'FULL',
    '山东省': 'FULL',
    '河南省': 'FULL',
    '湖北省': 'FULL',
    '湖南省': 'FULL',
    '广东省': 'FULL',
    '广西':     'FULL',
    '海南省': 'FULL',
    '重庆市': 'FULL',
    '四川省': 'FULL',
    '贵州省': 'FULL',
    '云南省': 'NONE',     # Dali kingdom
    '西藏':   'NONE',     # Tubo tribes
    '陕西省': 'CLIP_NW',  # 北部属西夏，南部属宋
    '甘肃省': 'CLIP_S',   # 南部属宋，北部属西夏
    '青海省': 'NONE',     # Tubo / Ximing
    '宁夏':   'NONE',     # Western Xia heartland
    '新疆':   'NONE',     # Western regions
    '台湾省': 'NONE',     # 非实际管辖（澎湖有联系）
    '香港':   'FULL',     # 属广南东路
    '澳门':   'FULL',     # 属广南东路
}
```

### 3.2 裁剪算法

对于 `CLIP_N`（裁剪北部）的省份，用一条裁剪线切掉北部区域：

```python
def clip_polygon_by_line(coords, clip_line_lat, keep_side='south'):
    """
    用纬度线裁剪多边形
    clip_line_lat: 裁剪纬度
    keep_side: 'south' | 'north'
    """
    # Sutherland-Hodgman 多边形裁剪算法
    # 纯 Python 实现，无需第三方库
    ...
```

### 3.3 裁剪纬度参考

| 省份 | 裁剪类型 | 裁剪参考线 | 依据 |
|---|---|---|---|
| 河北省 | 北纬 ≈ 39.5° | 白沟河—雁门关线 | 澶渊之盟边界 |
| 山西省 | 北纬 ≈ 39.5° | 雁门山—恒山—管涔山 | 宋辽界山 |
| 陕西省 | 北纬 ≈ 37° + 东界 | 横山山脉 | 宋夏边界 |
| 甘肃省 | 北纬 ≈ 36° | 兰州—会州一线 | 宋夏边界 |

### 3.4 南部边界省份（南宋）

```python
SONG_1142 = {  # 绍兴和议后
    **SONG_1111,
    # 以下省份从 FULL 改为 CLIP_N
    '江苏省': 'CLIP_N',   # 淮河以北归金
    '安徽省': 'CLIP_N',   # 淮河以北归金
    '河南省': 'NONE',     # 全境归金
    '山东省': 'NONE',     # 全境归金
    '山西省': 'NONE',     # 全境归金
    '河北省': 'NONE',     # 全境归金
    '陕西省': 'CLIP_S',   # 仅秦岭以南（汉中盆地）
    '甘肃省': 'CLIP_SS',  # 仅天水—西和一角
    # 原 CLIP_N 改为 NONE
    '湖北省': 'FULL',     # 襄阳-枣阳还在
    # ...
}
```

### 3.5 多边形合并算法

```python
def merge_polygons(polygons):
    """
    合并多个多边形为一个 MultiPolygon
    纯 Python 实现多边形并集（union）
    
    简单实现：收集所有坐标作为 MultiPolygon
    更精确：使用扫描线算法合并重叠区域
    """
    # 对于首期实现，直接收集为 MultiPolygon coordinates
    # 后续可优化去重叠
    ...
```

### 3.6 边界平滑（简化）

```python
def simplify_polygon(coords, tolerance=0.5):
    """
    Douglas-Peucker 算法简化多边形
    减少顶点数以优化 three.js 渲染性能
    tolerance=0.5 度 ≈ 55km（首期可用）
    """
    ...
```

---

## 四、邻国产出物

同时生成同期邻国边界，用于 overlay 层区分着色：

### 4.1 辽（Liao, 916–1125）

```
省份构成：内蒙古 + 辽宁 + 吉林 + 黑龙江 + 
          北京 + 天津 + 河北北部 + 山西北部
裁剪来源：河北（北纬39.5°以北大部）
          山西（北纬39°以北）
          内蒙古（全额）
          东三省（全额）
```

### 4.2 西夏（Western Xia, 1038–1227）

```
省份构成：宁夏（全额）+ 甘肃（北部）+ 陕西北部 + 内蒙古西部
裁剪来源：甘肃（北纬36°以北）
          陕西（北纬37°以北+ 横山以西）
          宁夏（全额）
          内蒙古（阿拉善等）
```

### 4.3 金（Jin, 1115–1234）—— 1142年

```
省份构成：原辽全部 + 北宋黄河以北 + 淮河以北
裁剪来源：江苏（淮河以北）
          安徽（淮河以北）
          河南（全额）
          山东（全额）
          山西（全额）
          河北（全额）
          北京/天津（全额）
          辽地（全额）
```

### 4.4 大理（Dali, 937–1253）

```
省份构成：云南（全额）+ 四川西南角 + 贵州西部
裁剪来源：云南（全额）
          四川（大渡河以南）
          贵州（西部）
```

---

## 五、实施步骤

### Phase 1：工具链（1–2 天）

| 步骤 | 产出 | 说明 |
|---|---|---|
| 1.1 | `scripts/clip.py` | Sutherland-Hodgman 多边形裁剪 |
| 1.2 | `scripts/merge.py` | 多边形合并 |
| 1.3 | `scripts/simplify.py` | Douglas-Peucker 顶点简化 |
| 1.4 | `scripts/to_overlay.py` | 统一输出格式 + 属性标记 |

### Phase 2：北宋疆域生成（1 天）

| 步骤 | 产出 | 说明 |
|---|---|---|
| 2.1 | 定义 `SONG_1111` 省份对照表 | 含 FULL/CLIP/NONE 标记 |
| 2.2 | 运行脚本 → `northern-song-1111.json` | |
| 2.3 | 视觉验证（在 three.js 中加载）| 看是否明显偏离历史地图 |
| 2.4 | 迭代修正裁剪线参数 | 对齐谭其骧《历史地图集》|

### Phase 3：同期邻国生成（1 天）

| 步骤 | 产出 |
|---|---|
| 3.1 | `liao-1111.json` |
| 3.2 | `western-xia-1111.json` |
| 3.3 | `dali.json` |

### Phase 4：南宋疆域（1 天）

| 步骤 | 产出 |
|---|---|
| 4.1 | 定义 `SONG_1142` 对照表 |
| 4.2 | `southern-song-1142.json` |
| 4.3 | `jin-1142.json`（同期金朝边界）|
| 4.4 | `western-xia-1142.json`（同期西夏）|

### Phase 5：前后端对接（1 天）

| 步骤 | 产出 |
|---|---|
| 5.1 | `server/routes/overlay.js` — 实现 `GET /api/map/overlay` |
| 5.2 | 支持 `?dynasty=song&period=1111` 参数 |
| 5.3 | `client/src/map/OverlayLayer.js` — 叠加层渲染（半透明多边形）|
| 5.4 | 整合到 ChinaMap.js |
| 5.5 | 时间轴上联动 overlay（拖动到不同年份切换边界）|

### Phase 6：精细化（持续迭代）

| 任务 | 说明 |
|---|---|
| 补充更多时期 | 960, 979, 1127, 1276 等 |
| 优化边界精度 | 参考谭其骧地图微调裁剪线 |
| 添加路/州界 | 按需求添加内部行政边界 |
| 边界动画 | 时间轴拖动时渐变过渡 |

---

## 六、难度评估与风险

### 难度

| 模块 | 难度 | 说明 |
|---|---|---|
| Polygon clipping | ⭐⭐⭐ | Sutherland-Hodgman 约 100 行代码 |
| Polygon merge | ⭐⭐⭐⭐ | 真正的多边形 union 较复杂 |
| Province selection | ⭐ | 查表即可 |
| Boundary verification | ⭐⭐ | 需要目视对比参考地图 |
| Three.js overlay | ⭐⭐ | 半透明 Mesh 即可 |

### 风险与缓解

| 风险 | 等级 | 缓解 |
|---|---|---|
| 裁剪后的边界与真实历史有偏差 | 🟡 中 | 首期接受简化版，后续微调 |
| 多边形合并算法复杂（重叠/空洞）| 🟡 中 | 首期不合并，用 MultiPolygon |
| 部分省份数据缺失/精度不足 | 🟢 低 | china.json 已有完整省界 |
| 无 shapely/geopandas | 🟢 低 | 纯 Python 实现基本算法即可 |

### 简化策略（如果遇到困难）

如果纯 Python 多边形合并太难，有更简单的替代：

**替代方案 A：不合并，直接 MultiPolygon**
```json
{
  "type": "MultiPolygon",
  "coordinates": [
    [[河北南部顶点]],  ← 每个被选中的省份保持独立
    [[河南顶点]],
    [[江苏顶点]],
    ...
  ]
}
```
这在 three.js 中用 `BufferGeometry` 渲染时几乎没区别，只是坐标文件会稍大。

**替代方案 B：手绘简化多边形**
如果算法路线走不通，可以直接在 JSON 中手写简化多边形，用大约 20–30 个关键点勾勒宋的轮廓。这比听起来更可行——我们知道每个边界的关键关口坐标。

---

## 七、渲染层设计（ChinaMap.js 扩展）

### 7.1 OverlayLayer 类

```javascript
// client/src/map/OverlayLayer.js
export class OverlayLayer {
  constructor(scene, project) {
    this.scene = scene;
    this.project = project;  // 复用 ChinaMap 的投影
    this.meshes = [];
  }

  async loadOverlay(dynasty, period) {
    const url = `/api/map/overlay?dynasty=${dynasty}&period=${period}`;
    const data = await fetch(url).then(r => r.json());
    this.render(data);
  }

  render(data) {
    // 遍历 data.features，每个 Feature 生成一个半透明 Mesh
    // 使用 project() 统一投影
    // 不同 entity（宋/辽/夏/金）使用不同颜色
  }

  clear() {
    // 移除所有 overlay mesh
  }
}
```

### 7.2 颜色方案

| 政权 | 颜色 | Hex | 不透明度 |
|---|---|---|---|
| 宋 (Song) | 红色 | `#E53935` | 0.25 |
| 辽 (Liao) | 深蓝 | `#1E88E5` | 0.25 |
| 西夏 (Xia) | 绿色 | `#43A047` | 0.25 |
| 金 (Jin) | 紫色 | `#8E24AA` | 0.25 |
| 大理 (Dali) | 橙色 | `#FB8C00` | 0.25 |

### 7.3 时间轴联动

```javascript
// 当时间轴拖动到新年份时：
timeline.onChange((year) => {
  if (year >= 960 && year < 1127) {
    overlay.loadOverlay('song', 1111);   // 北宋
  } else if (year >= 1127 && year <= 1279) {
    overlay.loadOverlay('song', 1142);   // 南宋
  }
});
```

---

## 八、与现有架构的兼容性

### 不需要修改的

- `server/db.js` — 数据库逻辑不变
- `server/routes/events.js` — 事件 API 不变
- `server/routes/meta.js` — 元信息 API 不变
- `client/src/api.js` — 只是加一个 fetch，不改变现有接口
- `client/src/timeline/Timeline.js` — 时间轴不关心地图

### 需要新增的

- `server/routes/overlay.js` — 实现已有预留接口
- `client/src/map/OverlayLayer.js` — 新类
- `server/data/geo/historical/*.json` — 边界数据文件

### 需要修改的

- `client/src/map/ChinaMap.js` — 创建 OverlayLayer 实例，绑定到场景
- `client/src/main.js` — 加载 overlay

### API 契约（已定义，无需改）

```
GET /api/map/overlay?dynasty=song&period=1111
→ FeatureCollection of boundary polygons
```

---

## 九、时间轴与 overlay 的联动策略

### 数据来源（每个时期定义）

```json
// periods.json
{
  "periods": [
    { "id": "960", "year": 960, "label": "宋朝建立" },
    { "id": "979", "year": 979, "label": "基本统一" },
    { "id": "1005", "year": 1005, "label": "澶渊之盟" },
    { "id": "1111", "year": 1111, "label": "北宋极盛" },
    { "id": "1127", "year": 1127, "label": "靖康之变" },
    { "id": "1142", "year": 1142, "label": "绍兴和议" },
    { "id": "1234", "year": 1234, "label": "联蒙灭金" },
    { "id": "1276", "year": 1276, "label": "临安陷落" }
  ],
  "default": "1111"
}
```

### 联动逻辑

```javascript
function getPeriodForYear(year) {
  if (year < 960) return null;
  if (year < 979) return '960';     // 小中原
  if (year < 1005) return '979';    // 统一但辽还在对峙
  if (year < 1127) return '1111';   // 北宋稳定期
  if (year < 1142) return '1127';   // 南宋初（还未正式定界）
  if (year < 1234) return '1142';   // 宋金对峙
  if (year < 1276) return '1234';   // 联蒙灭金后短暂扩张
  return '1276';                    // 临安陷落后仅余闽广
}
```

---

## 十、下一步（等待你的决策）

### 我的建议

从 **Phase 1 + 2 → 5** 的路径走通 MVP：

1. **用 Python 写裁剪脚本**+ 生成 `northern-song-1111.json`（最简版）
2. **用手写一个简化版的边界坐标**作为备选保底
3. **直接实现 overlay API + 前端渲染**
4. 先展示北宋一个时期，跑通全链路后再加南宋和其他邻国

### 需要你确认的

- [ ] Phase 1 的算法路线是否 OK？（Sutherland-Hodgman 纯 Python）
- [ ] 首期只做北宋 1111 年？还是南宋 1142 年也一起？
- [ ] 是否要同期做 Liao / Xia 邻国边界？
- [ ] 先做简化版（~20 顶点/多边形）再精细化，还是直接一步到位？

---

*参考：谭其骧《中国历史地图集》第六册（宋·辽·金时期），本方案边界简化遵循该图集的基本框架。*
