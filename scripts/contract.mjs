#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIRED_PROPERTIES, validateGeoJSON } from '../server/data/geo/historical/geojson.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const geoDir = path.join(root, '..', 'server', 'data', 'geo', 'historical');
const files = ['rivers.geojson', 'mountains.geojson', 'cities.geojson'];
for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(geoDir, file), 'utf8'));
  const result = validateGeoJSON(data);
  assert.equal(result.valid, true, `${file}: ${result.errors.join('; ')}`);
  assert.ok(data.features.length > 0, `${file}: expected features`);
  for (const feature of data.features) {
    for (const property of REQUIRED_PROPERTIES) assert.notEqual(feature.properties[property], undefined, `${file}: missing ${property}`);
  }
}

const baseUrl = (process.argv[2] || '').replace(/\/$/, '');
if (baseUrl) {
  const response = await fetch(`${baseUrl}/api/map/overlay?dynasty=jin&period=1120`);
  assert.equal(response.status, 200);
  const overlay = await response.json();
  assert.equal(overlay.type, 'FeatureCollection');
  assert.ok(Array.isArray(overlay.features));
  assert.ok(overlay.features.length > 0);
  assert.ok(overlay.features.every((feature) => feature.type === 'Feature' && feature.geometry));
  assert.equal(overlay.properties?._periodId, 'jin-1120');
}
console.log(`[contract] PASS GeoJSON (${files.length} files)${baseUrl ? ' + API overlay' : ''}`);
