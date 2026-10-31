// Welcome door swing: when a floor or unit view opens, its entrance doors are shown as real, upright
// door leaves that swing open on their hinge, back past the frame a little, and settle shut — rather
// than the flat door symbol drawn on the floor. A short rAF animation writes only these few leaves.
import { useEffect } from 'react';
import { CELL, WALL_H } from './units.js';
import { cellRect, footprint } from './grid.js';

/**
 * Doors drawn as swinging glass leaves: those of an office entrance (within 6 cells of a zone of kind
 * 'entrance'; not core doors), the server room's glass door (touching a zone of kind 'server') and one
 * door per meeting room and executive office (see roomDoors).
 */
export function entryDoors(items) {
  const ents = items.filter((z) => z.type === 'zone' && z.kind === 'entrance');
  const near = (d, z) => d.gx + 4 >= z.gx - 6 && d.gx <= z.gx + z.w + 6 && d.gy + 4 >= z.gy - 6 && d.gy <= z.gy + z.d + 6;
  const dist = (d, z) => Math.hypot(d.gx + 2 - (z.gx + z.w / 2), d.gy + 2 - (z.gy + z.d / 2));
  // the imported layouts draw some double doors twice (two rows of leaves a few cells apart): keep one
  // leaf per hinge column — the one nearest its entrance — so a double door swings exactly two leaves
  const best = new Map();
  for (const d of items) {
    if (d.type !== 'door' || String(d.id).startsWith('core')) continue;
    const z = ents.find((e) => near(d, e));
    if (!z) continue;
    const key = `${z.id}:${d.gx}`, cur = best.get(key);
    if (!cur || dist(d, z) < dist(cur, z)) best.set(key, d);
  }
  const servers = items.filter((z) => z.type === 'zone' && z.kind === 'server');
  const touches = (d, z) => d.gx + 4 >= z.gx - 1 && d.gx <= z.gx + z.w + 1 && d.gy + 4 >= z.gy - 1 && d.gy <= z.gy + z.d + 1;
  for (const d of items) {
    if (d.type === 'door' && !String(d.id).startsWith('core') && servers.some((z) => touches(d, z))) best.set(`server:${d.id}`, d);
  }
  const meet = roomDoors(items), ids = new Set(meet.map((m) => m.id));
  const lines = items.filter((w) => w.type === 'glass' || w.type === 'wall').map((w) => cellRect(w));
  const toward = (d) => ents.reduce((a, z) => (!a || dist(d, z) < dist(d, a) ? z : a), null);
  return [...[...best.values()].filter((d) => !ids.has(d.id)).map((d) => lineLeaf(d, lines, toward(d)) || d), ...meet];
}

/**
 * An entrance (or server-room) door as a leaf lying in the wall / glass line it sits in — the imported doors
 * are all stored at 0°, so their rotation does not say which way the wall runs: the nearest run through the
 * door's 4 × 4 cells does. The leaf spans the door's own part of the opening in that line (a double door's
 * two leaves meet in the middle), hinged at its start (its end when flipped), and swings toward the entrance
 * zone `to` (else into the unit, +y / +x). Null when no wall runs by it (the door's own rotation is used).
 */
