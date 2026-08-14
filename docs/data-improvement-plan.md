# 宋朝州府级地图数据改善计划（实施文档）

> 状态：已批准实施（2026-08-14）。范围：北宋 `song-1111`（960–1126）州府级政区 + 治所标注 + 府州详情面板。
> 配套调研：`docs/data-sources-research.md`。

## 一、目标

1. **计量贴近历史**：《元丰九域志》（1080 年成书，元丰三年）是北宋政区、户口（主/客户）、土贡的当代权威记录，
   作为州府级数据基准；《舆地广记》提供政区沿革校正。所有数值可溯源到古籍原文（保留原文摘录字段）。
2. **地图详实**：从「政权级 10 个多边形」细化为「路 → 府州军监 → 县」三层：
   州府边界面（Voronoi 近似 + 人工校正）、州府治所点 + 名称标注、县治点（默认隐藏，可开关）。
3. **双端同契约**：Web 与 Android 原生版共用同一份 GeoJSON 契约（`/api/map/overlay` 扩展，无新端点）。

## 二、数据字典

### 2.1 提交入仓库（可分发）

| 文件 | 内容 | 许可 |
|---|---|---|
| `server/data/geo/song/jiuyuzhi-1080.json` | 九域志解析：路→府州军监→县 三层 + 户口/土贡/属县等第/原文摘录 | 公版古籍文本整理（无版权） |
| `server/data/geo/song/yudi-guangji.json` | 舆地广记解析：府州军监条目 + 沿革首段摘要 | 公版古籍文本整理（无版权） |
| `scripts/manual-seats.song.json` | 人工标定的州府治所坐标（CCTS 瓦片/谭图参考读取） | manual-calibration（事实性坐标） |

`jiuyuzhi-1080.json` 结构：

```json
{
  "meta": { "source": "元丰九域志（kanripo KR2k0005，文渊阁四库本）", "year": 1080, "counts": { "京府": 4, "次府": 10, "州": 242, "军": 37, "监": 4, "县": 1135 } },
  "routes": [
    {
      "name": "京畿路", "seq": 1,
      "prefectures": [
        {
          "id": "song-kyjl-kaifengfu", "name": "开封府", "type": "府", "grade": "京府",
          "seat": "开封", "counties": [ { "name": "开封", "grade": "赤" }, { "name": "祥符", "grade": "赤" } ],
          "households": { "main": 183770, "guest": 63401, "raw": "主一十八萬三千七百七十 客六萬三千四百一" },
          "tribute": "绢、葛", "tributeRaw": "土貢：絹、葛…",
          "juan": 1, "quotation": "東京，開封府。治開封、祥符二縣。…"
        }
      ]
    }
  ]
}
```

### 2.2 本地生成（gitignore，`server/data/geo/historical/_generated/`）

| 文件 | 内容 | 来源 |
|---|---|---|
| `_generated/chgis/` | CHGIS V6 zip 原始包/解压目录 | 哈佛 Dataverse（不可再分发） |
| `_generated/song-seats-{year}.json` | 州府治所坐标全表（CHGIS 派生 + 人工标定合并） | CHGIS 本地派生 + manual-seats |
| `_generated/prefectures.geojson` | 州府面 + 治所点 + 县治点 FeatureCollection 成品 | build-song-prefectures.mjs |

生成产物拷贝到同步目录：`npm run data:prefectures` → 输出
`server/data/geo/historical/prefectures.geojson`（含 CHGIS 派生坐标，**不入 git**，与 `_generated/` 同规则）。

### 2.3 州府 feature properties（对齐 `REQUIRED_PROPERTIES` 九字段 + 业务字段）

```json
{
  "id": "song-kyjl-kaifengfu", "name": "开封府",
  "kind": "prefecture",                    // prefecture / prefecture-seat / county-seat
  "rank": 1,                               // 1=京府, 2=次府, 3=上州, 4=中州, 5=下州/军/监（按户口排序）
  "style": "stroke-only", "source": "元丰九域志+CHGIS(本地)", "license": "see docs",
  "confidence": "medium",                  // low=Voronoi 未校正 / medium=人工校订过 / high=四京等权威位置
  "note": "Voronoi 近似边界，治所经人工校订",
  "route": "京畿路", "type": "府", "grade": "京府",
  "households": { "main": 183770, "guest": 63401 },
  "tribute": "绢、葛",
  "evolution": "五代梁都汴…宋因之…",       // 舆地广记沿革摘要
  "seat": "开封", "seatCoord": [114.35, 34.80],
  "periods": ["song-1111"]
}
```

