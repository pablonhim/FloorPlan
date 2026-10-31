// Building data: rented floors → units → items, persistence and the editing reducer.
// The default layouts come from the official layout PDF (2026-09-29), converted to the 20 cm grid
// in src/model/layouts.json.

import { ROTATIONS, TILE } from '../iso/units.js';
import { SIZES, describe } from './catalog.js';
import { validate, rotateItem, cellRect } from '../iso/grid.js';
import LAYOUTS from './layouts.json';

// Floors are numbered as in Cambodia: G (the ground-floor lobby, 0), then 1, 2, 3 … above it
export const TOTAL_FLOORS = 10;   // floors 1–10 above G: 11 storeys in all
export const RENTED = [2, 4];
export const UNITS = { 2: ['A', 'B', 'C', 'D'], 4: ['C', 'D'] }; // floor 4: units C and D are in the PDF
export const STORAGE_KEY = 'floorplan.v2';
export const LOG_KEY = 'floorplan.log';
export const SOURCE = '2026_KOSIGN_Official_Layout_0929 (updated 2026-09-29)';

export const planId = (floor, unit) => `${floor}${unit}`;

/** Static plan geometry and legend from the PDF (not user-editable). */
export const PLANS = Object.fromEntries(Object.entries(LAYOUTS).map(([id, p]) => {
  const { items, ...meta } = p; // eslint-disable-line no-unused-vars
  return [id, meta];
}));

/**
 * Whole-floor plan: the floor's units side by side as on the PDF key plan (Unit C west, Unit D east,
 * sharing their boundary wall). Each unit keeps its own cell grid, shifted by `ox` cells.
 */
/**
 * Where each unit sits on its floor (cells), as on the PDF key plan: Units C (NW) and D (NE) above the
 * central east–west corridor, Units A (SW) and B (SE) below it. Floor 4 only has C and D in the plan.
 */
export const UNIT_AT = { C: [0, 0], D: [78, 0], A: [15, 99], B: [78, 99] }; // A/B walls at y = 102: a 3 m corridor

/** Building core from the key plan (floor cells; identical on every floor, stacked). */
export const CORE = {
  corridor: { x0: 6, x1: 150, y0: 87, y1: 102 },       // common corridor (3 m) between the north and south units
  liftsW: [15, 24], liftsE: [122, 131], liftY: 87,      // twin lifts at each end, opening onto the corridor
  // WCs fill the pocket from the outer wall to the neighbouring unit wall, down to the lift shafts' wall
  // line; doors open onto the lift hallway at the corner away from the shafts
  // doorOff: the door sits along the front wall right beside the lifts (world units in from its end)
  wcW: { x: 0, y: 69, w: 32, d: 18, doorSide: 'l', doorOff: 100 }, wcE: { x: 124, y: 69, w: 32, d: 18, doorSide: 'r', doorOff: 120 },
  stairsW: { x0: 1, x1: 35 }, stairsE: { x0: 121, x1: 155 }, stairsY: [102, 118], // stair cores below the corridor
  // enclosed storage rooms (스토리지) on the Unit C/D side, right beside each lift pair: as big as the two
  // lift shafts together, on the same corridor wall line; doors on their end faces, facing each other
  // along the corridor (west room: east end, east room: west end)
  storerooms: [{ x: 33, doorSide: 'e' }, { x: 104, doorSide: 'w' }],
  // corridor storage cabinets (none at present; the Unit A/B side was cleared): [{ xs, side: 'n' | 's' }]
  cabinets: [],
};

/**
 * Whole-floor plan: every unit of the floor at its key-plan position plus the building core, on one
 * cell grid. Each unit keeps its own grid, shifted by (ox, oy) cells.
 */
