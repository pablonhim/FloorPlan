// Fig 2 · Floor — the whole floor with all its units together (read-only overview).
// Click a unit (or its tab) to open that unit's isolated, editable layout.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CELL, TILE } from '../iso/units.js';
import { planFrame, renderScene, edgeItems } from '../iso/render.js';
import { meetingRooms, routeToKosign } from '../model/wayfinding.js';
import { esc } from '../iso/kernel.js';
import { floorPlan, toFloor, coreItems, stats, RENTED, PLANS, CORE, shellUnits } from '../model/floors.js';
import { elevatorParts } from '../model/catalog.js';
import { renderParts } from '../iso/parts.js';
import { person } from '../iso/scenes.js';
import { exportPng } from '../lib/exportPng.js';
import IsoDefs from './IsoDefs.jsx';
import { useFrameUpdater } from '../lib/useFrameUpdater.js';
import { HoverTip, useHoverTip } from './HoverTip.jsx';
import Credit from './Credit.jsx';
import SceneButton, { icon } from './SceneButton.jsx';
import { HeaderTools, Divider, FloorUnitButtons } from './HeaderTools.jsx';
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

/** Animated walking route (a solid line, a light running along it toward the room), with a lift marker and a room pin. */
function routeOverlay(K, route) {
  if (!route?.path) return '';
  const pts = route.path.map(([x, y]) => [(x + 0.5) * CELL, (y + 0.5) * CELL, 2]);
  const d = K.path(pts);
  const [sx, sy] = K.P(...pts[0]), [ex, ey] = K.P(...pts.at(-1));
  // a solid line with a bright streak running along it toward the room, forever
  return `<path class="route-under" d="${d}"/><path class="route-line" d="${d}"/><path class="route-glint" d="${d}"/>` +
    `<circle class="route-start" cx="${sx}" cy="${sy}" r="9"/><text class="route-tag" x="${sx}" y="${sy - 16}" font-size="13" text-anchor="middle">LIFT</text>` +
    `<circle class="route-pulse" cx="${ex}" cy="${ey}" r="10"/><circle class="route-end" cx="${ex}" cy="${ey}" r="8"/>` +
    `<text class="route-tag" x="${ex}" y="${ey - 18}" font-size="13" text-anchor="middle">${esc(route.room.label || 'Meeting room')}</text>`;
}

/**
 * A dot that walks the route once (SVG animateMotion: no per-frame script). It shows only once it sets off
 * (`begin` s), so it never sits at the drawing's origin before.
 */
function guideWalker(K, route, begin = 0.4) {
  if (!route?.path) return '';
  const pts = route.path.map(([x, y]) => [(x + 0.5) * CELL, (y + 0.5) * CELL, 2]);
  const d = K.path(pts);
  const len = pts.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0) / CELL;
  const dur = Math.max(2, len / 22).toFixed(2);   // cells per second
  const motion = `<animateMotion dur="${dur}s" begin="${begin}s" fill="freeze" path="${d}" calcMode="paced"/>`;
  return `<g visibility="hidden"><set attributeName="visibility" to="visible" begin="${begin}s" fill="freeze"/>` +
    `<circle class="guide-halo" r="16"/><circle class="guide-dot" r="8"/>${motion}</g>`;
}

/** The arrival lift's doors: shut, slide open, stay open while the visitor steps out, slide shut (s). */
const LIFT_T = { open: [0.25, 0.85], close: [2.4, 3.0] };
/** …and the visitor (the tower's walking figure at plan scale, 1 m = 50 units): seen once the doors part,
 *  walks out of the car, then stands in front of the lift facing the way the route goes (s). */
const WALK_T = [0.75, 2.05], PLAN_M = 5 * CELL;
const liftOpenAt = (t) => {
  const ease = (k) => 1 - (1 - Math.min(1, Math.max(0, k))) ** 3;
  return t < LIFT_T.close[0] ? ease((t - LIFT_T.open[0]) / (LIFT_T.open[1] - LIFT_T.open[0]))
    : 1 - ease((t - LIFT_T.close[0]) / (LIFT_T.close[1] - LIFT_T.close[0]));
};

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

// icons for the view tools (16 × 16, stroked in the current colour)
const TOOL = {
  back: icon(<path d="M10 3 5 8l5 5" />),   // chevron left: back to the building
  fit: icon(<path d="M3 6V3h3M10 3h3v3M13 10v3h-3M6 13H3v-3" />),                                                     // frame corners
  meet: icon(<><rect x="4" y="5.5" width="8" height="5" rx="1" /><path d="M5.5 3.5h1M9.5 3.5h1M5.5 12.5h1M9.5 12.5h1" /></>), // table + chairs
};

