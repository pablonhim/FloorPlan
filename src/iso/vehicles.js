// Low-poly vehicles for the exterior (tower view).
//
// Each model is described in car-local metres: u along the car (0 = rear bumper, 1 = front, as a
// fraction of its length), v across it (0 = centre line), z up. The body is two convex solids built from
// a side profile extruded across the car with tumblehome (half-width shrinking with height): the lower
// body, then the cabin (glasshouse). Wheels are octagonal drums with a metallic rim disc.
//
// Paint order (no depth sort needed): contact shadows → far-side wheels → lower body → cabin → wells on
// the near side → near-side wheels. Faces are back-face culled against the iso view direction (1, 1, 1)
// and shaded by a lambert term for the scene's sun (from the right, high), so any orientation shades
// consistently with the buildings.
import { SUN } from './shadow.js';

const VIEW = [1, 1, 1];
const LIGHT = (() => { const v = [0.62, -0.25, 0.74]; const n = Math.hypot(...v); return v.map((c) => c / n); })();
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mean = (ps) => ps.reduce((a, p) => [a[0] + p[0] / ps.length, a[1] + p[1] / ps.length, a[2] + p[2] / ps.length], [0, 0, 0]);

/**
 * Models. L, W in metres; r wheel radius; axles as fractions of L; lower / cabin: side profiles
 * [u fraction, z m], in order around the outline (rear-bottom first); taper: half-width at the profile's
 * top as a fraction of the bottom's; glass: indices of cabin profile edges that are glazed (edge i runs
 * from point i to i + 1); sideGlass: cabin sides glazed; win: an explicit side window instead (u, z).
 */
export const MODELS = {
  model3: { name: 'Tesla Model 3', L: 4.72, W: 1.85, r: 0.34, axles: [0.2, 0.78],
    lower: [[0.02, 0.3], [0, 0.55], [0.02, 0.82], [0.74, 0.84], [0.97, 0.7], [1, 0.5], [0.98, 0.3]], lowerTaper: 0.94,
    cabin: [[0.1, 0.83], [0.42, 1.42], [0.6, 1.44], [0.8, 0.84]], cabinTaper: 0.72, glass: [0, 1, 2], sideGlass: true },
  modelY: { name: 'Tesla Model Y', L: 4.75, W: 1.92, r: 0.36, axles: [0.2, 0.78],
    lower: [[0.02, 0.33], [0, 0.6], [0.02, 0.9], [0.75, 0.9], [0.97, 0.76], [1, 0.52], [0.98, 0.33]], lowerTaper: 0.94,
    cabin: [[0.04, 0.9], [0.13, 1.36], [0.42, 1.6], [0.62, 1.62], [0.8, 0.9]], cabinTaper: 0.74, glass: [0, 1, 2, 3], sideGlass: true },
  cybertruck: { name: 'Tesla Cybertruck', L: 5.1, W: 2.0, r: 0.44, axles: [0.18, 0.8],
    lower: [[0, 0.48], [0, 1.12], [1, 1.0], [1, 0.62], [0.97, 0.48]], lowerTaper: 1,
    cabin: [[0, 1.12], [0.42, 1.86], [0.62, 1.55], [1, 1.0]], cabinTaper: 0.9, glass: [1], sideGlass: false,
    win: [[0.3, 1.16], [0.42, 1.72], [0.6, 1.52], [0.7, 1.16]] },
  p911: { name: 'Porsche 911', L: 4.52, W: 1.85, r: 0.34, axles: [0.17, 0.79],
    lower: [[0.02, 0.28], [0, 0.6], [0.04, 0.76], [0.75, 0.74], [0.98, 0.56], [1, 0.4], [0.97, 0.28]], lowerTaper: 0.92,
    cabin: [[0.1, 0.75], [0.36, 1.27], [0.56, 1.29], [0.72, 0.75]], cabinTaper: 0.7, glass: [0, 2], sideGlass: true },
  taycan: { name: 'Porsche Taycan', L: 4.96, W: 1.97, r: 0.36, axles: [0.19, 0.8],
    lower: [[0.02, 0.28], [0, 0.6], [0.03, 0.78], [0.74, 0.76], [0.98, 0.56], [1, 0.4], [0.97, 0.28]], lowerTaper: 0.93,
    cabin: [[0.12, 0.77], [0.38, 1.36], [0.58, 1.38], [0.74, 0.77]], cabinTaper: 0.7, glass: [0, 1, 2], sideGlass: true },
  ferrari: { name: 'Ferrari', L: 4.57, W: 1.96, r: 0.35, axles: [0.2, 0.78],
    lower: [[0.01, 0.26], [0, 0.62], [0.04, 0.76], [0.7, 0.72], [0.98, 0.44], [1, 0.34], [0.97, 0.24]], lowerTaper: 0.9,
    cabin: [[0.24, 0.74], [0.4, 1.17], [0.52, 1.19], [0.7, 0.73]], cabinTaper: 0.68, glass: [0, 2], sideGlass: true },
  byd: { name: 'BYD e2', L: 4.26, W: 1.76, r: 0.32, axles: [0.19, 0.8],
    lower: [[0.02, 0.34], [0, 0.62], [0.02, 0.92], [0.8, 0.9], [0.98, 0.74], [1, 0.52], [0.98, 0.34]], lowerTaper: 0.95,
    cabin: [[0.01, 0.92], [0.05, 1.47], [0.58, 1.5], [0.8, 0.91]], cabinTaper: 0.78, glass: [0, 2], sideGlass: true },
};

