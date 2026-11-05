// Grid & snapping engine. All positions are whole cells; rotation is in strict 90° steps.
// An item is { id, type, gx, gy, rot, w?, d?, ... } where (gx, gy) is the cell of its minimum
// corner and w/d (cells, unrotated) override the catalog size for sizable types.
//
// A plan is { cols, rows, mask } where mask[ty][tx] === '1' marks a tile (TILE × TILE cells)
// that belongs to the floor plate, so L-shaped units snap only onto real floor.

import { SIZES, LAYER, MOUNTED } from '../model/catalog.js';
import { CELL, ROTATIONS, TILE } from './units.js';
import { rotPoint } from './parts.js';

export const normRot = (r) => ((((Math.round(r / 90) * 90) % 360) + 360) % 360);

/** Unrotated size in cells: catalog default, overridden per item for sizable types. */
export function baseSize(item) {
  const s = SIZES[item.type];
  return { w: s.sizable?.includes('w') && item.w ? item.w : s.w, d: s.sizable?.includes('d') && item.d ? item.d : s.d };
}

/** Footprint in cells after rotation: 90° and 270° swap width and depth. */
export function footprint(item) {
  const { w, d } = baseSize(item);
  return normRot(item.rot) % 180 === 0 ? { w, d } : { w: d, d: w };
}

/** Occupied cell rectangle [x0, x1) × [y0, y1). */
export function cellRect(item) {
  const f = footprint(item);
  return { x0: item.gx, y0: item.gy, x1: item.gx + f.w, y1: item.gy + f.d };
}

export const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Every tile the rectangle touches must be part of the plate. */
export function onPlate(r, plan) {
  if (r.x0 < 0 || r.y0 < 0 || r.x1 > plan.cols || r.y1 > plan.rows) return false;
  if (!plan.mask) return true;
  for (let ty = Math.floor(r.y0 / TILE); ty <= Math.floor((r.y1 - 1) / TILE); ty++) {
    for (let tx = Math.floor(r.x0 / TILE); tx <= Math.floor((r.x1 - 1) / TILE); tx++) {
      if (plan.mask[ty]?.[tx] !== '1') return false;
    }
  }
  return true;
}

/**
 * Collision layers: floor items (zones, door swings, mats) never collide; structure (walls, glass,
 * partitions, pillars, glass doors) may meet each other at joints; wall-hung pieces (mount) hang over
 * furniture but not into structure or each other; furniture collides with furniture and structure.
 */
export function collides(a, b) {
  const la = LAYER[a.type], lb = LAYER[b.type];
  if (la === 'floor' || lb === 'floor' || (la === 'structure' && lb === 'structure')) return false;
  if ((la === 'mount' && lb === 'furniture') || (la === 'furniture' && lb === 'mount')) return false;
  return overlaps(cellRect(a), cellRect(b));
}

/**
 * The cells right behind a wall-hung item (its local -y side, one cell deep, turned with it), and whether a
 * wall or pillar fills them: its middle one and at least half of them (a TV may be wider than a pillar).
 */
export function backed(items, cand) {
  const { w, d } = baseSize(cand), W0 = w * CELL, D0 = d * CELL;
  const cells = Array.from({ length: w }, (_, i) => {
    const [x, y] = rotPoint((i + 0.5) * CELL, -CELL / 2, W0, D0, cand.rot);
    return { x: cand.gx + Math.floor(x / CELL), y: cand.gy + Math.floor(y / CELL) };
  });
  const solid = items.filter((it) => it.id !== cand.id && (it.type === 'wall' || it.type === 'pillar')).map(cellRect);
  const hit = cells.map((c) => solid.some((r) => c.x >= r.x0 && c.x < r.x1 && c.y >= r.y0 && c.y < r.y1));
  return hit[Math.floor((w - 1) / 2)] && hit.filter(Boolean).length * 2 >= w;
}

/** Why `cand` cannot be placed, or null when it fits. `cand.id` is ignored as a collider. */
export function validate(items, cand, plan) {
  if (!SIZES[cand.type]) return 'unknown element';
  if (!Number.isInteger(cand.gx) || !Number.isInteger(cand.gy)) return 'off grid';
  if (!ROTATIONS.includes(cand.rot)) return 'rotation must be a 90° step';
  const { w, d } = baseSize(cand);
  if (!Number.isInteger(w) || !Number.isInteger(d) || w < 1 || d < 1) return 'size must be whole cells';
  if (!onPlate(cellRect(cand), plan)) return 'outside the floor plate';
  const hit = items.find((it) => it.id !== cand.id && collides(cand, it));
  if (hit) return `collides with ${(hit.name || SIZES[hit.type].label).toLowerCase()}`;
  if (MOUNTED.has(cand.type) && !backed(items, cand)) return 'needs a wall or pillar behind it';
  return null;
}

/** World point (on the floor plane) → the cell containing it. */
export const worldToCell = (wx, wy) => ({ cx: Math.floor(wx / CELL), cy: Math.floor(wy / CELL) });

/**
 * Snap an item so that cell `grab` (relative to its origin) sits under the pointer cell,
 * clamped so the whole footprint stays inside the plan bounds.
 */
export function snapOrigin(wx, wy, f, plan, grab = { gx: 0, gy: 0 }) {
  const { cx, cy } = worldToCell(wx, wy);
  return {
    gx: Math.max(0, Math.min(plan.cols - f.w, cx - grab.gx)),
    gy: Math.max(0, Math.min(plan.rows - f.d, cy - grab.gy)),
  };
}

/** The footprint's centre cell, used as the grab point for new and rotated items. */
export const centerGrab = (f) => ({ gx: Math.floor(f.w / 2), gy: Math.floor(f.d / 2) });

/** Rotate 90° clockwise about the footprint centre, staying on whole cells and in bounds. */
export function rotateItem(item, plan) {
  const f = footprint(item);
  const next = { ...item, rot: normRot(item.rot + 90) };
  const g = footprint(next);
  const gx = item.gx + Math.trunc((f.w - g.w) / 2); // trunc: four turns return to the start
  const gy = item.gy + Math.trunc((f.d - g.d) / 2);
  return {
    ...next,
    gx: Math.max(0, Math.min(plan.cols - g.w, gx)),
    gy: Math.max(0, Math.min(plan.rows - g.d, gy)),
  };
}
