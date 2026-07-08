#!/usr/bin/env python3
"""
HistoryMap — 历史疆域边界生成器
从 china.json（现代省界）裁剪生成各时期历史边界 GeoJSON。

方法：简化版 — 选取省份 + 纬度裁剪线，保持 MultiPolygon 结构。
不进行多边形合并（合并需要 shapely，本项目避免第三方依赖）。

用法：
  python generate_boundaries.py [--output-dir ../server/data/geo/historical]
"""

import json
import os
import sys
import math

# ──────────────────────────────────────────────
# 1. Sutherland-Hodgman 多边形裁剪（水平线）
# ──────────────────────────────────────────────

def clip_polygon_by_latitude(ring, cutoff_lat, keep='south'):
    """
    用水平线裁剪多边形。
    ring: [(lng, lat), ...] 封闭环（首尾相同）
    cutoff_lat: 裁剪纬度
    keep: 'south' | 'north' — 保留哪一侧
    
    返回裁剪后的环列表（可能多个环）。
    """
    if not ring:
        return []
    
    def inside(pt):
        lat = pt[1]
        if keep == 'south':
            return lat <= cutoff_lat  # 保留南侧（纬度更小）
        else:
            return lat >= cutoff_lat  # 保留北侧（纬度更大）
    
    def intersect(p1, p2):
        """计算线段与水平线的交点"""
        x1, y1 = p1
        x2, y2 = p2
        # 避免除以零
        if abs(y2 - y1) < 1e-10:
            return [(x1 + x2) / 2, cutoff_lat]
        t = (cutoff_lat - y1) / (y2 - y1)
        x = x1 + t * (x2 - x1)
        return [x, cutoff_lat]
    
    # Sutherland-Hodgman
    output = ring
    # 对裁剪边（这里只有一条水平线）处理
    # 但实际上我们只需要一次裁剪 — 对水平边
    # 但一个多边形可能有多个环，我们递归处理
    
    # 简化实现：直接对每个点进行遍历
    new_ring = []
    n = len(output)
    for i in range(n):
        curr = output[i]
        prev = output[i - 1]  # 因为闭环比实际点多一个（首尾相同），所以用 i-1
        
        curr_inside = inside(curr)
        prev_inside = inside(prev)
        
        if curr_inside:
            if not prev_inside:
                # 从外到内：加交点
                new_ring.append(intersect(prev, curr))
            new_ring.append(curr)
        elif prev_inside:
            # 从内到外：加交点
            new_ring.append(intersect(prev, curr))
        # 都在外：不加
    
    if len(new_ring) < 3:
        return []  # 裁剪后不构成多边形
    
    return [new_ring]


def clip_polygon_rings(rings, cutoff_lat, keep):
    """
    裁剪多边形环集合（含外环和内环/空洞）。
    rings: [outer_ring, hole1, hole2, ...]
    """
    if not rings:
        return []
    
    # 裁剪外环
    outer_clipped = clip_polygon_by_latitude(rings[0], cutoff_lat, keep)
    if not outer_clipped:
        return []
    
    # 裁剪内环（空洞），只保留完全在保留侧的
    holes_clipped = []
    for hole in rings[1:]:
        clipped = clip_polygon_by_latitude(hole, cutoff_lat, keep)
        holes_clipped.extend(clipped)
    
    # 组合：每个外环片段 + 对应的内环
    result = []
    for outer in outer_clipped:
        poly_rings = [outer] + holes_clipped
        result.append(poly_rings)
    
    return result


def clip_multi_polygon_coords(coords, cutoff_lat, keep='south'):
    """
    裁剪 MultiPolygon coordinates。
    coords: MultiPolygon 标准坐标结构
    """
    result = []
    for polygon in coords:
        clipped = clip_polygon_rings(polygon, cutoff_lat, keep)
        result.extend(clipped)
    return result


# ──────────────────────────────────────────────
# 2. 边界裁剪配置
# ──────────────────────────────────────────────

