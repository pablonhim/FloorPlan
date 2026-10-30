// Pure SVG-string renderers for the floor editor: floor plate and items.
import { CELL, TILE, PILLAR_H, SLAB } from './units.js';
import { esc, frame } from './kernel.js';
import { footprint } from './grid.js';
import { renderParts, placeRect } from './parts.js';
import { partsFor, SIZES, zoneTag, LAYER, isLive, tipFor, TIP_LANGS, NEUTRAL_TYPES } from '../model/catalog.js';
import { depthSort } from './depth.js';
import { shadowLayer, rectsPath, hull } from './shadow.js';
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

/**
 * Frosted glass walls: what stands behind each glass wall (`glass` items; not the storage rooms' own frosted
 * glass) is seen blurred through it. For each, the pieces drawn before it (depth-sorted `nodes`, each
 * { it, cls }) whose drawing overlaps its outline on screen are drawn again blurred over a plain backdrop,
 * clipped to that outline, just under the pane. `html(it)` gives an item's drawing. Map: glass id → svg.
 */
let GLASS_SEQ = 0;
export function glassBackdrops(K, nodes, html, cut = Infinity) {
  // clip ids unique to this drawing: the views are kept alive side by side in one document (the floor view
  // and the unit editor both draw the same glass walls, in different frames), and a url(#id) resolves to the
  // first element with that id in the document — a shared id would clip with another view's outline
  const seq = ++GLASS_SEQ;
  const scr = (n) => {
    const z1 = Math.min(n.z1, cut), pts = [];
    for (const x of [n.x0, n.x1]) for (const y of [n.y0, n.y1]) for (const z of [n.z0, z1]) pts.push(K.P(x, y, z));
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return { pts, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  };
  // a glass wall's pane exactly (it is thinner than the wall's grid cell): clipping to the whole cell
  // would leave a blurred strip, with no pane over it, along both faces of the glass
  const pane = (it) => {
    const { W0, D0, parts } = partsFor(it), p = parts.find((q) => /\bpane\b/.test(q.cls || '')) || parts[0];
    const w = placeRect(p, W0, D0, it.rot, it.gx * CELL, it.gy * CELL);
    return scr({ x0: w.x, y0: w.y, x1: w.x + w.w, y1: w.y + w.d, z0: p.z, z1: p.z + p.h });
  };
  const boxes = nodes.map(scr), out = new Map();
  nodes.forEach((n, i) => {
    if (n.it.type !== 'glass' || n.ghost) return;
    const g = pane(n.it), behind = [];
    for (let j = 0; j < i; j++) {
      const b = boxes[j];
      if (!nodes[j].ghost && nodes[j].it.type !== 'glass' && b.x0 < g.x1 && g.x0 < b.x1 && b.y0 < g.y1 && g.y0 < b.y1) behind.push(nodes[j]);
    }
    const d = 'M' + hull(g.pts).map((p) => p.map((v) => v.toFixed(2)).join(' ')).join('L') + 'Z', id = `glb${seq}-${n.it.id}`;
    out.set(n.it.id, `<g class="glass-behind"><defs><clipPath id="${id}"><path d="${d}"/></clipPath></defs>` +
      `<g clip-path="url(#${id})"><path class="glass-backdrop" d="${d}"/><g filter="url(#frost-blur)">` +
      behind.map((b) => `<g class="${b.cls || 'it'}">${html(b.it)}</g>`).join('') + `</g></g></g>`);
  });
  return out;
}

export function renderItem(K, item, cut = Infinity) {
  const { W0, D0, parts } = partsFor(item);
  return renderParts(K, parts, { W0, D0, rot: item.rot, ox: item.gx * CELL, oy: item.gy * CELL, z0: 0, cut });
}

/**
 * The hover card's text as attributes for an item's group (read by HoverTip), or '' for none: English as
 * data-tip / data-tip-sub, and each other language that differs as data-tip-<lang> / data-tip-sub-<lang>
 * (HoverTip shows the display language's, so a language change needs no redraw).
 */
export function tipAttrs(item) {
  return Object.entries(tipData(item)).map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
}

/** The same as an object of attributes ({} for none), for React. */
export function tipData(item) {
  const en = tipFor(item, 'en');
  if (!en) return {};
  const out = { 'data-tip': en.title, 'data-tip-sub': en.sub || '' };
  for (const l of TIP_LANGS) {
    if (l === 'en') continue;
    const t = tipFor(item, l);
    if (t.title !== en.title) out[`data-tip-${l}`] = t.title;
    if ((t.sub || '') !== (en.sub || '')) out[`data-tip-sub-${l}`] = t.sub || '';
  }
  return out;
}

/** Zone name tag on the floor plane, for the overlay layer above the furniture. */
/**
 * Name callouts for the occupied desks: a speech bubble with the employee's name floating just above each
 * desk's worktop, a pill whose small sharp notch at the bottom centre points down at the desk. Drawn in
 * screen space (text stays upright and level), back to front so nearer pills overlap farther ones; meant for
 * a layer over the whole scene.
 */
// The desks' name cards: a frosted card floating just above the monitor (everything behind it blurs: an HTML
// card in a foreignObject, with backdrop-filter), no border; a rounded-square profile picture with the name
// under it. Every card is the same width, wrapped tight round the picture; a long name shrinks to fit.
const CALLOUT = { rise: 3, pad: 3, pic: 24, gap: 2, fs: 7.5, nameH: 9 };
const textW = (s, fs) => [...s].reduce((w, c) => w + (/[\u1100-\uffff]/.test(c) ? 1.02 : 0.6) * fs, 0);
/** The profile picture: a placeholder head and shoulders for now (a real photo will go in its place). */
const PIC = '<svg viewBox="0 0 30 30" preserveAspectRatio="xMidYMid slice"><circle class="callout-pic-fig" cx="15" cy="12" r="5.6"/>' +
  '<path class="callout-pic-fig" d="M4.5 31a10.5 9 0 0 1 21 0Z"/></svg>';
/** Where a desk's card floats: just above the top of its monitor (world point, rotation included). */
function monitorTop(it) {
  const { W0, D0, parts } = partsFor(it), p = parts.find((q) => /\bmonitor-body\b/.test(q.cls || ''));
  if (!p) { const f = footprint(it); return [(it.gx + f.w / 2) * CELL, (it.gy + f.d / 2) * CELL, SIZES.desk.h]; }
  const w = placeRect(p, W0, D0, it.rot, it.gx * CELL, it.gy * CELL);
  return [w.x + w.w / 2, w.y + w.d / 2, p.z + p.h];
}
export function renderDeskCallouts(K, items) {
  const { rise, pad, pic, gap, fs, nameH } = CALLOUT;
  const W = pic + 2 * pad, H = pad + pic + gap + nameH + pad * 0.6;
  return items.filter((it) => it.type === 'desk' && (it.name || '').trim())
    .map((it) => ({ it, at: monitorTop(it) }))
    .sort((a, b) => a.at[0] + a.at[1] - (b.at[0] + b.at[1]))
    .map(({ it, at }) => {
      const name = it.name.trim(), [ax, ay] = K.P(...at), x = ax - W / 2, y = ay - rise - H;
      const size = Math.min(fs, (pic + pad) / Math.max(textW(name, 1), 1e-6));
      return `<foreignObject class="desk-callout" data-for="${esc(it.id)}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${W}" height="${H.toFixed(1)}">` +
        `<div xmlns="http://www.w3.org/1999/xhtml" class="callout-card" style="padding:${pad}px ${pad}px ${(pad * 0.6).toFixed(1)}px">` +
        `<div class="callout-pic" style="width:${pic}px;height:${pic}px">${PIC}</div>` +
        `<div class="callout-name" style="margin-top:${gap}px;height:${nameH}px;line-height:${nameH}px;font-size:${size.toFixed(2)}px">${esc(name)}</div>` +
        `</div></foreignObject>`;
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
  // a soft shadow: about three quarters of the wall's height long, light at the base and melting into the floor
  const shell = [...items.filter((it) => shellTypes.has(it.type)), ...edges].map((it) => caster(it, itemNode(it).z1 * 0.75));
  return shadowLayer(K, shell, { clipId, clip, darkness: 0.28, spread: [0.8, 5], cls: 'plan-shadow' });
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
  const solid = depthSort([...items.filter((it) => LAYER[it.type] !== 'floor'), ...edges].map((it) => ({ ...itemNode(it), it })));
  const frost = glassBackdrops(K, solid.map((n) => ({ ...n, cls: `it${n.it.faded ? ' faded' : ''}${cafe.has(n.it.id) ? ' cafe' : ''}` })), (it) => renderItem(K, it));
  s += solid.map((n) => (frost.get(n.it.id) || '') + g(n.it, n.it.id.startsWith('edge-') ? ' edge' : '')).join('');
  s += floor.filter((it) => it.type === 'zone').map((it) => `<g class="tag${isLive(it) ? ' live' : ''}">${renderZoneTag(K, it)}</g>`).join('');
  if (!bare) s += `<g class="desk-callouts">${renderDeskCallouts(K, items.filter((it) => !it.faded))}</g>`;
  return s;
}

/** Outer walls that sit just outside the tile grid in the PDF, as non-interactive wall items. */
export const edgeItems = (plan) => (plan.edges || []).map((e, i) => ({ id: `edge-${i}`, type: e.type || 'wall', gx: e.gx, gy: e.gy, rot: e.rot, w: e.w }));