export function floorPlan(floor) {
  const units = UNITS[floor].map((u) => {
    const p = PLANS[planId(floor, u)];
    const [ox, oy] = UNIT_AT[u];
    return { unit: u, id: p.id, ox, oy, cols: p.cols, rows: p.rows, mask: p.mask };
  });
  const cols = 156;
  const rows = Math.ceil(Math.max(CORE.stairsY[1] + 2, ...units.map((u) => u.oy + u.rows)) / TILE) * TILE;
  const grid = Array.from({ length: rows / TILE }, () => Array(cols / TILE).fill('0'));
  const fill = (x0, y0, x1, y1) => { // cells → tiles touched
    for (let ty = Math.floor(y0 / TILE); ty < Math.ceil(y1 / TILE); ty++) for (let tx = Math.floor(x0 / TILE); tx < Math.ceil(x1 / TILE); tx++) grid[ty][tx] = '1';
  };
  for (const u of units) {
    u.mask.forEach((row, ty) => [...row].forEach((c, tx) => { if (c === '1') grid[u.oy / TILE + ty][u.ox / TILE + tx] = '1'; }));
  }
  const c = CORE.corridor;
  fill(c.x0, c.y0, c.x1, c.y1);
  fill(0, 69, 33, 93); fill(cols - 33, 69, cols, 93);                                          // WC pockets + the floor their doors swing onto
  fill(CORE.stairsW.x0 - 1, CORE.stairsY[0] - 4, CORE.stairsW.x1, CORE.stairsY[1] + 2);         // stair cores (and their doors)
  fill(CORE.stairsE.x0, CORE.stairsY[0] - 4, CORE.stairsE.x1 + 1, CORE.stairsY[1] + 2);
  // a boundary wall both neighbours carry (Unit A's east wall is Unit B's west wall) is drawn once
  const edges = [...new Map(units.flatMap((u) => (PLANS[u.id].edges || []).map((e) => ({ ...e, gx: e.gx + u.ox, gy: e.gy + u.oy })))
    .map((e) => [`${e.type}:${e.gx}:${e.gy}:${e.rot}:${e.w}`, e])).values()];
  return { id: `F${floor}`, floor, cols, rows, mask: grid.map((r) => r.join('')), edges, units };
}

/**
 * Building core for the full-floor view: the common corridor, twin lifts at both ends opening onto it,
 * an enclosed storage room beside each lift pair on the Unit C/D side, a WC block above each lift pair
 * (Women's west, Men's east) and a stair core below each end. Floor coordinates; never part of a unit's
 * editable layout.
 */
