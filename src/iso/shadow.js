// Cast shadows and ambient occlusion for the structural shell.
//
// One sun, coming from the right: +x faces are lit, +y faces sit in shade, and shadows fall to the
// left on the floor. A box of height h casts the convex hull of its footprint and the footprint
// shifted by h · SUN on the ground plane.
//
// Realism: a shadow is darkest where it meets its caster and fades toward the tip. Each shadow is
// drawn as n stacked layers (more for tall casters, so the fade has no visible steps) — the shadow of the bottom 1/n, 2/n … n/n of the caster — so ground
// near the base is covered by every layer and the tip by one. Within a layer all casters merge (no
// darker blotches where walls meet), and a light blur (#penumbra) softens the edges.

/** Ground offset per unit of height (world units). */
export const SUN = { dx: -0.78, dy: 0.34 };

/** Andrew's monotone chain convex hull. */
function hull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) { while (lower.length > 1 && cross(lower.at(-2), lower.at(-1), q) <= 0) lower.pop(); lower.push(q); }
  for (const q of p.reverse()) { while (upper.length > 1 && cross(upper.at(-2), upper.at(-1), q) <= 0) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

const d2 = (K, pts, z) => 'M' + pts.map(([x, y]) => K.P(x, y, z).map((v) => v.toFixed(2)).join(' ')).join('L') + 'Z';

/** Shadow of box (x0..x1, y0..y1, height h above the ground plane at z) as an SVG path "d". */
export function castShadow(K, { x0, y0, x1, y1, h }, z = 0) {
  const ox = h * SUN.dx, oy = h * SUN.dy;
  const pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].flatMap(([x, y]) => [[x, y], [x + ox, y + oy]]);
  return d2(K, hull(pts), z);
}

/** Contact shadow: the footprint grown by `pad`, blurred by the #ao filter where it is drawn. */
export function contactShadow(K, { x0, y0, x1, y1 }, z = 0, pad = 3) {
  return d2(K, [[x0 - pad, y0 - pad], [x1 + pad, y0 - pad], [x1 + pad, y1 + pad], [x0 - pad, y1 + pad]], z);
}

/** Darkness right at the caster's base (the tip fades to roughly darkness / slices). */
export const BASE_DARKNESS = 0.58;

/** Rounded rectangle on the plane z as a path (same corner geometry as kernel box(..., r)). */
export function roundedRectPath(K, { x0, y0, x1, y1 }, r, z = 0) {
  r = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2);
  const pts = [];
  const arc = (cx, cy, a0) => { for (let i = 0; i <= 10; i++) { const a = a0 + (Math.PI / 2) * (i / 10); pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
  arc(x1 - r, y0 + r, -Math.PI / 2); arc(x1 - r, y1 - r, 0); arc(x0 + r, y1 - r, Math.PI / 2); arc(x0 + r, y0 + r, Math.PI);
  return d2(K, pts, z);
}

/** Rectangles (world units) on the plane z as one path, for a clipPath. */
export const rectsPath = (K, rects, z = 0) =>
  rects.map(({ x0, y0, x1, y1 }) => d2(K, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], z)).join('');

/**
 * Shadow layer, clipped to the floor. Options: `slices` (layers in the fade), `darkness` (at the base),
 * `spread` [near, far] blur radius: when set, each layer is blurred more the farther it reaches, so a
 * tall caster's shadow sharpens near its base and melts into rounded, diffuse corners at the tip.
 */
export function shadowLayer(K, casters, { z = 0, clipId, clip, slices = 8, darkness = BASE_DARKNESS, cls = '', spread = null }) {
  const ao = casters.map((c) => `<path d="${contactShadow(K, c, z)}"/>`).join('');
  // n layers of alpha a overlap near the base: 1 - (1 - a)^n = BASE_DARKNESS
  const a = (1 - Math.pow(1 - darkness, 1 / slices)).toFixed(4);
  const U = 'filterUnits="userSpaceOnUse" x="-4000" y="-4000" width="8000" height="8000"';
  let cast = '', defs = '';
  for (let k = 1; k <= slices; k++) {
    const t = k / slices;
    let f = '';
    if (spread) {
      defs += `<filter id="${clipId}-b${k}" ${U}><feGaussianBlur stdDeviation="${(spread[0] + (spread[1] - spread[0]) * t).toFixed(2)}"/></filter>`;
      f = ` filter="url(#${clipId}-b${k})"`;
    }
    cast += `<g class="shadow-slice" opacity="${a}"${f}>${casters.map((c) => `<path d="${castShadow(K, { ...c, h: c.h * t }, z)}"/>`).join('')}</g>`;
  }
  return `<defs><clipPath id="${clipId}"><path d="${clip}"/></clipPath>${defs}</defs>` +
    `<g class="${cls}" clip-path="url(#${clipId})"><g class="ao" filter="url(#ao)">${ao}</g>` +
    `<g class="cast-shadow"${spread ? '' : ' filter="url(#penumbra)"'}>${cast}</g></g>`;
}
