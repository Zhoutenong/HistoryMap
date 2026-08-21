#!/usr/bin/env node
// 生成投影 golden 期望值：以 Web 参考实现（d3-geo，与 ChinaMap.js fitProjection/project
// 完全同一链路）计算 contract/golden/projection.fixture.json 的期望输出，
// 写入 contract/golden/projection.expected.json。
//
// 双端（Web vitest / Android JVM 单测）都以本文件产物为唯一期望——任一端投影
// 数学被改动而另一端未跟随时，对应端测试即红（详见 docs/architecture/codebase-review-plan.md A2）。
// 用法：node scripts/gen-projection-golden.mjs

import { writeFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoMercator, geoPath } from 'd3-geo';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = join(ROOT, 'contract', 'golden', 'projection.fixture.json');
const OUT = join(ROOT, 'contract', 'golden', 'projection.expected.json');

const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'));
const [width, height] = fixture.fitSize;

// —— 与 client/src/map/ChinaMap.js 完全一致的投影链路（参考实现）——
const projection = geoMercator();
projection.fitSize([width, height], fixture.calibration);
const bounds = geoPath(projection).bounds(fixture.calibration);
const center = [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2];
const project = (lngLat) => {
  const p = projection(lngLat);
  return [p[0] - center[0], center[1] - p[1]];
};

const expected = fixture.probes.map((lngLat) => project(lngLat).map((v) => Math.round(v * 1e6) / 1e6));

const out = {
  description: '由 scripts/gen-projection-golden.mjs 生成（Web 参考实现 d3-geo），勿手改；重新生成前请评审 diff。',
  fitSize: fixture.fitSize,
  expected,
};

writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
console.log(`已生成 ${OUT.replace(ROOT + '\\', '')}：${expected.length} 个探针点`);
expected.forEach((xy, i) => console.log(`  [${i}] ${fixture.probes[i]} -> [${xy[0]}, ${xy[1]}]`));