function lineLeaf(d, lines, to) {
  const cx = d.gx + 2, cy = d.gy + 2;
  const runs = (vert) => lines.filter((r) => (vert
    ? r.y1 - r.y0 >= r.x1 - r.x0 && Math.abs((r.x0 + r.x1) / 2 - cx) <= 3 && r.y0 <= d.gy + 8 && r.y1 >= d.gy - 4
    : r.x1 - r.x0 >= r.y1 - r.y0 && Math.abs((r.y0 + r.y1) / 2 - cy) <= 3 && r.x0 <= d.gx + 8 && r.x1 >= d.gx - 4));
  const off = (vert) => Math.min(Infinity, ...runs(vert).map((r) => Math.abs((vert ? (r.x0 + r.x1) / 2 - cx : (r.y0 + r.y1) / 2 - cy))));
  const vert = off(true) < off(false);
  const rs = runs(vert);
  if (!rs.length) return null;
  const mid = (r) => (vert ? (r.x0 + r.x1) / 2 : (r.y0 + r.y1) / 2);
  const line = mid(rs.reduce((a, b) => (Math.abs(mid(b) - (vert ? cx : cy)) < Math.abs(mid(a) - (vert ? cx : cy)) ? b : a)));
  const onLine = rs.filter((r) => Math.abs(mid(r) - line) <= 1).map((r) => (vert ? [r.y0, r.y1] : [r.x0, r.x1]));
  const s0 = vert ? d.gy : d.gx, free = (c) => !onLine.some(([c0, c1]) => c0 <= c && c < c1);
  // the door's own cells of the opening (a double door's leaves each take their half)
  let g0 = s0, g1 = s0 + 4;
  while (g0 < g1 && !free(g0)) g0++;
  while (g1 > g0 && !free(g1 - 1)) g1--;
  if (g1 - g0 < 2) { g0 = s0; g1 = s0 + 4; }
  const len = (g1 - g0) * CELL - 2, a = d.flip ? g1 * CELL - 1 : g0 * CELL + 1, along = d.flip ? -1 : 1;
  const side = to ? Math.sign((vert ? to.gx + to.w / 2 : to.gy + to.d / 2) - line) || 1 : 1;
  return {
    id: d.id, len,
    H: vert ? [line * CELL, a] : [a, line * CELL],
    shut: vert ? [0, along] : [along, 0],
    open: vert ? [side, 0] : [0, side],
  };
}

/**
 * One glass door per meeting room and executive office (HQ, CEO): of the doors on the room's edge, the one nearest a glass wall (its
 * glass front). The imported doors are all stored at 0°, so the leaf is not taken from the door's
 * rotation: it lies along the room edge the door sits on, on that edge's wall / glass line, spans just the
 * opening in that line (hinged at its start, its end when flipped), and swings into the room. Returns leaf descriptors
 * { id, H: hinge, shut, open, len } in world units.
 */