# 北宋 (c.1111) — 省份控制表
# FULL: 全境纳入, CLIP_N: 裁北, CLIP_S: 裁南, 
# CLIP_NW: 裁西北, CLIP_SE: 裁东南, NONE: 不含
SONG_1111 = {
    # 全境
    '上海市': 'FULL', '江苏省': 'FULL', '浙江省': 'FULL',
    '安徽省': 'FULL', '福建省': 'FULL', '江西省': 'FULL',
    '山东省': 'FULL', '河南省': 'FULL', '湖北省': 'FULL',
    '湖南省': 'FULL', '广东省': 'FULL', '广西壮族自治区': 'FULL',
    '海南省': 'FULL', '重庆市': 'FULL', '四川省': 'FULL',
    '贵州省': 'FULL', '香港特别行政区': 'FULL', '澳门特别行政区': 'FULL',
    # 裁剪
    '河北省': ('CLIP_N', 39.8),    # 白沟河—雁门关一线 (~N39.8°)
    '山西省': ('CLIP_N', 39.8),    # 雁门关以南
    '陕西省': ('CLIP_N', 37.5),    # 横山以南（宋夏边界）
    '甘肃省': ('CLIP_N', 36.5),    # 仅保留陇南（兰州以南）
    # 不含
    '北京市': 'NONE', '天津市': 'NONE', '内蒙古自治区': 'NONE',
    '辽宁省': 'NONE', '吉林省': 'NONE', '黑龙江省': 'NONE',
    '云南省': 'NONE', '西藏自治区': 'NONE', '青海省': 'NONE',
    '宁夏回族自治区': 'NONE', '新疆维吾尔自治区': 'NONE', '台湾省': 'NONE',
}

# 南宋 (c.1142) — 绍兴和议后
SONG_1142 = {
    # 全境保留
    '浙江省': 'FULL', '福建省': 'FULL', '江西省': 'FULL',
    '湖南省': 'FULL', '广东省': 'FULL', '广西壮族自治区': 'FULL',
    '海南省': 'FULL', '重庆市': 'FULL', '四川省': 'FULL',
    '贵州省': 'FULL', '香港特别行政区': 'FULL', '澳门特别行政区': 'FULL',
    '上海市': 'FULL',
    # 淮河以南
    '江苏省': ('CLIP_N', 33.5),    # 淮河一线
    '安徽省': ('CLIP_N', 33.0),    # 淮河一线
    '湖北省': ('CLIP_N', 33.0),    # 襄阳以南
    # 秦岭以南
    '陕西省': ('CLIP_N', 34.0),    # 秦岭以南（汉中盆地）
    '甘肃省': ('CLIP_N', 34.5),    # 仅天水—西和角
    # 丢失
    '山东省': 'NONE', '河南省': 'NONE',
    '河北省': 'NONE', '山西省': 'NONE',
    '北京市': 'NONE', '天津市': 'NONE', '内蒙古自治区': 'NONE',
    '辽宁省': 'NONE', '吉林省': 'NONE', '黑龙江省': 'NONE',
    '云南省': 'NONE', '西藏自治区': 'NONE', '青海省': 'NONE',
    '宁夏回族自治区': 'NONE', '新疆维吾尔自治区': 'NONE', '台湾省': 'NONE',
}

# 辽 (c.1111)
LIAO_1111 = {
    '北京市': 'FULL', '天津市': 'FULL',
    '内蒙古自治区': 'FULL', '辽宁省': 'FULL', '吉林省': 'FULL', '黑龙江省': 'FULL',
    '河北省': ('CLIP_S', 39.8),    # 燕云以南
    '山西省': ('CLIP_S', 39.8),    # 大同以南
    # 不含
    '上海市': 'NONE', '江苏省': 'NONE', '浙江省': 'NONE',
    '安徽省': 'NONE', '福建省': 'NONE', '江西省': 'NONE',
    '山东省': 'NONE', '河南省': 'NONE', '湖北省': 'NONE',
    '湖南省': 'NONE', '广东省': 'NONE', '广西壮族自治区': 'NONE',
    '海南省': 'NONE', '重庆市': 'NONE', '四川省': 'NONE',
    '贵州省': 'NONE', '香港特别行政区': 'NONE', '澳门特别行政区': 'NONE',
    '云南省': 'NONE', '西藏自治区': 'NONE', '青海省': 'NONE',
    '宁夏回族自治区': 'NONE', '新疆维吾尔自治区': 'NONE', '台湾省': 'NONE',
    '陕西省': 'NONE', '甘肃省': 'NONE',
}

# 西夏 (c.1111)
XIA_1111 = {
    '宁夏回族自治区': 'FULL',
    '甘肃省': ('CLIP_S', 36.5),    # 河西走廊（北部）
    '陕西省': ('CLIP_S', 37.5),    # 陕北（横山以北）
    '内蒙古自治区': ('CLIP_N', 42.0),  # 鄂尔多斯（南部）
    # 不含
    '北京市': 'NONE', '天津市': 'NONE',
    '上海市': 'NONE', '江苏省': 'NONE', '浙江省': 'NONE',
    '安徽省': 'NONE', '福建省': 'NONE', '江西省': 'NONE',
    '山东省': 'NONE', '河南省': 'NONE', '湖北省': 'NONE',
    '湖南省': 'NONE', '广东省': 'NONE', '广西壮族自治区': 'NONE',
    '海南省': 'NONE', '重庆市': 'NONE', '四川省': 'NONE',
    '贵州省': 'NONE', '香港特别行政区': 'NONE', '澳门特别行政区': 'NONE',
    '云南省': 'NONE', '西藏自治区': 'NONE', '青海省': 'NONE',
    '新疆维吾尔自治区': 'NONE', '台湾省': 'NONE',
    '河北省': 'NONE', '山西省': 'NONE',
    '辽宁省': 'NONE', '吉林省': 'NONE', '黑龙江省': 'NONE',
}

