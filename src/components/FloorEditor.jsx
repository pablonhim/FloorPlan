// Fig 2 · Floor — isometric floor-plan editor for one unit of a rented floor.
//
// Pointer pipeline: client px → SVG user units (inverse screen CTM) → world (kernel.unproject on
// the floor plane z = 0) → cell (floor) → origin (minus grab offset, clamped) → validate().
// Nothing is stored unless it passes validate(), so placement is 100% grid-snapped.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CELL, CUT_H } from '../iso/units.js';
import { cellRect, centerGrab, collides, footprint, normRot, rotateItem, snapOrigin, validate, worldToCell, onPlate } from '../iso/grid.js';
import { depthSort } from '../iso/depth.js';
import { planFrame, itemNode, renderCell, renderFoot, renderItem, renderPlate, renderZoneTag, renderShadows, renderScene, renderDeskCallouts, edgeItems, cafeIds } from '../iso/render.js';
import { isLive, describe, defaults, LAYER, CORE, tipFor } from '../model/catalog.js';
import { PLANS, UNITS, stats, floorPlan, coreItems, toFloor } from '../model/floors.js';
import { exportPng } from '../lib/exportPng.js';
import IsoDefs from './IsoDefs.jsx';
import { entryDoors, roomDoorIds, useDoorSwing } from '../iso/doorSwing.js';
import { focusBox, overlaps, useSvgCamera } from '../lib/svgCamera.js';
import { reportDepth, usePlanZoom } from '../lib/planZoom.js';
import { keep } from '../lib/keep.js';
import { ghostBuilding } from '../iso/ghost.js';
import Palette from './Palette.jsx';
import Inspector from './Inspector.jsx';
import { HoverTip, useHoverTip } from './HoverTip.jsx';
import SceneButton, { icon } from './SceneButton.jsx';
import { ViewTools, Divider, FloorUnitButtons, StatusLine, sentence } from './ViewTools.jsx';
import DockMenu from './DockMenu.jsx';
import MenuPanel from './MenuPanel.jsx';
import { useOneOpen } from '../lib/oneOpen.js';

/** Each item's drawing, made once and kept (by item: an edited item is a new object; a unit's items are
 *  only ever drawn in that unit's frame). Filled ahead of time while the app is idle (prewarmUnits). */
const ITEM_HTML = new WeakMap();
const htmlOf = (K, item, cut) => {
  if (cut !== Infinity || item.id === 'ghost') return renderItem(K, item, cut);
  let h = ITEM_HTML.get(item);
  if (h === undefined) { h = renderItem(K, item, cut); ITEM_HTML.set(item, h); }
  return h;
};

const ItemG = memo(function ItemG({ K, item, cls, cut, ghost, faded, unit }) {
  const html = useMemo(() => htmlOf(K, item, cut), [K, item, cut]);
  const tip = !ghost && tipFor(item);   // the hover card's text (HoverTip)
  // a faded piece round the unit (building core, or a neighbouring unit's: `unit`, which a click glides
  // over to): shown, never edited, not exported
  if (faded) return <g className={cls} data-unit={unit} data-noexport="" dangerouslySetInnerHTML={{ __html: html }} />;
  return ghost || item.id.startsWith('edge-')
    ? <g className={cls} data-noexport={ghost ? '' : undefined} dangerouslySetInnerHTML={{ __html: html }} />
    : <g data-id={item.id} className={cls} data-tip={tip?.title} data-tip-sub={tip?.sub || undefined} dangerouslySetInnerHTML={{ __html: html }} />;
});

const Html = ({ html, ...rest }) => <g {...rest} dangerouslySetInnerHTML={{ __html: html }} />;

function nextDeskLabel(items, pid) {
  const used = new Set(items.filter((i) => i.type === 'desk').map((i) => i.label));
  for (let n = 1; ; n++) { const l = `${pid}-${String(n).padStart(2, '0')}`; if (!used.has(l)) return l; }
}

const area = (it) => { const f = footprint(it); return f.w * f.d; };

/** A unit's frame, kept per unit (lib/keep). */
const unitFrame = (pid) => keep(`unit-frame:${pid}`, [], () => planFrame(PLANS[pid]));
const unitPlate = (pid) => keep(`unit-plate:${pid}`, [], () => renderPlate(unitFrame(pid), PLANS[pid]));
/** The building ghosted under the unit: only its outer line, storey by storey down to the ground. */
const unitGhost = (pid) => keep(`unit-ghost:${pid}`, [], () => ghostBuilding(unitFrame(pid), PLANS[pid].mask, PLANS[pid].floor));

