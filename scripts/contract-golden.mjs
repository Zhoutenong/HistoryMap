#!/usr/bin/env node
// 双端 golden 契约校验（Node 侧，A2 第一步）：
//   1. overlay 合并：server 参考实现（overlay-merge.js）对固定夹具的输出必须与
//      contract/golden/overlay-merge.expected.json 完全一致；
//   2. 投影：d3-geo 参考链路（与 gen-projection-golden.mjs 相同）对固定夹具的输出
//      必须与 contract/golden/projection.expected.json 一致（Web 真实 ChinaMap.js 的
//      golden 断言在 client vitest：client/src/map/__tests__/projection.golden.test.js；
//      Android 侧在 OverlayMergeGoldenTest / ProjectionGoldenTest）。
// 任一端数值/语义漂移（人为改动任一端而未同步另一端）时对应测试变红。
// 用法：npm run contract:golden

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoMercator, geoPath } from 'd3-geo';
import { buildOverlayResponse } from '../server/data/geo/historical/overlay-merge.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(ROOT, 'contract', 'golden', p), 'utf8'));

let failures = 0;
const fail = (msg) => { failures += 1; console.error(`  ✗ ${msg}`); };

// ---------- 1. overlay 合并 golden ----------
{
  const fixture = read('overlay-merge.fixture.json');
  const expectedFile = read('overlay-merge.expected.json');
  const actual = buildOverlayResponse({
    periodsIndex: fixture.files['periods.json'] ?? null,
    dynasty: fixture.dynasty,
    period: fixture.period,
    readFile: (filename) => fixture.files[filename] ?? null,
  });
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expectedFile.expected);
  if (a === e) {
    console.log(`✓ overlay 合并 golden（features=${actual.features.length}，rivers=${actual.properties.rivers.length}，prefectureSeats=${actual.properties.prefectureSeats.length}）`);
  } else {
    fail('overlay 合并输出与 golden 不一致');
    // 输出首个差异位置便于定位
    for (let i = 0; i < Math.max(a.length, e.length); i += 1) {
      if (a[i] !== e[i]) {
        console.error(`    首个差异 @${i}:\n      actual:   …${a.slice(Math.max(0, i - 40), i + 60)}…\n      expected: …${e.slice(Math.max(0, i - 40), i + 60)}…`);
        break;
      }
    }
  }
}

// ---------- 2. 投影 golden（d3-geo 参考链路自检） ----------
{
  const fixture = read('projection.fixture.json');
  const expectedFile = read('projection.expected.json');
  const [width, height] = fixture.fitSize;
  const projection = geoMercator();
  projection.fitSize([width, height], fixture.calibration);
  const bounds = geoPath(projection).bounds(fixture.calibration);
  const center = [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2];
  const project = (lngLat) => {
    const p = projection(lngLat);
    return [p[0] - center[0], center[1] - p[1]];
  };
  let ok = true;
  fixture.probes.forEach((lngLat, i) => {
    const [ax, ay] = project(lngLat);
    const [ex, ey] = expectedFile.expected[i];
    if (Math.abs(ax - ex) > 1e-5 || Math.abs(ay - ey) > 1e-5) {
      ok = false;
      fail(`投影探针[${i}] ${lngLat}：actual=[${ax}, ${ay}] expected=[${ex}, ${ey}]`);
    }
  });
  if (ok) console.log(`✓ 投影 golden（d3-geo 参考链路，${fixture.probes.length} 个探针点）`);
}

if (failures > 0) {
  console.error(`\ngolden 契约校验失败：${failures} 处不一致`);
  process.exit(1);
}
console.log('\ngolden 契约校验全部通过');
