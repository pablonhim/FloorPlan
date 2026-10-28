import { describe, expect, it } from 'vitest';
import { kernel } from './kernel.js';
import { footprint, rotateItem, snapOrigin, validate, normRot, centerGrab, onPlate } from './grid.js';
import { rotPoint, rotFace, placeRect } from './parts.js';
import { depthSort, behind } from './depth.js';
import { CELL } from './units.js';
import { renderItem, renderPlate, renderScene, edgeItems, planFrame as floorFrame } from './render.js';
import { SIZES } from '../model/catalog.js';
import { reducer, seedAll, sanitize, PLANS, UNITS, planId, floorPlan, toFloor, coreItems } from '../model/floors.js';
import LAYOUTS from '../model/layouts.json';
import { FOOTPRINT, PILLARS, facades, strips } from '../model/building.js';

const OPEN = { cols: 40, rows: 26 }; // plain rectangular plan without a mask

describe('projection', () => {
  const K = kernel(123.4, 56.7);
  it('unproject is the exact inverse of P on any horizontal plane', () => {
    for (const [x, y, z] of [[0, 0, 0], [37.5, 12, 0], [400, 260, 0], [15, 99, 8.2]]) {
      const [sx, sy] = K.P(x, y, z);
      const [wx, wy] = K.unproject(sx, sy, z);
      expect(wx).toBeCloseTo(x, 9);
      expect(wy).toBeCloseTo(y, 9);
    }
  });
});

describe('rotation matrices', () => {
  it('rotated points stay inside the rotated footprint', () => {
    for (const rot of [0, 90, 180, 270]) {
      const [W, D] = rot % 180 ? [40, 60] : [60, 40];
      for (const [lx, ly] of [[0, 0], [60, 0], [0, 40], [60, 40], [12, 7]]) {
        const [x, y] = rotPoint(lx, ly, 60, 40, rot);
        expect(x).toBeGreaterThanOrEqual(-1e-9); expect(x).toBeLessThanOrEqual(W + 1e-9);
        expect(y).toBeGreaterThanOrEqual(-1e-9); expect(y).toBeLessThanOrEqual(D + 1e-9);
      }
    }
  });
  it('local front (+y) faces +y, -x, -y, +x as the item turns', () => {
    expect([0, 90, 180, 270].map((r) => rotFace('+y', r))).toEqual(['+y', '-x', '-y', '+x']);
  });
  it('parts map to rectangles of the same size', () => {
    const r = placeRect({ x: 2, y: 4, w: 10, d: 3 }, 20, 20, 90, 100, 50);
    expect([r.w, r.d]).toEqual([3, 10]);
  });
});

