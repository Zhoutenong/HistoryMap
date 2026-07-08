import * as THREE from 'three';
import { geoMercator, geoPath } from 'd3-geo';
import { getTheme } from '../theme.js';

// 统一投影：所有经纬度 -> three.js XY 平面坐标的唯一入口。
// 事件层、地图层都通过它转换，保证位置一致。
const projection = geoMercator();

let _fitDone = false;
// 投影后的像素中心；project() 输出会减去它，使地图天然居中于原点。
// 这样地图 mesh 顶点与事件泡泡坐标完全一致，相机看向原点时两者都在视野内。
let _center = [0, 0];

/**
 * 把 GeoJSON 经纬度 [lng, lat] 投影成 three.js 平面坐标 [x, y]。
 * 输出已居中：地图 mesh 与事件泡泡共用此函数，位置天然对齐。
 * @param {[number, number]} lngLat
 * @returns {[number, number]}
 */
export function project(lngLat) {
  const p = projection(lngLat);
  // d3 y 轴朝下：翻转成数学坐标系（朝上），并减去中心做居中
  return [p[0] - _center[0], _center[1] - p[1]];
}

/**
 * 用 GeoJSON 的整体范围拟合投影，并记录居中中心。
 * 必须在渲染地图 mesh 之前调用一次。
 * @param {object} geojson FeatureCollection
 */
export function fitProjection(geojson) {
  if (_fitDone) return;
  projection.fitSize([1000, 800], geojson);
  // 取投影后包围盒中心作为居中基准（与地图实际范围一致）
  const bounds = geoPath(projection).bounds(geojson);
  _center = [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2];
  _fitDone = true;
}

/**
 * 构建中国地图 three.js 组。
 * @param {object} geojson
 * @returns {THREE.Group}
 */
export function buildChinaMap(geojson) {
  fitProjection(geojson);
  const group = new THREE.Group();
  group.name = 'ChinaMap';

  const theme = getTheme();

  const provinceShape = new THREE.Shape();
  const extrudeSettings = {
    depth: 6,           // 薄板厚度，给一点立体感
    bevelEnabled: false
  };

  const provinceMaterial = new THREE.MeshStandardMaterial({
    color: theme.mapProvince,
    metalness: 0.1,
    roughness: 0.75
  });
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: theme.mapEdge,
    transparent: true,
    opacity: 0.6
  });
  const oceanMaterial = new THREE.MeshStandardMaterial({
    color: theme.mapOcean,
    metalness: 0.2,
    roughness: 0.5,
    transparent: true,
    opacity: 0.25,
    side: THREE.DoubleSide
  });

  geojson.features.forEach((feature, idx) => {
    const polygons = normalizePolygons(feature.geometry);
    polygons.forEach((rings) => {
      const shape = new THREE.Shape();
      // 外环
      const outer = rings[0].map((c) => project(c));
      shape.moveTo(outer[0][0], outer[0][1]);
      for (let i = 1; i < outer.length; i++) shape.lineTo(outer[i][0], outer[i][1]);
      // 内环（孔洞，如飞地挖空）
      for (let h = 1; h < rings.length; h++) {
        const hole = new THREE.Path();
        const hp = rings[h].map((c) => project(c));
        hole.moveTo(hp[0][0], hp[0][1]);
        for (let i = 1; i < hp.length; i++) hole.lineTo(hp[i][0], hp[i][1]);
        shape.holes.push(hole);
      }
      const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      const mesh = new THREE.Mesh(geo, provinceMaterial);
      mesh.name = feature.properties?.name || `province-${idx}`;
      group.add(mesh);

      // 边线，贴在顶面 (z = depth)
      const edgePoints = outer.map(([x, y]) => new THREE.Vector3(x, y, extrudeSettings.depth + 0.05));
      if (edgePoints.length) {
        const edgeGeo = new THREE.BufferGeometry().setFromPoints(edgePoints);
        group.add(new THREE.Line(edgeGeo, edgeMaterial));
      }
    });
  });

  // project() 已做居中，地图天然在原点附近，无需再平移 group。
  // 保留包围盒信息供相机自适应使用。
  const box = new THREE.Box3().setFromObject(group);
  group.userData.box = box;
  return group;
}

/**
 * 把 Polygon / MultiPolygon 统一成 [[[lng,lat],...], ...]（一组多边形，每个含若干环）。
 */
function normalizePolygons(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}
