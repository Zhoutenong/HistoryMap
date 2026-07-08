import * as THREE from 'three';
import { project } from './ChinaMap.js';

/**
 * 把 Polygon / MultiPolygon 统一成 [rings, rings, ...]，
 * 每个 rings 的第一个环是外边界，其余是孔洞。
 */
function normalizePolygons(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.map((poly) => poly);
  }
  return [];
}

function coordsToVectors(coords) {
  return coords.map(([lng, lat]) => {
    const [x, y] = project([lng, lat]);
    return new THREE.Vector2(x, y);
  });
}

/**
 * 从一个多边形（含孔洞）创建半透明填充面 + 边界线。
 */
function buildPolygonGroup(rings, fillColor, borderColor, opacity) {
  const group = new THREE.Group();

  const shape = new THREE.Shape(coordsToVectors(rings[0]));
  for (let i = 1; i < rings.length; i++) {
    shape.holes.push(new THREE.Path(coordsToVectors(rings[i])));
  }

  const geometry = new THREE.ShapeGeometry(shape);
  const material = new THREE.MeshBasicMaterial({
    color: fillColor,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.z = 7; // 在现代底图之上，泡泡之下
  group.add(mesh);

  // 边界线
  const borderPoints = coordsToVectors(rings[0]).map(
    (v) => new THREE.Vector3(v.x, v.y, 7.1)
  );
  const borderGeo = new THREE.BufferGeometry().setFromPoints(borderPoints);
  const borderMat = new THREE.LineBasicMaterial({
    color: borderColor,
    transparent: true,
    opacity: Math.min(opacity + 0.2, 0.9)
  });
  group.add(new THREE.LineLoop(borderGeo, borderMat));

  return group;
}

/**
 * 构建朝代疆域叠加层。
 * 从后端返回的 GeoJSON 中读取每个 feature 的 entity/color/fillOpacity，
 * 所有 features 同时显示（不按年份切换——时期已在请求时确定）。
 *
 * @param {object} geojson FeatureCollection
 * @returns {{ group: THREE.Group, update: (year:number)=>void }}
 */
export function buildTerritoryOverlay(geojson) {
  const root = new THREE.Group();
  root.name = 'TerritoryOverlay';

  const entries = [];

  geojson.features.forEach((feature) => {
    const props = feature.properties || {};
    const fillColor = new THREE.Color(props.color || '#00f0ff');
    const borderColor = new THREE.Color(props.borderColor || props.color || '#00f0ff');
    const opacity = props.fillOpacity !== undefined ? props.fillOpacity : 0.35;

    const polygons = normalizePolygons(feature.geometry);
    if (!polygons.length) return;

    const featureGroup = new THREE.Group();
    featureGroup.name = props.entity || props.name || 'overlay';

    polygons.forEach((rings) => {
      featureGroup.add(buildPolygonGroup(rings, fillColor, borderColor, opacity));
    });

    root.add(featureGroup);
    entries.push(featureGroup);
  });

  // update(year): 当前后端/按时期返回，所有 features 直接显示
  // 如需按年份进一步控制，可以在这里扩展
  function update(_year) {
    // no-op: 时期已在请求时确定
  }

  return { group: root, update };
}
