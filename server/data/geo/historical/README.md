# HistoryMap — 历史边界数据

本目录包含宋朝及邻国的历史疆域边界 GeoJSON 文件。

## 数据来源

基于谭其骧《中国历史地图集》第六册（宋·辽·金时期）的边界描述，从 `../china.json`（现代中国省级行政区划）裁剪生成。

## 文件说明

| 文件 | 时期 | 说明 |
|---|---|---|
| `northern-song-1111.json` | 北宋极盛期 | 约 1111 年，北界白沟河—雁门关—横山 |
| `liao-1111.json` | 辽 | 同期，含燕云十六州 |
| `western-xia-1111.json` | 西夏 | 同期，河西走廊+鄂尔多斯 |
| `southern-song-1142.json` | 南宋 | 绍兴和议后，秦岭—淮河为界 |
| `jin-1142.json` | 金 | 同期，统治原辽+北宋北方 |
| `dali.json` | 大理 | 937–1253 年，大渡河以南 |
| `periods.json` | — | 索引文件，供前端切换时期 |

## 格式

标准 GeoJSON FeatureCollection，每 feature 对应一个省份的裁剪结果。

`properties` 字段：
- `name` — 省份名
- `dynasty` — 所属王朝
- `color` / `fillOpacity` — 渲染建议值
- `clipped` — 是否经过裁剪
- `clip_action` / `cutoff_lat` — 裁剪参数

## 生成脚本

`server/scripts/generate_boundaries.py`

```bash
python server/scripts/generate_boundaries.py
```

## 使用

前端通过 `GET /api/map/overlay?dynasty=song&period=1111` 获取。

## 精度说明

为简化版边界：
- 核心省份：完整多边形（与现代省界重合）
- 边界省份：沿已知历史边界线做纬度裁剪
- 未使用多边形合并（保持 MultiPolygon 结构）

如需更高精度，可参考谭其骧地图手工矢量化。
