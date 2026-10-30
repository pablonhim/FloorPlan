// Camera for the plan views. Writing an SVG's viewBox re-lays out the whole drawing (thousands of
// non-scaling strokes and labels: ~30 ms a write), so while the camera moves — wheel, drag, a glide —
// the <svg> is only moved with a CSS transform (the compositor scales what is already painted), and the
// viewBox is written once, when the move settles. Ambient loops pause while it moves (.cam-moving).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CELL } from '../iso/units.js';

const ease = (k) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2);
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The CSS transform (origin 0 0) that makes an svg of size W × H drawn with viewBox `from` show viewBox
 * `to` instead — both the same aspect, preserveAspectRatio xMidYMid meet.
 */
export function camTransform(W, H, from, to) {
  const k = Math.min(W / from.w, H / from.h), s = from.w / to.w;
  const ox = (W - from.w * k) / 2, oy = (H - from.h * k) / 2;
  const tx = ox * (1 - s) + s * k * (from.x - to.x), ty = oy * (1 - s) + s * k * (from.y - to.y);
  return `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${s.toFixed(5)})`;
}

/** Shows viewBox `to` on `el` (drawn with `from`) by a CSS transform, or clears it (to = null). */
export function showVia(el, size, from, to) {
  if (!el) return;
  if (!to) {
    el.style.transform = ''; el.style.willChange = '';
    el.classList.remove('cam-moving');
    return;
  }
  el.style.transformOrigin = '0 0';
  el.style.willChange = 'transform';
  el.classList.add('cam-moving');
  el.style.transform = camTransform(size[0], size[1], from, to);
}

/**
 * The viewBox framing cell rect r ({ gx, gy, w, d }, standing h world units tall) in kernel K, with room
 * around it, at least minW wide and never wider than the fitted view vb0 (whose aspect it keeps).
 */
export function focusBox(K, r, vb0, { h = 40, minW = vb0.w * 0.3 } = {}) {
  const x0 = r.gx * CELL, y0 = r.gy * CELL, x1 = (r.gx + r.w) * CELL, y1 = (r.gy + r.d) * CELL;
  const pts = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].flatMap(([x, y]) => [K.P(x, y, 0), K.P(x, y, h)]);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys), aspect = vb0.h / vb0.w;
  const w = Math.min(vb0.w, Math.max(minW, bw * 2.2, (bh * 2.2) / aspect));
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  return { x: cx - w / 2, y: cy - (w * aspect) / 2, w, h: w * aspect };
}

/** Do two viewBox-style rects overlap (b grown by `pad` of its size on every side)? */
export const overlaps = (a, b, pad = 0) => a.x < b.x + b.w * (1 + pad) && b.x - b.w * pad < a.x + a.w && a.y < b.y + b.h * (1 + pad) && b.y - b.h * pad < a.y + a.h;

/**
 * The camera of one plan view (svg filling its parent); onView(view) hears of every view it shows.
 * - vb: the committed viewBox (React state: render it as the svg's viewBox)
 * - live: ref to the view shown right now (vb, or where a move has got to)
 * - move(next | fn, settle = 140): show `next` at once (transform); commit it once quiet (see watch)
 * - jump(next): commit at once (no animation); glideTo(to, { ms, delay, onDone, commit }); cancel()
 * - toSvg(clientX, clientY): the svg user point under a screen point, wherever the camera is
 * - scale(): screen px per svg unit of the view shown
 */
