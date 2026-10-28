// Fig 2 · Floor — isometric floor-plan editor for one unit of a rented floor.
//
// Pointer pipeline: client px → SVG user units (inverse screen CTM) → world (kernel.unproject on
// the floor plane z = 0) → cell (floor) → origin (minus grab offset, clamped) → validate().
// Nothing is stored unless it passes validate(), so placement is 100% grid-snapped.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CELL, CUT_H } from '../iso/units.js';
import { centerGrab, collides, footprint, normRot, rotateItem, snapOrigin, validate, worldToCell, onPlate } from '../iso/grid.js';
import { depthSort } from '../iso/depth.js';
import { planFrame, itemNode, renderCell, renderFoot, renderItem, renderPlate, renderZoneTag, renderShadows, renderScene, edgeItems, cafeIds } from '../iso/render.js';
import { isLive, describe, defaults, LAYER, CORE, tipFor } from '../model/catalog.js';
import { PLANS, UNITS, stats, floorPlan, coreItems, toFloor, CORE as CORE_AT } from '../model/floors.js';
import { exportPng } from '../lib/exportPng.js';
import IsoDefs from './IsoDefs.jsx';
import { entryDoors, roomDoorIds, useDoorSwing } from '../iso/doorSwing.js';
import { useFrameUpdater } from '../lib/useFrameUpdater.js';
import Palette from './Palette.jsx';
import Inspector from './Inspector.jsx';
import Switch, { ICONS } from './Switch.jsx';
import { HoverTip, useHoverTip } from './HoverTip.jsx';
import SceneButton, { icon } from './SceneButton.jsx';
import { HeaderTools, Divider, FloorUnitButtons } from './HeaderTools.jsx';
import Credit from './Credit.jsx';

