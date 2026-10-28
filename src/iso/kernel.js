// Isometric projection kernel, ported from iso-glow / iso-figure (MIT, github.com/MrBongoC/ai-iso-skill).
//
// World axes: +x runs down-right, +y down-left, +z up.
// Screen:     sx = (x - y)·cos30 + OX,  sy = (x + y)·sin30 - z + OY
//
// Faces are drawn by mapping a flat local 2D group onto a 3D plane with an SVG matrix:
//   TOP(x,y,z)   local u → +x, v → +y          (deck)
//   FRONT(x,y,z) local u → +x, v → -z          (y = max face, lower-left)
//   SIDE(x,y,z)  local u → -y, v → -z          (x = max face, lower-right)
// so ordinary rects/text inside `<g transform="${FRONT(...)}">` land on the plane.

export const C = Math.cos(Math.PI / 6);
export const S = Math.sin(Math.PI / 6);

/** World vector → screen vector (no origin). */
export const D = (x, y, z) => [(x - y) * C, (x + y) * S - z];

const n2 = (v) => v.toFixed(2);

export function kernel(OX, OY) {
  const P = (x, y, z) => [(x - y) * C + OX, (x + y) * S - z + OY];

  /** Screen → world on the horizontal plane at height z. Exact inverse of P. */
  const unproject = (sx, sy, z = 0) => {
    const a = (sx - OX) / C; // x - y
    const b = (sy - OY + z) / S; // x + y
    return [(a + b) / 2, (b - a) / 2];
  };

  const plane = (O, U, V) => {
    const o = P(...O), u = D(...U), v = D(...V);
    return `matrix(${u[0]} ${u[1]} ${v[0]} ${v[1]} ${o[0]} ${o[1]})`;
  };
  const TOP = (x, y, z) => plane([x, y, z], [1, 0, 0], [0, 1, 0]);
  const FRONT = (x, y, z) => plane([x, y, z], [1, 0, 0], [0, 0, -1]);
  const SIDE = (x, y, z) => plane([x, y, z], [0, -1, 0], [0, 0, -1]);

  // A rectangle on a plane. Square-cornered ones (every box face) are emitted as a single polygon in
  // screen space: half the DOM nodes of a <g transform><rect/></g> pair and no matrix to compose.
  const rect = (t, w, h, r = 0, cls = 'face') => {
    const m = r ? null : /^matrix\(([^)]*)\)$/.exec(t);
    if (!m) return `<g transform="${t}"><rect class="${cls}" width="${w}" height="${h}" rx="${r}"/></g>`;
    const [a, b, c, d, e, f] = m[1].split(' ').map(Number);
    const q = (u, v) => `${n2(a * u + c * v + e)} ${n2(b * u + d * v + f)}`;
    return `<path class="${cls}" d="M${q(0, 0)}L${q(w, 0)}L${q(w, h)}L${q(0, h)}Z"/>`;
  };

  const d3 = (pts) => 'M' + pts.map((p) => P(...p).map(n2).join(' ')).join('L') + 'Z';

  // Rounded box: one rounded top plus one continuous side wall along the visible part of the
  // outline, so the corners meet cleanly. r = 0 keeps the classic three flat faces.
  const rounded = (x, y, z, w, d, h, r, c) => {
    r = Math.min(r, w / 2, d / 2);
    const n = 10, z1 = z + h, q = Math.PI / 4, H = Math.PI / 2;
    const arc = (cx, cy, a0, a1) => {
      const o = [];
      for (let i = 0; i <= n; i++) {
        const a = a0 + ((a1 - a0) * i) / n;
        o.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
      }
      return o;
    };
    const ring = [...arc(x + w - r, y + r, -H, 0), ...arc(x + w - r, y + d - r, 0, H), ...arc(x + r, y + d - r, H, 2 * H), ...arc(x + r, y + r, 2 * H, 3 * H)];
    const vis = [...arc(x + w - r, y + r, -q, 0), ...arc(x + w - r, y + d - r, 0, H), ...arc(x + r, y + d - r, H, 3 * q)];
    const wall = [...vis.map(([a, b]) => [a, b, z]), ...vis.slice().reverse().map(([a, b]) => [a, b, z1])];
    return `<path class="face front${c}" d="${d3(wall)}"/><path class="face top${c}" d="${d3(ring.map(([a, b]) => [a, b, z1]))}"/>`;
  };

  /**
   * Solid box: three visible faces (or a rounded top + wall when r > 0). `cls` is appended to every
   * face; faces are also tagged `side` (x = max, lower-right), `front` (y = max) or `top` for shading.
   */
  const box = (x, y, z, w, d, h, r = 0, cls = '') => {
    const c = cls ? ' ' + cls : '';
    if (r > 0) return rounded(x, y, z, w, d, h, r, c);
    return rect(SIDE(x + w, y + d, z + h), d, h, 0, 'face side' + c) +
      rect(FRONT(x, y + d, z + h), w, h, 0, 'face front' + c) +
      rect(TOP(x, y, z + h), w, d, 0, 'face top' + c);
  };

  /** Flat rectangle on the horizontal plane at height z (no walls). */
  const flat = (x, y, z, w, d, cls = 'face top') => rect(TOP(x, y, z), w, d, 0, cls);

  /** 3D polyline → SVG path "d". */
  const path = (pts) => 'M' + pts.map((p) => P(...p).map(n2).join(' ')).join('L');

  return { OX, OY, P, D, unproject, plane, TOP, FRONT, SIDE, rect, box, flat, path };
}

/** Frame a scene: pass its extreme 3D corners. Returns kernel + viewBox padded to `aspect`. */
export function frame(points, margin = 0.09, aspect = 4 / 3) {
  const d = points.map(([x, y, z]) => D(x, y, z));
  const x0 = Math.min(...d.map((p) => p[0])), x1 = Math.max(...d.map((p) => p[0]));
  const y0 = Math.min(...d.map((p) => p[1])), y1 = Math.max(...d.map((p) => p[1]));
  const m = margin * Math.max(x1 - x0, y1 - y0);
  let w = x1 - x0 + 2 * m, h = y1 - y0 + 2 * m;
  let ox = m - x0, oy = m - y0;
  if (w / h < aspect) { const nw = h * aspect; ox += (nw - w) / 2; w = nw; }
  else { const nh = w / aspect; oy += (nh - h) / 2; h = nh; }
  return { ...kernel(ox, oy), viewBox: `0 0 ${w.toFixed(1)} ${h.toFixed(1)}`, W: w, H: h };
}

/** Parallel hairlines at a0, a0+step … a1, each spanning b0→b1, in face-local units. */
export const slits = (a0, a1, step, b0, b1, vertical = true, cls = 'detail') => {
  let s = '';
  for (let a = a0; a <= a1 + 1e-6; a += step) {
    s += vertical
      ? `<line class="${cls}" x1="${a}" y1="${b0}" x2="${a}" y2="${b1}"/>`
      : `<line class="${cls}" x1="${b0}" y1="${a}" x2="${b1}" y2="${a}"/>`;
  }
  return s;
};

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
