// Moving actors for the tower view: paths that cars and people follow, and a low-poly walking figure.
//
// A path is a list of legs. Each leg is sampled from straight runs and quadratic corners (world units on
// the ground plane), carries its own speed, whether the car is reversing (it then faces against its
// motion), an optional height profile (ramps) and an optional clip id (the ramp opening, the plate
// outline). The runner asks pose(path, seconds) for where an actor is.

/** Build one leg from a start point and pieces: ['L', x, y] straight to, ['Q', cx, cy, x, y] corner. */
export function leg(start, pieces, opts = {}) {
  const pts = [start];
  let [x, y] = start;
  for (const p of pieces) {
    if (p[0] === 'L') {
      const [, x1, y1] = p, n = Math.max(1, Math.ceil(Math.hypot(x1 - x, y1 - y) / 0.8));
      for (let i = 1; i <= n; i++) pts.push([x + ((x1 - x) * i) / n, y + ((y1 - y) * i) / n]);
      [x, y] = [x1, y1];
    } else {
      const [, cx, cy, x1, y1] = p, n = 16;
      for (let i = 1; i <= n; i++) {
        const t = i / n, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
        pts.push([a * x + b * cx + c * x1, a * y + b * cy + c * y1]);
      }
      [x, y] = [x1, y1];
    }
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, len: cum.at(-1), speed: 30, reverse: false, z: null, clip: null, ...opts };
}

/** Cubic leg (used for reversing out of an angled bay): p0 → p3 with controls p1, p2. */
export function cubicLeg(p0, p1, p2, p3, opts = {}) {
  const pts = [];
  for (let i = 0; i <= 32; i++) {
    const t = i / 32, a = (1 - t) ** 3, b = 3 * (1 - t) ** 2 * t, c = 3 * (1 - t) * t * t, d = t ** 3;
    pts.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]);
  }
  return leg(pts[0], pts.slice(1).map(([x, y]) => ['L', x, y]), opts);
}

/** The path as one SVG polyline in world (plan) units, legs joined, jumps as moves; and its length. */
export function planPath(path) {
  let d = '', len = 0;
  for (const l of path) {
    if (!l.pts) continue;
    d += l.pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
    len += l.len;
  }
  return { d, len };
}

/** Total duration of a path in seconds (legs may hold a pause: { wait }). */
export const duration = (path) => path.reduce((a, l) => a + (l.wait ?? l.len / l.speed), 0);

/**
 * Pose at time t (s): { x, y, z, ux, uy, dist, leg } — ux, uy the way the actor faces; null once done.
 * Speed eases in over the first and out over the last metre or so of each leg that starts / ends a stop.
 */
export function pose(path, t) {
  let along = 0;                                  // distance covered on earlier legs
  for (const l of path) {
    const T = l.wait ?? l.len / l.speed;
    if (t > T) { t -= T; along += l.len || 0; continue; }
    if (l.wait) return { ...l.at, leg: l, dist: 0, along, k: t / T };
    const k = t / T;
    // ease: true = in-out; 'out' = brakes to a stop (enters at 2x the leg's mean speed); 'in' = pulls
    // away from a stop (leaves at 2x) — so a leg with half the cruise speed joins a cruising leg smoothly
    const e = l.ease === 'out' ? 1 - (1 - k) ** 2 : l.ease === 'in' ? k * k : l.ease ? (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2) : k;
    const s = e * l.len;
    let lo = 1, hi = l.cum.length - 1;           // first sample at or past s (binary search)
    while (lo < hi) { const mid = (lo + hi) >> 1; if (l.cum[mid] < s) lo = mid + 1; else hi = mid; }
    const i = lo;
    const [a, b] = [l.pts[i - 1], l.pts[i]], seg = l.cum[i] - l.cum[i - 1] || 1, f = (s - l.cum[i - 1]) / seg;
    const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f;
    let ux = b[0] - a[0], uy = b[1] - a[1];
    const n = Math.hypot(ux, uy) || 1;
    ux /= n; uy /= n;
    if (l.reverse) { ux = -ux; uy = -uy; }
    return { x, y, z: l.z ? l.z(x, y) : null, ux, uy, dist: s, along: along + s, leg: l };
  }
  return null;
}

/**
 * The drawings show walls and lifts cut down (the plans' elevator box is ~1.1 m), so figures are drawn at
 * this fraction of life size to stay shorter than the lift they walk into.
 */
export const PERSON_SCALE = 0.6;

/**
 * Low-poly walking figure (1.75 m × PERSON_SCALE) at (x, y) on the ground at z, facing (ux, uy), stride
 * phase from the distance walked. Boxes on the world axes nearest the heading, painted back to front.
 */
export function person(K, { x, y, z, ux, uy, dist, m: m0 }) {
  const m = m0 * PERSON_SCALE;
  const alongX = Math.abs(ux) >= Math.abs(uy);
  const f = alongX ? [Math.sign(ux), 0] : [0, Math.sign(uy)], l = [-f[1], f[0]];
  const ph = (dist / (1.3 * m)) * Math.PI * 2, sw = Math.sin(ph), bob = 0.03 * m * Math.abs(Math.cos(ph));
  // part: centre offsets (forward a, lateral b) in metres, z0 / height, size forward × lateral (m)
  const parts = [
    { a: 0.16 * sw, b: 0.1, z0: 0, h: 0.85, fa: 0.16, fb: 0.15, cls: 'person legs' },
    { a: -0.16 * sw, b: -0.1, z0: 0, h: 0.85, fa: 0.16, fb: 0.15, cls: 'person legs' },
    { a: 0, b: 0, z0: 0.85, h: 0.62, fa: 0.24, fb: 0.44, cls: 'person' },
    { a: -0.14 * sw, b: 0.28, z0: 0.9, h: 0.56, fa: 0.12, fb: 0.11, cls: 'person' },
    { a: 0.14 * sw, b: -0.28, z0: 0.9, h: 0.56, fa: 0.12, fb: 0.11, cls: 'person' },
    { a: 0.01, b: 0, z0: 1.5, h: 0.24, fa: 0.22, fb: 0.2, cls: 'person skin' },
  ].map((p) => {
    const cx = x + (f[0] * p.a + l[0] * p.b) * m, cy = y + (f[1] * p.a + l[1] * p.b) * m;
    const w = (alongX ? p.fa : p.fb) * m, d = (alongX ? p.fb : p.fa) * m;
    return { ...p, x0: cx - w / 2, y0: cy - d / 2, w, d };
  }).sort((p, q) => (p.x0 + p.w / 2 + p.y0 + p.d / 2) - (q.x0 + q.w / 2 + q.y0 + q.d / 2) || p.z0 - q.z0);
  const shadow = K.path([[x - 0.3 * m, y - 0.3 * m, z], [x + 0.3 * m, y - 0.3 * m, z], [x + 0.3 * m, y + 0.3 * m, z], [x - 0.3 * m, y + 0.3 * m, z]]) + 'Z';
  return `<g class="walker"><path class="walker-shadow" filter="url(#car-ao)" d="${shadow}"/>` +
    parts.map((p) => K.box(p.x0, p.y0, z + p.z0 * m + (p.cls.includes('legs') ? 0 : bob), p.w, p.d, p.h * m, 0, p.cls)).join('') + `</g>`;
}
