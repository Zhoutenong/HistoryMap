// 双端投影 golden（Web 侧，A2 第一步）：用 contract/golden/projection.fixture.json
// 的固定标定点集走真实的 ChinaMap.js fitProjection/project 链路，输出必须与
// contract/golden/projection.expected.json 一致。Android 侧同数据集断言在
// android/app/src/test/.../ProjectionGoldenTest.kt——任一端投影数学漂移（改了
// 一端没改另一端）对应测试即红。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { fitProjection, project } from '../ChinaMap.js';

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../../contract/golden/projection.fixture.json', import.meta.url)), 'utf8'),
);
const expectedFile = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../../contract/golden/projection.expected.json', import.meta.url)), 'utf8'),
);

describe('双端投影 golden（ChinaMap vs Android MercatorProjection）', () => {
  test('fitSize 标定参数与期望文件一致', () => {
    expect(fixture.fitSize).toEqual([1000, 800]);
    expect(expectedFile.fitSize).toEqual([1000, 800]);
  });

  test('固定标定 + 探针点输出与 golden 一致', () => {
    fitProjection(fixture.calibration);
    fixture.probes.forEach((lngLat, i) => {
      const [x, y] = project(lngLat);
      const [ex, ey] = expectedFile.expected[i];
      // expected 由同链路生成后四舍五入到 1e-6，容差放宽一档防浮点舍入误报
      expect(x).toBeCloseTo(ex, 5);
      expect(y).toBeCloseTo(ey, 5);
    });
  });

  test('标定包围盒四角关于原点对称（居中不变式）', () => {
    fitProjection(fixture.calibration);
    // MultiPoint 标定点：首点为包围盒西南角、第 3 点为东北角
    const points = fixture.calibration.features[0].geometry.coordinates;
    const sw = project(points[0]);
    const ne = project(points[2]);
    expect(sw[0]).toBeCloseTo(-ne[0], 5);
    expect(sw[1]).toBeCloseTo(-ne[1], 5);
  });
});