const DOOR_ROOMS = new Set(['meeting', 'ceo']);
export function roomDoors(items) {
  const lines = items.filter((w) => w.type === 'glass' || w.type === 'wall').map((w) => ({ w, r: cellRect(w) }));
  const glass = lines.filter((l) => l.w.type === 'glass');
  const gap = (r, x, y) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.y0 - y, 0, y - r.y1));
  const out = [];
  for (const z of items.filter((i) => i.type === 'zone' && DOOR_ROOMS.has(i.kind))) {
    const f = footprint(z), x0 = z.gx, y0 = z.gy, x1 = z.gx + f.w, y1 = z.gy + f.d;
    // doors centred on the room's edge (within 2 cells of it), and the room's own glass
    const zr = { x0, y0, x1, y1 };
    const doors = items.filter((d) => d.type === 'door' && !String(d.id).startsWith('core') && gap(zr, d.gx + 2, d.gy + 2) <= 2);
    if (!doors.length) continue;
    const own = glass.filter((l) => gap(zr, (l.r.x0 + l.r.x1) / 2, (l.r.y0 + l.r.y1) / 2) <= 2);
    const toGlass = (d) => (own.length ? Math.min(...own.map((l) => gap(l.r, d.gx + 2, d.gy + 2))) : 0);
    // the door most on this room's edge (not a neighbour's door just outside it), then the one by the glass
    const rank = (d) => gap(zr, d.gx + 2, d.gy + 2) * 100 + toGlass(d);
    const d = doors.reduce((a, b) => (rank(b) < rank(a) ? b : a));
    const cx = d.gx + 2, cy = d.gy + 2;
    // wall / glass runs along a room edge that reach the door's span on it (within a cell)
    const EDGE = { w: x0, e: x1, n: y0, s: y1 };
    const runsOn = (side) => {
      const vert = side === 'w' || side === 'e', edge = EDGE[side], a0 = vert ? d.gy : d.gx;
      return lines.map((l) => l.r).filter((r) => (vert
        ? r.y1 - r.y0 >= r.x1 - r.x0 && Math.abs((r.x0 + r.x1) / 2 - edge) <= 2 && r.y0 <= a0 + 5 && r.y1 >= a0 - 1
        : r.x1 - r.x0 >= r.y1 - r.y0 && Math.abs((r.y0 + r.y1) / 2 - edge) <= 2 && r.x0 <= a0 + 5 && r.x1 >= a0 - 1));
    };
    // how much of the door's span is an opening in that edge's wall (0 when no wall runs beside it)
    const opening = (side) => {
      const vert = side === 'w' || side === 'e', a0 = vert ? d.gy : d.gx, rs = runsOn(side);
      if (!rs.length) return 0;
      let open = 0;
      for (let a = a0; a < a0 + 4; a++) if (!rs.some((r) => (vert ? r.y0 <= a && a < r.y1 : r.x0 <= a && a < r.x1))) open++;
      return open;
    };
    // the nearest room edge; between edges about as near (a door at a corner), the one whose wall has an
    // opening at the door; on a tie still, the north / south wall (the source's 0° door symbols sit in one)
    const dist = { n: Math.abs(cy - y0), s: Math.abs(cy - y1), w: Math.abs(cx - x0), e: Math.abs(cx - x1) };
    const near = Math.min(...Object.values(dist));
    const side = ['n', 's', 'w', 'e'].filter((k) => dist[k] <= near + 1)
      .reduce((a, b) => (opening(b) > opening(a) || (opening(b) === opening(a) && dist[b] < dist[a]) ? b : a));
    const vert = side === 'w' || side === 'e', edge = EDGE[side];
    // the wall line: the centre of a wall / glass run along that edge beside the door, else the edge
    const runs = runsOn(side);
    const mid = (r) => (vert ? (r.x0 + r.x1) / 2 : (r.y0 + r.y1) / 2);
    const line = (runs.length ? mid(runs.reduce((a, b) => (Math.abs(mid(b) - edge) < Math.abs(mid(a) - edge) ? b : a))) : edge) * CELL;
    // the leaf fills the actual opening in that wall line, not the 80 cm door symbol (which overlaps the
    // wall / glass either side): the free cells round the door's span, between the runs that bound them
    const cover = lines.map((l) => l.r).filter((r) => (vert
      ? r.y1 - r.y0 >= r.x1 - r.x0 && Math.abs((r.x0 + r.x1) / 2 - edge) <= 2
      : r.x1 - r.x0 >= r.y1 - r.y0 && Math.abs((r.y0 + r.y1) / 2 - edge) <= 2)).map((r) => (vert ? [r.y0, r.y1] : [r.x0, r.x1]));
    // …and never past the room's own extent along that edge (a crossing wall at a corner bounds it there)
    const [e0, e1] = vert ? [y0, y1] : [x0, x1];
    const free = (c) => c >= e0 && c < e1 && !cover.some(([c0, c1]) => c0 <= c && c < c1);
    const s0 = vert ? d.gy : d.gx;
    let g0 = s0, g1 = s0 + 4;
    const start = [s0 + 1, s0 + 2, s0, s0 + 3].find(free);   // a free cell of the span, middle first
    if (start !== undefined) {
      g0 = start; while (g0 > s0 - 4 && free(g0 - 1)) g0--;
      g1 = start + 1; while (g1 < s0 + 8 && free(g1)) g1++;
    }
    const len = (g1 - g0) * CELL - 2, a = d.flip ? g1 * CELL - 1 : g0 * CELL + 1, along = d.flip ? -1 : 1;
    out.push({
      id: d.id, len,
      H: vert ? [line, a] : [a, line],
      shut: vert ? [0, along] : [along, 0],
      open: { w: [1, 0], e: [-1, 0], n: [0, 1], s: [0, -1] }[side],
    });
  }
  return out;
}

/** Ids of the doors drawn as standing glass leaves (entryDoors: entrances, the server room, meeting rooms and
 *  offices); their flat floor symbol is hidden. */
export const roomDoorIds = (items) => new Set(entryDoors(items).map((m) => m.id));

/**
 * The upright leaf of door `d` (a 4 × 4-cell door part, hinge at its local (2, 2), shut along local +x,
 * open along local +y; turned by d.rot about its centre) at swing phase phi (0 shut, 1 fully open,
 * negative: past the frame the other way).
 */