# 金 (c.1142) — 绍兴和议后
JIN_1142 = {
    '北京市': 'FULL', '天津市': 'FULL',
    '内蒙古自治区': 'FULL', '辽宁省': 'FULL', '吉林省': 'FULL', '黑龙江省': 'FULL',
    '河北省': 'FULL', '山西省': 'FULL',
    '山东省': 'FULL', '河南省': 'FULL',
    '宁夏回族自治区': 'FULL',
    '甘肃省': ('CLIP_S', 34.5),    # 陇东（北部）
    '陕西省': ('CLIP_S', 34.0),    # 秦岭以北
    '江苏省': ('CLIP_S', 33.5),    # 淮河以北
    '安徽省': ('CLIP_S', 33.0),    # 淮河以北
    # 不含
    '上海市': 'NONE', '浙江省': 'NONE', '福建省': 'NONE',
    '江西省': 'NONE', '湖北省': 'NONE', '湖南省': 'NONE',
    '广东省': 'NONE', '广西壮族自治区': 'NONE', '海南省': 'NONE',
    '重庆市': 'NONE', '四川省': 'NONE', '贵州省': 'NONE',
    '香港特别行政区': 'NONE', '澳门特别行政区': 'NONE',
    '云南省': 'NONE', '西藏自治区': 'NONE', '青海省': 'NONE',
    '新疆维吾尔自治区': 'NONE', '台湾省': 'NONE',
}

# 大理 (937-1253)
DALI = {
    '云南省': 'FULL',
    '四川省': ('CLIP_S', 27.0),    # 大渡河以南一小角
    '贵州省': ('CLIP_S', 25.0),    # 西南角
    # 不含
    '北京市': 'NONE', '天津市': 'NONE', '河北省': 'NONE',
    '山西省': 'NONE', '内蒙古自治区': 'NONE', '辽宁省': 'NONE',
    '吉林省': 'NONE', '黑龙江省': 'NONE',
    '上海市': 'NONE', '江苏省': 'NONE', '浙江省': 'NONE',
    '安徽省': 'NONE', '福建省': 'NONE', '江西省': 'NONE',
    '山东省': 'NONE', '河南省': 'NONE', '湖北省': 'NONE',
    '湖南省': 'NONE', '广东省': 'NONE', '广西壮族自治区': 'NONE',
    '海南省': 'NONE', '重庆市': 'NONE',
    '香港特别行政区': 'NONE', '澳门特别行政区': 'NONE',
    '西藏自治区': 'NONE', '青海省': 'NONE',
    '宁夏回族自治区': 'NONE', '新疆维吾尔自治区': 'NONE', '台湾省': 'NONE',
    '陕西省': 'NONE', '甘肃省': 'NONE',
}


# ──────────────────────────────────────────────
# 3. GeoJSON 生成器
# ──────────────────────────────────────────────

def load_china_geojson(path):
    """加载 china.json"""
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def build_dynasty_geojson(china_data, province_config, dynasty_name, period_label, color, opacity):
    """
    根据省份配置生成王朝边界 FeatureCollection。
    
    province_config: {'省份名': 'FULL' | ('CLIP_N', lat) | ('CLIP_S', lat) | 'NONE'}
    """
    features_out = []
    province_index = {feat['properties']['name']: feat for feat in china_data['features']}
    
    for prov_name, config in province_config.items():
        if config == 'NONE':
            continue
        if prov_name not in province_index:
            print(f'  ⚠ 未找到省份: {prov_name}')
            continue
        
        feat = province_index[prov_name]
        geom = feat['geometry']
        props = feat['properties']
        
        if config == 'FULL':
            # 直接使用原几何
            features_out.append({
                'type': 'Feature',
                'properties': {
                    'name': prov_name,
                    'dynasty': dynasty_name,
                    'period': period_label,
                    'adcode': props.get('adcode'),
                },
                'geometry': geom
            })
        elif isinstance(config, tuple):
            action, cutoff = config
            new_geom = None
            if geom['type'] == 'MultiPolygon':
                new_coords = clip_multi_polygon_coords(geom['coordinates'], cutoff, 
                    'south' if action == 'CLIP_N' else 'north')
                if new_coords:
                    new_geom = {'type': 'MultiPolygon', 'coordinates': new_coords}
            elif geom['type'] == 'Polygon':
                new_rings_set = clip_polygon_rings(geom['coordinates'], cutoff,
                    'south' if action == 'CLIP_N' else 'north')
                if new_rings_set:
                    # 如果只有一个结果环集，输出 Polygon；多个则输出 MultiPolygon
                    if len(new_rings_set) == 1:
                        new_geom = {'type': 'Polygon', 'coordinates': new_rings_set[0]}
                    else:
                        new_geom = {'type': 'MultiPolygon', 'coordinates': new_rings_set}
            
            if new_geom:
                features_out.append({
                    'type': 'Feature',
                    'properties': {
                        'name': prov_name,
                        'dynasty': dynasty_name,
                        'period': period_label,
                        'adcode': props.get('adcode'),
                        'clipped': True,
                        'clip_action': action,
                        'cutoff_lat': cutoff,
                    },
                    'geometry': new_geom
                })
    
    return {
        'type': 'FeatureCollection',
        'properties': {
            'name': dynasty_name,
            'period': period_label,
            'color': color,
            'fillOpacity': opacity,
            'stroke': color,
            'strokeWidth': 2,
            'strokeOpacity': 0.8,
            'description': f'{dynasty_name}疆域（{period_label}）',
        },
        'features': features_out
    }


