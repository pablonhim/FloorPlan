// Fig 2 · Floor — the whole floor with all its units together (read-only overview).
// Click a unit (or its tab) to open that unit's isolated, editable layout.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CELL, TILE } from '../iso/units.js';
import { planFrame, renderScene, edgeItems } from '../iso/render.js';
import { meetingRooms, routeToMeeting, routeToKosign } from '../model/wayfinding.js';
import { esc } from '../iso/kernel.js';
import { floorPlan, toFloor, coreItems, stats, RENTED, PLANS } from '../model/floors.js';
import { exportPng } from '../lib/exportPng.js';
import IsoDefs from './IsoDefs.jsx';
import { useFrameUpdater } from '../lib/useFrameUpdater.js';
import { entryDoors, useDoorSwing } from '../iso/doorSwing.js';

const TW = TILE * CELL;

/** Clickable floor area of one unit (its mask tiles, shifted) plus its name tag. */
/** Glowing highlight over every meeting room (floor-plane fill + outline), on top of the scene. */
function meetingOverlay(K, rooms) {
  return rooms.map((r) => {
    const x0 = r.gx * CELL, y0 = r.gy * CELL, x1 = (r.gx + r.w) * CELL, y1 = (r.gy + r.d) * CELL;
    const d = K.path([[x0, y0, 1], [x1, y0, 1], [x1, y1, 1], [x0, y1, 1]]) + 'Z';
    return `<path class="meet-glow" d="${d}" filter="url(#bloom)"/><path class="meet-hi" d="${d}"/>`;
  }).join('');
}

/** Animated walking route (dashes flowing toward the room), with a lift marker and a room pin. */
function routeOverlay(K, route) {
  if (!route?.path) return '';
  const pts = route.path.map(([x, y]) => [(x + 0.5) * CELL, (y + 0.5) * CELL, 2]);
  const d = K.path(pts);
  const [sx, sy] = K.P(...pts[0]), [ex, ey] = K.P(...pts.at(-1));
  return `<path class="route-under" d="${d}"/><path class="route-line" d="${d}"/>` +
    `<circle class="route-start" cx="${sx}" cy="${sy}" r="9"/><text class="route-tag" x="${sx}" y="${sy - 16}" font-size="13" text-anchor="middle">LIFT</text>` +
    `<circle class="route-pulse" cx="${ex}" cy="${ey}" r="10"/><circle class="route-end" cx="${ex}" cy="${ey}" r="8"/>` +
    `<text class="route-tag" x="${ex}" y="${ey - 18}" font-size="13" text-anchor="middle">${esc(route.room.label || 'Meeting room')}</text>`;
}

/** A dot that walks the route once (SVG animateMotion: no per-frame script). */
function guideWalker(K, route) {
  if (!route?.path) return '';
  const pts = route.path.map(([x, y]) => [(x + 0.5) * CELL, (y + 0.5) * CELL, 2]);
  const d = K.path(pts);
  const len = route.path.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - route.path[i - 1][0], p[1] - route.path[i - 1][1]) : 0), 0);
  const dur = Math.max(2, len / 22).toFixed(2);   // cells per second
  const motion = `<animateMotion dur="${dur}s" begin="0.4s" fill="freeze" path="${d}" calcMode="paced"/>`;
  return `<g><circle class="guide-halo" r="16"/><circle class="guide-dot" r="8"/>${motion}</g>`;
}

function unitOverlay(K, u, s) {
  let d = '';
  u.mask.forEach((row, ty) => {
    let start = -1;
    for (let tx = 0; tx <= row.length; tx++) {
      const on = row[tx] === '1';
      if (on && start < 0) start = tx;
      if (!on && start >= 0) {
        const x0 = (u.ox / TILE + start) * TW, x1 = (u.ox / TILE + tx) * TW, y0 = (u.oy / TILE + ty) * TW, y1 = y0 + TW;
        d += K.path([[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]]) + 'Z';
        start = -1;
      }
    }
  });
  const cx = (u.ox + u.cols / 2) * CELL, cy = (u.oy + u.rows * 0.5) * CELL;
  return `<g class="unit-hit" data-unit="${u.unit}"><path class="unit-area" d="${d}"/>` +
    `<g transform="${K.TOP(cx, cy, 0)}"><text class="unit-name" x="0" y="0" font-size="34" text-anchor="middle">UNIT ${u.unit}</text>` +
    `<text class="unit-sub" x="0" y="20" font-size="12" text-anchor="middle">${esc(PLANS[u.id].subtitle)} · ${s.assigned}/${s.desks} seats</text></g></g>`;
}

