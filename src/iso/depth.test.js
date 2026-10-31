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

describe('depthSort joints', () => {
  const ids = (ns) => ns.map((n) => n.it.id);
  it('draws a pillar over the wall running into it', () => {
    const wall = { x0: 0, y0: 0, x1: 60, y1: 10, z0: 0, z1: 36, it: { id: 'w', type: 'wall' } };
    const pillar = { x0: 50, y0: -5, x1: 70, y1: 15, z0: 0, z1: 40, it: { id: 'p', type: 'pillar' } };
    expect(ids(depthSort([pillar, wall]))).toEqual(['w', 'p']);
  });
  it('draws glass under the wall it runs into', () => {
    const glass = { x0: 0, y0: 3, x1: 50, y1: 7, z0: 0, z1: 36, it: { id: 'g', type: 'glass' } };
    const wall = { x0: 40, y0: 0, x1: 50, y1: 60, z0: 0, z1: 36, it: { id: 'w', type: 'wall' } };
    expect(ids(depthSort([wall, glass]))).toEqual(['g', 'w']);
  });
});