describe('grid snapping', () => {
  it('normalises to 90° steps', () => {
    expect([0, 89, 90, 360, -90, 450].map(normRot)).toEqual([0, 90, 90, 0, 270, 90]);
  });
  it('swaps footprint at 90° and 270°, honouring per-item sizes', () => {
    expect(footprint({ type: 'desk', rot: 0 })).toEqual({ w: 7, d: 6 });
    expect(footprint({ type: 'desk', rot: 90 })).toEqual({ w: 6, d: 7 });
    expect(footprint({ type: 'wall', rot: 90, w: 25 })).toEqual({ w: 1, d: 25 });
    expect(footprint({ type: 'pillar', rot: 0, w: 99 })).toEqual({ w: 4, d: 4 }); // not sizable
  });
  it('snaps to whole cells and clamps to the plan', () => {
    const f = footprint({ type: 'pillar', rot: 0 });
    expect(snapOrigin(57.9, 21.2, f, OPEN, centerGrab(f))).toEqual({ gx: 3, gy: 0 });
    expect(snapOrigin(-30, -30, f, OPEN)).toEqual({ gx: 0, gy: 0 });
    expect(snapOrigin(1e6, 1e6, f, OPEN)).toEqual({ gx: OPEN.cols - 4, gy: OPEN.rows - 4 });
    const o = snapOrigin(12.345 * CELL, 7.89 * CELL, f, OPEN);
    expect(Number.isInteger(o.gx) && Number.isInteger(o.gy)).toBe(true);
  });
  it('rejects collisions, off-grid, off-step rotation and out of bounds', () => {
    const items = [{ id: 'a', type: 'stool', gx: 5, gy: 5, rot: 0 }];
    expect(validate(items, { id: 'b', type: 'desk', gx: 0, gy: 0, rot: 0 }, OPEN)).toMatch(/collides/);
    expect(validate(items, { id: 'b', type: 'desk', gx: 7, gy: 0, rot: 0 }, OPEN)).toBeNull();
    expect(validate(items, { id: 'b', type: 'desk', gx: 7.5, gy: 0, rot: 0 }, OPEN)).toMatch(/grid/);
    expect(validate(items, { id: 'b', type: 'desk', gx: 7, gy: 0, rot: 45 }, OPEN)).toMatch(/90/);
    expect(validate(items, { id: 'b', type: 'desk', gx: 39, gy: 0, rot: 0 }, OPEN)).toMatch(/outside/);
  });
  it('layers: zones never collide, walls may meet pillars, furniture may not sit in walls', () => {
    const items = [{ id: 'p', type: 'pillar', gx: 10, gy: 10, rot: 0 }, { id: 'z', type: 'zone', gx: 0, gy: 0, rot: 0, w: 30, d: 20 }];
    expect(validate(items, { id: 'w', type: 'wall', gx: 0, gy: 11, rot: 0, w: 20 }, OPEN)).toBeNull();
    expect(validate(items, { id: 's', type: 'stool', gx: 11, gy: 11, rot: 0 }, OPEN)).toMatch(/collides/);
    expect(validate(items, { id: 's', type: 'stool', gx: 2, gy: 2, rot: 0 }, OPEN)).toBeNull();
  });
  it('respects the plate mask (L-shaped units)', () => {
    const plan = { cols: 6, rows: 6, mask: ['11', '10'] }; // bottom-right tile missing
    expect(onPlate({ x0: 0, y0: 0, x1: 6, y1: 3 }, plan)).toBe(true);
    expect(onPlate({ x0: 2, y0: 2, x1: 4, y1: 4 }, plan)).toBe(false);
  });
  it('four rotations return an item to where it started, odd and even sizes', () => {
    for (const a of [{ id: 'x', type: 'desk', gx: 10, gy: 10, rot: 0 }, { id: 'y', type: 'zone', gx: 5, gy: 5, rot: 0, w: 8, d: 4 }]) {
      let b = a;
      for (let i = 0; i < 4; i++) b = rotateItem(b, OPEN);
      expect(b).toEqual(a);
    }
  });
});

describe('depth sort', () => {
  it('paints boxes behind (smaller x or y) first', () => {
    const n = (x0, y0, w, d, z0 = 0, h = 10) => ({ x0, y0, x1: x0 + w, y1: y0 + d, z0, z1: z0 + h });
    const back = n(0, 0, 10, 10), right = n(20, 0, 10, 40), front = n(0, 20, 10, 10), top = n(0, 0, 10, 10, 10, 2);
    expect(behind(back, front)).toBe(true);
    const order = depthSort([front, top, right, back]);
    expect(order.indexOf(back)).toBeLessThan(order.indexOf(front));
    expect(order.indexOf(back)).toBeLessThan(order.indexOf(top));
    expect(order.indexOf(back)).toBeLessThan(order.indexOf(right));
  });
});

