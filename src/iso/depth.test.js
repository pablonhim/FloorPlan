import { describe, expect, it } from 'vitest';
import { depthSort } from './depth.js';

describe('depthSort layers', () => {
  // a tall wall in front (larger y) of a pillar it covers on screen
  const pillar = { x0: 0, y0: 0, x1: 10, y1: 10, z0: 0, z1: 50, it: { id: 'p' } };
  const wall = { x0: 0, y0: 12, x1: 40, y1: 14, z0: 0, z1: 50, it: { id: 'w' } };
  const ids = (ns) => ns.map((n) => n.it.id);

  it('follows the geometry on the same layer', () => {
    expect(ids(depthSort([wall, pillar]))).toEqual(['p', 'w']);
  });
  it('draws a higher layer on top of what it overlaps', () => {
    expect(ids(depthSort([wall, { ...pillar, it: { id: 'p', layer: 1 } }]))).toEqual(['w', 'p']);
    expect(ids(depthSort([{ ...wall, it: { id: 'w', layer: -1 } }, pillar]))).toEqual(['w', 'p']);
  });
});
