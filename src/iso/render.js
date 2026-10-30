// Pure SVG-string renderers for the floor editor: floor plate and items.
import { CELL, TILE, PILLAR_H, SLAB } from './units.js';
import { esc, frame } from './kernel.js';
import { footprint } from './grid.js';
import { renderParts } from './parts.js';
import { partsFor, SIZES, zoneTag, LAYER, isLive, tipFor, NEUTRAL_TYPES } from '../model/catalog.js';
import { depthSort } from './depth.js';
import { shadowLayer, rectsPath } from './shadow.js';
import { roomDoorIds } from './doorSwing.js';

const TW = TILE * CELL; // one tile in world units

/** Kernel + viewBox framing a whole plan (plate, slab and the tallest part). */
export function planFrame(plan) {
  const W = plan.cols * CELL, D = plan.rows * CELL;
  return frame([
    [-CELL, -CELL, -SLAB], [W + CELL, -CELL, -SLAB], [-CELL, D + CELL, -SLAB], [W + CELL, D + CELL, -SLAB],
    [-CELL, -CELL, PILLAR_H], [W + CELL, -CELL, PILLAR_H], [-CELL, D + CELL, PILLAR_H],
  ], 0.03, 16 / 10);
}

/**
 * Ids of the furniture that belongs to WeCafe (a cafe / barista zone) or a massage room: it is drawn in
 * the building's neutral finish (`.it.cafe`) instead of the blue office furniture. An item belongs to the zone its
 * footprint centre stands in; one standing in no room (the PDF's cafe zone stops short of the bar along
 * the north wall) goes with the nearest room within CAFE_REACH cells, if that is the cafe. Service and
 * marker zones (cabinet room, core, entrance, notes) are not rooms for this.
 */
const CAFE_REACH = 8;
const NOT_ROOMS = new Set(['cabinet', 'core', 'entrance', 'note']);
/** Rooms whose furniture takes the neutral finish: WeCafe (and its barista) and the massage rooms. */
const NEUTRAL_ROOMS = new Set(['cafe', 'barista', 'massage']);
export function cafeIds(items) {
  const zones = items.filter((z) => z.type === 'zone' && !NOT_ROOMS.has(z.kind)).map((z) => {
    const f = footprint(z);
    return { cafe: NEUTRAL_ROOMS.has(z.kind), x0: z.gx, y0: z.gy, x1: z.gx + f.w, y1: z.gy + f.d };
  });
  const ids = new Set();
  if (!zones.some((z) => z.cafe)) {   // no cafe or massage room: only the always-neutral pieces
    for (const it of items) if (NEUTRAL_TYPES.has(it.type)) ids.add(it.id);
    return ids;
  }
  const dist = (z, x, y) => Math.hypot(Math.max(z.x0 - x, 0, x - z.x1), Math.max(z.y0 - y, 0, y - z.y1));
  for (const it of items) {
    if (LAYER[it.type] !== 'furniture') continue;
    if (NEUTRAL_TYPES.has(it.type)) { ids.add(it.id); continue; }   // neutral wherever it stands
    const f = footprint(it), cx = it.gx + f.w / 2, cy = it.gy + f.d / 2;
    const inside = zones.find((z) => cx >= z.x0 && cx < z.x1 && cy >= z.y0 && cy < z.y1);
    const near = inside || zones.reduce((m, z) => (dist(z, cx, cy) < (m ? dist(m, cx, cy) : CAFE_REACH + 1e-9) ? z : m), null);
    if (near?.cafe) ids.add(it.id);
  }
  return ids;
}

/** Depth-sort node for an item, in world units. */
export function itemNode(item) {
  const f = footprint(item);
  const x0 = item.gx * CELL, y0 = item.gy * CELL;
  return { x0, y0, x1: x0 + f.w * CELL, y1: y0 + f.d * CELL, z0: 0, z1: SIZES[item.type].h || 0.5 };
}

export function renderItem(K, item, cut = Infinity) {
  const { W0, D0, parts } = partsFor(item);
  return renderParts(K, parts, { W0, D0, rot: item.rot, ox: item.gx * CELL, oy: item.gy * CELL, z0: 0, cut });
}