def save_geojson(data, filepath):
    """保存 GeoJSON"""
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'  ✅ 已生成: {os.path.basename(filepath)}  ({len(data["features"])} 个要素)')


# ──────────────────────────────────────────────
# 4. 主流程
# ──────────────────────────────────────────────

def main():
    # 脚本位于 server/scripts/generate_boundaries.py
    # 项目根是 server/.. 即 HistoryMap/
    server_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # server/
    default_output = os.path.join(server_dir, 'data', 'geo', 'historical')
    
    # 解析参数
    output_dir = default_output
    if len(sys.argv) > 1:
        if sys.argv[1] == '--output-dir' and len(sys.argv) > 2:
            output_dir = sys.argv[2]
    
    os.makedirs(output_dir, exist_ok=True)
    
    # 加载基础数据
    china_path = os.path.join(server_dir, 'data', 'geo', 'china.json')
    print(f'📂 加载基础地图: {china_path}')
    
    if not os.path.exists(china_path):
        print(f'❌ 未找到 {china_path}')
        sys.exit(1)
    
    china_data = load_china_geojson(china_path)
    print(f'   ✅ 已加载 {len(china_data["features"])} 个省级行政区\n')
    
    # 定义要生成的边界
    generations = [
        # (配置文件, 王朝名, 时期, 颜色, 不透明度, 文件名)
        (SONG_1111, '北宋', '1111年极盛期', '#E53935', 0.35, 'northern-song-1111.json'),
        (LIAO_1111, '辽', '1111年', '#1E88E5', 0.30, 'liao-1111.json'),
        (XIA_1111, '西夏', '1111年', '#43A047', 0.30, 'western-xia-1111.json'),
        (SONG_1142, '南宋', '1142年绍兴和议后', '#E53935', 0.35, 'southern-song-1142.json'),
        (JIN_1142, '金', '1142年', '#8E24AA', 0.30, 'jin-1142.json'),
        (DALI, '大理', '937–1253年', '#FB8C00', 0.30, 'dali.json'),
    ]
    
    print('🏗 开始生成历史疆域边界...\n')
    
    for config, name, period, color, opacity, filename in generations:
        print(f'  ── {name}（{period}）')
        geojson = build_dynasty_geojson(china_data, config, name, period, color, opacity)
        filepath = os.path.join(output_dir, filename)
        save_geojson(geojson, filepath)
    
    # 生成总索引
    periods_index = {
        'periods': [
            {'id': 'song-1111', 'year': 1111, 'label': '北宋极盛', 'files': [
                'northern-song-1111.json', 'liao-1111.json', 'western-xia-1111.json']},
            {'id': 'song-1142', 'year': 1142, 'label': '南宋·绍兴和议', 'files': [
                'southern-song-1142.json', 'jin-1142.json', 'western-xia-1111.json']},
        ],
        'entities': [
            {'id': 'song', 'name': '宋', 'color': '#E53935'},
            {'id': 'liao', 'name': '辽', 'color': '#1E88E5'},
            {'id': 'xia', 'name': '西夏', 'color': '#43A047'},
            {'id': 'jin', 'name': '金', 'color': '#8E24AA'},
            {'id': 'dali', 'name': '大理', 'color': '#FB8C00'},
        ],
        'default': 'song-1111',
    }
    
    index_path = os.path.join(output_dir, 'periods.json')
    with open(index_path, 'w', encoding='utf-8') as f:
        json.dump(periods_index, f, ensure_ascii=False, indent=2)
    print(f'\n  ✅ 索引文件: periods.json')
    
    print(f'\n🎉 全部生成完毕！共 {len(generations)} 个文件')
    print(f'📁 输出目录: {output_dir}')


if __name__ == '__main__':
    main()