## 三、许可矩阵

| 数据 | 可提交 git | 可商用 | 备注 |
|---|---|---|---|
| 古籍文本解析（九域志/舆地广记） | ✅ | ✅（事实性文本整理） | 古代文献无版权；整理格式原创 |
| 人工标定坐标（manual-seats） | ✅ | ⚠️ 建议标注 | 事实性坐标，参考 CCTS/谭图读取 |
| CHGIS 派生坐标/州府面 | ❌（gitignore） | ❌ | 复旦 CHGIS V2.0 协议：不可再分发、非商业 |
| regimes-*.json（既有） | ✅ | GPL-3.0 | 衍生数据须沿用 GPL-3.0 |
| CCTS 瓦片 / 谭图扫描 | ❌ 仅参考 | ❌ | 中研院版权 / 出版社版权 |

## 四、管线命令

```bash
npm run data:classics     # P1: 抓取并解析元丰九域志 + 舆地广记 → server/data/geo/song/
npm run data:seats        # P2: CHGIS 本地派生治所坐标 + 合并人工标定 → _generated/song-seats-1080.json
npm run data:prefectures  # P3: Voronoi 州府面 + 裁剪 + 输出 historical/prefectures.geojson
npm run data:check        # P6: 校验（数量/坐标/名称交叉/几何自检）
```

## 五、实施阶段

- **P0 规划落盘**：本文件 + `.gitignore`（`_generated/`）+ 目录约定。✅ 完成
- **P1 古籍解析管线**：`scripts/fetch-jiuyuzhi.mjs`、`scripts/fetch-yudi-guangji.mjs`。
  验收闸门：州府数 == 4 京府 + 10 次府 + 242 州 + 37 军 + 4 监，县数 == 1135。
- **P2 治所坐标**：`scripts/fetch-chgis-song.mjs`（Dataverse 本地下载 → 宋年府级点 → fuzzy 匹配九域志州名）
  + `scripts/manual-seats.song.json` 兜底（匹配率目标 >90%）。
- **P3 州府边界**：`scripts/build-song-prefectures.mjs`（投影平面 Voronoi → polygon-clipping 与宋政权轮廓求交裁剪
  → 输出面 + 治所点 + 县治点）。人工校正工作流：`_generated/correction-checklist.md`。
- **P4 后端接入**：`server/routes/overlay.js` 契约扩展（`KNOWN_KINDS` + `properties.prefectures/prefectureSeats/countySeats`；
  Polygon 保留 geometry 新通道）+ `historical/README.md` 数据契约更新。
- **P5 Web 渲染**：`TerritoryOverlay.js`（水彩仅描边分支 + 治所 CSS2D 标注 + 碰撞障碍 + 点击回调）、
  `main.js`（`showPlaceDetail` 府州详情面板）、`settings/store.js` + `SettingsMenu.js`（州府/县治开关）、
  `styles.css`（`prefecture-label` 样式族）、`Legend.js`（防御性按 kind 过滤）。
- **P6 校验**：`scripts/check-prefectures.mjs` + lint/test 回归。
- **P7 Android**：`OverlayLoader.kt` 白名单 + Polygon 保留分支、`WatercolorBuilder` 仅描边分支、
  `OverlayParser.kt`/`LabelPlacement` 治所标签 rank 体系。
- **P8 文档收尾**：AGENTS.md / README.md / package.json scripts。

## 六、扩展期（预留）

- 南宋州府（`song-1142/1279`）：CHGIS 1200/1279 本地点 + 《宋史·地理志》州目。
- 县治渲染默认开启的 LOD 策略（1135 县按 rank/视口密度）。
- Android 府州详情面板（Web 验证交互后移植）。
- 唐/辽/金/元复用同一管线（古籍源换《旧唐书·地理志》等）。