/** Paints: CSS custom properties in iso.css (light and night variants), matte or metallic. */
export const PAINTS = ['white', 'black', 'red', 'steel', 'blue', 'grey', 'silver'];

/**
 * Draws one car (SVG string) for kernel K. (cx, cy): centre on the ground plane at height z, in world
 * units; (ux, uy): unit forward direction; m: world units per metre; paint: one of PAINTS.
 */
export function vehicle(K, { model, cx, cy, ux, uy, z, m, paint, lights = false, shadow = true, interior = false }) {
  const md = MODELS[model];
  const L = md.L * m, hw0 = (md.W / 2) * m;
  // car-local (u along from the rear in metres·m, v across, h up) → world
  const W3 = (u, v, h) => [cx + ux * (u - L / 2) - uy * v, cy + uy * (u - L / 2) + ux * v, z + h];
  const pathOf = (pts) => K.path(pts) + 'Z';
  const shade = (n) => Math.round(55 + 45 * Math.max(0, dot(n, LIGHT)));   // % of paint vs its dark
  const fillStyle = (n, mat) => `fill:color-mix(in srgb, var(--${mat}) ${shade(n)}%, var(--${mat}-dk))`;
  let seeThrough = false;                          // set while drawing the cabin of an x-rayed car

  /** Convex solid from profile pts [[u m, z m]] with half-width hw at the bottom, ×taper at the top. */
  const slab = (pts, hwB, taper, faceCls) => {
    const zs = pts.map((p) => p[1]), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const hwAt = (h) => hwB * (1 + (taper - 1) * ((h - z0) / Math.max(1e-6, z1 - z0)));
    // rounded corners in plan: near each bumper (within R of the car's length) the outline is sampled
    // more finely and pulled in along a quarter-circle, so the corners read as rounded, not cut
    const R = 0.11, step = 0.018 * L;
    const P = [], orig = [];                                       // points, and the profile edge each starts
    pts.forEach(([u, h], i) => {
      const [u2, h2] = pts[(i + 1) % pts.length];
      const nearEnd = Math.min(u, L - u, u2, L - u2) < R * L;
      const n = nearEnd ? Math.max(1, Math.ceil(Math.abs(u2 - u) / step)) : 1;
      for (let k = 0; k < n; k++) { P.push([u + ((u2 - u) * k) / n, (h + ((h2 - h) * k) / n) * m]); orig.push(i); }
    });
    const ends = (u) => { const f = Math.min(u, L - u) / L; return f >= R ? 1 : 0.6 + 0.4 * Math.sqrt(1 - (1 - f / R) ** 2); };
    const right = P.map(([u, h]) => W3(u, hwAt(h / m) * ends(u), h)), left = P.map(([u, h]) => W3(u, -hwAt(h / m) * ends(u), h));
    const c = mean([...right, ...left]);
    const faces = [{ pts: right, kind: 'side' }, { pts: left.slice().reverse(), kind: 'side' }];
    P.forEach((_, i) => {
      const j = (i + 1) % P.length;
      faces.push({ pts: [right[i], right[j], left[j], left[i]], kind: 'strip', edge: orig[i] });
    });
    let s = '';
    for (const f of faces) {
      let n = cross(sub(f.pts[1], f.pts[0]), sub(f.pts[2], f.pts[0]));
      if (dot(n, sub(mean(f.pts), c)) < 0) n = n.map((x) => -x);
      const len = Math.hypot(...n) || 1;
      n = n.map((x) => x / len);
      if (dot(n, VIEW) <= 1e-4) continue;                                   // faces away from the viewer
      // strips (the body's lengthwise bands) are outlined in their own colour: the many short strips of a
      // rounded corner then read as one smooth surface instead of a hatch of edge lines
      const fs = fillStyle(n, faceCls(f));
      s += f.kind === 'strip'
        ? `<path class="car-face strip${seeThrough ? ' xray' : ''}" style="${fs};stroke:${fs.slice(5)}" d="${pathOf(f.pts)}"/>`
        : `<path class="car-face${seeThrough ? ' xray' : ''}" style="${fs}" d="${pathOf(f.pts)}"/>`;
    }
    return s;
  };

  // which side faces the viewer: +v side's outward normal is (-uy, ux, 0)
  const nearSign = (-uy + ux) > 0 ? 1 : -1;
  const paintVar = `paint-${paint}`;
  const wheels = md.axles.flatMap((a) => [1, -1].map((side) => ({ u: a * L, side })));
  const r = md.r * m, tw = 0.24 * m, clr = Math.min(...md.lower.map((p) => p[1])) * m;

  // wheel: octagonal drum across the car at the body's side line
  const oct = (rad, u0, h0) => [...Array(8)].map((_, i) => { const a = (i + 0.5) * Math.PI / 4; return [u0 + rad * Math.cos(a), h0 + rad * Math.sin(a)]; });
  const wheel = ({ u, side }) => {
    const vOut = side * (hw0 - 0.02 * m), vIn = side * (hw0 - 0.02 * m - tw);
    const ring = oct(r, u, r);
    const outer = ring.map(([uu, hh]) => W3(uu, vOut, hh)), inner = ring.map(([uu, hh]) => W3(uu, vIn, hh));
    const c = mean([...outer, ...inner]);
    let s = '';
    const faces = [{ pts: outer, rim: true }, { pts: inner.slice().reverse() }];
    ring.forEach((_, i) => { const j = (i + 1) % 8; faces.push({ pts: [outer[i], outer[j], inner[j], inner[i]] }); });
    for (const f of faces) {
      let n = cross(sub(f.pts[1], f.pts[0]), sub(f.pts[2], f.pts[0]));
      if (dot(n, sub(mean(f.pts), c)) < 0) n = n.map((x) => -x);
      const len = Math.hypot(...n) || 1;
      n = n.map((x) => x / len);
      if (dot(n, VIEW) <= 1e-4) continue;
      s += `<path class="car-tyre" style="${fillStyle(n, 'tyre')}" d="${pathOf(f.pts)}"/>`;
      if (f.rim) s += `<path class="car-rim" d="${pathOf(oct(r * 0.62, u, r).map(([uu, hh]) => W3(uu, vOut + side * 0.01 * m, hh)))}"/>`;
    }
    return s;
  };

  // ---- contact shadows: a soft directional shadow (sun from the right) plus tight dark patches under
  // the sills and the tyres, so the car sits on the paving ----
  const lowH = 0.5 * m, sx = SUN.dx * lowH, sy = SUN.dy * lowH;
  const foot = (grow, ox = 0, oy = 0) => [[-grow, -hw0 - grow], [L + grow, -hw0 - grow], [L + grow, hw0 + grow], [-grow, hw0 + grow]]
    .map(([u, v]) => { const p = W3(u, v, 0); return [p[0] + ox, p[1] + oy, z]; });
  function shadowParts() {
    const cast = `<path class="cast" d="${pathOf(hullXY([...foot(0.1 * m), ...foot(0.1 * m, sx, sy)]).map(([x, y]) => [x, y, z]))}"/>`;
    const ao = `<path class="ao" d="${pathOf(foot(-0.05 * m))}"/>` + wheels.map(({ u, side }) => {
      const v = side * (hw0 - 0.02 * m - tw / 2);
      return `<path class="tyre-ao" d="${pathOf([[u - r * 0.7, v - tw * 0.7], [u + r * 0.7, v - tw * 0.7], [u + r * 0.7, v + tw * 0.7], [u - r * 0.7, v + tw * 0.7]].map(([uu, vv]) => W3(uu, vv, 0)))}"/>`;
    }).join('');
    return { cast, ao };
  }
  if (shadow === 'only') return shadowParts();
  // one blur per group (not per shape): the cast shadow, then the contact shadows under body and tyres
  const sh = shadowParts();
  let s = shadow ? `<g class="car-shadow"><g filter="url(#car-pen)">${sh.cast}</g><g filter="url(#car-ao)">${sh.ao}</g></g>` : '';

  const far = wheels.filter((w) => w.side !== nearSign), near = wheels.filter((w) => w.side === nearSign);
  // driving at night (lights: true; shown in dark mode only): headlight beams spread on the road ahead
  if (lights) {
    const beam = (v0) => [[L - 0.05 * m, v0 - 0.1 * m], [L - 0.05 * m, v0 + 0.1 * m], [L + 7 * m, v0 + 1.3 * m], [L + 7 * m, v0 - 1.3 * m]]
      .map(([u, v]) => W3(u, v, 0.02 * m));
    const vh = hw0 * 0.62;
    // both beams and the bright pool share one blur
    s += `<g class="car-lights"><g filter="url(#car-pen)">` +
      `<path class="car-beam" d="${pathOf(beam(vh))}"/><path class="car-beam" d="${pathOf(beam(-vh))}"/>` +
      `<path class="car-beam core" d="${pathOf([[L, -hw0 * 0.8], [L, hw0 * 0.8], [L + 3 * m, hw0 * 1.1], [L + 3 * m, -hw0 * 1.1]].map(([u, v]) => W3(u, v, 0.02 * m)))}"/></g></g>`;
  }
  s += far.map(wheel).join('');
  const lowerPts = md.lower.map(([f, h]) => [f * L, h]);
  s += slab(lowerPts, hw0, md.lowerTaper, () => paintVar);
  const cabinPts = md.cabin.map(([f, h]) => [f * L, h]);
  if (interior) {
    // seen through: two front seats, a rear bench and the steering wheel, under a see-through cabin
    const belt = Math.min(...md.cabin.map((p) => p[1])) * m, cu = md.cabin.map((p) => p[0] * L);
    const c0 = Math.min(...cu), c1 = Math.max(...cu), span = c1 - c0;
    const block = (u0, u1, v0, v1, z0, z1, cls) => {
      const P = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
      const lo = P.map(([u, v]) => W3(u, v, z0)), hi = P.map(([u, v]) => W3(u, v, z1));
      const faces = [hi, ...P.map((_, i) => { const j = (i + 1) % 4; return [hi[i], hi[j], lo[j], lo[i]]; })];
      const c = mean([...lo, ...hi]);
      return faces.map((pts) => {
        let n = cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]));
        if (dot(n, sub(mean(pts), c)) < 0) n = n.map((x) => -x);
        const ln = Math.hypot(...n) || 1;
        n = n.map((x) => x / ln);
        return dot(n, VIEW) > 1e-4 ? `<path class="car-seat" style="${fillStyle(n, cls)}" d="${pathOf(pts)}"/>` : '';
      }).join('');
    };
    const sw = hw0 * 0.38, seatZ = belt - 0.38 * m;
    const front = c0 + span * 0.52, rear = c0 + span * 0.18;
    // painted back (low u + v) to front
    s += block(rear, rear + 0.45 * m, -hw0 * 0.8, hw0 * 0.8, seatZ, belt + 0.05 * m, 'seat');
    for (const v of [-1, 1]) {
      s += block(front, front + 0.5 * m, v * sw - 0.25 * m, v * sw + 0.25 * m, seatZ, belt - 0.12 * m, 'seat');           // cushion
      s += block(front - 0.12 * m, front, v * sw - 0.25 * m, v * sw + 0.25 * m, seatZ, belt + 0.38 * m, 'seat');           // back
    }
    const wheelU = front + 0.82 * m;
    s += block(wheelU, wheelU + 0.05 * m, sw - 0.17 * m, sw + 0.17 * m, belt - 0.05 * m, belt + 0.22 * m, 'tyre');           // steering wheel
    seeThrough = true;
  }
  const hwCabin = hw0 * md.lowerTaper * 0.97;
  s += slab(cabinPts, hwCabin, md.cabinTaper, (f) => (f.kind === 'side' ? (md.sideGlass ? 'glass-car' : paintVar) : md.glass.includes(f.edge) ? 'glass-car' : paintVar));
  seeThrough = false;
  if (md.win) {
    // explicit side window on the near cabin side (Cybertruck): placed on the tapered side plane
    const zs = cabinPts.map((p) => p[1]), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const hwAt = (h) => hwCabin * (1 + (md.cabinTaper - 1) * ((h - z0) / (z1 - z0)));
    s += `<path class="car-window" d="${pathOf(md.win.map(([f, h]) => W3(f * L, nearSign * (hwAt(h) + 0.005 * m), h * m)))}"/>`;
  }
  // wheel wells: dark arches on the near body side, behind the near wheels
  const hwLow = (h) => {
    const zs = lowerPts.map((p) => p[1]), z0 = Math.min(...zs), z1 = Math.max(...zs);
    return hw0 * (1 + (md.lowerTaper - 1) * ((h - z0) / (z1 - z0)));
  };
  s += near.map(({ u }) => {
    const R = r * 1.18, arch = [...Array(9)].map((_, i) => { const a = (i / 8) * Math.PI; return [u + R * Math.cos(a), r + R * Math.sin(a)]; });
    const pts = [[u + R, clr], ...arch, [u - R, clr]].map(([uu, hh]) => W3(uu, nearSign * (hwLow(hh / m) + 0.005 * m), Math.max(hh, clr)));
    return `<path class="car-well" d="${pathOf(pts)}"/>`;
  }).join('');
  s += near.map(wheel).join('');
  // lamps on the end faces that face the viewer: head lamps at the front, tail lamps at the rear
  if (lights) {
    const lampZ = Math.max(...md.lower.filter(([f]) => f > 0.9).map(([, h]) => h)) * m * 0.82;
    const lamp = (u, v, cls) => `<path class="${cls}" d="${pathOf([[u, v - 0.16 * m, lampZ + 0.05 * m], [u, v + 0.16 * m, lampZ + 0.05 * m], [u, v + 0.16 * m, lampZ - 0.06 * m], [u, v - 0.16 * m, lampZ - 0.06 * m]].map(([uu, vv, hh]) => W3(uu, vv, hh)))}"/>`;
    const vh = hw0 * 0.62, fwdSeen = ux + uy > 0;
    s += `<g class="car-lights">` + (fwdSeen
      ? lamp(L + 0.02 * m, vh, 'car-head') + lamp(L + 0.02 * m, -vh, 'car-head')
      : lamp(-0.02 * m, vh, 'car-tail') + lamp(-0.02 * m, -vh, 'car-tail')) + `</g>`;
  }
  return `<g class="vehicle" data-model="${model}">${s}</g>`;
}

/** Filters used by the car shadows (once per SVG). */
export const VEHICLE_DEFS = `<defs>` +
  `<filter id="car-ao" filterUnits="userSpaceOnUse" x="-2000" y="-2000" width="6000" height="6000"><feGaussianBlur stdDeviation=".45"/></filter>` +
  `<filter id="car-pen" filterUnits="userSpaceOnUse" x="-2000" y="-2000" width="6000" height="6000"><feGaussianBlur stdDeviation="1.1"/></filter>` +
  `</defs>`;

function hullXY(pts) {
  const p = pts.map(([x, y]) => [x, y]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length > 1 && cr(lo.at(-2), lo.at(-1), q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length > 1 && cr(up.at(-2), up.at(-1), q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
