const REQUIRED_PROPERTIES = ['id', 'name', 'kind', 'rank', 'style', 'source', 'license', 'confidence', 'note'];
const GEOMETRY_TYPES = new Set(['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon']);

function isCoordinate(value) {
  return Array.isArray(value) && value.length >= 2
    && Number.isFinite(value[0]) && Number.isFinite(value[1])
    && value[0] >= -180 && value[0] <= 180 && value[1] >= -90 && value[1] <= 90;
}

function coordinatesAreValid(value, type, depth = 0) {
  const pointTypes = new Set(['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon']);
  if (!pointTypes.has(type)) return false;
  if (depth === 0 && type === 'Point') return isCoordinate(value);
  if (depth === 0 && type === 'MultiPoint') return Array.isArray(value) && value.every(isCoordinate);
  if (depth === 0 && type === 'LineString') return Array.isArray(value) && value.length >= 2 && value.every(isCoordinate);
  if (depth === 0 && type === 'MultiLineString') return Array.isArray(value) && value.length > 0 && value.every((line) => coordinatesAreValid(line, 'LineString'));
  if (depth === 0 && type === 'Polygon') return Array.isArray(value) && value.length > 0 && value.every((ring) => Array.isArray(ring) && ring.length >= 4 && ring.every(isCoordinate));
  if (depth === 0 && type === 'MultiPolygon') return Array.isArray(value) && value.length > 0 && value.every((polygon) => coordinatesAreValid(polygon, 'Polygon'));
  return false;
}

export function validateGeoJSON(data) {
  const errors = [];
  if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    return { valid: false, errors: ['expected a GeoJSON FeatureCollection with features'] };
  }
  data.features.forEach((feature, index) => {
    const prefix = `features[${index}]`;
    if (!feature || feature.type !== 'Feature') errors.push(`${prefix}.type must be Feature`);
    if (!feature?.geometry || !GEOMETRY_TYPES.has(feature.geometry.type)) errors.push(`${prefix}.geometry has unsupported type`);
    else if (!coordinatesAreValid(feature.geometry.coordinates, feature.geometry.type)) errors.push(`${prefix}.geometry coordinates are invalid`);
    const props = feature?.properties;
    if (!props || typeof props !== 'object') errors.push(`${prefix}.properties must be an object`);
    else REQUIRED_PROPERTIES.forEach((key) => {
      if (props[key] === undefined || props[key] === null || props[key] === '') errors.push(`${prefix}.properties.${key} is required`);
    });
  });
  return { valid: errors.length === 0, errors };
}

export function filterGeoJSONByPeriod(data, periodId) {
  if (!data || !Array.isArray(data.features)) return { type: 'FeatureCollection', features: [] };
  return {
    ...data,
    features: data.features.filter((feature) => {
      const periods = feature.properties?.periods;
      return !Array.isArray(periods) || periods.length === 0 || periods.includes(periodId);
    }),
  };
}

export function featureCollectionToLegacy(features) {
  return features.map(({ properties = {}, geometry }) => {
    const coords = geometry?.coordinates;
    if (properties.kind === 'river') return { ...properties, path: coords };
    if (properties.kind === 'mountain') return { ...properties, coord: coords };
    if (properties.kind === 'city') return { ...properties, coord: coords };
    return properties;
  });
}

export { REQUIRED_PROPERTIES };
