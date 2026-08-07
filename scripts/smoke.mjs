#!/usr/bin/env node

const baseUrl = (process.argv[2] || 'http://localhost:3001').replace(/\/$/, '');
const jinPeriodIds = ['jin-1120', 'jin-1142', 'jin-1200'];
const jinMetaPeriodIds = jinPeriodIds.map((id) => id.replace('jin-', ''));

function hasNonEmptyGeometry(geometry) {
  if (!geometry || !geometry.type || !Array.isArray(geometry.coordinates)) return false;
  const coordinates = JSON.stringify(geometry.coordinates);
  return coordinates !== '[]' && coordinates !== 'null' && coordinates.length > 2;
}

function isFeatureCollectionWithGeometry(value) {
  return value?.type === 'FeatureCollection'
    && Array.isArray(value.features)
    && value.features.length > 0
    && value.features.every((feature) => hasNonEmptyGeometry(feature.geometry));
}

const checks = [
  ['production page', '/', (response) => response.headers.get('content-type')?.includes('text/html')],
  ['health API', '/api/health', async (response) => response.status === 200 && (await response.json()).ok === true],
  ['events API', '/api/events?dynasty=song', async (response) => response.status === 200 && Array.isArray(await response.json())],
  ['Jin events API', '/api/events?dynasty=jin', async (response) => {
    if (response.status !== 200) return false;
    const events = await response.json();
    return Array.isArray(events)
      && events.length > 0
      && events.every((event) => event.dynasty === 'jin'
        && Number.isInteger(event.year)
        && Number.isInteger(event.yearEnd)
        && Array.isArray(event.coord)
        && event.coord.length === 2);
  }],
  ['dynasties API', '/api/dynasties', async (response) => {
    if (response.status !== 200) return false;
    const dynasties = await response.json();
    const jin = dynasties.find((dynasty) => dynasty.id === 'jin');
    return Array.isArray(dynasties)
      && jin?.name === '金朝'
      && jin.startYear === 1115
      && jin.endYear === 1234;
  }],
  ['Jin meta API', '/api/meta?dynasty=jin', async (response) => {
    if (response.status !== 200) return false;
    const meta = await response.json();
    return meta.dynasty === 'jin'
      && meta.name === '金朝'
      && meta.startYear === 1115
      && meta.endYear === 1234
      && Array.isArray(meta.periods)
      && jinMetaPeriodIds.every((id) => meta.periods.some((period) => period.id === id));
  }],
  ['overlay periods API', '/api/map/overlay/periods', async (response) => {
    if (response.status !== 200) return false;
    const periods = await response.json();
    return Array.isArray(periods)
      && jinPeriodIds.every((id) => periods.some((period) => period.id === id));
  }],
  ...jinPeriodIds.map((periodId) => [
    `Jin overlay ${periodId}`,
    `/api/map/overlay?dynasty=jin&period=${periodId.replace('jin-', '')}`,
    async (response) => response.status === 200 && isFeatureCollectionWithGeometry(await response.json()),
  ]),
  ['overlay API', '/api/map/overlay?dynasty=song&period=1111', async (response) => response.status === 200 && (await response.json()).type === 'FeatureCollection'],
];

let failed = false;
for (const [name, pathname, validate] of checks) {
  try {
    const response = await fetch(`${baseUrl}${pathname}`);
    const valid = await validate(response);
    if (!valid) throw new Error(`HTTP ${response.status}`);
    console.log(`[smoke] PASS ${name}`);
  } catch (error) {
    failed = true;
    console.error(`[smoke] FAIL ${name}: ${error.message}`);
  }
}

if (failed) process.exitCode = 1;
