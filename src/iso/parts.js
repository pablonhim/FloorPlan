// Part engine: an element is a list of boxes in its own local frame (unrotated footprint W0 × D0,
// facing +y). Rendering rotates every part by the item's 90° step, translates it to the item's
// cell, depth-sorts the parts and projects them with the kernel.
//
// Part: { x, y, z, w, d, h, r?, cls?, flat?, deco?: { '+y'|'-y'|'+x'|'-x': (faceW, faceH) => svg },
//         top?: (w, d, rot) => svg }
// `deco` draws on a side face in face-local units (u left→right, v downward from the top edge);
// it is shown only when that face ends up facing the viewer (+y → FRONT plane, +x → SIDE plane).

import { depthSort } from './depth.js';

/** 2×2 rotation matrices for clockwise plan rotation by 0/90/180/270°. */
const R = { 0: [1, 0, 0, 1], 90: [0, -1, 1, 0], 180: [-1, 0, 0, -1], 270: [0, 1, -1, 0] };

const apply = (m, [x, y]) => [m[0] * x + m[1] * y, m[2] * x + m[3] * y];

/**
 * Rotate a local point about the footprint so the result stays in [0, W] × [0, D] of the
 * rotated footprint (W = D0, D = W0 at 90°/270°).
 */
export function rotPoint(lx, ly, W0, D0, rot) {
  const [x, y] = apply(R[rot], [lx, ly]);
  const [cx, cy] = apply(R[rot], [W0, D0]);
  return [x - Math.min(0, cx), y - Math.min(0, cy)];
}

const DIR = { '+x': [1, 0], '-x': [-1, 0], '+y': [0, 1], '-y': [0, -1] };
const dirName = ([x, y]) => (x > 0 ? '+x' : x < 0 ? '-x' : y > 0 ? '+y' : '-y');

/** Which world face a local face becomes after rotation. */
export const rotFace = (face, rot) => dirName(apply(R[rot], DIR[face]));

/** Local part → world rectangle (world units), given item origin (ox, oy). */
export function placeRect(p, W0, D0, rot, ox, oy) {
  const a = rotPoint(p.x, p.y, W0, D0, rot);
  const b = rotPoint(p.x + p.w, p.y + p.d, W0, D0, rot);
  const x = Math.min(a[0], b[0]) + ox, y = Math.min(a[1], b[1]) + oy;
  return { x, y, w: Math.abs(b[0] - a[0]), d: Math.abs(b[1] - a[1]) };
}

/**
 * Render parts to an SVG string.
 * opts: { W0, D0, rot, ox, oy, z0, cut } — `cut` (height) trims tall parts for cutaway view.
 */
export function renderParts(K, parts, { W0, D0, rot, ox, oy, z0 = 0, cut = Infinity }) {
  const nodes = [];
  for (const p of parts) {
    if (p.z >= cut) continue;
    const h = Math.min(p.h, cut - p.z);
    const w = placeRect(p, W0, D0, rot, ox, oy);
    const z = z0 + p.z;
    nodes.push({ p, w, z, h, clipped: h < p.h, x0: w.x, y0: w.y, x1: w.x + w.w, y1: w.y + w.d, z0: z, z1: z + h });
  }
  let s = '';
  for (const { p, w, z, h, clipped } of depthSort(nodes)) {
    s += p.flat ? K.flat(w.x, w.y, z, w.w, w.d, 'face top' + (p.cls ? ' ' + p.cls : '')) : K.box(w.x, w.y, z, w.w, w.d, h, p.r || 0, p.cls || '');
    if (p.deco && !clipped) {
      for (const [face, fn] of Object.entries(p.deco)) {
        const fw = face[1] === 'y' ? p.w : p.d;
        const wf = rotFace(face, rot);
        if (wf === '+y') s += `<g transform="${K.FRONT(w.x, w.y + w.d, z + h)}">${fn(fw, h)}</g>`;
        else if (wf === '+x') s += `<g transform="${K.SIDE(w.x + w.w, w.y + w.d, z + h)}">${fn(fw, h)}</g>`;
      }
    }
    if (p.top && !clipped) s += `<g transform="${K.TOP(w.x, w.y, z + h)}">${p.top(w.w, w.d, rot)}</g>`;
  }
  return s;
}
