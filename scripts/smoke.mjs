#!/usr/bin/env node

const baseUrl = (process.argv[2] || 'http://localhost:3001').replace(/\/$/, '');
const dynastyConfigs = [
  { id: 'jin', name: '金朝', start: 1115, end: 1234, periodIds: ['jin-1120', 'jin-1142', 'jin-1200'] },
  { id: 'liao', name: '辽朝', start: 916, end: 1125, periodIds: ['liao-1111'] },
  { id: 'yuan', name: '元朝', start: 1271, end: 1368, periodIds: ['yuan-1279', 'yuan-1300'] },
];

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

const allPeriodIds = dynastyConfigs.flatMap((config) => config.periodIds);

const checks = [
  ['production page', '/', (response) => response.headers.get('content-type')?.includes('text/html')],
  ['health API', '/api/health', async (response) => response.status === 200 && (await response.json()).ok === true],
  ['events API', '/api/events?dynasty=song', async (response) => response.status === 200 && Array.isArray(await response.json())],
  ...dynastyConfigs.flatMap((config) => [
    [`${config.id} events API`, `/api/events?dynasty=${config.id}`, async (response) => {
      if (response.status !== 200) return false;
      const events = await response.json();
      return Array.isArray(events)
        && events.length > 0
        && events.every((event) => event.dynasty === config.id
          && Number.isInteger(event.year)
          && Number.isInteger(event.yearEnd)
          && Array.isArray(event.coord)
          && event.coord.length === 2);
    }],
    [`${config.id} meta API`, `/api/meta?dynasty=${config.id}`, async (response) => {
      if (response.status !== 200) return false;
      const meta = await response.json();
      const periodIds = config.periodIds.map((id) => id.replace(`${config.id}-`, ''));
      return meta.dynasty === config.id
        && meta.name === config.name
        && meta.startYear === config.start
        && meta.endYear === config.end
        && Array.isArray(meta.periods)
        && periodIds.every((id) => meta.periods.some((period) => period.id === id));
    }],
    ...config.periodIds.map((periodId) => [
      `${config.id} overlay ${periodId}`,
      `/api/map/overlay?dynasty=${config.id}&period=${periodId.replace(`${config.id}-`, '')}`,
      async (response) => response.status === 200 && isFeatureCollectionWithGeometry(await response.json()),
    ]),
  ]),
  ['dynasties API', '/api/dynasties', async (response) => {
    if (response.status !== 200) return false;
    const dynasties = await response.json();
    return Array.isArray(dynasties)
      && dynastyConfigs.every((config) => {
        const found = dynasties.find((dynasty) => dynasty.id === config.id);
        return found?.name === config.name
          && found.startYear === config.start
          && found.endYear === config.end;
      });
  }],
  ['overlay periods API', '/api/map/overlay/periods', async (response) => {
    if (response.status !== 200) return false;
    const periods = await response.json();
    return Array.isArray(periods)
      && allPeriodIds.every((id) => periods.some((period) => period.id === id));
  }],
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