export default function FloorOverview({ floor, plans, onBack, onFloor, onUnit, light, guide = false }) {
  const plan = useMemo(() => floorPlan(floor), [floor]);
  // the units this floor does not rent (floor 4: A and B), as faded shells: walls and pillars only
  const shells = useMemo(() => shellUnits(floor), [floor]);
  // framed to take them in too
  const K = useMemo(() => planFrame({ ...plan, rows: Math.max(plan.rows, ...shells.map((u) => u.oy + u.plan.rows)) }), [plan, shells]);
  const shellSvg = useMemo(() => shells.map((u) => {
    const [dx, dy] = K.D(u.ox * CELL, u.oy * CELL, 0);
    return `<g transform="translate(${dx.toFixed(2)} ${dy.toFixed(2)})">${renderScene(K, u.plan, u.items)}</g>`;
  }).join(''), [shells, K]);
  const VB0 = useMemo(() => ({ x: 0, y: 0, w: K.W, h: K.H }), [K]);
  const [vb, setVb] = useState(VB0);
  const setVbFrame = useFrameUpdater(setVb); // wheel / drag: at most one viewBox update per frame
  const [hoverUnit, setHoverUnit] = useState(null);
  const [msg, setMsg] = useState('');
  const svgRef = useRef(null);
  const stageRef = useRef(null);
  const [tip, tipMove, tipHide] = useHoverTip(stageRef);
  const drag = useRef(null);

  useEffect(() => { setVb(VB0); setHoverUnit(null); setMsg(''); }, [VB0]);

  const unitStats = useMemo(() => Object.fromEntries(plan.units.map((u) => [u.unit, stats(plans[u.id])])), [plan, plans]);
  const scene = useMemo(
    // full-floor view: every unit plus the building core (corridor, elevators, WCs) for circulation
    () => renderScene(K, plan, [...plan.units.flatMap((u) => toFloor(plans[u.id], u.ox, u.oy)), ...coreItems()]),
    [K, plan, plans],
  );
  const overlay = useMemo(() => plan.units.map((u) => unitOverlay(K, u, unitStats[u.unit])).join(''), [K, plan, unitStats]);
  // feature overlays: the meeting-room highlight (and, arriving from "Go to KOSIGN", the route to KOSIGN)
  const [showMeet, setShowMeet] = useState(false);
  const floorItems = useMemo(() => [...plan.units.flatMap((u) => toFloor(plans[u.id], u.ox, u.oy)), ...coreItems()], [plan, plans]);
  const rooms = useMemo(() => meetingRooms(floorItems), [floorItems]);
  // arriving from "Go to KOSIGN": the route from the east lifts to KOSIGN's entrance, walked by a guide
  const kosign = useMemo(() => (guide ? routeToKosign(plan, floorItems, edgeItems(plan)) : null), [guide, plan, floorItems]);
  // welcome: the entrance doors swing as upright leaves when the floor opens
  const doorsRef = useRef(null);
  const swingDoors = useMemo(() => entryDoors(floorItems), [floorItems]);
  useDoorSwing(doorsRef, K, swingDoors, floor);
  // arriving from "Go to KOSIGN": the east lift the route starts at is the one the visitor rode up in; its
  // doors open over the plan's own elevator (same parts, redrawn each frame), the visitor steps out and
  // waits in front of it, then the doors close behind
  const liftRef = useRef(null), visitorRef = useRef(null);
  const arrival = useMemo(() => {
    if (!kosign?.path) return null;
    const sx = kosign.path[0][0];
    return { gx: CORE.liftsE.reduce((a, b) => (Math.abs(b + 4.5 - sx) < Math.abs(a + 4.5 - sx) ? b : a)), gy: CORE.liftY };
  }, [kosign]);
  useEffect(() => {
    const g = liftRef.current, v = visitorRef.current;
    if (!g || !v) return undefined;
    if (!arrival) { g.innerHTML = ''; v.innerHTML = ''; return undefined; }
    const draw = (open) => { g.innerHTML = `<g class="it">${renderParts(K, elevatorParts({ open }), { W0: 90, D0: 90, rot: 0, ox: arrival.gx * CELL, oy: arrival.gy * CELL })}</g>`; };
    // the visitor: from inside the car out past the sill, then facing along the route's first stretch
    const x = (arrival.gx + 4.5) * CELL, y0 = (arrival.gy + 4) * CELL, y1 = (arrival.gy + 11) * CELL;
    const [p0, p1] = kosign.path, dx = (p1 || p0)[0] - p0[0], dy = (p1 || p0)[1] - p0[1], dl = Math.hypot(dx, dy) || 1;
    const fig = (y, dist, ux, uy) => person(K, { x, y, z: 0, ux, uy, dist, m: PLAN_M }).replace('url(#car-ao)', 'url(#ao)');
    const stand = () => { v.innerHTML = fig(y1, 0, dx / dl, dy / dl); };
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) { g.innerHTML = ''; stand(); return undefined; }
    let id = 0;
    const t0 = performance.now();
    const step = (now) => {
      const t = (now - t0) / 1000;
      draw(liftOpenAt(t));
      if (t < LIFT_T.open[0] + 0.2) v.innerHTML = '';
      else if (t < WALK_T[0]) v.innerHTML = fig(y0, 0, 0, 1);
      else if (t < WALK_T[1]) { const k = (t - WALK_T[0]) / (WALK_T[1] - WALK_T[0]), y = y0 + (y1 - y0) * k; v.innerHTML = fig(y, y - y0, 0, 1); }
      else stand();
      if (t < LIFT_T.close[1]) id = requestAnimationFrame(step);
      else g.innerHTML = '';   // shut again: the static plan elevator shows through; the visitor stays
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [arrival, K, kosign]);
  const features = useMemo(() => (showMeet ? meetingOverlay(K, rooms) : '') +
    // arriving by lift, the visitor (drawn per frame) stands at the route's start instead of a walking dot
    (kosign ? routeOverlay(K, kosign) + (arrival ? '' : guideWalker(K, kosign)) : ''), [K, showMeet, rooms, kosign, arrival]);

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
    tipMove(e, Boolean(drag.current?.moved));
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

  const exportFloor = async () => {
    try { await exportPng(svgRef.current, { filename: `floor-${floor}-all-units.png`, viewBox: K.viewBox }); setMsg('exported png'); }
    catch (err) { setMsg(`export failed: ${err.message}`); }
  };

  // the view tools, as one row of round buttons centred in the app header: back to the building, the
  // floors with this floor's units, then fit and the meeting-room highlight
  const tools = (
    <HeaderTools>
      <SceneButton below label="Building" tip="Back to the whole building" onClick={onBack}>{TOOL.back}</SceneButton>
      <Divider />
      <FloorUnitButtons floor={floor} onFloor={onFloor} onUnit={onUnit} />
      <Divider />
      <SceneButton below label="Fit" tip="Fit the whole floor in the view" onClick={() => setVb(VB0)}>{TOOL.fit}</SceneButton>
      <SceneButton below label={showMeet ? 'Hide meeting rooms' : 'Highlight meeting rooms'} active={showMeet} onClick={() => setShowMeet((v) => !v)}
        tip={rooms.length ? `Light up the ${rooms.length} meeting rooms on this floor` : 'No meeting rooms on this floor'}>{TOOL.meet}</SceneButton>
    </HeaderTools>
  );

  return (
    <div className="flex flex-1 min-h-0">
      {tools}
      <div className="flex flex-col flex-1 min-w-0">
        <div ref={stageRef} className="relative flex-1 min-h-0 stage-glow">
          <button type="button" className="frost-panel frost-edge absolute right-4 top-3 z-10 rounded-full px-3.5 py-2 text-[12px] font-medium text-accent-hi hover:text-accent" onClick={exportFloor}>Export PNG</button>
          <div className="absolute left-4 top-3 pointer-events-none">
            <div className="text-[11px] uppercase tracking-[.18em] text-ink">Fig 2 · Floor {String(floor).padStart(2, '0')} · all units</div>
            <div className="text-[12px] text-ink-hi mt-0.5">Click a unit to open its layout</div>
          </div>
          <svg
            ref={svgRef}
            className="floor-ov office-lit w-full h-full block select-none touch-none"
            viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
            role="img"
            aria-label={`Isometric plan of floor ${floor} with units ${plan.units.map((u) => u.unit).join(' and ')}. Click a unit to open it.`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => { drag.current = null; }}
            onPointerLeave={() => { setHoverUnit(null); tipHide(); }}
          >
            <IsoDefs light={light} />
            <g dangerouslySetInnerHTML={{ __html: scene }} />
            {shellSvg && <g className="shell-units" pointerEvents="none" dangerouslySetInnerHTML={{ __html: shellSvg }} />}
            <g className="door-swing" ref={doorsRef} pointerEvents="none" />
            <g className="arrival-lift" ref={liftRef} pointerEvents="none" />
            <g className="features" pointerEvents="none" dangerouslySetInnerHTML={{ __html: features }} />
            <g className="arrival-visitor" ref={visitorRef} pointerEvents="none" />
            <g className={hoverUnit ? `units hover-${hoverUnit}` : 'units'} dangerouslySetInnerHTML={{ __html: overlay }} />
          </svg>
          <HoverTip tip={tip} />
          <Credit />
          <div className="absolute right-4 bottom-3 text-right text-[12px] tabular-nums pointer-events-none" aria-live="polite">
            {msg ? <div className="text-accent-hi">{msg}</div> : null}
            {kosign && <div className="text-accent-hi">{kosign.path ? `route · east lifts → ${kosign.room.label} entrance` : 'KOSIGN entrance not reachable on this floor'}</div>}
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