export function coreItems() {
  const z = (id, gx, gy, w, d, label, en) => ({ id, type: 'zone', kind: 'core', gx, gy, rot: 0, w, d, label, en, locked: true });
  const { corridor: c, liftsW, liftsE, liftY, wcW, wcE, stairsW, stairsE, stairsY } = CORE;
  return [
    z('core-corridor', c.x0 + 50, c.y0, c.x1 - c.x0 - 100, c.y1 - c.y0, '공용 복도', 'Common corridor · elevators, WC & stairs'), // tag clear of lifts + cabinets
    z('core-wc-w', wcW.x, wcW.y, wcW.w, wcW.d, '여자 화장실', "Women's WC"),
    { id: 'core-wc-f', type: 'wc', gender: 'f', gx: wcW.x, gy: wcW.y, w: wcW.w, d: wcW.d, rot: 0, doorSide: wcW.doorSide, doorOff: wcW.doorOff, locked: true },
    { id: 'core-wc-f-door', type: 'door', gx: liftsW[0] - 5, gy: wcW.y + wcW.d, rot: 0, locked: true },   // just left of the west lifts
    z('core-wc-e', wcE.x, wcE.y, wcE.w, wcE.d, '남자 화장실', "Men's WC"),
    { id: 'core-wc-m', type: 'wc', gender: 'm', gx: wcE.x, gy: wcE.y, w: wcE.w, d: wcE.d, rot: 0, doorSide: wcE.doorSide, doorOff: wcE.doorOff, locked: true },
    { id: 'core-wc-m-door', type: 'door', gx: liftsE[1] + 10, gy: wcE.y + wcE.d, rot: 90, locked: true }, // just right of the east lifts
    ...[...liftsW, ...liftsE].map((x, i) => ({ id: `core-lift-${i}`, type: 'elevator', gx: x, gy: liftY, rot: 0, locked: true })),
    ...CORE.storerooms.flatMap((r, i) => [
      { id: `core-store-${i}`, type: 'storeroom', gx: r.x, gy: liftY, rot: 0, doorSide: r.doorSide, locked: true },
      // its door swings out of the end face, along the corridor toward the other storage room
      r.doorSide === 'e'
        ? { id: `core-store-door-${i}`, type: 'door', gx: r.x + 18, gy: liftY + 2, rot: 0, locked: true }
        : { id: `core-store-door-${i}`, type: 'door', gx: r.x - 4, gy: liftY + 2, rot: 90, locked: true },
    ]),
    ...CORE.cabinets.flatMap((g, gi) => g.xs.map((x, i) => ({
      id: `core-cab-${gi}-${i}`, type: 'cabinet', gx: x, rot: g.side === 'n' ? 0 : 180, locked: true,
      gy: g.side === 'n' ? c.y0 : c.y1 - 3,
    }))),
    z('core-stairs-w', stairsW.x0, stairsY[0], stairsW.x1 - stairsW.x0, stairsY[1] - stairsY[0], '계단', 'Stairs'),
    // the stairs sit opposite their restroom's door across the corridor (west: the women's; east: the
    // men's), the flight going down from a small landing on the corridor's edge
    { id: 'core-stair-w', type: 'stair', gx: liftsW[0] - 6, gy: stairsY[0] + 4, rot: 0, locked: true },
    z('core-stairs-e', stairsE.x0, stairsY[0], stairsE.x1 - stairsE.x0, stairsY[1] - stairsY[0], '계단', 'Stairs'),
    { id: 'core-stair-e', type: 'stair', gx: liftsE[1] + 9, gy: stairsY[0] + 4, rot: 0, locked: true },
  ];
}

/** A unit's items moved into floor coordinates. */
export const toFloor = (items, ox, oy = 0) => items.map((it) => ({ ...it, gx: it.gx + ox, gy: it.gy + oy }));

