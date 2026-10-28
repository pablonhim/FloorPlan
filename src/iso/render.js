// Pure SVG-string renderers for the floor editor: floor plate and items.
import { CELL, TILE, PILLAR_H, SLAB } from './units.js';
import { esc, frame } from './kernel.js';
import { footprint } from './grid.js';
import { renderParts } from './parts.js';
import { partsFor, SIZES, describe, zoneTag, LAYER, isLive } from '../model/catalog.js';
import { depthSort } from './depth.js';
import { shadowLayer, rectsPath } from './shadow.js';

const TW = TILE * CELL; // one tile in world units

/** Kernel + viewBox framing a whole plan (plate, slab and the tallest part). */
export function planFrame(plan) {
  const W = plan.cols * CELL, D = plan.rows * CELL;
  return frame([
    [-CELL, -CELL, -SLAB], [W + CELL, -CELL, -SLAB], [-CELL, D + CELL, -SLAB], [W + CELL, D + CELL, -SLAB],
    [-CELL, -CELL, PILLAR_H], [W + CELL, -CELL, PILLAR_H], [-CELL, D + CELL, PILLAR_H],
  ], 0.03, 16 / 10);
}

/** Depth-sort node for an item, in world units. */
export function itemNode(item) {
  const f = footprint(item);
  const x0 = item.gx * CELL, y0 = item.gy * CELL;
  return { x0, y0, x1: x0 + f.w * CELL, y1: y0 + f.d * CELL, z0: 0, z1: SIZES[item.type].h || 0.5 };
}

export function renderItem(K, item, cut = Infinity) {
  const { W0, D0, parts } = partsFor(item);
  return `<title>${esc(describe(item))}</title>` +
    renderParts(K, parts, { W0, D0, rot: item.rot, ox: item.gx * CELL, oy: item.gy * CELL, z0: 0, cut });
}

/** Zone name tag on the floor plane, for the overlay layer above the furniture. */
export function renderZoneTag(K, item) {
  const n = itemNode(item);
  return `<g transform="${K.TOP(n.x0, n.y0, 0)}">${zoneTag(item, n.x1 - n.x0, n.y1 - n.y0)}</g>`;
}

/** Footprint outline flat on the floor (selection / drop target). */
export function renderFoot(K, item, cls) {
  const n = itemNode(item);
  return K.flat(n.x0, n.y0, 0.2, n.x1 - n.x0, n.y1 - n.y0, cls);
}

export function renderCell(K, cx, cy) {
  return K.flat(cx * CELL, cy * CELL, 0.3, CELL, CELL, 'cellhint');
}

/** Tile rows of the plate mask as runs [tx0, tx1) — one slab box per run keeps paint order simple. */
function runs(mask) {
  const out = [];
  mask.forEach((row, ty) => {
    let start = -1;
    for (let tx = 0; tx <= row.length; tx++) {
      const on = row[tx] === '1';
      if (on && start < 0) start = tx;
      if (!on && start >= 0) { out.push({ ty, tx0: start, tx1: tx }); start = -1; }
    }
  });
  return out;
}

/** Slab following the unit outline, the 60 cm ceiling-tile grid, and metre ticks. */
export function renderPlate(K, plan) {
  const { TOP, box } = K;
  const R = runs(plan.mask);
  let s = '';
  for (const r of R) s += box(r.tx0 * TW, r.ty * TW, -SLAB, (r.tx1 - r.tx0) * TW, TW, SLAB, 0, 'slab');
  // 60 cm tile grid as one path: every tile edge exactly once, so shared edges are never drawn twice
  // (which would double their alpha); its strength is a single stroke alpha in .slab-grid
  const edges = new Set();
  for (const r of R) {
    for (let tx = r.tx0; tx < r.tx1; tx++) {
      edges.add(`M${tx * TW} ${r.ty * TW}h${TW}`).add(`M${tx * TW} ${(r.ty + 1) * TW}h${TW}`);
      edges.add(`M${tx * TW} ${r.ty * TW}v${TW}`).add(`M${(tx + 1) * TW} ${r.ty * TW}v${TW}`);
    }
  }
  s += `<g transform="${TOP(0, 0, 0)}"><path class="slab-grid" d="${[...edges].join('')}"/>`;
  // metre ticks every 5 tiles (3 m) along the back edges
  const cols = plan.mask[0].length, rows = plan.mask.length;
  for (let tx = 0; tx <= cols; tx += 5) s += `<text class="tick" x="${tx * TW}" y="-5" font-size="9" text-anchor="middle">${(tx * 0.6).toFixed(0)}m</text>`;
  for (let ty = 5; ty <= rows; ty += 5) s += `<text class="tick" x="-5" y="${ty * TW + 3}" font-size="9" text-anchor="end">${(ty * 0.6).toFixed(0)}m</text>`;
  s += `</g>`;
  return s;
}

/** Shadows on the plate, clipped to it, cast by the structural shell (walls, pillars, core, outer walls). */
export function renderShadows(K, plan, items, edges = edgeItems(plan)) {
  const clipId = `clip-${plan.id}`;
  const clip = rectsPath(K, runs(plan.mask).map((r) => ({ x0: r.tx0 * TW, y0: r.ty * TW, x1: r.tx1 * TW, y1: (r.ty + 1) * TW })), 0);
  const caster = (it, h) => ({ ...itemNode(it), h });
  const shellTypes = new Set(['wall', 'pillar', 'elevator', 'wc', 'restroom', 'cabinet', 'storeroom']);
  const shell = [...items.filter((it) => shellTypes.has(it.type)), ...edges].map((it) => caster(it, itemNode(it).z1));
  return shadowLayer(K, shell, { clipId, clip });
}

/**
 * A whole static scene as one SVG string (read-only views and exports): plate, floor layer
 * (zones by area, then door swings), shell shadows, depth-sorted solids, then zone name tags.
 */
export function renderScene(K, plan, items) {
  const edges = edgeItems(plan);
  const area = (it) => { const f = footprint(it); return f.w * f.d; };
  const g = (it, extra = '') => `<g class="it${isLive(it) ? ' live' : ''}${extra}">${renderItem(K, it)}</g>`;
  const floor = items.filter((it) => LAYER[it.type] === 'floor')
    .sort((a, b) => (a.type === b.type ? area(b) - area(a) : a.type === 'zone' ? -1 : 1));
  let s = renderPlate(K, plan) + floor.map((it) => g(it)).join('');
  s += renderShadows(K, plan, items, edges);
  s += depthSort([...items.filter((it) => LAYER[it.type] !== 'floor'), ...edges].map((it) => ({ ...itemNode(it), it })))
    .map((n) => g(n.it, n.it.id.startsWith('edge-') ? ' edge' : '')).join('');
  s += floor.filter((it) => it.type === 'zone').map((it) => `<g class="tag${isLive(it) ? ' live' : ''}">${renderZoneTag(K, it)}</g>`).join('');
  return s;
}

/** Outer walls that sit just outside the tile grid in the PDF, as non-interactive wall items. */
export const edgeItems = (plan) => (plan.edges || []).map((e, i) => ({ id: `edge-${i}`, type: e.type || 'wall', gx: e.gx, gy: e.gy, rot: e.rot, w: e.w }));
