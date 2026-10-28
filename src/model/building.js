// Building footprint from the official layout's key plan (Floor 4 drawing embedded in the PDF).
//
// Traced in the key-plan image and converted to metres (the drawing is scaled 46.6 px/m across and
// 35.8 px/m down; that vertical scale makes the pillar rows 1.1 / 5.2 / 13.3 m, matching the unit
// plans). x runs east, y runs south, origin at the west-most wall line and the north façade.
// Units C (NW) and D (NE) sit above the central east–west corridor, A (SW) and B (SE) below it; the
// stepped bumps on both sides are the WC and stair cores.

/** Outer wall line, clockwise (rectilinear, metres). */
export const FOOTPRINT = [
  [0.6, 0], [12.5, 0], [12.5, 0.4], [20.1, 0.4], [20.1, 0], [32.0, 0],          // north façade, recessed centre
  [32.0, 13.3], [32.6, 13.3], [32.6, 17.5], [30.7, 17.5],                        // east WC core bump
  [30.7, 22.5], [31.6, 22.5], [31.6, 25.6], [28.0, 25.6],                        // east corridor end + stair core
  [28.0, 29.3], [28.9, 29.3], [28.9, 38.8],                                      // Unit B east side
  [23.9, 38.8], [23.9, 37.8], [21.4, 37.8], [21.4, 39.2],                        // south façade, stepped
  [11.2, 39.2], [11.2, 37.8], [8.6, 37.8], [8.6, 38.8],
  [3.6, 38.8], [3.6, 29.3], [4.5, 29.3], [4.5, 25.6],                            // Unit A west side
  [0.9, 25.6], [0.9, 22.5], [1.8, 22.5], [1.8, 17.5],                            // west stair core + corridor end
  [0, 17.5], [0, 13.3], [0.6, 13.3],                                             // west WC core bump
];

export const EXTENT = { w: 32.6, d: 39.2 };

/** Structural pillars (centres, metres). */
export const PILLARS = [
  [1.9, 1.1], [7.1, 1.1], [12.4, 1.1], [20.1, 1.1], [25.4, 1.1], [30.7, 1.1],
  [1.9, 5.2], [7.1, 5.2], [12.4, 5.2], [20.1, 5.2], [25.4, 5.2], [30.7, 5.2],
  [1.9, 13.3], [7.1, 13.3], [12.4, 13.3], [20.1, 13.3], [25.4, 13.3], [30.7, 13.3],
  [1.9, 17.5], [12.4, 17.5], [20.1, 17.5], [30.7, 17.5],
  [1.9, 25.6], [7.6, 25.6], [12.4, 25.6], [20.1, 25.6], [24.9, 25.6], [30.7, 25.6],
  [4.8, 29.6], [12.4, 29.6], [20.1, 29.6], [27.8, 29.6],
  [4.8, 37.7], [12.4, 37.7], [20.1, 37.7], [27.8, 37.7],
];

/** Twin lift shafts of each core (metres), used for the roof overruns. */
export const LIFTS = [{ x0: 3.5, y0: 17.6, x1: 7.6, y1: 19.8 }, { x0: 24.9, y0: 17.6, x1: 29.1, y1: 19.8 }];

/** Visible façade faces of the extruded footprint: edges whose outward normal points +y (front) or +x (side). */
export function facades(poly = FOOTPRINT) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const [xa, ya] = poly[i], [xb, yb] = poly[(i + 1) % poly.length];
    if (ya === yb && xb < xa) out.push({ kind: 'front', x0: xb, x1: xa, y: ya });   // heading west: outward +y
    else if (xa === xb && yb > ya) out.push({ kind: 'side', x: xa, y0: ya, y1: yb }); // heading south: outward +x
  }
  return out;
}

/** The footprint cut into horizontal strips of rectangles (for cast shadows and the roof). */
export function strips(poly = FOOTPRINT) {
  const ys = [...new Set(poly.map((p) => p[1]))].sort((a, b) => a - b);
  const rects = [];
  for (let k = 0; k < ys.length - 1; k++) {
    const ym = (ys[k] + ys[k + 1]) / 2;
    const xs = [];
    for (let i = 0; i < poly.length; i++) {
      const [xa, ya] = poly[i], [xb, yb] = poly[(i + 1) % poly.length];
      if (xa === xb && (ya - ym) * (yb - ym) < 0) xs.push(xa);   // vertical edge crossing the strip
    }
    xs.sort((a, b) => a - b);
    for (let j = 0; j + 1 < xs.length; j += 2) rects.push({ x0: xs[j], x1: xs[j + 1], y0: ys[k], y1: ys[k + 1] });
  }
  return rects;
}
