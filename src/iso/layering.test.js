// Layering audit over every seeded plan and whole floor: the depth order never puts a piece in front of
// one it is geometrically behind (where they cover each other on screen), joints follow the joint rule,
// door leaves never stack, and every item's parts stay inside the box the scene sorts it by.
import { describe, expect, it } from 'vitest';
import { seedPlan, PLANS, floorPlan, coreItems, toFloor, RENTED } from '../model/floors.js';
import { itemNode, edgeItems } from './render.js';
import { depthSort, behind, overlapOnScreen, intersect3d } from './depth.js';
import { partsFor, LAYER } from '../model/catalog.js';
import { placeRect } from './parts.js';
import { entryDoors, leafNode } from './doorSwing.js';
import { CELL } from './units.js';

const RANK = { glass: 1, partition: 2, wall: 3, pillar: 4 };
const rank = (n) => (n.slot ? 0 : RANK[n.it.type] ?? 5);
const label = (n) => (n.slot ? `leaf ${n.slot}` : `${n.it.type} ${n.it.id}`);

function problems(items, plan) {
  const nodes = [...items.filter((it) => LAYER[it.type] !== 'floor'), ...edgeItems(plan)].map((it) => ({ ...itemNode(it), it }))
    .concat(entryDoors(items).map((d) => ({ ...leafNode(d), slot: d.id })));
  const pos = new Map(depthSort(nodes).map((n, i) => [n, i])), out = [];
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j];
    if (!overlapOnScreen(a, b) || (a.it?.layer || 0) !== (b.it?.layer || 0)) continue;
    if (a.slot && b.slot && intersect3d(a, b)) out.push(`stacked leaves: ${label(a)} / ${label(b)}`);
    if (intersect3d(a, b)) {
      if (rank(a) !== rank(b) && (rank(a) < rank(b)) !== (pos.get(a) < pos.get(b))) out.push(`joint: ${label(a)} / ${label(b)}`);
    } else if (behind(a, b) && !behind(b, a) && pos.get(a) > pos.get(b)) out.push(`${label(a)} drawn over ${label(b)}`);
    else if (behind(b, a) && !behind(a, b) && pos.get(b) > pos.get(a)) out.push(`${label(b)} drawn over ${label(a)}`);
  }
  return out;
}

describe('layering', () => {
  for (const id of Object.keys(PLANS)) it(`unit ${id}`, () => expect(problems(seedPlan(id), PLANS[id])).toEqual([]));
  for (const f of RENTED) it(`floor ${f}`, () => {
    const plan = floorPlan(f);
    expect(problems([...plan.units.flatMap((u) => toFloor(seedPlan(u.id), u.ox, u.oy)), ...coreItems()], plan)).toEqual([]);
  });

  it("keeps every item's parts inside its box, in every rotation", () => {
    const out = [], seen = new Set();
    for (const id of Object.keys(PLANS)) for (const src of seedPlan(id)) for (const rot of [0, 90, 180, 270]) {
      const item = { ...src, rot }, key = `${src.type}${src.w}x${src.d}@${rot}${src.name ? 'n' : ''}${src.flip ? 'f' : ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const n = itemNode(item), { W0, D0, parts } = partsFor(item);
      for (const p of parts) {
        const w = placeRect(p, W0, D0, rot, item.gx * CELL, item.gy * CELL), e = 0.01;
        if (w.x < n.x0 - e || w.x + w.w > n.x1 + e || w.y < n.y0 - e || w.y + w.d > n.y1 + e) out.push(`${key} ${p.cls}: outside`);
        if (!p.flat && p.z + p.h > n.z1 + e) out.push(`${key} ${p.cls}: too tall`);
      }
    }
    expect(out).toEqual([]);
  });

  it("sorts every item's own parts cleanly", () => {
    const out = [], seen = new Set();
    for (const id of Object.keys(PLANS)) for (const src of seedPlan(id)) for (const rot of [0, 90, 180, 270]) {
      const key = `${src.type}@${rot}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const { W0, D0, parts } = partsFor({ ...src, rot });
      const nodes = parts.filter((p) => !p.flat).map((p) => { const w = placeRect(p, W0, D0, rot, 0, 0); return { x0: w.x, y0: w.y, x1: w.x + w.w, y1: w.y + w.d, z0: p.z, z1: p.z + p.h, p }; });
      const pos = new Map(depthSort(nodes).map((n, i) => [n, i]));
      for (const a of nodes) for (const b of nodes) {
        if (a === b || !overlapOnScreen(a, b)) continue;
        if (intersect3d(a, b)) out.push(`${key}: ${a.p.cls} intersects ${b.p.cls}`);
        else if (behind(a, b) && !behind(b, a) && pos.get(a) > pos.get(b)) out.push(`${key}: ${a.p.cls} over ${b.p.cls}`);
      }
    }
    expect([...new Set(out)]).toEqual([]);
  });
});
