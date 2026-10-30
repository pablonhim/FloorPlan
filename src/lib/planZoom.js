// Wheel and zoom-rail zoom for the plan views (floor, unit), on their svgCamera: zooms about the pointer
// within [min, max] (view width as a share of the fitted width) and reports the depth to the zoom rail.
import { useCallback, useEffect, useRef } from 'react';
import { factorOf, fracOf, onZoomCommand, setZoom } from './zoomStore.js';

/** onView for useSvgCamera: the rail's depth for view v of a plan K. */
export const reportDepth = (K, min, max) => (v) => setZoom({ frac: fracOf(v.w / K.W, min, max) });

/** Returns zoomBy(deltaY, p?) for the view's wheel handler (p: the svg point kept still; default the centre). */
export function usePlanZoom(cam, K, { min, max, active = true }) {
  const opt = useRef();
  opt.current = { min, max };
  const camRef = useRef(cam);
  camRef.current = cam;
  const zoomBy = useCallback((deltaY, p) => {
    const { min: lo, max: hi } = opt.current, c = camRef.current, v = c.live.current;
    const at = p || { x: v.x + v.w / 2, y: v.y + v.h / 2 };
    const w = Math.max(K.W * lo, Math.min(K.W * hi, v.w * Math.exp(deltaY * 0.0015))), k = w / v.w;
    if (k === 1) return;
    c.move({ x: at.x - (at.x - v.x) * k, y: at.y - (at.y - v.y) * k, w, h: v.h * k });
  }, [K]);
  // the rail: + / − step like two wheel notches; a click glides to a depth about the view's centre, a drag
  // (now) follows the thumb at once and is written when it lets go (settle)
  useEffect(() => {
    if (!active) return undefined;
    // the rail shows this view's depth as it comes on screen
    setZoom({ frac: fracOf(camRef.current.live.current.w / K.W, opt.current.min, opt.current.max) });
    return onZoomCommand((cmd) => {
    const c = camRef.current, v = c.live.current, { min: lo, max: hi } = opt.current;
    if (cmd.step) { zoomBy(-cmd.step * 260); return; }
    if (cmd.settle) { c.commit(); return; }
    if (cmd.fit) { c.glideTo({ x: 0, y: 0, w: K.W, h: K.H }, { ms: 600 }); return; }   // the fitted view
    const w = K.W * factorOf(cmd.frac, lo, hi), k = w / v.w, cx = v.x + v.w / 2, cy = v.y + v.h / 2;
    const to = { x: cx - (v.w * k) / 2, y: cy - (v.h * k) / 2, w, h: v.h * k };
    if (cmd.now) { c.cancel(); c.move(to, null); } else c.glideTo(to, { ms: 350 });
    });
  }, [zoomBy, K, active]);
  return zoomBy;
}
