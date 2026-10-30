// The building ghosted under the open floor (or unit): only its outside — the footprint's outer edges at
// each storey below, and the outer walls from the ground up to the open floor as faint glass — so the floor
// keeps its place in the building without anything drawn inside it. Nothing above the open floor.
import { CELL, TILE } from './units.js';

/** Storey height in plan units (1 unit = 2 cm): 3.2 m, as in the tower view. */
export const STOREY = 160;

/**
 * The outer outline of a plan's tile mask (rows of '0' / '1'), in plan units — only edges that face the
 * open air outside the building (gaps enclosed by the footprint count as inside), and only the ones that
 * face the viewer: `front` (outside below, [x0, x1, y]) and `side` (outside to the right, [y0, y1, x]).
 */
function outerEdges(mask) {
  const T = TILE * CELL, W = Math.max(...mask.map((r) => r.length)), H = mask.length;
  // flood the outside in from a one-tile margin round the mask
  const out = new Set(), key = (x, y) => `${x},${y}`, on = (x, y) => mask[y]?.[x] === '1';
  const stack = [[-1, -1]];
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < -1 || y < -1 || x > W || y > H || out.has(key(x, y)) || on(x, y)) continue;
    out.add(key(x, y));
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  const air = (x, y) => out.has(key(x, y));
  const runs = (n, m, edge) => {   // merge consecutive edge tiles into runs: [[a0, a1, line]]
    const res = [];
    for (let j = 0; j <= m; j++) {
      let start = -1;
      for (let i = 0; i <= n; i++) {
        const e = i < n && edge(i, j);
        if (e && start < 0) start = i;
        if (!e && start >= 0) { res.push([start * T, i * T, j * T]); start = -1; }
      }
    }
    return res;
  };
  return {
    front: runs(W, H, (tx, ty) => on(tx, ty - 1) && air(tx, ty)),   // bottom edge of a tile, open air below
    side: runs(H, W, (ty, tx) => on(tx - 1, ty) && air(tx, ty)),    // right edge of a tile, open air beside
  };
}

/**
 * Ghost of the building under the open storey `floor` of a plan (at z = 0), from the plan's tile mask.
 * Returns `below` (SVG, drawn under the plan) and `bounds`: screen-space corners from the ground to the
 * open floor (for a view that takes it all in).
 */
export function ghostBuilding(K, mask, floor) {
  const e = outerEdges(mask), zGround = -floor * STOREY;
  // a storey's line: the outer edges facing the viewer (the back ones are behind the building anyway)
  const ring = (z) => [
    ...e.front.map(([a, b, y]) => K.path([[a, y, z], [b, y, z]])),
    ...e.side.map(([a, b, x]) => K.path([[x, a, z], [x, b, z]])),
  ].join('');
  let s = e.front.map(([a, b, y]) => `<path class="ghost-wall front" d="${K.path([[a, y, zGround], [b, y, zGround], [b, y, 0], [a, y, 0]])}Z"/>`).join('') +
    e.side.map(([a, b, x]) => `<path class="ghost-wall side" d="${K.path([[x, a, zGround], [x, b, zGround], [x, b, 0], [x, a, 0]])}Z"/>`).join('');
  let rings = '';
  for (let i = 0; i < floor; i++) rings += ring(zGround + i * STOREY);
  if (rings) s += `<path class="ghost-floor" d="${rings}"/>`;
  const W = Math.max(...mask.map((r) => r.length)) * TILE * CELL, H = mask.length * TILE * CELL;
  const bounds = [[0, 0], [W, 0], [W, H], [0, H]].flatMap(([x, y]) => [K.P(x, y, zGround), K.P(x, y, 0)]);
  // clear at the top (the open floor), fading out toward the ground
  const fade = `<defs><linearGradient id="ghost-fade-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/>` +
    `<stop offset=".3" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
    `<mask id="ghost-fade" maskUnits="objectBoundingBox" maskContentUnits="objectBoundingBox" x="0" y="0" width="1" height="1">` +
    `<rect width="1" height="1" fill="url(#ghost-fade-g)"/></mask></defs>`;
  return { below: floor > 0 ? `${fade}<g class="ghost-bld" mask="url(#ghost-fade)">${s}</g>` : '', bounds };
}

/** A view (viewBox rect, at aspect `aspect` = h / w) framing screen points pts with padding. */
export function frameOf(pts, aspect, pad = 1.08) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const w = Math.max((Math.max(...xs) - Math.min(...xs)) * pad, ((Math.max(...ys) - Math.min(...ys)) * pad) / aspect);
  return { x: cx - w / 2, y: cy - (w * aspect) / 2, w, h: w * aspect };
}