// the floor's other units, faded, where they really are around this one (as on the floor overview);
// hover lifts one, a click glides the camera over to it and opens it (see glide). Their floor (plate,
// zones, door swings) lies under this unit. Their walls, pillars and furniture within NEAR cells of this
// unit are depth-sorted in with its own items (see solidNodes): drawn as one block over or under it,
// the faded walls along a shared boundary painted over desks in front of them (e.g. unit D's beside the
// CSO seat in 4C). Pieces farther off cannot cross this unit on screen and are drawn as one block
// behind or in front of it, by their own depth.
function unitNeighbours(pid, plans) {
  const plan = PLANS[pid], K = unitFrame(pid), fp = floorPlan(plan.floor);
  return keep(`unit-nb:${pid}`, fp.units.filter((u) => u.id !== pid).map((u) => plans?.[u.id]), () => {
    const NEAR = 10;
    const me = fp.units.find((u) => u.id === pid);
    if (!me) return [];
    const mid = (plan.cols + plan.rows) / 2;
    return fp.units.filter((u) => u.id !== pid).map((u) => {
      const p = PLANS[u.id], Ku = planFrame(p), dx = u.ox - me.ox, dy = u.oy - me.oy;
      const [ox, oy] = K.D(dx * CELL, dy * CELL, 0);
      const own = (plans?.[u.id] || []).filter((it) => !CORE.has(it.type));
      // in this unit's cells, ids kept apart from its own (outer walls keep their edge- prefix)
      const its = toFloor([...own, ...edgeItems(p)], dx, dy)
        .map((it) => ({ ...it, id: it.id.startsWith('edge-') ? `edge-nb${u.unit}-${it.id}` : `nb${u.unit}-${it.id}` }));
      const flat = its.filter((it) => LAYER[it.type] === 'floor'), solid = its.filter((it) => LAYER[it.type] !== 'floor');
      const near = [], behind = [], ahead = [];
      for (const it of solid) {
        const r = cellRect(it);
        if (r.x1 > -NEAR && r.x0 < plan.cols + NEAR && r.y1 > -NEAR && r.y0 < plan.rows + NEAR) near.push(it);
        else ((r.x0 + r.x1 + r.y0 + r.y1) / 2 > mid ? ahead : behind).push(it);
      }
      const block = (list) => (list.length ? renderScene(K, plan, list, { bare: true }) : '');
      return {
        unit: u.unit, near,
        flat: `<g transform="translate(${ox.toFixed(2)} ${oy.toFixed(2)})">${renderPlate(K, p)}</g>${renderScene(K, plan, flat, { bare: true })}`,
        behind: block(behind), ahead: block(ahead),
        // that unit's own fitted view, in this unit's svg coordinates: where the glide ends
        to: { x: K.OX - Ku.OX + ox, y: K.OY - Ku.OY + oy, w: Ku.W, h: Ku.H },
      };
    });
  });
}
// the building core round it too (corridor, lifts, WCs, storage rooms, stairs), faded, not clickable. Its
// flat parts (zones, door swings) lie under the unit; its walls, lifts and fixtures are depth-sorted in
// with the unit's own items (see solidNodes): the WC pocket sits inside the unit's outline, behind some of
// its walls and in front of others, so drawing the core as one block over or under the unit was wrong
function unitCore(pid) {
  const plan = PLANS[pid], K = unitFrame(pid);
  return keep(`unit-core:${pid}`, [], () => {
    const me = floorPlan(plan.floor).units.find((u) => u.id === pid);
    if (!me) return null;
    const its = toFloor(coreItems(), -me.ox, -me.oy);
    const flat = its.filter((it) => LAYER[it.type] === 'floor');
    return {
      flat: renderScene(K, plan, flat, { bare: true }),
      solid: its.filter((it) => LAYER[it.type] !== 'floor'),
    };
  });
}

/** Build every unit's surroundings and item drawings ahead of time (App runs these while the app is idle). */
export const prewarmUnits = (plans) => Object.keys(PLANS).flatMap((pid) => [
  () => { unitNeighbours(pid, plans); unitCore(pid); unitGhost(pid); unitPlate(pid); },
  () => { const K = unitFrame(pid); for (const it of plans[pid] || []) htmlOf(K, it, Infinity); },
]);

