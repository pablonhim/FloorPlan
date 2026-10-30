// A bare compass at the left of each view's tool dock. Every view draws the site the same way round: north (world −y)
// runs up and to the right on screen, 30° above the horizontal, so that is where the needle rests. It is live:
// dragging or zooming the drawing swings the needle like a real one, and it settles back to north on a spring.
import { useEffect, useRef } from 'react';

const ROT = 60;   // the needle is drawn pointing straight up; north on screen is 60° clockwise from that

export default function Compass() {
  const needle = useRef(null);
  useEffect(() => {
    const s = { a: 0, v: 0, raf: 0, last: 0 };
    const step = (t) => {
      const dt = Math.min(0.05, (t - (s.last || t)) / 1000); s.last = t;
      s.v += (-90 * s.a - 7 * s.v) * dt;   // a lightly damped spring back to north
      s.a += s.v * dt;
      needle.current?.setAttribute('transform', `rotate(${(ROT + s.a).toFixed(2)})`);
      if (Math.abs(s.a) < 0.05 && Math.abs(s.v) < 0.05) { s.a = s.v = 0; s.raf = 0; s.last = 0; needle.current?.setAttribute('transform', `rotate(${ROT})`); return; }
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
    <svg viewBox="-20 -20 40 40" width="40" height="40" role="img" aria-label="Compass: north is up and to the right" className="pointer-events-auto shrink-0">
      <title>North</title>
      <circle r="18.5" fill="none" stroke="var(--ink)" strokeWidth="1.2" opacity=".55" />
      <g ref={needle} transform={`rotate(${ROT})`}>
        <path d="M0 -10 L2.8 0 L-2.8 0 Z" fill="var(--ink-hi)" />
        <path d="M0 10 L2.8 0 L-2.8 0 Z" fill="none" stroke="var(--ink)" strokeWidth="1" strokeLinejoin="round" />
        <circle r="1.2" fill="var(--ink)" />
      </g>
      {/* N stays upright, at north's place on the ring */}
      <text x={Math.cos(-Math.PI / 6) * 14} y={Math.sin(-Math.PI / 6) * 14} textAnchor="middle" dominantBaseline="middle"
        fontSize="7" fontWeight="600" fill="var(--ink-hi)">N</text>
    </svg>
  );
}