/** The hover card's text as attributes for an item's group (read by HoverTip), or '' for none. */
export function tipAttrs(item) {
  const t = tipFor(item);
  return t ? ` data-tip="${esc(t.title)}" data-tip-sub="${esc(t.sub || '')}"` : '';
}

/** Zone name tag on the floor plane, for the overlay layer above the furniture. */
/**
 * Name callouts for the occupied desks: an upright pill with the employee's name floating above each desk,
 * a thin leader from the pill's bottom centre down to the desk's worktop, and a dot where it lands. Drawn in
 * screen space (text stays upright and level), back to front so nearer pills overlap farther ones; meant for
 * a layer over the whole scene.
 */
const CALLOUT = { z: 38, rise: 34, fs: 10, padX: 6, h: 15 };
const textW = (s, fs) => [...s].reduce((w, c) => w + (/[\u1100-\uffff]/.test(c) ? 1.02 : 0.6) * fs, 0);
export function renderDeskCallouts(K, items) {
  const { z, rise, fs, padX, h } = CALLOUT;
  return items.filter((it) => it.type === 'desk' && (it.name || '').trim())
    .map((it) => { const f = footprint(it); return { it, cx: (it.gx + f.w / 2) * CELL, cy: (it.gy + f.d / 2) * CELL }; })
    .sort((a, b) => a.cx + a.cy - (b.cx + b.cy))
    .map(({ it, cx, cy }) => {
      const name = it.name.trim(), [ax, ay] = K.P(cx, cy, z), top = ay - rise, w = textW(name, fs) + 2 * padX;
      return `<g class="desk-callout" data-for="${esc(it.id)}"><line class="callout-lead" x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${ax.toFixed(1)}" y2="${top.toFixed(1)}"/>` +
        `<circle class="callout-dot" cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="1.3"/>` +
        `<rect class="callout-pill" x="${(ax - w / 2).toFixed(1)}" y="${(top - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h}" rx="${h / 2}"/>` +
        `<text class="callout-name" x="${ax.toFixed(1)}" y="${(top - h / 2 + fs * 0.36).toFixed(1)}" font-size="${fs}" text-anchor="middle">${esc(name)}</text></g>`;
    }).join('');
}

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
export function renderScene(K, plan, items, { bare = false } = {}) {
  // bare: just the items (no plate, shell shadows or outer walls), e.g. the building core
  // drawn around a unit, where `plan` has no plate of its own
  const edges = bare ? [] : edgeItems(plan);
  const area = (it) => { const f = footprint(it); return f.w * f.d; };
  const cafe = cafeIds(items), swung = roomDoorIds(items);
  // items flagged `faded` (another unit's shell drawn round this one) are sorted in with the rest but drawn
  // faded, cast no shadow and are no targets (.it.faded)
  const g = (it, extra = '') => `<g class="it${it.faded ? ' faded' : ''}${isLive(it) ? ' live' : ''}${cafe.has(it.id) ? ' cafe' : ''}${swung.has(it.id) ? ' swung' : ''}${extra}"${extra ? '' : tipAttrs(it)}>${renderItem(K, it)}</g>`;
  const floor = items.filter((it) => LAYER[it.type] === 'floor')
    .sort((a, b) => (a.type === b.type ? area(b) - area(a) : a.type === 'zone' ? -1 : 1));
  let s = (bare ? '' : renderPlate(K, plan)) + floor.map((it) => g(it)).join('');
  if (!bare) s += renderShadows(K, plan, items.filter((it) => !it.faded), edges);
  s += depthSort([...items.filter((it) => LAYER[it.type] !== 'floor'), ...edges].map((it) => ({ ...itemNode(it), it })))
    .map((n) => g(n.it, n.it.id.startsWith('edge-') ? ' edge' : '')).join('');
  s += floor.filter((it) => it.type === 'zone').map((it) => `<g class="tag${isLive(it) ? ' live' : ''}">${renderZoneTag(K, it)}</g>`).join('');
  if (!bare) s += `<g class="desk-callouts">${renderDeskCallouts(K, items.filter((it) => !it.faded))}</g>`;
  return s;
}

/** Outer walls that sit just outside the tile grid in the PDF, as non-interactive wall items. */
export const edgeItems = (plan) => (plan.edges || []).map((e, i) => ({ id: `edge-${i}`, type: e.type || 'wall', gx: e.gx, gy: e.gy, rot: e.rot, w: e.w }));