describe('official layout (PDF 2026-09-29)', () => {
  const seeds = seedAll();
  it('has floor 2 with units A–D and floor 4 with units C and D', () => {
    expect(Object.keys(PLANS).sort()).toEqual(['2A', '2B', '2C', '2D', '4C', '4D']);
    expect(UNITS[2]).toEqual(['A', 'B', 'C', 'D']);
    expect(UNITS[4]).toEqual(['C', 'D']);
  });
  it('splits PDF page 4 into Unit A (Webcash / Local Solutions) and Unit B (R&D / Global / HQ)', () => {
    const named = (id) => seeds[id].filter((i) => i.type === 'desk' && i.name).map((i) => i.name);
    expect(named('2A')).toEqual(expect.arrayContaining(['정인성 팀장', '쏙라', '짠나앗']));
    expect(named('2B')).toEqual(expect.arrayContaining(['최기종 부대표', '체트라', '처언']));
    const zones = (id) => seeds[id].filter((i) => i.type === 'zone').map((z) => z.label);
    expect(zones('2A')).toEqual(expect.arrayContaining(['매꽁 회의실', 'GA 스토리지', '웹케시', '로컬솔루션']));
    expect(zones('2B')).toEqual(expect.arrayContaining(['앞싸라 회의실', 'HQ · 최기종 부대표', 'IT 인프라']));
    expect(PLANS['2B'].legendStart).toBe(4);
  });
  it('loads every item from the PDF with nothing dropped by validation (doubled door leaves merged)', () => {
    for (const id of Object.keys(PLANS)) {
      const notDoor = (i) => i.type !== 'door';
      expect(seeds[id].filter(notDoor)).toHaveLength(LAYOUTS[id].items.filter(notDoor).length);
      // a door appears once per hinge column: no two doors share a column within 3 cells
      const doors = seeds[id].filter((i) => i.type === 'door');
      for (const a of doors) expect(doors.filter((b) => b !== a && b.gx === a.gx && (b.rot || 0) === (a.rot || 0) && Math.abs(b.gy - a.gy) <= 3)).toHaveLength(0);
    }
  });
  it('places the pillars (សសរ) of every unit and the named employees', () => {
    for (const id of ['2C', '2D', '4C', '4D']) expect(seeds[id].filter((i) => i.type === 'pillar')).toHaveLength(10);
    expect(seeds['2A'].filter((i) => i.type === 'pillar').length + seeds['2B'].filter((i) => i.type === 'pillar').length).toBe(12);
    const names = (id) => seeds[id].filter((i) => i.type === 'desk' && i.name).map((i) => i.name);
    expect(names('2C')).toContain('스레이닌');
    expect(names('2D')).toContain('사라윳');
    expect(names('4C')).toEqual(expect.arrayContaining(['싸카리 (CSO)', '쀠뚜 (CMO)']));
  });
  it('has the named rooms', () => {
    const zones = (id) => seeds[id].filter((i) => i.type === 'zone').map((z) => z.label);
    expect(zones(planId(2, 'C'))).toEqual(expect.arrayContaining(['서울 회의실', '앙코르 회의실', '캐비닛 실']));
    expect(zones(planId(2, 'D'))).toEqual(expect.arrayContaining(['제주 회의실', '서버실']));
    expect(zones(planId(4, 'C'))).toEqual(expect.arrayContaining(['CEO', '바욘 회의실', 'GM']));
    expect(zones(planId(4, 'D'))).toEqual(expect.arrayContaining(['위카페', '위카페 바리스타', '남성 마사지 실', '여성 마사지 실']));
  });
  it('renders every unit without NaN', () => {
    for (const id of Object.keys(PLANS)) {
      const K = floorFrame(PLANS[id]);
      let s = renderPlate(K, PLANS[id]);
      for (const it of [...seeds[id], ...edgeItems(PLANS[id])]) s += renderItem(K, it);
      expect(s).not.toMatch(/NaN|undefined|Infinity/);
    }
    for (const t of Object.keys(SIZES)) for (const rot of [0, 90, 180, 270]) {
      expect(renderItem(floorFrame(PLANS['2C']), { id: 'x', type: t, gx: 3, gy: 3, rot, on: true, name: 'A B', w: 5, d: 4 }, 12)).not.toMatch(/NaN|undefined/);
    }
  });
});

describe('floor level (all units)', () => {
  it('lays the units out as on the key plan, with every item still on the plate', () => {
    const seeds = seedAll();
    expect(floorPlan(2).units.map((u) => [u.unit, u.ox, u.oy])).toEqual([['A', 15, 99], ['B', 78, 99], ['C', 0, 0], ['D', 78, 0]]);
    expect(floorPlan(4).units.map((u) => [u.unit, u.ox, u.oy])).toEqual([['C', 0, 0], ['D', 78, 0]]);
    for (const f of [2, 4]) {
      const fp = floorPlan(f);
      const all = fp.units.flatMap((u) => toFloor(seeds[u.id], u.ox, u.oy));
      for (const it of all) expect(onPlate({ x0: it.gx, y0: it.gy, x1: it.gx + footprint(it).w, y1: it.gy + footprint(it).d }, fp)).toBe(true);
      expect(renderScene(floorFrame(fp), fp, all)).not.toMatch(/NaN|undefined/);
    }
  });
});