let seq = 0;
export const newId = (type) => `${type}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

const STR = { name: 60, team: 60, label: 40, en: 60, note: 40, kind: 16, gender: 1, doorSide: 1 };

/** Drop anything malformed, off-grid, off the plate or colliding (first one wins). */
export function sanitize(raw, plan) {
  const out = [];
  if (!Array.isArray(raw)) return out;
  for (const r of raw) {
    if (!r || typeof r !== 'object' || !SIZES[r.type]) continue;
    const it = {
      id: typeof r.id === 'string' && r.id ? r.id : newId(r.type),
      type: r.type,
      gx: r.gx, gy: r.gy,
      rot: ROTATIONS.includes(r.rot) ? r.rot : 0,
    };
    const sz = SIZES[r.type].sizable || '';
    if (sz.includes('w') && Number.isInteger(r.w)) it.w = r.w;
    if (sz.includes('d') && Number.isInteger(r.d)) it.d = r.d;
    for (const [k, n] of Object.entries(STR)) if (typeof r[k] === 'string') it[k] = r[k].slice(0, n);
    if (typeof r.on === 'boolean') it.on = r.on;
    if (typeof r.locked === 'boolean') it.locked = r.locked;
    if (Number.isInteger(r.n)) it.n = r.n;
    if (r.flip === true) it.flip = true;
    if (Number.isInteger(r.layer) && r.layer !== 0) it.layer = Math.max(-9, Math.min(9, r.layer));   // drawing order override
    if (out.some((o) => o.id === it.id)) it.id = newId(it.type);
    if (!validate(out, it, plan)) out.push(it);
  }
  return dedupeDoors(out);
}

/**
 * The imported layouts draw some double doors twice: a second row of leaves 1–3 cells from the first,
 * at the same hinge columns. Keep one door per hinge column — the one nearest an entrance zone (or the
 * first found) — so each double door has exactly two leaves.
 */
function dedupeDoors(items) {
  const ents = items.filter((z) => z.type === 'zone' && z.kind === 'entrance');
  const dist = (d) => Math.min(Infinity, ...ents.map((z) => Math.hypot(d.gx + 2 - (z.gx + z.w / 2), d.gy + 2 - (z.gy + z.d / 2))));
  const drop = new Set();
  const doors = items.filter((i) => i.type === 'door');
  for (const a of doors) {
    for (const b of doors) {
      if (a === b || drop.has(a) || drop.has(b) || a.gx !== b.gx || (a.rot || 0) !== (b.rot || 0) || Math.abs(a.gy - b.gy) > 3) continue;
      drop.add(dist(a) <= dist(b) ? b : a);
    }
  }
  const kept = drop.size ? items.filter((i) => !drop.has(i)) : items;
  // double doors: two leaves side by side on the same line open from the middle — the right-hand leaf
  // (larger gx) is the mirror image, hinged on its right
  const left = kept.filter((i) => i.type === 'door');
  return kept.map((d) => (d.type === 'door' && !d.flip && left.some((o) => o !== d && o.gy === d.gy && (o.rot || 0) === (d.rot || 0) && d.gx - o.gx >= 2 && d.gx - o.gx <= 4)
    ? { ...d, flip: true } : d));
}

/**
 * Close the small gaps between neighbouring desks along each desk row (desks at 0° / 180°) and column
 * (90° / 270°). Rows that face each other (touching back to back) form one block and move together,
 * slot by slot, so a facing pair stays mirrored: first the desks sharing a slot are lined up on its
 * start, then each gap of up to MAX_GAP cells is closed by sliding the smaller run of touching slots on
 * one side of it (the far side on a tie). Wider gaps are aisles and stay, as do gaps between two
 * different named teams. Nothing is moved into anything: if one side is blocked the other is tried,
 * and if both are, the gap stays.
 */
const MAX_GAP = 2;
export function packDeskRows(items, plan) {
  let out = items;
  const horiz = (d) => (d.rot || 0) % 180 === 0;
  const span = (d) => { const r = cellRect(d); return horiz(d) ? [r.x0, r.x1, r.y0, r.y1] : [r.y0, r.y1, r.x0, r.x1]; }; // along, cross
  const desks = () => out.filter((d) => d.type === 'desk');
  // blocks: rows of the same direction joined when one's desks touch the other's back to back
  const root = new Map(), find = (k) => (root.get(k) === k ? k : find(root.get(k)));
  const lineOf = (d) => `${horiz(d) ? 'h' : 'v'}${span(d)[2]}`;
  for (const d of desks()) root.set(lineOf(d), lineOf(d));
  for (const a of desks()) for (const b of desks()) {
    const [a0, a1, , c1] = span(a), [b0, b1, c0] = span(b);
    if (horiz(a) === horiz(b) && c1 === c0 && a0 < b1 && b0 < a1) root.set(find(lineOf(b)), find(lineOf(a)));
  }
  const blocks = [...new Set([...root.keys()].map(find))];
  const shift = (d, by) => (horiz(d) ? { ...d, gx: d.gx + by } : { ...d, gy: d.gy + by });
  const tryMove = (moves) => {   // moves: [[desk, by]]; all or nothing
    const moved = new Map(moves.filter(([, by]) => by).map(([d, by]) => [d.id, shift(d, by)]));
    const next = out.map((d) => moved.get(d.id) || d);
    if (![...moved.values()].every((d) => !validate(next, d, plan))) return false;
    out = next;
    return true;
  };
  // slots: desks of the block whose spans along the row overlap, in order
  const slotsOf = (block) => {
    const ds = desks().filter((d) => find(lineOf(d)) === block).sort((a, b) => span(a)[0] - span(b)[0]);
    const slots = [];
    for (const d of ds) {
      const [a0, a1] = span(d), last = slots[slots.length - 1];
      if (last && a0 < last.a1) { last.ds.push(d); last.a1 = Math.max(last.a1, a1); } else slots.push({ a0, a1, ds: [d] });
    }
    return slots;
  };
  const teams = (slot) => new Set(slot.ds.map((d) => d.team).filter(Boolean));
  for (const block of blocks) {
    for (const slot of slotsOf(block)) tryMove(slot.ds.map((d) => [d, slot.a0 - span(d)[0]]));
    for (let i = 1; ; i++) {
      const slots = slotsOf(block);
      if (i >= slots.length) break;
      const gap = slots[i].a0 - slots[i - 1].a1;
      const ta = teams(slots[i - 1]), tb = teams(slots[i]);
      if (gap <= 0 || gap > MAX_GAP || (ta.size && tb.size && ![...ta].some((t) => tb.has(t)))) continue;
      let l = i - 1; while (l > 0 && slots[l - 1].a1 === slots[l].a0) l--;
      let r = i; while (r < slots.length - 1 && slots[r].a1 === slots[r + 1].a0) r++;
      const run = (from, to, by) => slots.slice(from, to).flatMap((sl) => sl.ds.map((d) => [d, by]));
      const left = run(l, i, gap), right = run(i, r + 1, -gap);
      const nl = i - l, nr = r + 1 - i;
      if (nl < nr) { if (!tryMove(left)) tryMove(right); } else if (!tryMove(right)) tryMove(left);
    }
  }
  return out;
}

export const seedPlan = (id) => packDeskRows(sanitize(LAYOUTS[id].items, PLANS[id]), PLANS[id]);
/**
 * The shell (walls, glass walls and pillars; the outer walls come with the plan) of the units a floor does
 * not rent, taken from the floor where they are laid out (the building's shell is the same on every floor):
 * floor 4 rents only C and D, so its A and B are drawn as faded shells. [{ unit, plan, items, ox, oy }]
 */
export function shellUnits(floor) {
  return ['C', 'D', 'A', 'B'].filter((u) => !UNITS[floor].includes(u)).flatMap((u) => {
    const from = RENTED.find((f) => UNITS[f].includes(u));
    if (from === undefined) return [];
    const id = planId(from, u), [ox, oy] = UNIT_AT[u];
    return [{ unit: u, plan: PLANS[id], items: seedPlan(id).filter((it) => ['wall', 'glass', 'pillar'].includes(it.type)), ox, oy }];
  });
}

export const seedAll = () => Object.fromEntries(Object.keys(PLANS).map((id) => [id, seedPlan(id)]));

// ---------- persistence ----------

/** Saved items matching `pick` moved to their seed position (by id), where they fit there. */
function moveSeeded(items, id, pick) {
  let out = items;
  for (const seed of seedPlan(id).filter(pick)) {
    const cur = out.find((it) => it.id === seed.id);
    if (!cur || (cur.gx === seed.gx && cur.gy === seed.gy)) continue;
    const moved = { ...cur, gx: seed.gx, gy: seed.gy };
    const next = out.map((it) => (it.id === seed.id ? moved : it));
    if (!validate(next, moved, PLANS[id])) out = next;
  }
  return out;
}

/** Saved items matching `pick` replaced by the seed's (by type: the saved ones go, the seed's come in
 *  where they fit). */
function resetSeeded(items, id, pick) {
  let out = items.filter((it) => !pick(it));
  for (const it of seedPlan(id).filter(pick)) if (!validate(out, it, PLANS[id])) out = [...out, it];
  return out;
}

/** Seed items matching `pick` that a saved plan lacks (by id), added where they still fit. */
function addSeeded(items, id, pick) {
  const have = new Set(items.map((it) => it.id));
  let out = items;
  for (const it of seedPlan(id).filter((s) => pick(s) && !have.has(s.id))) if (!validate(out, it, PLANS[id])) out = [...out, it];
  return out;
}

export function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (raw && raw.plans) {
      // v2 → v3: desk rows were packed (no gaps between neighbouring desks); saved plans get it once
      // v3 → v4: two massage chairs each in the 4th-floor men's and women's massage rooms
      // v4 → v5: three server racks in the 2D server room; v5 → v6: the racks moved to the room's middle
      // v6 → v7: the 4D WeCafe's tables all one size (9 × 2 cells), its tables and stools re-laid once
      const fix = (items, id) => {
        const packed = raw.v >= 3 ? items : packDeskRows(items, PLANS[id]);
        const chairs = raw.v >= 4 ? packed : addSeeded(packed, id, (it) => it.type === 'massageChair');
        const racks = raw.v >= 5 ? chairs : addSeeded(chairs, id, (it) => it.type === 'serverRack');
        const moved = raw.v >= 6 ? racks : moveSeeded(racks, id, (it) => it.type === 'serverRack');
        return raw.v >= 7 || id !== '4D' ? moved : resetSeeded(moved, id, (it) => it.type === 'table' || it.type === 'stool');
      };
      return Object.fromEntries(Object.keys(PLANS).map((id) => [id, Array.isArray(raw.plans[id]) ? fix(sanitize(raw.plans[id], PLANS[id]), id) : seedPlan(id)]));
    }
  } catch { /* corrupt or blocked storage: fall through to the PDF layout */ }
  return seedAll();
}

export function save(plans) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 7, savedAt: new Date().toISOString(), plans }));
    return true;
  } catch {
    return false;
  }
}

// ---------- change log ----------

const LOG_MAX = 300;
/** Repeated edits of one item (nudging it along, retyping a field) within this long make one entry (ms). */
const COALESCE = 30_000;

export function loadLog() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((e) => e && typeof e.t === 'number' && typeof e.text === 'string').slice(-LOG_MAX) : [];
  } catch { return []; }
}

export function saveLog(log) {
  try { localStorage.setItem(LOG_KEY, JSON.stringify(log)); return true; } catch { return false; }
}

/** The log with entry e ({ plan, action, id?, text }) added, stamped now. */
function logged(log = [], e) {
  const t = Date.now(), last = log[log.length - 1];
  if (last && e.id && last.id === e.id && last.plan === e.plan && last.action === e.action && t - last.t < COALESCE) {
    return [...log.slice(0, -1), { ...last, ...e, t }];
  }
  return [...log.slice(1 - LOG_MAX), { ...e, t }];
}

/** What a reducer action did, in words, or null when it changes nothing worth logging. */
function entryFor(a, before, after) {
  const cur = before?.find((i) => i.id === a.id), next = after?.find((i) => i.id === a.id);
  const what = (it) => (it ? describe(it) : 'item');
  switch (a.type) {
    case 'add': { const it = after[after.length - 1]; return { id: it.id, text: `Added ${what(it)}` }; }
    case 'move': return { id: a.id, text: `Moved ${what(cur)} to ${next.gx}, ${next.gy}${next.rot !== cur.rot ? ` · ${next.rot}°` : ''}` };
    case 'resize': return { id: a.id, text: `Resized ${what(next)}` };
    case 'rotate': return { id: a.id, text: `Rotated ${what(cur)} to ${next.rot}°` };
    case 'patch': {
      if (cur?.type === 'desk' && 'name' in a.patch && (a.patch.name || '') !== (cur.name || '')) {
        const label = cur.label || 'desk';
        return { id: a.id, text: a.patch.name ? `Assigned ${label} to ${a.patch.name}${cur.name ? ` (was ${cur.name})` : ''}` : `Unassigned ${label} (was ${cur.name})` };
      }
      if (Object.keys(a.patch).join() === 'layer') return { id: a.id, text: `${(a.patch.layer || 0) > (cur?.layer || 0) ? 'Brought forward' : 'Sent backward'} ${what(next)}` };
      const keys = Object.keys(a.patch).filter((k) => !['id', 'type', 'gx', 'gy', 'rot', 'w', 'd'].includes(k));
      return keys.length ? { id: a.id, text: `Edited ${what(next)} · ${keys.join(', ')}` } : null;
    }
    case 'remove': return { id: a.id, text: `Removed ${what(cur)}` };
    case 'reset': return { text: 'Reset to the official PDF layout' };
    default: return null;
  }
}

// ---------- reducer (with undo) ----------

const HISTORY = 60;

export const initState = () => ({ plans: load(), past: [], log: loadLog() });

function commit(state, id, items, a) {
  if (items === state.plans[id]) return state;
  const e = a && entryFor(a, state.plans[id], items);
  return {
    plans: { ...state.plans, [id]: items }, past: [...state.past.slice(1 - HISTORY), state.plans],
    log: e ? logged(state.log, { plan: id, action: a.type, ...e }) : state.log,
  };
}

/**
 * Every geometric write goes through validate(): the store never holds an off-grid,
 * off-step, off-plate or colliding item.
 */
export function reducer(state, a) {
  const items = state.plans[a.plan];
  const plan = PLANS[a.plan];
  const replace = (next) => (validate(items, next, plan) ? state : commit(state, a.plan, items.map((i) => (i.id === next.id ? next : i)), a));
  switch (a.type) {
    case 'add': {
      const it = { ...a.item, id: a.item.id || newId(a.item.type) };
      return validate(items, it, plan) ? state : commit(state, a.plan, [...items, it], a);
    }
    case 'move': {
      const cur = items.find((i) => i.id === a.id);
      if (!cur) return state;
      const next = { ...cur, gx: a.gx, gy: a.gy, rot: a.rot ?? cur.rot };
      if (next.gx === cur.gx && next.gy === cur.gy && next.rot === cur.rot) return state;
      return replace(next);
    }
    case 'resize': {
      const cur = items.find((i) => i.id === a.id);
      if (!cur) return state;
      return replace({ ...cur, ...(a.w ? { w: a.w } : {}), ...(a.d ? { d: a.d } : {}) });
    }
    case 'rotate': {
      const cur = items.find((i) => i.id === a.id);
      return cur ? replace(rotateItem(cur, plan)) : state;
    }
    case 'patch': // non-geometric fields only
      return commit(state, a.plan, items.map((i) => {
        if (i.id !== a.id) return i;
        const { id, type, gx, gy, rot, w, d, ...rest } = a.patch; // eslint-disable-line no-unused-vars
        return { ...i, ...rest };
      }), a);
    case 'remove':
      return commit(state, a.plan, items.filter((i) => i.id !== a.id), a);
    case 'reset':
      return commit(state, a.plan, seedPlan(a.plan), a);
    case 'undo':
      if (!state.past.length) return state;
      return {
        plans: state.past[state.past.length - 1], past: state.past.slice(0, -1),
        log: logged(state.log, { plan: Object.keys(state.plans).find((k) => state.plans[k] !== state.past[state.past.length - 1][k]), action: 'undo', text: 'Undid the last change' }),
      };
    case 'clearLog':
      return { ...state, log: [] };
    default:
      return state;
  }
}

export function stats(items) {
  const desks = items.filter((i) => i.type === 'desk');
  return { desks: desks.length, assigned: desks.filter((d) => d.name && d.name.trim()).length, items: items.length };
}

/** Totals for one floor across its units. */
export function floorStats(plans, floor) {
  return (UNITS[floor] || []).map((u) => stats(plans[planId(floor, u)] || []))
    .reduce((a, b) => ({ desks: a.desks + b.desks, assigned: a.assigned + b.assigned, items: a.items + b.items }), { desks: 0, assigned: 0, items: 0 });
}