const ItemG = memo(function ItemG({ K, item, cls, cut, ghost }) {
  const html = useMemo(() => renderItem(K, item, cut), [K, item, cut]);
  const tip = !ghost && tipFor(item);   // the hover card's text (HoverTip)
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

export default function FloorEditor({ pid, items: allItems, plans, dispatch, onBack, onSwitch, light, savedAt }) {
  // Building-core (schematic) mode shows elevators, restrooms and stairwells; the office view hides
  // them. Hidden core items still block placement, so nothing can be stacked onto the real core.
  const [showCore, setShowCore] = useState(false);
  const items = useMemo(() => (showCore ? allItems : allItems.filter((it) => !CORE.has(it.type))), [allItems, showCore]);
  const hiddenCore = allItems.length - items.length;
  const plan = PLANS[pid];
  const K = useMemo(() => planFrame(plan), [plan]);
  const VB0 = useMemo(() => ({ x: 0, y: 0, w: K.W, h: K.H }), [K]);
  const edges = useMemo(() => edgeItems(plan), [plan]);
  const svgRef = useRef(null);
  const stageRef = useRef(null);
  const [tip, tipMove, tipHide] = useHoverTip(stageRef);
  // welcome: the unit's entrance doors swing as upright leaves when the unit opens
  const doorsRef = useRef(null);
  const swingDoors = useMemo(() => entryDoors(allItems), [allItems]);
  useDoorSwing(doorsRef, K, swingDoors, pid);
  const [vb, setVb] = useState(VB0);
  const setVbFrame = useFrameUpdater(setVb); // wheel / drag: at most one viewBox update per frame
  const [placing, setPlacing] = useState(null); // { type, rot, via }
  const [selected, setSelected] = useState(null);
  const [ghost, setGhost] = useState(null); // { item, ok, reason, mode }
  const [hover, setHover] = useState(null); // { cx, cy }
  const [hoverId, setHoverId] = useState(null); // item under the pointer
  const [cut, setCut] = useState(false);
  const [msg, setMsg] = useState('');
  const drag = useRef(null);
  const lastWorld = useRef(null);

  const sel = items.find((i) => i.id === selected) || null;
  const st = stats(items);
  const cutH = cut ? CUT_H : Infinity;

  // switching floor or unit isolates the new unit: no selection, hover, drag or ghost carries over
  useEffect(() => {
    drag.current = null;
    setSelected(null); setPlacing(null); setGhost(null); setHover(null); setHoverId(null); setVb(VB0); setMsg('');
  }, [pid, VB0]);
  useEffect(() => {
    if (!showCore) { setPlacing((p) => (p && CORE.has(p.type) ? null : p)); setSelected((s) => (s && !items.some((i) => i.id === s) ? null : s)); }
  }, [showCore, items]);
  useEffect(() => { if (!placing) setGhost((g) => (g?.mode === 'new' ? null : g)); }, [placing]);

  // ---------- coordinate pipeline ----------
  const toSvg = useCallback((e) => new DOMPoint(e.clientX, e.clientY).matrixTransform(svgRef.current.getScreenCTM().inverse()), []);
  const toWorld = useCallback((e) => { const p = toSvg(e); return K.unproject(p.x, p.y, 0); }, [toSvg, K]);

  // validation always sees every item of the unit, hidden core included
  const check = useCallback((item) => {
    const reason = validate(allItems, item, plan);
    const hidden = reason && !showCore && allItems.some((o) => CORE.has(o.type) && o.id !== item.id && collides(item, o));
    return { ok: !reason, reason: hidden ? `${reason} (hidden building core · turn on Core to see it)` : reason };
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
    const world = toWorld(e);
    lastWorld.current = world;
    if (placing) { stamp(placeGhost(world)); return; }
    const hit = e.target.closest('[data-id]');
    const it = hit && items.find((i) => i.id === hit.dataset.id);
    svgRef.current.setPointerCapture(e.pointerId);
    const nbUnit = !it && e.target.closest('[data-unit]')?.dataset.unit;
    if (nbUnit) {   // a faded neighbouring unit: drag pans, a click glides over to it
      drag.current = { kind: 'pan', unit: nbUnit, vb0: vb, scale: svgRef.current.getScreenCTM().a, sx: e.clientX, sy: e.clientY, moved: false };
      return;
    }
    if (it && !it.locked) {
      const { cx, cy } = worldToCell(world[0], world[1]);
      drag.current = { kind: 'item', base: it, rot: it.rot, grab: { gx: cx - it.gx, gy: cy - it.gy }, sx: e.clientX, sy: e.clientY, moved: false };
      setSelected(it.id);
      setMsg('');
    } else {
      // empty floor or a locked item: drag pans, a click selects it (or clears the selection)
      drag.current = { kind: 'pan', hit: it?.id || null, vb0: vb, scale: svgRef.current.getScreenCTM().a, sx: e.clientX, sy: e.clientY, moved: false };
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
      setVbFrame((v) => ({ ...v, x: d.vb0.x - (e.clientX - d.sx) / d.scale, y: d.vb0.y - (e.clientY - d.sy) / d.scale }));
    } else {
      setGhost(ghostAt(world, { ...d.base, rot: d.rot }, d.grab, 'move'));
    }
  };

  const endDrag = (commit) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === 'pan') {
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
      const p = toSvg(e);
      setVbFrame((v) => {
        const w = Math.max(K.W * 0.12, Math.min(K.W * 1.5, v.w * Math.exp(e.deltaY * 0.0015)));
        const k = w / v.w;
        return { x: p.x - (p.x - v.x) * k, y: p.y - (p.y - v.y) * k, w, h: v.h * k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [toSvg, K, setVbFrame]);

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
  }, [rotate, remove, nudge, placing, dispatch]);

  // ---------- scene ----------
  const plate = useMemo(() => renderPlate(K, plan), [K, plan]);
  const cafe = useMemo(() => cafeIds(allItems), [allItems]);
  const swung = useMemo(() => roomDoorIds(allItems), [allItems]);
  const lifted = ghost?.mode === 'move' ? drag.current?.base?.id : null;
  const clsOf = (it) => `it${isLive(it) ? ' live' : ''}${cafe.has(it.id) ? ' cafe' : ''}${swung.has(it.id) ? ' swung' : ''}${it.id === selected ? ' sel' : ''}${it.id === lifted ? ' lifted' : ''}${it.locked ? ' locked' : ''}`;

  // floor layer (zones, then door swings) lies under everything; the rest is depth-sorted
  const floorNodes = useMemo(() => items.filter((it) => LAYER[it.type] === 'floor')
    .sort((a, b) => (a.type === b.type ? area(b) - area(a) : a.type === 'zone' ? -1 : 1)), [items]);
  const solidNodes = useMemo(() => {
    const list = [...items.filter((it) => LAYER[it.type] !== 'floor'), ...edges]
      .map((it) => ({ ...itemNode(it), it, cls: it.id.startsWith('edge-') ? 'it edge' : clsOf(it) }));
    if (ghost) list.push({ ...itemNode(ghost.item), it: ghost.item, ghost: true, cls: `it ghost${isLive(ghost.item) ? ' live' : ''}${ghost.ok ? '' : ' bad'}` });
    return depthSort(list);
  }, [items, edges, ghost, selected, lifted]); // eslint-disable-line react-hooks/exhaustive-deps

  const shadows = useMemo(() => renderShadows(K, plan, items, edges), [K, plan, items, edges]);

  const tags = useMemo(() => floorNodes.filter((it) => it.type === 'zone')
    .map((it) => `<g class="tag${isLive(it) ? ' live' : ''}">${renderZoneTag(K, it)}</g>`).join(''), [floorNodes, K]);

  // the floor's other units, faded, where they really are around this one (as on the floor overview);
  // hover lifts one, a click glides the camera over to it and opens it (see glide)
  const neighbours = useMemo(() => {
    const fp = floorPlan(plan.floor), me = fp.units.find((u) => u.id === pid);
    if (!me) return [];
    return fp.units.filter((u) => u.id !== pid).map((u) => {
      const p = PLANS[u.id], Ku = planFrame(p);
      const [ox, oy] = K.D((u.ox - me.ox) * CELL, (u.oy - me.oy) * CELL, 0);
      const its = (plans?.[u.id] || []).filter((it) => showCore || !CORE.has(it.type));
      return {
        unit: u.unit, ahead: u.ox - me.ox + u.oy - me.oy > 0,   // in front of this unit: drawn over it
        html: `<g transform="translate(${ox.toFixed(2)} ${oy.toFixed(2)})">${renderScene(K, p, its)}</g>`,
        // that unit's own fitted view, in this unit's svg coordinates: where the glide ends
        to: { x: K.OX - Ku.OX + ox, y: K.OY - Ku.OY + oy, w: Ku.W, h: Ku.H },
      };
    });
  }, [plan.floor, pid, K, plans, showCore]);
  // the building core round it too (corridor, lifts, WCs, storage rooms, stairs), faded, not clickable;
  // drawn over this unit when it lies in front of it (the north units), under it otherwise
  const core = useMemo(() => {
    const me = floorPlan(plan.floor).units.find((u) => u.id === pid);
    if (!me) return null;
    return { ahead: CORE_AT.corridor.y0 > me.oy, html: renderScene(K, plan, toFloor(coreItems(), -me.ox, -me.oy), { bare: true }) };
  }, [plan, pid, K]);
  const coreG = core && <g key="core" data-noexport="" className="nb core" dangerouslySetInnerHTML={{ __html: core.html }} />;
  const [hoverUnit, setHoverUnit] = useState(null);
  const gliding = useRef(0);
  useEffect(() => () => cancelAnimationFrame(gliding.current), []);
  const glide = (unit) => {
    const nb = neighbours.find((n) => n.unit === unit);
    if (!nb || gliding.current) { if (!nb) onSwitch(plan.floor, unit); return; }
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) { onSwitch(plan.floor, unit); return; }
    setHoverUnit(null); setSelected(null); setPlacing(null); setGhost(null);
    const from = vb, to = nb.to, t0 = performance.now(), ms = 700;
    const ease = (k) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2);
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms), e = ease(k), mix = (a, b) => a + (b - a) * e;
      setVb({ x: mix(from.x, to.x), y: mix(from.y, to.y), w: mix(from.w, to.w), h: mix(from.h, to.h) });
      if (k < 1) gliding.current = requestAnimationFrame(step);
      else { gliding.current = 0; onSwitch(plan.floor, unit); }   // the new unit opens on exactly this view
    };
    gliding.current = requestAnimationFrame(step);
  };
  const nbG = (n) => (
    <g key={n.unit} data-unit={n.unit} data-noexport="" className={`nb${hoverUnit === n.unit ? ' hot' : ''}`} dangerouslySetInnerHTML={{ __html: n.html }} />
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

  const status = [
    `F${plan.floor} unit ${plan.unit}`,
    hoverUnit ? `unit ${hoverUnit} · click to open` : null,
    `${st.assigned}/${st.desks} desks assigned`,
    hover ? `cell ${hover.cx},${hover.cy} (${(hover.cx * 0.2).toFixed(1)}, ${(hover.cy * 0.2).toFixed(1)} m)` : null,
    placing ? `placing ${placing.type} ${placing.rot}°` : null,
    savedAt ? `saved ${savedAt}` : 'not saved',
  ].filter(Boolean).join(' · ');

  const tb = 'rounded-md border border-edge px-2.5 py-1 text-[12px] text-ink-hi hover:border-line transition-colors disabled:opacity-40 disabled:hover:border-edge';

  // navigation as one row of round buttons centred in the app header (as on the floor view): back to the
  // floor, the floors with this floor's units (this one ringed; another glides over to it), and fit
  const tools = (
    <HeaderTools>
      <SceneButton below label={`Floor ${plan.floor}`} tip={`Back to every unit of floor ${plan.floor}`} onClick={onBack}>{icon(<path d="M10 3 5 8l5 5" />)}</SceneButton>
      <Divider />
      <FloorUnitButtons floor={plan.floor} unit={plan.unit}
        onFloor={(f) => onSwitch(f, UNITS[f].includes(plan.unit) ? plan.unit : UNITS[f][0])}
        onUnit={(f, u) => glide(u)} />
      <Divider />
      <SceneButton below label="Fit" tip="Fit the whole unit in the view" onClick={() => setVb(VB0)}>{icon(<path d="M3 6V3h3M10 3h3v3M13 10v3h-3M6 13H3v-3" />)}</SceneButton>
    </HeaderTools>
  );

  return (
    <div className="flex flex-1 min-h-0">
      {tools}
      <aside className="w-56 shrink-0 p-3 overflow-auto">
        <Palette placing={placing} setPlacing={setPlacing} showCore={showCore} />
      </aside>

      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-edge px-3 py-2">
          <button type="button" className={tb} onClick={rotate} disabled={!sel && !placing}>Rotate 90°</button>
          <button type="button" className={tb} onClick={remove} disabled={!sel}>Delete</button>
          <button type="button" className={tb} onClick={() => dispatch({ type: 'undo' })}>Undo</button>
          <span className="mx-1 flex items-center gap-3">
            <Switch checked={cut} onChange={setCut} label="Cutaway" icon={ICONS.cutaway}
              title="Cutaway: lower tall walls and objects so the plan is easier to read" />
            <Switch checked={showCore} onChange={setShowCore} label="Building core" icon={ICONS.core}
              title={`Building core (elevators, restrooms, stairwells): hidden in the office view${!showCore && hiddenCore ? ` · ${hiddenCore} hidden` : ''}`} />
          </span>
          <span className="flex-1" />
          <button type="button" className={tb} onClick={() => { if (confirm(`Reset floor ${plan.floor} unit ${plan.unit} to the official PDF layout? (Undo can restore your version.)`)) dispatch({ type: 'reset', plan: pid }); }}>Reset to PDF</button>
          <button type="button" className={`${tb} !border-accent text-accent-hi`} onClick={exportPlan}>Export PNG</button>
        </div>

        <div ref={stageRef} className="relative flex-1 min-h-0 stage-glow">
          <div className="absolute left-4 top-3 pointer-events-none">
            <div className="text-[11px] uppercase tracking-[.18em] text-ink">Fig 2 · Floor {String(plan.floor).padStart(2, '0')} · Unit {plan.unit}{showCore ? ' · building core' : ' · office view'}</div>
            <div className="text-[12px] text-ink-hi mt-0.5">{plan.subtitle}</div>
          </div>
          <svg
            ref={svgRef}
            className="office-lit w-full h-full block select-none touch-none"
            style={{ cursor: placing ? 'copy' : undefined }}
            viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
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
            {core && !core.ahead && coreG}
            {neighbours.filter((n) => !n.ahead).map(nbG)}
            <Html html={plate} />
            {floorNodes.map((it) => <ItemG key={it.id} K={K} item={it} cls={clsOf(it)} cut={cutH} />)}
            <Html html={shadows} className="shell-shadows" />
            <Html html={feet} data-noexport="" />
            {solidNodes.map((n) => <ItemG key={n.ghost ? 'ghost' : n.it.id} K={K} item={n.it} cls={n.cls} cut={cutH} ghost={n.ghost} />)}
            <g className="door-swing" ref={doorsRef} pointerEvents="none" data-noexport="" />
            <Html html={tags} className="zone-tags" />
            {core?.ahead && coreG}
            {neighbours.filter((n) => n.ahead).map(nbG)}
          </svg>
          <HoverTip tip={tip} />
          <Credit />
          <div className="absolute right-4 bottom-3 text-right text-[12px] tabular-nums pointer-events-none" aria-live="polite">
            {msg ? <div className="text-accent-hi">{msg}</div> : null}
            <div className="text-ink-hi">{status}</div>
          </div>
        </div>
      </div>

      <aside className="w-72 shrink-0 border-l border-edge p-3 flex flex-col min-h-0">
        <Inspector
          plan={plan}
          item={sel}
          items={items}
          patch={(p) => sel && dispatch({ type: 'patch', plan: pid, id: sel.id, patch: p })}
          resize={resize}
          rotate={rotate}
          remove={remove}
          select={(id) => { setSelected(id); setMsg(''); }}
        />
      </aside>
    </div>
  );
}