describe('building core (full-floor view only)', () => {
  it('places twin elevators and both WCs on the plate, clear of every unit item', () => {
    const seeds = seedAll();
    for (const f of [2, 4]) {
      const fp = floorPlan(f);
      const units = fp.units.flatMap((u) => toFloor(seeds[u.id], u.ox, u.oy));
      const core = coreItems();
      expect(core.filter((i) => i.type === 'elevator')).toHaveLength(4);
      expect(core.filter((i) => i.type === 'wc').map((i) => i.gender).sort()).toEqual(['f', 'm']);
      expect(core.filter((i) => i.type === 'cabinet')).toHaveLength(0); // Unit A/B side cleared
      const rooms = core.filter((i) => i.type === 'storeroom');
      const lift = core.find((i) => i.type === 'elevator');
      expect(rooms).toHaveLength(2);
      for (const r of rooms) expect([r.gy, footprint(r).w, footprint(r).d]).toEqual([lift.gy, 2 * footprint(lift).w, footprint(lift).d]); // two shafts' size, same wall line
      for (const it of core) expect(validate(units, it, fp)).toBeNull();
      expect(renderScene(floorFrame(fp), fp, [...units, ...core])).not.toMatch(/NaN|undefined/);
    }
  });
  it('is never part of a unit layout', () => {
    for (const items of Object.values(seedAll())) expect(items.some((i) => ['elevator', 'wc', 'restroom', 'stair', 'cabinet', 'storeroom'].includes(i.type))).toBe(false);
  });
});

describe('building footprint (key plan)', () => {
  it('is a closed rectilinear outline, symmetric east–west', () => {
    for (let i = 0; i < FOOTPRINT.length; i++) {
      const [a, b] = [FOOTPRINT[i], FOOTPRINT[(i + 1) % FOOTPRINT.length]];
      expect(a[0] === b[0] || a[1] === b[1]).toBe(true);
    }
    const W = Math.max(...FOOTPRINT.map((p) => p[0]));
    for (const [x, y] of FOOTPRINT) expect(FOOTPRINT.some(([u, v]) => Math.abs(u - (W - x)) < 0.15 && v === y)).toBe(true);
  });
  it('cuts into strips that cover it exactly and contain every pillar', () => {
    const rects = strips();
    const area = rects.reduce((a, r) => a + (r.x1 - r.x0) * (r.y1 - r.y0), 0);
    let shoelace = 0;
    FOOTPRINT.forEach(([x, y], i) => { const [u, v] = FOOTPRINT[(i + 1) % FOOTPRINT.length]; shoelace += x * v - u * y; });
    expect(area).toBeCloseTo(Math.abs(shoelace) / 2, 6);
    for (const [px, py] of PILLARS) expect(rects.some((r) => px >= r.x0 && px <= r.x1 && py >= r.y0 && py <= r.y1)).toBe(true);
  });
  it('shows the stepped façades as separate visible faces', () => {
    const f = facades();
    expect(f.filter((x) => x.kind === 'front').length).toBeGreaterThanOrEqual(6);
    expect(f.filter((x) => x.kind === 'side').length).toBeGreaterThanOrEqual(6);
  });
});

describe('reducer', () => {
  it('refuses invalid moves and supports undo', () => {
    const s0 = { plans: { '2C': [{ id: 'a', type: 'stool', gx: 3, gy: 3, rot: 0 }, { id: 'b', type: 'stool', gx: 9, gy: 3, rot: 0 }] }, past: [] };
    expect(reducer(s0, { type: 'move', plan: '2C', id: 'b', gx: 3, gy: 3 })).toBe(s0);
    const s1 = reducer(s0, { type: 'move', plan: '2C', id: 'b', gx: 6, gy: 3 });
    expect(s1.plans['2C'][1].gx).toBe(6);
    expect(reducer(s1, { type: 'undo' }).plans).toBe(s0.plans);
  });
  it('sanitize drops colliding and off-plate items', () => {
    const out = sanitize([{ type: 'stool', gx: 3, gy: 3, rot: 0 }, { type: 'stool', gx: 3, gy: 3, rot: 0 }, { type: 'desk', gx: 0, gy: 80, rot: 0 }], PLANS['2C']);
    expect(out).toHaveLength(1); // duplicate collides; desk at bottom-left is off the L-shaped plate
  });
});
