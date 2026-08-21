#!/usr/bin/env node
// 生成 overlay 合并 golden 期望值：以服务端参考实现
//（server/data/geo/historical/overlay-merge.js，与 GET /api/map/overlay 同一函数）
// 计算 contract/golden/overlay-merge.fixture.json 的期望响应，
// 写入 contract/golden/overlay-merge.expected.json。
//
// 双端（Node 契约脚本 / Android OverlayMergeGoldenTest）都以本文件产物为唯一期望，
// 任一端合并语义漂移测试即红（docs/architecture/codebase-review-plan.md A2 第一步）。
// 用法：node scripts/gen-overlay-golden.mjs

import { writeFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOverlayResponse } from '../server/data/geo/historical/overlay-merge.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = join(ROOT, 'contract', 'golden', 'overlay-merge.fixture.json');
const OUT = join(ROOT, 'contract', 'golden', 'overlay-merge.expected.json');

const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'));
const body = buildOverlayResponse({
  periodsIndex: fixture.files['periods.json'] ?? null,
  dynasty: fixture.dynasty,
  period: fixture.period,
  readFile: (filename) => fixture.files[filename] ?? null,
});

const out = {
  description: '由 scripts/gen-overlay-golden.mjs 生成（服务端参考实现 overlay-merge.js），勿手改；重新生成前请评审 diff。',
  dynasty: fixture.dynasty,
  period: fixture.period,
  expected: body,
};

writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
console.log(`已生成 ${OUT.replace(ROOT + '\\', '')}`);
console.log(`  features=${body.features.length} rivers=${body.properties.rivers.length} mountains=${body.properties.mountains.length} cities=${body.properties.cities.length} places=${body.properties.places.length} prefectures=${body.properties.prefectures.length} prefectureSeats=${body.properties.prefectureSeats.length}`);