export default function FloorOverview({ floor, plans, onBack, onFloor, onUnit, light, guide = false }) {
  const plan = useMemo(() => floorPlan(floor), [floor]);
  const K = useMemo(() => planFrame(plan), [plan]);
  const VB0 = useMemo(() => ({ x: 0, y: 0, w: K.W, h: K.H }), [K]);
  const [vb, setVb] = useState(VB0);
  const setVbFrame = useFrameUpdater(setVb); // wheel / drag: at most one viewBox update per frame
  const [hoverUnit, setHoverUnit] = useState(null);
  const [msg, setMsg] = useState('');
  const svgRef = useRef(null);
  const drag = useRef(null);

  useEffect(() => { setVb(VB0); setHoverUnit(null); setMsg(''); }, [VB0]);

  const unitStats = useMemo(() => Object.fromEntries(plan.units.map((u) => [u.unit, stats(plans[u.id])])), [plan, plans]);
  const scene = useMemo(
    // full-floor view: every unit plus the building core (corridor, elevators, WCs) for circulation
    () => renderScene(K, plan, [...plan.units.flatMap((u) => toFloor(plans[u.id], u.ox, u.oy)), ...coreItems()]),
    [K, plan, plans],
  );
  const overlay = useMemo(() => plan.units.map((u) => unitOverlay(K, u, unitStats[u.unit])).join(''), [K, plan, unitStats]);
  // feature overlays: meeting-room highlight and lift → main meeting room wayfinding
  const [showMeet, setShowMeet] = useState(false);
  const [showRoute, setShowRoute] = useState(false);
  const floorItems = useMemo(() => [...plan.units.flatMap((u) => toFloor(plans[u.id], u.ox, u.oy)), ...coreItems()], [plan, plans]);
  const rooms = useMemo(() => meetingRooms(floorItems), [floorItems]);
  const route = useMemo(() => (showRoute ? routeToMeeting(plan, floorItems, edgeItems(plan)) : null), [showRoute, plan, floorItems]);
  // arriving from "Go to KOSIGN": the route from the east lifts to KOSIGN's entrance, walked by a guide
  const kosign = useMemo(() => (guide ? routeToKosign(plan, floorItems, edgeItems(plan)) : null), [guide, plan, floorItems]);
  // welcome: the entrance doors swing as upright leaves when the floor opens
  const doorsRef = useRef(null);
  const swingDoors = useMemo(() => entryDoors(floorItems), [floorItems]);
  useDoorSwing(doorsRef, K, swingDoors, floor);
  const features = useMemo(() => (showMeet ? meetingOverlay(K, rooms) : '') + (showRoute ? routeOverlay(K, route) : '') +
    (kosign ? routeOverlay(K, kosign) + guideWalker(K, kosign) : ''), [K, showMeet, showRoute, rooms, route, kosign]);

  const toSvg = useCallback((e) => new DOMPoint(e.clientX, e.clientY).matrixTransform(svgRef.current.getScreenCTM().inverse()), []);
  useEffect(() => {
    const el = svgRef.current;
    const onWheel = (e) => {
      e.preventDefault();
      const p = toSvg(e);
      setVbFrame((v) => {
        const w = Math.max(K.W * 0.15, Math.min(K.W * 1.5, v.w * Math.exp(e.deltaY * 0.0015)));
        const k = w / v.w;
        return { x: p.x - (p.x - v.x) * k, y: p.y - (p.y - v.y) * k, w, h: v.h * k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [toSvg, K, setVbFrame]);

  // drag pans; a click (no movement) on a unit opens it
  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    svgRef.current.setPointerCapture(e.pointerId);
    drag.current = { unit: e.target.closest('[data-unit]')?.dataset.unit || null, vb0: vb, scale: svgRef.current.getScreenCTM().a, sx: e.clientX, sy: e.clientY, moved: false };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) { setHoverUnit(e.target.closest('[data-unit]')?.dataset.unit || null); return; }
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
    d.moved = true;
    setVbFrame((v) => ({ ...v, x: d.vb0.x - (e.clientX - d.sx) / d.scale, y: d.vb0.y - (e.clientY - d.sy) / d.scale }));
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved && d.unit) onUnit(floor, d.unit);
  };

  const total = Object.values(unitStats).reduce((a, b) => ({ desks: a.desks + b.desks, assigned: a.assigned + b.assigned }), { desks: 0, assigned: 0 });
  const tb = 'rounded-md border border-edge px-2.5 py-1 text-[12px] text-ink-hi hover:border-line transition-colors';
  const seg = (on) => `px-2.5 py-1 text-[12px] ${on ? 'bg-accent-dim text-accent-hi' : 'text-ink hover:text-ink-hi'}`;

  const exportFloor = async () => {
    try { await exportPng(svgRef.current, { filename: `floor-${floor}-all-units.png`, viewBox: K.viewBox }); setMsg('exported png'); }
    catch (err) { setMsg(`export failed: ${err.message}`); }
  };

  return (
    <div className="flex flex-1 min-h-0">
      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-edge px-3 py-2">
          <button type="button" className={tb} onClick={onBack}>‹ Building</button>
          <div className="flex rounded-md border border-edge overflow-hidden" role="tablist" aria-label="Floor">
            {RENTED.map((f) => <button key={f} type="button" role="tab" aria-selected={f === floor} className={seg(f === floor)} onClick={() => onFloor(f)}>Floor {f}</button>)}
          </div>
          <div className="flex rounded-md border border-edge overflow-hidden" role="tablist" aria-label="Unit">
            <button type="button" role="tab" aria-selected className={seg(true)}>All units</button>
            {plan.units.map((u) => <button key={u.unit} type="button" role="tab" aria-selected={false} className={seg(false)} onClick={() => onUnit(floor, u.unit)}>Unit {u.unit}</button>)}
          </div>
          <button type="button" className={tb} onClick={() => setVb(VB0)}>Fit</button>
          <button type="button" aria-pressed={showMeet} onClick={() => setShowMeet((v) => !v)}
            className={`${tb} ${showMeet ? '!border-accent bg-accent-dim text-accent-hi' : ''}`}
            title={rooms.length ? `Light up the ${rooms.length} meeting rooms on this floor` : 'No meeting rooms on this floor'}>
            Highlight meeting rooms
          </button>
          <button type="button" aria-pressed={showRoute} onClick={() => setShowRoute((v) => !v)}
            className={`${tb} ${showRoute ? '!border-accent bg-accent-dim text-accent-hi' : ''}`}
            title="Walking route from the lifts to the main meeting room">
            Directions
          </button>
          <span className="flex-1" />
          <button type="button" className={`${tb} !border-accent text-accent-hi`} onClick={exportFloor}>Export PNG</button>
        </div>

        <div className="relative flex-1 min-h-0 stage-glow">
          <div className="absolute left-4 top-3 pointer-events-none">
            <div className="text-[11px] uppercase tracking-[.18em] text-ink">Fig 2 · Floor {String(floor).padStart(2, '0')} · all units</div>
            <div className="text-[12px] text-ink-hi mt-0.5">Click a unit to open its layout</div>
          </div>
          <svg
            ref={svgRef}
            className="floor-ov w-full h-full block select-none touch-none"
            viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
            role="img"
            aria-label={`Isometric plan of floor ${floor} with units ${plan.units.map((u) => u.unit).join(' and ')}. Click a unit to open it.`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => { drag.current = null; }}
            onPointerLeave={() => setHoverUnit(null)}
          >
            <IsoDefs light={light} />
            <g dangerouslySetInnerHTML={{ __html: scene }} />
            <g className="door-swing" ref={doorsRef} pointerEvents="none" />
            <g className="features" pointerEvents="none" dangerouslySetInnerHTML={{ __html: features }} />
            <g className={hoverUnit ? `units hover-${hoverUnit}` : 'units'} dangerouslySetInnerHTML={{ __html: overlay }} />
          </svg>
          <div className="absolute right-4 bottom-3 text-right text-[12px] tabular-nums pointer-events-none" aria-live="polite">
            {msg ? <div className="text-accent-hi">{msg}</div> : null}
            {kosign && <div className="text-accent-hi">{kosign.path ? `route · east lifts → ${kosign.room.label} entrance` : 'KOSIGN entrance not reachable on this floor'}</div>}
            {showRoute && <div className="text-accent-hi">{route?.path ? `route · lift → ${route.room.label} · ${(route.path.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - route.path[i - 1][0], p[1] - route.path[i - 1][1]) : 0), 0) * 0.2).toFixed(0)} m walk` : 'no meeting room reachable on this floor'}</div>}
            <div className="text-ink-hi">
              F{floor} · {plan.units.length} units · {total.assigned}/{total.desks} desks assigned{hoverUnit ? ` · unit ${hoverUnit} · click to open` : ''}
            </div>
          </div>
        </div>
      </div>

      <aside className="w-72 shrink-0 border-l border-edge p-3 flex flex-col gap-3 overflow-auto">
        <h3 className="text-[10px] uppercase tracking-[.18em] text-ink">Units on floor {floor}</h3>
        {plan.units.map((u) => {
          const p = PLANS[u.id], s = unitStats[u.unit];
          return (
            <button key={u.unit} type="button" onClick={() => onUnit(floor, u.unit)}
              onPointerEnter={() => setHoverUnit(u.unit)} onPointerLeave={() => setHoverUnit(null)}
              className={`text-left rounded-md border px-3 py-2.5 transition-colors ${hoverUnit === u.unit ? 'border-accent bg-accent-dim' : 'border-edge'}`}>
              <div className="flex items-baseline justify-between">
                <span className="text-[14px] text-ink-hi">Unit {u.unit}</span>
                <span className="text-[11px] text-accent-hi tabular-nums">{s.assigned}/{s.desks} seats</span>
              </div>
              <div className="text-[11px] text-ink mt-0.5">{p.subtitle}</div>
              <div className="text-[11px] text-ink">{p.subtitleEn}</div>
              <ol className="mt-1.5 space-y-0.5 text-[11px]">
                {p.legend.map((l, i) => <li key={l} className="flex gap-2"><span className="w-3 text-accent tabular-nums">{i + (p.legendStart || 1)}</span><span className="text-ink-hi">{l}</span></li>)}
              </ol>
              <div className="mt-2 text-[11px] text-accent-hi">Open unit ›</div>
            </button>
          );
        })}
      </aside>
    </div>
  );
}
