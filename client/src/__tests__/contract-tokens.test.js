// 双端契约快照（Web 侧，A2 第二步）：自动生成的 contract-tokens.js 数值必须与
// contract/tokens.json 完全一致——防止手改生成文件造成静默漂移。Android 侧由同一个
// 生成器产出 ContractTokens.kt，其一致性由 `npm run contract:tokens`（生成物与契约
// diff）守护——两端消费的数值同源，任一端漂移测试即红。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
  CONTRACT, PROJECTION, LOD, COLLISION, PLACE_KINDS, CATEGORIES, SPEEDS,
} from '../contract-tokens.js';

const json = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../contract/tokens.json', import.meta.url)), 'utf8'),
);

describe('双端共享契约（contract/tokens.json → contract-tokens.js）', () => {
  test('契约汇总版本与命名空间', () => {
    expect(CONTRACT.version).toBe(json.version);
    expect(CONTRACT.projection).toBe(PROJECTION);
    expect(CONTRACT.lod).toBe(LOD);
    expect(CONTRACT.collision).toBe(COLLISION);
    expect(CONTRACT.placeKinds).toBe(PLACE_KINDS);
    expect(CONTRACT.categories).toBe(CATEGORIES);
    expect(CONTRACT.speeds).toBe(SPEEDS);
  });

  test('投影 fitSize（ChinaMap.fitProjection / Android MercatorProjection）', () => {
    expect(PROJECTION.fitWidth).toBe(json.projection.fitWidth);
    expect(PROJECTION.fitHeight).toBe(json.projection.fitHeight);
  });

  test('LOD 档位矩阵（main.js nextLodTier / LodLevel.kt nextLod）', () => {
    expect(LOD.hysteresis).toBe(json.lod.hysteresis);
    expect([...LOD.thresholds]).toEqual([...json.lod.thresholds]);
  });

  test('碰撞参数（collisions.js / Collisions.kt）', () => {
    expect(COLLISION.gap).toBe(json.collision.gap);
    expect(COLLISION.maxPush).toBe(json.collision.maxPush);
    expect(COLLISION.viewportPad).toBe(json.collision.viewportPad);
  });

  test('地点类要素 kind 白名单（TerritoryOverlay.js / OverlayLoader.kt / overlay-merge.js）', () => {
    expect([...PLACE_KINDS]).toEqual([...json.placeKinds]);
  });

  test('设置项 schema：分类定义 + 播放速度（store.js / SettingsStore.kt）', () => {
    expect(CATEGORIES.map((c) => c.id)).toEqual(json.categories.map((c) => c.id));
    expect(CATEGORIES.map((c) => c.label)).toEqual(json.categories.map((c) => c.label));
    expect({ ...SPEEDS }).toEqual(json.speeds);
  });
});
