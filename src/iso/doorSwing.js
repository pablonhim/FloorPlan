// Welcome door swing: when a floor or unit view opens, its entrance doors are shown as real, upright
// door leaves that swing open on their hinge, back past the frame a little, and settle shut — rather
// than the flat door symbol drawn on the floor. A short rAF animation writes only these few leaves.
import { useEffect } from 'react';
import { CELL, WALL_H } from './units.js';

/** Doors that belong to an office entrance: within 6 cells of a zone of kind 'entrance' (not core doors). */
export function entryDoors(items) {
  const ents = items.filter((z) => z.type === 'zone' && z.kind === 'entrance');
  const near = (d, z) => d.gx + 4 >= z.gx - 6 && d.gx <= z.gx + z.w + 6 && d.gy + 4 >= z.gy - 6 && d.gy <= z.gy + z.d + 6;
  const dist = (d, z) => Math.hypot(d.gx + 2 - (z.gx + z.w / 2), d.gy + 2 - (z.gy + z.d / 2));
  // the imported layouts draw some double doors twice (two rows of leaves a few cells apart): keep one
  // leaf per hinge column — the one nearest its entrance — so a double door swings exactly two leaves
  const best = new Map();
  for (const d of items) {
    if (d.type !== 'door' || String(d.id).startsWith('core')) continue;
    const z = ents.find((e) => near(d, e));
    if (!z) continue;
    const key = `${z.id}:${d.gx}`, cur = best.get(key);
    if (!cur || dist(d, z) < dist(cur, z)) best.set(key, d);
  }
  return [...best.values()];
}

/**
 * The upright leaf of door `d` (a 4 × 4-cell door part, hinge at its local (2, 2), shut along local +x,
 * open along local +y; turned by d.rot about its centre) at swing phase phi (0 shut, 1 fully open,
 * negative: past the frame the other way).
 */
function leaf(K, d, phi) {
  const S = 4 * CELL, cx = d.gx * CELL + S / 2, cy = d.gy * CELL + S / 2, a = ((d.rot || 0) * Math.PI) / 180;
  const rot = ([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  // a mirrored leaf (d.flip, the right leaf of a double door) hinges at the other end and shuts the other way
  const [hx, hy] = rot([d.flip ? S / 2 - 2 : 2 - S / 2, 2 - S / 2]), shut = rot([d.flip ? -1 : 1, 0]), open = rot([0, 1]);
  const t = (phi * Math.PI) / 2, len = S - 4;
  const dir = [shut[0] * Math.cos(t) + open[0] * Math.sin(t), shut[1] * Math.cos(t) + open[1] * Math.sin(t)];
  const H = [cx + hx, cy + hy], T = [H[0] + dir[0] * len, H[1] + dir[1] * len], h = WALL_H * 0.85;
  return `<path class="door-panel" d="${K.path([[H[0], H[1], 0], [T[0], T[1], 0], [T[0], T[1], h], [H[0], H[1], h]])}Z"/>` +
    `<path class="door-panel-edge" d="${K.path([[T[0], T[1], 0], [T[0], T[1], h]])}"/>`;
}

// swing profile over the animation: open, back past the frame, settle shut
const KEYS = [[0, 0], [0.38, 0.85], [0.66, -0.18], [0.84, 0.06], [1, 0]];
const ease = (k) => 1 - (1 - k) ** 2;
function phase(k) {
  for (let i = 1; i < KEYS.length; i++) {
    const [k0, v0] = KEYS[i - 1], [k1, v1] = KEYS[i];
    if (k <= k1) return v0 + (v1 - v0) * ease((k - k0) / (k1 - k0));
  }
  return 0;
}

/** Plays the swing into the <g> behind `ref` whenever `key` changes (e.g. the floor or unit shown). */
export function useDoorSwing(ref, K, doors, key, ms = 1300) {
  useEffect(() => {
    const g = ref.current;
    if (!g || !doors.length) { if (g) g.innerHTML = ''; return undefined; }
    const draw = (phi) => { g.innerHTML = doors.map((d) => leaf(K, d, phi)).join(''); };
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) { draw(0); return undefined; }
    let id = 0;
    const t0 = performance.now() + 250;
    const step = (now) => {
      const k = Math.max(0, Math.min(1, (now - t0) / ms));
      draw(phase(k));
      if (k < 1) id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}
