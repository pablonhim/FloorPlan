// The newer objects (TV stand … glass doors): drawn inside their footprint and in a clean order in every
// rotation, the stool's colours, and the wall-hung pieces' rule (a wall or pillar right behind them).
import { describe, expect, it } from 'vitest';
import { partsFor, SIZES, LAYER, PALETTE } from '../model/catalog.js';
import { itemNode, renderItem } from './render.js';
import { placeRect } from './parts.js';
import { depthSort, behind, overlapOnScreen, intersect3d } from './depth.js';
import { validate } from './grid.js';
import { frame } from './kernel.js';
import { CELL } from './units.js';

const NEW = ['tvStand', 'wallTv', 'tvCart', 'plant', 'closet', 'curtain', 'rug', 'wallClock', 'printer', 'copier', 'glassDoor'];
const variants = [...NEW.map((type) => ({ type })), { type: 'glassDoor', w: 8, kind: 'entrance' }, { type: 'glassDoor', w: 4, kind: 'cabinet' },
  { type: 'stool', color: 'red' }];

describe('new objects', () => {
  it('keep their parts inside their box and sort them cleanly, in every rotation', () => {
    const out = [];
    for (const v of variants) for (const rot of [0, 90, 180, 270]) {
      const item = { id: 'x', gx: 5, gy: 5, rot, ...v }, key = `${v.type}${v.w || ''}@${rot}`;
      const n = itemNode(item), { W0, D0, parts } = partsFor(item);
      const nodes = [];
      for (const p of parts) {
        const w = placeRect(p, W0, D0, rot, item.gx * CELL, item.gy * CELL), e = 0.01;
        if (w.x < n.x0 - e || w.x + w.w > n.x1 + e || w.y < n.y0 - e || w.y + w.d > n.y1 + e) out.push(`${key} ${p.cls}: outside`);
        if (!p.flat && p.z + p.h > n.z1 + e) out.push(`${key} ${p.cls}: too tall`);
        if (!p.flat) nodes.push({ x0: w.x, y0: w.y, x1: w.x + w.w, y1: w.y + w.d, z0: p.z, z1: p.z + p.h, p });
      }
      const pos = new Map(depthSort(nodes).map((q, i) => [q, i]));
      for (const a of nodes) for (const b of nodes) {
        if (a === b || !overlapOnScreen(a, b)) continue;
        if (intersect3d(a, b)) out.push(`${key}: ${a.p.cls} intersects ${b.p.cls}`);
        else if (behind(a, b) && !behind(b, a) && pos.get(a) > pos.get(b)) out.push(`${key}: ${a.p.cls} over ${b.p.cls}`);
      }
      const K = frame([[0, 0, 0], [400, 400, 60]], 0.08, 4 / 3);
      expect(renderItem(K, item)).not.toMatch(/NaN|undefined/);
    }
    expect([...new Set(out)]).toEqual([]);
  });

  it('are in the objects menu, the plain door is not, and a red stool keeps its colour on its seat', () => {
    const offered = PALETTE.filter((g) => !g.core && g.panel !== false).flatMap((g) => g.types.map((t) => (typeof t === 'string' ? t : t.type)));
    for (const t of NEW) expect(offered).toContain(t);
    expect(offered).not.toContain('door');
    expect(SIZES.door).toBeTruthy();   // the layouts' own doors still draw
    expect(partsFor({ type: 'stool', color: 'red' }).parts.some((p) => /\bseat\b.*\bc-red\b/.test(p.cls))).toBe(true);
    expect(LAYER.rug).toBe('floor');
    expect(LAYER.glassDoor).toBe('structure');
  });

  it('hang a TV or clock only with a wall or pillar right behind it', () => {
    const plan = { cols: 60, rows: 60, mask: null };
    const wall = { id: 'w', type: 'wall', gx: 10, gy: 10, rot: 0, w: 10 };   // cells x 10–19, y 10
    const pillar = { id: 'p', type: 'pillar', gx: 30, gy: 10, rot: 0 };       // cells x 30–33, y 10–13
    const items = [wall, pillar];
    // facing +y (rot 0): its back is the row above it
    expect(validate(items, { id: 't', type: 'wallTv', gx: 12, gy: 11, rot: 0 }, plan)).toBeNull();
    expect(validate(items, { id: 't', type: 'wallTv', gx: 12, gy: 14, rot: 0 }, plan)).toBe('needs a wall or pillar behind it');
    // turned to face -y, hung on the wall's other side
    expect(validate(items, { id: 't', type: 'wallTv', gx: 12, gy: 9, rot: 180 }, plan)).toBeNull();
    // a clock on the pillar's east face (facing +x)
    expect(validate(items, { id: 'c', type: 'wallClock', gx: 34, gy: 11, rot: 270 }, plan) === null
      || validate(items, { id: 'c', type: 'wallClock', gx: 34, gy: 11, rot: 90 }, plan) === null).toBe(true);
    // a TV wider than the pillar still hangs on it when the pillar fills its middle and half its width
    expect(validate(items, { id: 't', type: 'wallTv', gx: 30, gy: 14, rot: 0 }, plan)).toBeNull();
    // it can hang over a TV stand, but not into the wall
    const stand = { id: 's', type: 'tvStand', gx: 11, gy: 11, rot: 0 };
    expect(validate([...items, stand], { id: 't', type: 'wallTv', gx: 12, gy: 11, rot: 0 }, plan)).toBeNull();
    expect(validate(items, { id: 't', type: 'wallTv', gx: 12, gy: 10, rot: 0 }, plan)).toMatch(/collides/);
  });
});