export function useSvgCamera(svgRef, VB0, onView) {
  const [vb, setVb] = useState(VB0);
  const seen = useRef(onView);   // onView(view): told every view shown (e.g. the zoom rail's depth)
  seen.current = onView;
  const live = useRef(VB0), drawn = useRef(VB0), size = useRef([1, 1]);
  const raf = useRef(0), quiet = useRef({ id: 0, at: 0, frames: 0, settle: 140 });

  const measure = () => {
    const r = svgRef.current?.parentElement?.getBoundingClientRect();
    if (r && r.width && r.height) size.current = [r.width, r.height];
  };
  const apply = () => showVia(svgRef.current, size.current, drawn.current, live.current === drawn.current ? null : live.current);
  // a committed viewBox has rendered: drop the transform in the same frame (or keep one for a move since)
  useLayoutEffect(() => { drawn.current = vb; apply(); }, [vb]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopQuiet = () => { cancelAnimationFrame(quiet.current.id); quiet.current.id = 0; };
  const commit = useCallback(() => { stopQuiet(); setVb(live.current); }, []);
  // a move has settled once it has been quiet for `settle` ms *and* 3 frames: where frames are slow (a big
  // drawing zoomed in, a weak GPU) the next wheel step can come later than `settle` ms, and committing in the
  // middle of a gesture would re-lay out the whole drawing again and again
  const watch = (now) => {
    const q = quiet.current;
    q.frames++;
    if (q.frames >= 3 && now - q.at >= q.settle) { q.id = 0; setVb(live.current); }
    else q.id = requestAnimationFrame(watch);
  };
  const move = useCallback((next, settle = 140) => {
    if (!svgRef.current?.style.transform) measure();
    live.current = typeof next === 'function' ? next(live.current) : next;
    apply();
    seen.current?.(live.current);
    const q = quiet.current;
    stopQuiet();
    if (settle != null) { Object.assign(q, { at: performance.now(), frames: 0, settle }); q.id = requestAnimationFrame(watch); }
  }, [commit]); // eslint-disable-line react-hooks/exhaustive-deps
  const cancel = useCallback(() => { cancelAnimationFrame(raf.current); raf.current = 0; }, []);
  const jump = useCallback((next) => { cancel(); stopQuiet(); live.current = next; setVb(next); seen.current?.(next); }, [cancel]);
  const glideTo = useCallback((to, { ms = 900, delay = 0, onDone, commit: keep = true } = {}) => {
    cancel();
    if (reduced()) { if (keep) jump(to); onDone?.(); return; }
    const from = live.current;
    // zooming out: the wider destination is drawn first and enlarged toward it — the whole of it is there
    // all the way (shrinking the narrower drawing instead showed blank margins until the glide ended)
    if (keep && to.w > from.w * 1.02) { stopQuiet(); setVb(to); }
    // the clock starts on the first frame the browser shows (a view that has just opened may still be laying
    // out its drawing: a start time taken now would have the glide skip ahead once it can draw)
    let t0 = null;
    const step = (now) => {
      if (t0 === null) t0 = now + delay;
      const k = Math.max(0, Math.min(1, (now - t0) / ms)), e = ease(k), mix = (a, b) => a + (b - a) * e;
      move({ x: mix(from.x, to.x), y: mix(from.y, to.y), w: mix(from.w, to.w), h: mix(from.h, to.h) }, null);
      if (k < 1) raf.current = requestAnimationFrame(step);
      else { raf.current = 0; if (keep) commit(); onDone?.(); }
    };
    raf.current = requestAnimationFrame(step);
  }, [cancel, jump, move, commit]);
  useEffect(() => () => { cancel(); stopQuiet(); }, [cancel]);

  const toSvg = useCallback((cx, cy) => {
    const r = svgRef.current.parentElement.getBoundingClientRect(), v = live.current;
    const k = Math.min(r.width / v.w, r.height / v.h);
    return { x: v.x + (cx - r.left - (r.width - v.w * k) / 2) / k, y: v.y + (cy - r.top - (r.height - v.h * k) / 2) / k };
  }, [svgRef]);
  const scale = useCallback(() => {
    const r = svgRef.current.parentElement.getBoundingClientRect(), v = live.current;
    return Math.min(r.width / v.w, r.height / v.h);
  }, [svgRef]);

  return { vb, live, move, jump, glideTo, cancel, commit, toSvg, scale };
}