function frameOf(d) {
  if (d.H) return d;   // a leaf descriptor (roomDoors, lineLeaf)
  const S = 4 * CELL, cx = d.gx * CELL + S / 2, cy = d.gy * CELL + S / 2, a = ((d.rot || 0) * Math.PI) / 180;
  const rot = ([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  // a mirrored leaf (d.flip, the right leaf of a double door) hinges at the other end and shuts the other way
  const [hx, hy] = rot([d.flip ? S / 2 - 2 : 2 - S / 2, 2 - S / 2]);
  return { id: d.id, shut: rot([d.flip ? -1 : 1, 0]), open: rot([0, 1]), len: S - 4, H: [cx + hx, cy + hy] };
}
const LEAF_H = WALL_H * 0.85;
export function leaf(K, d, phi) {
  const { H, shut, open, len } = frameOf(d);
  const t = (phi * Math.PI) / 2;
  const dir = [shut[0] * Math.cos(t) + open[0] * Math.sin(t), shut[1] * Math.cos(t) + open[1] * Math.sin(t)];
  const T = [H[0] + dir[0] * len, H[1] + dir[1] * len];
  // one pane, outlined in the glass's own line (no dark edge stroke down its free side)
  return `<path class="door-panel" d="${K.path([[H[0], H[1], 0], [T[0], T[1], 0], [T[0], T[1], LEAF_H], [H[0], H[1], LEAF_H]])}Z"/>`;
}

/**
 * Where a swinging leaf sits in the depth order: a thin box along its shut line (world units, a depth-sort
 * node). The views draw an empty slot <g data-door="id"> at that place among the solids, and the swing
 * writes each leaf into its slot, so walls and furniture in front of a door still cover it.
 */
export function leafNode(d) {
  const { H, shut, len } = frameOf(d), T = [H[0] + shut[0] * len, H[1] + shut[1] * len];
  return { x0: Math.min(H[0], T[0]) - 1, x1: Math.max(H[0], T[0]) + 1, y0: Math.min(H[1], T[1]) - 1, y1: Math.max(H[1], T[1]) + 1, z0: 0, z1: LEAF_H, door: d.id };
}
export const leafSlot = (id) => `<g class="door-slot" data-door="${id}"></g>`;

// swing profile over the animation: open, back past the frame, settle shut
const KEYS = [[0, 0], [0.38, 0.85], [0.66, -0.18], [0.84, 0.06], [1, 0]];
const ease = (k) => 1 - (1 - k) ** 2;
function phase(k) {
  for (let i = 1; i < KEYS.length; i++) {
    const [k0, v0] = KEYS[i - 1], [k1, v1] = KEYS[i];
    if (k <= k1) return v0 + (v1 - v0) * ease((k - k0) / (k1 - k0));
  }
  return 0;
}

/**
 * Plays the swing whenever `key` changes (e.g. the floor or unit shown): each leaf is written into its slot
 * among the solids (leafSlot) inside the svg behind `ref`; a leaf without a slot goes into `ref` itself.
 */
export function useDoorSwing(ref, K, doors, key, ms = 1300) {
  useEffect(() => {
    const g = ref.current;
    if (!g || !doors.length) { if (g) g.innerHTML = ''; return undefined; }
    const svg = g.ownerSVGElement || g;
    const draw = (phi) => {
      let loose = '';
      for (const d of doors) {
        const slot = svg.querySelector(`.door-slot[data-door="${CSS.escape(d.id)}"]`), html = leaf(K, d, phi);
        if (slot) slot.innerHTML = html; else loose += html;
      }
      g.innerHTML = loose;
    };
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) { draw(0); return undefined; }
    let id = 0;
    const t0 = performance.now() + 250;
    const step = (now) => {
      const k = Math.max(0, Math.min(1, (now - t0) / ms));
      draw(phase(k));
      if (k < 1) id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  // an edit redraws the scene (and its empty slots) without a new swing: put the leaves back, shut
  useEffect(() => {
    const g = ref.current;
    if (!g) return;
    const svg = g.ownerSVGElement || g;
    let loose = '';
    for (const d of doors) {
      const slot = svg.querySelector(`.door-slot[data-door="${CSS.escape(d.id)}"]`);
      if (slot) { if (!slot.firstChild) slot.innerHTML = leaf(K, d, 0); } else loose += leaf(K, d, 0);
    }
    if (loose && !g.firstChild) g.innerHTML = loose;
  }); // eslint-disable-line react-hooks/exhaustive-deps
}