/** Zoom range: view width as a share of the fitted width (closest, farthest). */
const ZOOM = { min: 0.12, max: 1.5 };

export default function FloorEditor({ pid, items: allItems, plans, dispatch, onBack, onSwitch, light, savedAt, focus = null, active = true }) {
  // The office view: the unit's own building-core items (elevators, restrooms, stairwells) are hidden here
  // (the faded core round the unit shows them); they still block placement, so nothing can be stacked onto
  // the real core. (A building-core mode used to show them; the view is now always the office view.)
  const showCore = false;
  const items = useMemo(() => allItems.filter((it) => !CORE.has(it.type)), [allItems]);
  const plan = PLANS[pid];
  const K = unitFrame(pid);
  const VB0 = useMemo(() => ({ x: 0, y: 0, w: K.W, h: K.H }), [K]);
  const edges = keep(`unit-edges:${pid}`, [], () => edgeItems(plan));
  const svgRef = useRef(null);
  const stageRef = useRef(null);
  const [tip, tipMove, tipHide] = useHoverTip(stageRef);
  // welcome: the unit's entrance doors swing as upright leaves when the unit opens
  const doorsRef = useRef(null);
  const swingDoors = useMemo(() => entryDoors(allItems), [allItems]);
  useDoorSwing(doorsRef, K, swingDoors, pid);
  // the camera: moves are CSS transforms, the viewBox (cam.vb) is written once a move settles (svgCamera)
  const cam = useSvgCamera(svgRef, VB0, reportDepth(K, ZOOM.min, ZOOM.max));
  // wheel / zoom rail: this unit's own zoom range
  const zoomBy = usePlanZoom(cam, K, { ...ZOOM, active });
  const vb = cam.vb;
  const [placing, setPlacing] = useState(null); // { type, rot, via }
  const [selected, setSelected] = useState(null);
  const [ghost, setGhost] = useState(null); // { item, ok, reason, mode }
  const [hover, setHover] = useState(null); // { cx, cy }
  const [hoverId, setHoverId] = useState(null); // item under the pointer
  const [panelOpen, setPanelOpen] = useState(false);   // the right-hand panel (menu at the bottom right)
  useEffect(() => { if (selected) setPanelOpen(true); }, [selected]);   // selecting an item opens it
  useEffect(() => { setPanelOpen(false); }, [pid]);                      // another unit: closed again
  const [paletteMin, setPaletteMin] = useState(false);
  useOneOpen(!paletteMin, () => setPaletteMin(true));   // the objects panel too: one menu or panel open at a time   // the objects panel collapsed to its icons   // the right-hand panel folded down to its header
  const cut = false;   // tall walls and objects at full height (the cutaway switch is gone)
  const [msg, setMsg] = useState('');
  const drag = useRef(null);
  const lastWorld = useRef(null);

  const sel = items.find((i) => i.id === selected) || null;
  const st = stats(items);
  const cutH = cut ? CUT_H : Infinity;

  // switching floor or unit isolates the new unit: no selection, hover, drag or ghost carries over
  useEffect(() => {
    drag.current = null;
    setSelected(null); setPlacing(null); setGhost(null); setHover(null); setHoverId(null); setMsg('');
  }, [pid, VB0]);
  // …and opens fitted, before its first paint (a glide over from a neighbour hands over on the same view)
  useLayoutEffect(() => { cam.jump(VB0); }, [pid, VB0]); // eslint-disable-line react-hooks/exhaustive-deps
  // a search result picked here (or on another page): the camera glides onto it and selects it, which opens
  // its details; arriving in a new unit it starts from the fitted view once the page has settled in
  const pidSeen = useRef(null);
  useEffect(() => {
    const fresh = pidSeen.current !== pid;
    pidSeen.current = pid;
    if (!focus) return;
    if (focus.id && allItems.some((i) => i.id === focus.id && !CORE.has(i.type))) setSelected(focus.id);
    cam.glideTo(focusBox(K, focus, VB0), { delay: fresh ? 250 : 0 });
  }, [focus, pid]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!showCore) { setPlacing((p) => (p && CORE.has(p.type) ? null : p)); setSelected((s) => (s && !items.some((i) => i.id === s) ? null : s)); }
  }, [showCore, items]);
  useEffect(() => { if (!placing) setGhost((g) => (g?.mode === 'new' ? null : g)); }, [placing]);

  // ---------- coordinate pipeline ----------
  const toSvg = useCallback((e) => cam.toSvg(e.clientX, e.clientY), [cam.toSvg]); // eslint-disable-line react-hooks/exhaustive-deps
  const toWorld = useCallback((e) => { const p = toSvg(e); return K.unproject(p.x, p.y, 0); }, [toSvg, K]);

  // validation always sees every item of the unit, hidden core included
  const check = useCallback((item) => {
    const reason = validate(allItems, item, plan);
    const hidden = reason && !showCore && allItems.some((o) => CORE.has(o.type) && o.id !== item.id && collides(item, o));
    return { ok: !reason, reason: hidden ? `${reason} (the building core, hidden in this view)` : reason };
  }, [allItems, plan, showCore]);

  const ghostAt = useCallback((world, base, grab, mode) => {
    const { gx, gy } = snapOrigin(world[0], world[1], footprint(base), plan, grab);
    const item = { ...base, gx, gy };
    return { item, ...check(item), mode };
  }, [check]);

  const newBase = useCallback((p) => ({
    id: 'ghost', type: p.type, rot: p.rot, ...defaults(p.type),
    ...(p.type === 'desk' ? { label: nextDeskLabel(items, pid) } : {}),
  }), [items, pid]);

  const placeGhost = useCallback((world, p = placing) => {
    if (!p || !world) return null;
    const base = newBase(p);
    const g = ghostAt(world, base, centerGrab(footprint(base)), 'new');
    setGhost(g);
    return g;
  }, [placing, newBase, ghostAt]);

  const stamp = (g) => {
    if (!g) return false;
    if (!g.ok) { setMsg(`can't place: ${g.reason}`); return false; }
    const { id, ...item } = g.item; // eslint-disable-line no-unused-vars
    dispatch({ type: 'add', plan: pid, item });
    setMsg(`placed ${describe(g.item)} at ${g.item.gx},${g.item.gy}`);
    return true;
  };

  // ---------- pointer ----------
  const onPointerDown = (e) => {
    if (e.button === 2) { setPlacing(null); return; }
    if (e.button !== 0 || gliding.current) return;
    cam.cancel();
    const world = toWorld(e);
    lastWorld.current = world;
    if (placing) { stamp(placeGhost(world)); return; }
    const hit = e.target.closest('[data-id]');
    const it = hit && items.find((i) => i.id === hit.dataset.id);
    svgRef.current.setPointerCapture(e.pointerId);
    const nbUnit = !it && e.target.closest('[data-unit]')?.dataset.unit;
    if (nbUnit) {   // a faded neighbouring unit: drag pans, a click glides over to it
      drag.current = { kind: 'pan', unit: nbUnit, vb0: cam.live.current, scale: cam.scale(), sx: e.clientX, sy: e.clientY, moved: false };
      return;
    }
    if (it && !it.locked) {
      const { cx, cy } = worldToCell(world[0], world[1]);
      drag.current = { kind: 'item', base: it, rot: it.rot, grab: { gx: cx - it.gx, gy: cy - it.gy }, sx: e.clientX, sy: e.clientY, moved: false };
      setSelected(it.id);
      setMsg('');
    } else {
      // empty floor or a locked item: drag pans, a click selects it (or clears the selection)
      drag.current = { kind: 'pan', hit: it?.id || null, vb0: cam.live.current, scale: cam.scale(), sx: e.clientX, sy: e.clientY, moved: false };
    }
  };

  const onPointerMove = (e) => {
    tipMove(e, Boolean(drag.current?.moved || placing));   // no card while dragging or placing
    const world = toWorld(e);
    lastWorld.current = world;
    const c = worldToCell(world[0], world[1]);
    setHover(onPlate({ x0: c.cx, y0: c.cy, x1: c.cx + 1, y1: c.cy + 1 }, plan) ? c : null);
    const d = drag.current;
    if (!d) setHoverUnit(placing ? null : e.target.closest('[data-unit]')?.dataset.unit || null);
    if (!d) { if (placing) placeGhost(world); return; }
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
    d.moved = true;
    if (d.kind === 'pan') {
      cam.move({ ...d.vb0, x: d.vb0.x - (e.clientX - d.sx) / d.scale, y: d.vb0.y - (e.clientY - d.sy) / d.scale }, null);
    } else {
      setGhost(ghostAt(world, { ...d.base, rot: d.rot }, d.grab, 'move'));
    }
  };

  const endDrag = (commit) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === 'pan') {
      if (d.moved) cam.commit();   // the pan settles: write the viewBox once
      if (!d.moved && commit && d.unit) { glide(d.unit); return; }
      if (!d.moved && commit) {
        setSelected(d.hit);
        const it = d.hit && items.find((i) => i.id === d.hit);
        setMsg(it?.locked ? `${describe(it)} · locked` : '');
      }
      return;
    }
    if (d.moved && commit && ghost?.mode === 'move') {
      if (ghost.ok) {
        dispatch({ type: 'move', plan: pid, id: d.base.id, gx: ghost.item.gx, gy: ghost.item.gy, rot: ghost.item.rot });
        setMsg(`moved to ${ghost.item.gx},${ghost.item.gy}`);
      } else setMsg(`can't move: ${ghost.reason}`);
    }
    setGhost(null);
  };

  // HTML5 drop from the palette
  const onDragOver = (e) => { if (!placing) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; lastWorld.current = toWorld(e); placeGhost(lastWorld.current); };
  const onDrop = (e) => { e.preventDefault(); if (placing) stamp(placeGhost(toWorld(e))); setPlacing(null); setGhost(null); };

  // wheel zoom about the pointer (native listener: React's onWheel is passive)
  useEffect(() => {
    const el = svgRef.current;
    const onWheel = (e) => {
      e.preventDefault();
      cam.cancel();
      zoomBy(e.deltaY, toSvg(e));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [toSvg, K]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- commands ----------
  const guard = (it) => { if (it?.locked) { setMsg(`${describe(it)} is locked · unlock it in the inspector`); return true; } return false; };

  const rotate = useCallback(() => {
    const d = drag.current;
    if (d?.kind === 'item') {
      d.rot = normRot(d.rot + 90);
      d.grab = centerGrab(footprint({ ...d.base, rot: d.rot }));
      if (d.moved && lastWorld.current) setGhost(ghostAt(lastWorld.current, { ...d.base, rot: d.rot }, d.grab, 'move'));
      return;
    }
    if (placing) {
      const p = { ...placing, rot: normRot(placing.rot + 90) };
      setPlacing(p);
      placeGhost(lastWorld.current, p);
      return;
    }
    if (!sel || guard(sel)) return;
    const next = rotateItem(sel, plan);
    const { reason } = check(next);
    if (reason) setMsg(`can't rotate: ${reason}`);
    else { dispatch({ type: 'rotate', plan: pid, id: sel.id }); setMsg(`rotated to ${next.rot}°`); }
  }, [placing, sel, check, plan, pid, dispatch, ghostAt, placeGhost]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = useCallback(() => {
    if (!sel || guard(sel)) return;
    dispatch({ type: 'remove', plan: pid, id: sel.id });
    setMsg(`deleted ${describe(sel)}`);
    setSelected(null);
  }, [sel, pid, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  const nudge = useCallback((dx, dy) => {
    if (!sel || guard(sel)) return;
    const next = { ...sel, gx: sel.gx + dx, gy: sel.gy + dy };
    const { reason } = check(next);
    if (reason) setMsg(`can't move: ${reason}`);
    else dispatch({ type: 'move', plan: pid, id: sel.id, gx: next.gx, gy: next.gy });
  }, [sel, check, pid, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  const resize = (w, d) => {
    if (!sel) return;
    const next = { ...sel, ...(w ? { w } : {}), ...(d ? { d } : {}) };
    const { reason } = check(next);
    if (reason) setMsg(`can't resize: ${reason}`);
    else { dispatch({ type: 'resize', plan: pid, id: sel.id, w, d }); setMsg(''); }
  };

  useEffect(() => {
    if (!active) return undefined;   // kept alive but not on screen (App): the keys are another view's
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, select')) return;
      const k = e.key;
      if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z') { dispatch({ type: 'undo' }); setMsg('undo'); }
      else if (k === 'r' || k === 'R') rotate();
      else if (k === 'Delete' || k === 'Backspace') remove();
      else if (k === 'Escape') {
        if (drag.current) { drag.current = null; setGhost(null); }
        else if (placing) setPlacing(null);
        else setSelected(null);
      }
      else if (k === 'ArrowLeft') nudge(-1, 0);
      else if (k === 'ArrowRight') nudge(1, 0);
      else if (k === 'ArrowUp') nudge(0, -1);
      else if (k === 'ArrowDown') nudge(0, 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rotate, remove, nudge, placing, dispatch, active]);

  // ---------- scene ----------
  const plate = unitPlate(pid);
  const cafe = useMemo(() => cafeIds(allItems), [allItems]);
  const swung = useMemo(() => roomDoorIds(allItems), [allItems]);
  const lifted = ghost?.mode === 'move' ? drag.current?.base?.id : null;
  const clsOf = (it) => `it${isLive(it) ? ' live' : ''}${cafe.has(it.id) ? ' cafe' : ''}${swung.has(it.id) ? ' swung' : ''}${it.id === selected ? ' sel' : ''}${it.id === lifted ? ' lifted' : ''}${it.locked ? ' locked' : ''}`;

  const neighbours = unitNeighbours(pid, plans);
  const core = unitCore(pid);
  const bldGhost = unitGhost(pid);

  // floor layer (zones, then door swings) lies under everything; the rest is depth-sorted
  const floorNodes = useMemo(() => items.filter((it) => LAYER[it.type] === 'floor')
    .sort((a, b) => (a.type === b.type ? area(b) - area(a) : a.type === 'zone' ? -1 : 1)), [items]);
  const solidNodes = useMemo(() => {
    const list = [...items.filter((it) => LAYER[it.type] !== 'floor'), ...edges]
      .map((it) => ({ ...itemNode(it), it, cls: it.id.startsWith('edge-') ? 'it edge' : clsOf(it) }));
    for (const it of core?.solid || []) list.push({ ...itemNode(it), it, faded: true, cls: 'it core-faded' });
    for (const n of neighbours) for (const it of n.near) list.push({ ...itemNode(it), it, faded: true, unit: n.unit, cls: 'it nbi' });
    if (ghost) list.push({ ...itemNode(ghost.item), it: ghost.item, ghost: true, cls: `it ghost${isLive(ghost.item) ? ' live' : ''}${ghost.ok ? '' : ' bad'}` });
    return depthSort(list);
  }, [items, edges, ghost, selected, lifted, core, neighbours]); // eslint-disable-line react-hooks/exhaustive-deps

  const shadows = useMemo(() => renderShadows(K, plan, items, edges), [K, plan, items, edges]);

  // the employees' names, floating above their desks (renderDeskCallouts), over everything
  const callouts = useMemo(() => renderDeskCallouts(K, items), [K, items]);
  const tags = useMemo(() => floorNodes.filter((it) => it.type === 'zone')
    .map((it) => `<g class="tag${isLive(it) ? ' live' : ''}">${renderZoneTag(K, it)}</g>`).join(''), [floorNodes, K]);

  const [hoverUnit, setHoverUnit] = useState(null);
  const gliding = useRef(false);
  const glide = (unit) => {
    const nb = neighbours.find((n) => n.unit === unit);
    if (!nb || gliding.current) { if (!nb) onSwitch(plan.floor, unit); return; }
    setHoverUnit(null); setSelected(null); setPlacing(null); setGhost(null);
    gliding.current = true;
    // no commit at the end: the new unit opens fitted, which is exactly this view (see the jump on pid)
    cam.glideTo(nb.to, { ms: 700, commit: false, onDone: () => { gliding.current = false; onSwitch(plan.floor, unit); } });
  };
  // only the neighbours near the view are drawn (zoomed in on a corner, the far units are skipped)
  const nearby = (n) => overlaps(vb, n.to, 0.25);
  // one part of a neighbouring unit drawn as a block: its floor ('flat'), or its far pieces ('behind', 'ahead')
  const nbG = (part) => (n) => n[part] && (
    <g key={`${part}-${n.unit}`} data-unit={n.unit} data-noexport="" className={`nb${hoverUnit === n.unit ? ' hot' : ''}`} dangerouslySetInnerHTML={{ __html: n[part] }} />
  );

  const hovered = !ghost && !placing && hoverId && hoverId !== selected ? items.find((i) => i.id === hoverId) : null;
  const feet = (hovered ? renderFoot(K, hovered, 'foot hover') : '') +
    (sel && !lifted ? renderFoot(K, sel, 'foot sel') : '') +
    (ghost ? renderFoot(K, ghost.item, `foot${ghost.ok ? '' : ' bad'}`) : '') +
    (hover && !ghost && !hovered ? renderCell(K, hover.cx, hover.cy) : '');

  const exportPlan = async () => {
    try { await exportPng(svgRef.current, { filename: `floor-${plan.floor}-unit-${plan.unit}.png`, viewBox: K.viewBox }); setMsg('exported png'); }
    catch (err) { setMsg(`export failed: ${err.message}`); }
  };

  const status = hoverUnit ? `Unit ${hoverUnit} · Click to open` : [
    `Floor ${plan.floor}, Unit ${plan.unit}`,
    `${st.assigned} of ${st.desks} seats taken`,
    savedAt ? `Saved ${savedAt}` : 'Not saved',
  ].join(' · ');


  // navigation as one row of round buttons at the bottom left of the drawing (as on the floor
  // view): back to the floor, the floors with this floor's units (this one ringed; another glides over
  // to it), and fit
  const tools = (
    <ViewTools left={`calc(0.75rem + ${paletteMin ? '4.75rem' : '14rem'} + 0.75rem)`} after={<>
      {/* editing actions: round frosted buttons floating beside the dock (R and Delete still work); Rotate shows
          only while there is something to turn (a movable item selected, or one being placed) and Delete only
          while a removable item is selected (Undo sits at the bottom right, by the menu button) */}
      <div className="flex items-center gap-2" role="toolbar" aria-label="Edit">
        {((sel && !sel.locked) || placing) && (
          <span className="pop-in"><SceneButton place="above" tall label="Rotate" tip="Turn the selected item (or the one being placed) · R" onClick={rotate}>
            {icon(<><path d="M13 8a5 5 0 1 1-1.5-3.6" /><path d="M13 2.5V5h-2.5" /></>)}</SceneButton></span>
        )}
        {sel && !sel.locked && (
          <span className="pop-in"><SceneButton place="above" tall label="Delete" tip="Remove the selected item · Delete" onClick={remove}>
            {icon(<><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" /><path d="M7 7v4M9 7v4" /></>)}</SceneButton></span>
        )}
      </div>
    </>}>
      <SceneButton place="above-start" compact docked label={`Floor ${plan.floor}`} tip={`Back to every unit of floor ${plan.floor}`} onClick={onBack}>{icon(<path d="M10 3 5 8l5 5" />)}</SceneButton>
      <Divider />
      <FloorUnitButtons floor={plan.floor} unit={plan.unit}
        onFloor={(f) => onSwitch(f, UNITS[f].includes(plan.unit) ? plan.unit : UNITS[f][0])}
        onUnit={(f, u) => glide(u)} />
      <Divider />
      <DockMenu items={[
        { label: 'Export PNG', icon: 'export', onClick: exportPlan },
        { label: 'Reset to PDF', icon: 'reset', danger: true, onClick: () => { if (confirm(`Reset floor ${plan.floor} unit ${plan.unit} to the official PDF layout? (Undo can restore your version.)`)) dispatch({ type: 'reset', plan: pid }); } },
      ]} />
    </ViewTools>
  );

  return (
    <div className="relative flex flex-1 min-h-0">
      {/* the palette: a frosted card floating over the drawing at the left (no column of its own), full height;
          the bottom dock starts just right of it; its list scrolls inside and fades out at the bottom edge.
          Its header collapses it to a slim column of icons (names in a frosted card on hover) */}
      <aside className={`frost-panel frost-edge absolute left-3 top-[3.75rem] bottom-3 z-10 flex flex-col rounded-2xl ${paletteMin ? 'w-[4.75rem]' : 'w-56'}`}>
        <div className={`flex items-center gap-2 py-2 pr-1.5 ${paletteMin ? 'justify-center pl-1.5' : 'pl-3'} border-b border-[color-mix(in_srgb,var(--ink)_18%,transparent)]`}>
          {!paletteMin && <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink-hi">Objects</span>}
          <button type="button" onClick={() => setPaletteMin((m) => !m)} aria-expanded={!paletteMin}
            aria-label={paletteMin ? 'Expand the objects panel' : 'Collapse the objects panel'} title={paletteMin ? 'Expand' : 'Collapse'}
            className="grid size-6 shrink-0 place-items-center rounded-full text-ink hover:bg-accent-dim hover:text-accent">
            {icon(<path d={paletteMin ? 'M6 4l4 4-4 4' : 'M10 4 6 8l4 4'} />)}
          </button>
        </div>
        <div className="fade-bottom no-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-2 pb-10">
          <Palette placing={placing} setPlacing={setPlacing} showCore={showCore} collapsed={paletteMin} />
        </div>
      </aside>

      <div className="flex flex-col flex-1 min-w-0">
        <div ref={stageRef} className="relative flex-1 min-h-0 overflow-hidden stage-glow">
          <svg
            ref={svgRef}
            className="office-lit cam-over select-none touch-none"
            data-hot={hoverUnit || undefined}
            style={{ cursor: placing ? 'copy' : undefined }}
            viewBox={cam.box}
            role="img"
            aria-label={`Isometric floor plan of floor ${plan.floor}, unit ${plan.unit}. Drag desks and partitions to move them on the 20 cm grid; R rotates, Delete removes.`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => endDrag(true)}
            onPointerCancel={() => endDrag(false)}
            onPointerOver={(e) => setHoverId(e.target.closest('[data-id]')?.dataset.id || null)}
            onPointerLeave={() => { setHover(null); setHoverId(null); setHoverUnit(null); tipHide(); if (!drag.current && placing) setGhost(null); }}
            onContextMenu={(e) => e.preventDefault()}
            onDragOver={onDragOver}
            onDragLeave={() => setGhost(null)}
            onDrop={onDrop}
          >
            <IsoDefs light={light} />
            <g pointerEvents="none" data-noexport="" dangerouslySetInnerHTML={{ __html: bldGhost.below }} />
            {neighbours.filter(nearby).map(nbG('flat'))}
            {core && <g data-noexport="" className="nb core" dangerouslySetInnerHTML={{ __html: core.flat }} />}
            {neighbours.filter(nearby).map(nbG('behind'))}
            <Html html={plate} />
            {floorNodes.map((it) => <ItemG key={it.id} K={K} item={it} cls={clsOf(it)} cut={cutH} />)}
            <Html html={shadows} className="shell-shadows" />
            <Html html={feet} data-noexport="" />
            {solidNodes.map((n) => <ItemG key={n.ghost ? 'ghost' : n.faded ? `f:${n.it.id}` : n.it.id} K={K} item={n.it} cls={n.cls} cut={cutH} ghost={n.ghost} faded={n.faded} unit={n.unit} />)}
            <g className="door-swing" ref={doorsRef} pointerEvents="none" data-noexport="" />
            <Html html={tags} className="zone-tags" />
            <Html html={callouts} className="desk-callouts" />
            {neighbours.filter(nearby).map(nbG('ahead'))}
          </svg>
          <HoverTip tip={tip} />
          {tools}
          {/* the status line (and any message above it), top centre */}
          <StatusLine>
            {msg ? <div className="text-accent-hi">{sentence(msg)}</div> : null}
            <div className="text-ink-hi">{status}</div>
          </StatusLine>
        </div>
      </div>

      {/* the inspector: a menu button at the bottom right whose frosted panel grows out of it to full height
          (as on the building page's floor list); closed when the unit opens, opening by itself when an item is
          selected (its fields are where it is edited) */}
      {/* Undo, always there, just left of the menu button on the bottom line (⌘Z still works) */}
      <div className="absolute bottom-3 right-[3.75rem] z-10">   {/* 0.75rem edge + 40px button + 0.5rem gap */}
        <SceneButton place="above" tall label="Undo" tip="Undo the last change · ⌘Z" onClick={() => dispatch({ type: 'undo' })}>
          {icon(<><path d="M5.5 3 2.5 6l3 3" /><path d="M2.5 6H10a3.5 3.5 0 0 1 0 7H7" /></>)}</SceneButton>
      </div>
      <MenuPanel open={panelOpen} onOpen={setPanelOpen} fill label={`Unit ${plan.unit} details`}>
        <div className="flex items-center gap-2 border-b border-[color-mix(in_srgb,var(--ink)_18%,transparent)] px-2.5 py-1.5">
          <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink-hi">
            {sel ? 'Selected' : `Unit ${plan.unit}`}<span className="text-ink"> · {st.assigned}/{st.desks} seats</span>
          </span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col px-2 pt-2">
          <Inspector
            plan={plan}
            item={sel}
            items={items}
            patch={(p) => sel && dispatch({ type: 'patch', plan: pid, id: sel.id, patch: p })}
            resize={resize}
            select={(id) => { setSelected(id); setMsg(''); }}
          />
        </div>
      </MenuPanel>
    </div>
  );
}
