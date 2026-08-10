import { describe, expect, it } from 'vitest';
import { resolveCollisions } from '../collisions.js';

function nodes(count) {
  return Array.from({ length: count }, (_, index) => ({
    year: index,
    rect: { x: index % 10, y: Math.floor(index / 10), w: 24, h: 14 },
  }));
}

describe('collision algorithm scales across representative event counts', () => {
  for (const count of [100, 500, 1000]) {
    it(`resolves ${count} nodes without invalid offsets`, () => {
      const result = resolveCollisions(nodes(count));
      expect(result).toHaveLength(count);
      expect(result.every(({ dx, dy }) => Number.isFinite(dx) && Number.isFinite(dy))).toBe(true);
    });
  }
});
