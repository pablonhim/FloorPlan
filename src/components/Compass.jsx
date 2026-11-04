// A bare compass at the end of the zoom bar, after Fit (`size` in px). Every view draws the site the same way round: north (world −y)
// runs up and to the right on screen, 30° above the horizontal, so that is where the needle rests. It is live:
// dragging or zooming the drawing swings the needle like a real one, and it settles back to north on a spring.
// The needle is its own little <svg> layer, turned with a CSS transform: the spring then moves it on the
// compositor. (Turned by an SVG transform attribute it re-laid out and repainted, and so re-layerized the whole
// page, on every frame of every drag and zoom.)
import { useEffect, useRef } from 'react';

const ROT = 60;   // the needle is drawn pointing straight up; north on screen is 60° clockwise from that
const turn = (el, a) => { if (el) el.style.transform = `rotate(${a.toFixed(2)}deg)`; };

export default function Compass({ size = 40 }) {
  const needle = useRef(null);
  useEffect(() => {
    const s = { a: 0, v: 0, raf: 0, last: 0 };
    const step = (t) => {
      const dt = Math.min(0.05, (t - (s.last || t)) / 1000); s.last = t;
      s.v += (-90 * s.a - 7 * s.v) * dt;   // a lightly damped spring back to north
      s.a += s.v * dt;
      turn(needle.current, ROT + s.a);
      if (Math.abs(s.a) < 0.05 && Math.abs(s.v) < 0.05) { s.a = s.v = 0; s.raf = 0; s.last = 0; turn(needle.current, ROT); return; }
      s.raf = requestAnimationFrame(step);
    };
    const kick = (dv) => {
      s.v = Math.max(-400, Math.min(400, s.v + dv));
      if (!s.raf) s.raf = requestAnimationFrame(step);
    };
    // moving the drawing: a drag (any pressed pointer moving) or the wheel
    const onMove = (e) => { if (e.buttons) kick((e.movementX - e.movementY * 0.5) * 6); };
    const onWheel = (e) => kick(Math.sign(e.deltaY || e.deltaX) * 60);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('wheel', onWheel);
      cancelAnimationFrame(s.raf);
    };
  }, []);
  return (
    <span role="img" aria-label="Compass: north is up and to the right" title="North" className="pointer-events-auto shrink-0 relative block" style={{ width: size, height: size }}>
      <svg viewBox="-20 -20 40 40" width={size} height={size} aria-hidden="true" className="absolute inset-0">
        {/* no ring: just the N and the needle */}
        {/* N stays upright, at north's place on the ring */}
        <text x={Math.cos(-Math.PI / 6) * 14} y={Math.sin(-Math.PI / 6) * 14} textAnchor="middle" dominantBaseline="middle"
          fontSize="7" fontWeight="600" fill="var(--ink-hi)">N</text>
      </svg>
      <svg ref={needle} viewBox="-20 -20 40 40" width={size} height={size} aria-hidden="true" className="absolute inset-0"
        style={{ transform: `rotate(${ROT}deg)`, transformOrigin: '50% 50%', willChange: 'transform' }}>
        <path d="M0 -10 L2.8 0 L-2.8 0 Z" fill="var(--ink-hi)" />
        <path d="M0 10 L2.8 0 L-2.8 0 Z" fill="none" stroke="var(--ink)" strokeWidth="1" strokeLinejoin="round" />
        <circle r="1.2" fill="var(--ink)" />
      </svg>
    </span>
  );
}
