// Fig 2 · Floor — isometric floor-plan editor for one unit of a rented floor.
//
// Pointer pipeline: client px → SVG user units (inverse screen CTM) → world (kernel.unproject on
// the floor plane z = 0) → cell (floor) → origin (minus grab offset, clamped) → validate().
// Nothing is stored unless it passes validate(), so placement is 100% grid-snapped.
import { memo, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CELL, CUT_H, TILE } from '../iso/units.js';
import { cellRect, centerGrab, collides, footprint, normRot, rotateItem, snapOrigin, validate, worldToCell, onPlate } from '../iso/grid.js';
import { sortFor } from '../iso/depth.js';
import { planFrame, itemNode, renderCell, renderFoot, renderItem, renderPlate, renderZoneTag, renderShadows, renderScene, renderDeskCallouts, edgeItems, cafeIds, tipData, glassBackdrops, tagCls } from '../iso/render.js';
import { isLive, leadCls, describe, defaults, LAYER, CORE, PALETTE } from '../model/catalog.js';
import { PLANS, UNITS, stats, floorPlan, coreItems, toFloor, newId, shellUnits } from '../model/floors.js';
import { exportPng, shownBox, tightBox, SHOT_W } from '../lib/exportPng.js';
import { useShot } from '../lib/shotStore.js';
import { teamList, teamScope, teamBounds, markTeamLabels } from '../lib/teamView.js';
import IsoDefs from './IsoDefs.jsx';
import { entryDoors, roomDoorIds, useDoorSwing, leafNode, leaf } from '../iso/doorSwing.js';
import { focusBox, overlaps, useSvgCamera } from '../lib/svgCamera.js';
import { reportDepth, usePlanZoom } from '../lib/planZoom.js';
import { keep } from '../lib/keep.js';
import { ghostBuilding } from '../iso/ghost.js';
import Palette from './Palette.jsx';
import { DeleteIcon } from './AnimatedIcons.jsx';
import Inspector from './Inspector.jsx';
import DeskCard from './DeskCard.jsx';
import { useCustomObjects } from '../lib/customObjects.js';
import { HoverTip, useHoverTip } from './HoverTip.jsx';
import SceneButton, { icon } from './SceneButton.jsx';
import { ViewTools, Divider, NavMenu, ViewModeMenu, StatusLine, sentence } from './ViewTools.jsx';
import { useT, why } from '../lib/i18n.js';
import { CornerMenu, DockMenuContext } from './DockMenu.jsx';
import MenuPanel from './MenuPanel.jsx';
import { useRaiseOnHover } from '../lib/raiseOnHover.js';

/** Each item's drawing, made once and kept (by item: an edited item is a new object; a unit's items are
 *  only ever drawn in that unit's frame). Filled ahead of time while the app is idle (prewarmUnits). */
const ITEM_HTML = [new WeakMap(), new WeakMap()];   // isometric, top-down
const htmlOf = (K, item, cut) => {
  if (cut !== Infinity || item.id === 'ghost') return renderItem(K, item, cut);
  const map = ITEM_HTML[K.top ? 1 : 0];
  let h = map.get(item);
  if (h === undefined) { h = renderItem(K, item, cut); map.set(item, h); }
  return h;
};

const ItemG = memo(function ItemG({ K, item, cls, cut, ghost, faded, unit }) {
  const html = useMemo(() => htmlOf(K, item, cut), [K, item, cut]);
  const tip = ghost ? {} : tipData(item);   // the hover card's text, in every language (HoverTip)
  // a faded piece round the unit (building core, or a neighbouring unit's: `unit`, which a click glides
  // over to): shown, never edited, not exported; the core's WCs, lifts and storage get the hover tip too
  if (faded) return <g className={cls} data-unit={unit} data-noexport="" {...(unit ? {} : tip)} dangerouslySetInnerHTML={{ __html: html }} />;
  return ghost || item.id.startsWith('edge-')
    ? <g className={cls} data-noexport={ghost ? '' : undefined} dangerouslySetInnerHTML={{ __html: html }} />
    : <g data-id={item.id} className={cls} {...tip} dangerouslySetInnerHTML={{ __html: html }} />;
});

/** The pieces whose drawing order can be changed (Bring forward / Send backward). */
const LAYERED = new Set(['wall', 'pillar', 'glass', 'partition', 'door']);

const Html = ({ html, ...rest }) => <g {...rest} dangerouslySetInnerHTML={{ __html: html }} />;

function nextDeskLabel(items, pid) {
  const used = new Set(items.filter((i) => i.type === 'desk').map((i) => i.label));
  for (let n = 1; ; n++) { const l = `${pid}-${String(n).padStart(2, '0')}`; if (!used.has(l)) return l; }
}

const area = (it) => { const f = footprint(it); return f.w * f.d; };
/** Does item `it` stand in zone `z` (its footprint's centre inside the zone)? */
const inZone = (z, it) => {
  const f = footprint(it), g = footprint(z), cx = it.gx + f.w / 2, cy = it.gy + f.d / 2;
  return cx >= z.gx && cx < z.gx + g.w && cy >= z.gy && cy < z.gy + g.d;
};

/** A unit's frame, kept per unit and view (lib/keep); `top`: the top-down 2D view. */
const unitFrame = (pid, top = false) => keep(`unit-frame:${pid}:${top}`, [], () => planFrame(PLANS[pid], top));
const unitPlate = (pid, top = false) => keep(`unit-plate:${pid}:${top}`, [], () => renderPlate(unitFrame(pid, top), PLANS[pid]));
/** The building ghosted under the unit: only its outer line, storey by storey down to the ground. */
const unitGhost = (pid, top = false) => keep(`unit-ghost:${pid}:${top}`, [], () => ghostBuilding(unitFrame(pid, top), PLANS[pid].mask, PLANS[pid].floor));

// the floor's other units, faded, where they really are around this one (as on the floor overview);
// hover lifts one, a click glides the camera over to it and opens it (see glide). Their floor (plate,
// zones, door swings) lies under this unit. Their walls, pillars and furniture within NEAR cells of this
// unit are depth-sorted in with its own items (see solidNodes): drawn as one block over or under it,
// the faded walls along a shared boundary painted over desks in front of them (e.g. unit D's beside the
// CSO seat in 4C). Pieces farther off cannot cross this unit on screen and are drawn as one block
// behind or in front of it, by their own depth.
function unitNeighbours(pid, plans, top = false) {
  const plan = PLANS[pid], K = unitFrame(pid, top), fp = floorPlan(plan.floor);
  return keep(`unit-nb:${pid}:${top}`, fp.units.filter((u) => u.id !== pid).map((u) => plans?.[u.id]), () => {
    const NEAR = 10;
    const me = fp.units.find((u) => u.id === pid);
    if (!me) return [];
    const mid = (plan.cols + plan.rows) / 2;
    // the core's solid pieces (lifts, storage rooms, WCs, stairs) in this unit's cells
    const coreRects = toFloor(coreItems(), -me.ox, -me.oy).filter((it) => LAYER[it.type] !== 'floor').map(cellRect);
    return fp.units.filter((u) => u.id !== pid).map((u) => {
      const p = PLANS[u.id], Ku = planFrame(p, top), dx = u.ox - me.ox, dy = u.oy - me.oy;
      const [ox, oy] = K.D(dx * CELL, dy * CELL, 0);
      const own = (plans?.[u.id] || []).filter((it) => !CORE.has(it.type));
      // in this unit's cells, ids kept apart from its own (outer walls keep their edge- prefix)
      const its = toFloor([...own, ...edgeItems(p)], dx, dy)
        .map((it) => ({ ...it, id: it.id.startsWith('edge-') ? `edge-nb${u.unit}-${it.id}` : `nb${u.unit}-${it.id}` }));
      const flat = its.filter((it) => LAYER[it.type] === 'floor'), solid = its.filter((it) => LAYER[it.type] !== 'floor');
      const near = [], behind = [], ahead = [];
      // (near the building core too: its lifts and storage rooms stand by every unit, in front of some of a
      // neighbour's walls and behind others, so those walls are sorted in with them rather than drawn as a block)
      const byCore = (r) => coreRects.some((c) => r.x1 > c.x0 - NEAR && r.x0 < c.x1 + NEAR && r.y1 > c.y0 - NEAR && r.y0 < c.y1 + NEAR);
      for (const it of solid) {
        const r = cellRect(it);
        if ((r.x1 > -NEAR && r.x0 < plan.cols + NEAR && r.y1 > -NEAR && r.y0 < plan.rows + NEAR) || byCore(r)) near.push(it);
        else ((r.x0 + r.x1 + r.y0 + r.y1) / 2 > mid ? ahead : behind).push(it);
      }
      const block = (list) => (list.length ? renderScene(K, plan, list, { bare: true }) : '');
      // its glass doors (entrance, meeting rooms) standing shut in their doorways, as on the unit itself
      // (not in the top-down plan: no upright leaves there)
      const doors = top ? '' : entryDoors(its).map((d) => leaf(K, d, 0)).join('');
      return {
        unit: u.unit, near, doors,
        flat: `<g transform="translate(${ox.toFixed(2)} ${oy.toFixed(2)})">${renderPlate(K, p)}</g>${renderScene(K, plan, flat, { bare: true })}`,
        behind: block(behind), ahead: block(ahead),
        // that unit's own fitted view, in this unit's svg coordinates: where the glide ends
        to: { x: K.OX - Ku.OX + ox, y: K.OY - Ku.OY + oy, w: Ku.W, h: Ku.H },
      };
    });
  });
}
// the building core round it too (corridor, lifts, WCs, storage rooms, stairs), at full strength, not clickable. Its
// flat parts (zones, door swings) lie under the unit; its walls, lifts and fixtures are depth-sorted in
// with the unit's own items (see solidNodes): the WC pocket sits inside the unit's outline, behind some of
// its walls and in front of others, so drawing the core as one block over or under the unit was wrong
/** Does item `it` (in unit `plan`'s cells) stand wholly on the unit's own floor: every tile it covers on the
 *  outline? (The shared corridor and the stairwell only touch the units' edges: they are the building's.) */
const ownTile = (plan, it) => {
  const f = footprint(it);
  for (let ty = Math.floor(it.gy / TILE); ty < Math.ceil((it.gy + f.d) / TILE); ty++)
    for (let tx = Math.floor(it.gx / TILE); tx < Math.ceil((it.gx + f.w) / TILE); tx++) if (plan.mask[ty]?.[tx] !== '1') return false;
  return true;
};

function unitCore(pid, top = false) {
  const plan = PLANS[pid], K = unitFrame(pid, top);
  return keep(`unit-core:${pid}:${top}`, [], () => {
    const me = floorPlan(plan.floor).units.find((u) => u.id === pid);
    if (!me) return null;
    const its = toFloor(coreItems(), -me.ox, -me.oy);
    // a core piece is the unit's own only where it stands on the unit's floor (its outline's tiles, not its
    // bounding box: units C and D are L-shaped, and the stairs and the shared corridor sit in the notch)
    const flat = its.filter((it) => LAYER[it.type] === 'floor');
    // the building's own floor under the core (the corridor round the lifts and storage rooms, the WC pockets,
    // the stair cores): the floor's tiles no unit has, as a plate of its own, where it lies round this unit
    const fp = floorPlan(plan.floor), taken = new Set();
    for (const u of fp.units) u.mask.forEach((row, ty) => [...row].forEach((c, tx) => { if (c === '1') taken.add(`${u.oy / TILE + ty},${u.ox / TILE + tx}`); }));
    const coreMask = fp.mask.map((row, ty) => [...row].map((c, tx) => (c === '1' && !taken.has(`${ty},${tx}`) ? '1' : '0')).join(''));
    const [gx, gy] = K.D(-me.ox * CELL, -me.oy * CELL, 0);
    const noTicks = (svg) => svg.replace(/<text class="tick"[^>]*>[^<]*<\/text>/g, '');
    // the units this floor does not rent (floor 4: A and B), as the floor view draws them: their floor plates
    // and their walls, glass and pillars, standing past the corridor (without them that half of the floor is
    // bare sky next to the storage rooms)
    const shells = shellUnits(plan.floor);
    const shellGround = shells.map((u) => {
      const [sx, sy] = K.D((u.ox - me.ox) * CELL, (u.oy - me.oy) * CELL, 0);
      return `<g transform="translate(${sx.toFixed(2)} ${sy.toFixed(2)})">${noTicks(renderPlate(K, u.plan))}</g>`;
    }).join('');
    const shellAll = shells.flatMap((u) => toFloor([...u.items, ...edgeItems(u.plan)], u.ox - me.ox, u.oy - me.oy)
      .map((it) => ({ ...it, id: it.id.startsWith('edge-') ? `edge-sh${u.unit}-${it.id}` : `sh${u.unit}-${it.id}` })));
    // a boundary wall both shells carry (A's east wall is B's west wall) once, as in floorPlan
    const shellSolid = [...new Map(shellAll.map((it) => [it.id.startsWith('edge-') ? `${it.type}:${it.gx}:${it.gy}:${it.rot}:${it.w}` : it.id, it])).values()];
    const ground = `${shellGround}<g transform="translate(${gx.toFixed(2)} ${gy.toFixed(2)})">${noTicks(renderPlate(K, { mask: coreMask }))}</g>`;
    return {
      ground,
      flat: renderScene(K, plan, flat.filter((it) => ownTile(plan, it)), { bare: true }),
      flatOut: renderScene(K, plan, flat.filter((it) => !ownTile(plan, it)), { bare: true }),
      solid: [...its.filter((it) => LAYER[it.type] !== 'floor').map((it) => ({ it, mine: ownTile(plan, it) })),
        ...shellSolid.map((it) => ({ it, mine: false }))],
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
  const t = useT();
  // The office view: the unit's own building-core items (elevators, restrooms, stairwells) are hidden here
  // (the faded core round the unit shows them); they still block placement, so nothing can be stacked onto
  // the real core. (A building-core mode used to show them; the view is now always the office view.)
  const showCore = false;
  const items = useMemo(() => allItems.filter((it) => !CORE.has(it.type)), [allItems]);
  const plan = PLANS[pid];
  // the view: isometric, or the flat top-down plan (the dock's 2D button; a view setting kept with the others)
  const shared = useContext(DockMenuContext);
  const top = !!shared?.prefs?.top, focusLabels = shared?.prefs?.focus !== false;
  const K = unitFrame(pid, top);
  const VB0 = useMemo(() => ({ x: 0, y: 0, w: K.W, h: K.H }), [K]);
  const edges = keep(`unit-edges:${pid}`, [], () => edgeItems(plan));
  const svgRef = useRef(null);
  useRaiseOnHover(svgRef);   // overlapping desk name cards: the hovered one comes to the front
  const stageRef = useRef(null);
  const [tip, tipMove, tipHide] = useHoverTip(stageRef);
  // welcome: the unit's entrance doors swing as upright leaves when the unit opens
  const doorsRef = useRef(null);
  const swingDoors = useMemo(() => (top ? [] : entryDoors(allItems)), [allItems, top]);   // top-down: no leaves to swing
  useDoorSwing(doorsRef, K, swingDoors, pid);
  // the camera: moves are CSS transforms, the viewBox (cam.vb) is written once a move settles (svgCamera)
  const cam = useSvgCamera(svgRef, VB0, reportDepth(K, ZOOM.min, ZOOM.max));
  // wheel / zoom rail: this unit's own zoom range
  const zoomBy = usePlanZoom(cam, K, { ...ZOOM, active });
  const [placing, setPlacing] = useState(null); // { type, rot, via, preset?, key? } (preset, key: a saved object)
  const [custom, saveCustom, removeCustom] = useCustomObjects();   // My objects (Save to Object Panel)
  const [selected, setSelected] = useState(null);
  const [ghost, setGhost] = useState(null); // { item, ok, reason, mode }
  const [hover, setHover] = useState(null); // { cx, cy }
  const [hoverId, setHoverId] = useState(null); // item under the pointer
  const [panelOpen, setPanelOpen] = useState(false);   // the inspector panel (the info button beside the dock)
  useEffect(() => { setPanelOpen(false); }, [pid]);                      // another unit: closed again
  const cut = false;   // tall walls and objects at full height (the cutaway switch is gone)
  const [msg, setMsg] = useState('');
  const drag = useRef(null);
  const lastWorld = useRef(null);

  const sel = items.find((i) => i.id === selected) || null;
  // the desk card shown, and the one just closed: it stays a moment to shrink back into its bubble (DeskCard closing)
  const cardDesk = sel?.type === 'desk' && !ghost && !placing ? sel : null;
  // (swapped in the same render the card closes in — state set while rendering — so no frame goes by with
  // neither card drawn, which would flash the small bubble in between)
  const lastCard = useRef(null);
  const [shownId, setShownId] = useState(null);
  const [closingCard, setClosingCard] = useState(null);
  const cardId = cardDesk?.id ?? null;
  if (cardId !== shownId) {
    setShownId(cardId);
    if (shownId && lastCard.current?.id === shownId) setClosingCard(lastCard.current);
  }
  if (cardDesk) lastCard.current = cardDesk;   // (the latest copy, name and all, for the closing card)
  useEffect(() => {   // a fallback: it goes when its shrink ends (DeskCard onClosed)
    if (!closingCard) return undefined;
    const t = setTimeout(() => setClosingCard((c) => (c === closingCard ? null : c)), 900);
    return () => clearTimeout(t);
  }, [closingCard]);
  const st = stats(items);
  // Team / Department view (the dock's team button): one team shown, the rest stepping back (lib/teamView)
  const [team, setTeam] = useState(null);
  useEffect(() => { setTeam(null); }, [pid]);   // another unit: every team again
  const teams = useMemo(() => teamList(items), [items]);
  const teamOn = teams.find((x) => x.label === team) || null;
  // focus labels (the dock menu's Focus Labels): a desk or department selected, only that department's names
  // and its people's name cards show; the rest are hidden until the selection is cleared
  const dept = useMemo(() => {
    if (!focusLabels || !sel) return null;
    const isDept = (z) => z.type === 'zone' && ['dept', 'ceo'].includes(z.kind || 'dept');
    if (isDept(sel)) return sel;
    const zones = items.filter(isDept);
    // a desk's own team first, else the department it stands in
    return (sel.team && zones.find((z) => z.label === sel.team)) || zones.find((z) => inZone(z, sel)) || null;
  }, [focusLabels, sel, items]);
  // what stays in view: the team in Team view, else the focused department (its desk or area selected) — the
  // rest steps back into plain clay with no lines, as the units round a focused unit do
  const focusTeam = teamOn || (dept ? teams.find((x) => x.label === dept.label) || null : null);
  const scope = useMemo(() => (focusTeam ? teamScope(items, focusTeam) : null), [items, focusTeam]);
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

  // a new item: the type's defaults, or a saved object's exact configuration (its desk code made fresh)
  const newBase = useCallback((p) => ({
    id: 'ghost', ...(p.preset || defaults(p.type)), type: p.type, rot: p.rot,
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
    if (!g.ok) { setMsg(["can't place: {r}", { r: why(g.reason) }]); return false; }
    const { id, ...item } = g.item; // eslint-disable-line no-unused-vars
    dispatch({ type: 'add', plan: pid, item });
    setMsg(['placed {x} at {at}', { x: describe(g.item), at: `${g.item.gx},${g.item.gy}` }]);
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
        setMsg(it?.locked ? ['{x} · locked', { x: describe(it) }] : '');
      }
      return;
    }
    if (d.moved && commit && ghost?.mode === 'move') {
      if (ghost.ok) {
        dispatch({ type: 'move', plan: pid, id: d.base.id, gx: ghost.item.gx, gy: ghost.item.gy, rot: ghost.item.rot });
        setMsg(['moved to {at}', { at: `${ghost.item.gx},${ghost.item.gy}` }]);
      } else setMsg(["can't move: {r}", { r: why(ghost.reason) }]);
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
  const guard = (it) => { if (it?.locked) { setMsg(['{x} is locked · unlock it in the inspector', { x: describe(it) }]); return true; } return false; };

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
    if (reason) setMsg(["can't rotate: {r}", { r: why(reason) }]);
    else { dispatch({ type: 'rotate', plan: pid, id: sel.id }); setMsg(['rotated to {n}°', { n: next.rot }]); }
  }, [placing, sel, check, plan, pid, dispatch, ghostAt, placeGhost]); // eslint-disable-line react-hooks/exhaustive-deps

  // drawing order for walls and pillars (z-index): a layer above or below the rest where they overlap; a
  // visual setting only, so it works on locked pieces too
  const layer = useCallback((dir) => {
    if (!sel || !LAYERED.has(sel.type)) return;
    const next = Math.max(-9, Math.min(9, (sel.layer || 0) + dir));
    if (next === (sel.layer || 0)) return;
    dispatch({ type: 'patch', plan: pid, id: sel.id, patch: { layer: next } });
    setMsg([dir > 0 ? 'brought forward · layer {n}' : 'sent backward · layer {n}', { n: next }]);
  }, [sel, pid, dispatch]);

  // Save to Object Panel: the selected item's configuration as a reusable object in My objects
  const saveToPanel = useCallback(() => {
    if (!sel) return;
    const saved = saveCustom(sel);
    setMsg(saved ? ['saved to My objects · {x}', { x: saved.label }] : ['already in My objects']);
  }, [sel, saveCustom]);

  // Replace with…: swap the selected item for another object (a built-in type or a saved one) in its place,
  // keeping its cell and its turn; one undoable step
  const replaceWith = useCallback((choice) => {
    if (!sel || sel.locked) return;
    const v = choice.variant ? PALETTE.flatMap((g) => g.types).find((t) => typeof t === 'object' && t.key === choice.variant) : null;   // a ready-made variant (a glass door)
    const c = choice.key ? custom.find((o) => o.key === choice.key) : v;
    const base = c ? { ...defaults(c.preset.type), ...c.preset } : { type: choice.type, ...defaults(choice.type) };
    if (!base.type) return;
    const item = { ...base, id: newId(base.type), gx: sel.gx, gy: sel.gy, rot: sel.rot };
    if (item.type === 'desk' && !c) item.label = sel.type === 'desk' ? sel.label : nextDeskLabel(items, pid);
    const reason = validate(allItems.filter((o) => o.id !== sel.id), item, plan);
    if (reason) { setMsg(["can't replace: {r}", { r: why(reason) }]); return; }
    dispatch({ type: 'replace', plan: pid, id: sel.id, item });
    setSelected(item.id);
    setMsg(['replaced with {x}', { x: c ? c.label : describe(item) }]);
  }, [sel, custom, items, allItems, plan, pid, dispatch]);

  const remove = useCallback(() => {
    if (!sel || guard(sel)) return;
    dispatch({ type: 'remove', plan: pid, id: sel.id });
    setMsg(['deleted {x}', { x: describe(sel) }]);
    setSelected(null);
  }, [sel, pid, dispatch]);

  const nudge = useCallback((dx, dy) => {
    if (!sel || guard(sel)) return;
    const next = { ...sel, gx: sel.gx + dx, gy: sel.gy + dy };
    const { reason } = check(next);
    if (reason) setMsg(["can't move: {r}", { r: why(reason) }]);
    else dispatch({ type: 'move', plan: pid, id: sel.id, gx: next.gx, gy: next.gy });
  }, [sel, check, pid, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  const resize = (w, d) => {
    if (!sel) return;
    const next = { ...sel, ...(w ? { w } : {}), ...(d ? { d } : {}) };
    const { reason } = check(next);
    if (reason) setMsg(["can't resize: {r}", { r: why(reason) }]);
    else { dispatch({ type: 'resize', plan: pid, id: sel.id, w, d }); setMsg(''); }
  };

  useEffect(() => {
    if (!active) return undefined;   // kept alive but not on screen (App): the keys are another view's
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, select')) return;
      const k = e.key;
      if (k === 'Escape' && team && !selected && !placing && !drag.current) { setTeam(null); e.preventDefault(); return; }
      if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z') { dispatch({ type: 'undo' }); setMsg(['undo']); }
      else if (k === 'r' || k === 'R') rotate();
      else if (k === ']') layer(1);
      else if (k === '[') layer(-1);
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
  }, [rotate, remove, layer, nudge, placing, dispatch, active, team, selected]);

  // ---------- scene ----------
  const plate = unitPlate(pid, top);
  const cafe = useMemo(() => cafeIds(allItems), [allItems]);
  const swung = useMemo(() => roomDoorIds(allItems), [allItems]);
  const lifted = ghost?.mode === 'move' ? drag.current?.base?.id : null;
  const clsOf = (it) => `it${isLive(it) ? ' live' : ''}${leadCls(it)}${cafe.has(it.id) ? ' cafe' : ''}${swung.has(it.id) ? ' swung' : ''}${it.id === selected ? ' sel' : ''}${it.id === lifted ? ' lifted' : ''}${it.locked ? ' locked' : ''}${scope ? (scope.ids.has(it.id) ? (scope.zones.has(it.id) ? ' team-on' : '') : ' team-off') : ''}`;

  const neighbours = unitNeighbours(pid, plans, top);
  const core = unitCore(pid, top);
  const bldGhost = unitGhost(pid, top);

  // floor layer (zones, then door swings) lies under everything; the rest is depth-sorted
  const floorNodes = useMemo(() => items.filter((it) => LAYER[it.type] === 'floor')
    .sort((a, b) => (a.layer || 0) - (b.layer || 0) || (a.type === b.type ? area(b) - area(a) : a.type === 'zone' ? -1 : 1)), [items]);
  const solidNodes = useMemo(() => {
    const list = [...items.filter((it) => LAYER[it.type] !== 'floor'), ...edges]
      .map((it) => ({ ...itemNode(it), it, cls: it.id.startsWith('edge-') ? `it edge${scope ? ' team-off' : ''}` : clsOf(it) }));
    // the building core: the pieces inside this unit's outline (its WC pocket), and every lift and storage room
    // (their doors, the storerooms' frosted glass), at full strength; the rest — the WCs, stairs and cabinets by
    // the other units — faded like those units (.nbc); in a team or department focus, all of it steps back
    const KEEP = new Set(['elevator', 'storeroom']);
    for (const { it, mine } of core?.solid || []) {
      const full = (mine || KEEP.has(it.type)) && !scope;
      list.push({ ...itemNode(it), it, faded: true, cls: full ? 'it core-faded' : 'it core-faded nbc' });
    }
    for (const n of neighbours) for (const it of n.near) list.push({ ...itemNode(it), it, faded: true, unit: n.unit, cls: 'it nbi' });
    if (ghost) list.push({ ...itemNode(ghost.item), it: ghost.item, ghost: true, cls: `it ghost${isLive(ghost.item) ? ' live' : ''}${ghost.ok ? '' : ' bad'}` });
    for (const d of swingDoors) list.push({ ...leafNode(d), slot: d.id });   // the swinging door leaves' slots
    return sortFor(K)(list);
  }, [K, items, edges, ghost, selected, lifted, core, neighbours, swingDoors, scope]); // eslint-disable-line react-hooks/exhaustive-deps

  const shadows = useMemo(() => renderShadows(K, plan, items, edges), [K, plan, items, edges]);
  // frosted glass walls: what stands behind each one, blurred, drawn just under it (glassBackdrops)
  const frost = useMemo(() => glassBackdrops(K, solidNodes.filter((n) => !n.slot), (it) => htmlOf(K, it, cutH), cutH), [K, solidNodes, cutH]);

  // the employees' names, floating above their desks (renderDeskCallouts), over everything
  const callouts = useMemo(() => renderDeskCallouts(K, items), [K, items]);
  const tags = useMemo(() => floorNodes.filter((it) => it.type === 'zone')
    .map((it) => `<g class="tag${tagCls(it)}" data-zone="${it.id}">${renderZoneTag(K, it)}</g>`).join(''), [floorNodes, K]);
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const members = new Set(dept ? items.filter((it) => it.type === 'desk' && (it.team ? it.team === dept.label : inZone(dept, it))).map((it) => it.id) : []);
    svg.querySelectorAll('.desk-callouts .desk-callout').forEach((c) => c.classList.toggle('unfocus', !!dept && !members.has(c.dataset.for)));
    svg.querySelectorAll('.zone-tags .tag.team').forEach((c) => c.classList.toggle('unfocus', !!dept && c.dataset.zone !== dept.id));
  }, [dept, items, callouts, tags]);
  // team view: only the team's people's name cards and its areas' names
  useLayoutEffect(() => { markTeamLabels(svgRef.current, scope); }, [scope, callouts, tags]);
  const showTeam = (label) => {
    setTeam(label);
    const x = label && teams.find((y) => y.label === label), b = x && teamBounds(x);
    if (b) { setSelected(null); cam.glideTo(focusBox(K, b, VB0, { minW: VB0.w * 0.4 })); }
  };

  const [hoverUnit, setHoverUnit] = useState(null);
  const [dockUnit, setDockUnit] = useState(null);
  const [navTeam, setNavTeam] = useState(null);   // a team hovered in the dock's menu: its areas' floors light up
  const [jumpGroup, setJumpGroup] = useState(null);   // a quick-jump icon hovered: its places' floors light up   // the unit whose button in the dock is hovered: its floor lights up
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
  // (the view the camera rests on: a pan can rest without writing the viewBox, so not cam.vb)
  const nearby = (n) => overlaps(cam.view, n.to, 0.25);
  // one part of a neighbouring unit drawn as a block: its floor ('flat'), or its far pieces ('behind', 'ahead')
  const nbG = (part) => (n) => n[part] && (
    <g key={`${part}-${n.unit}`} data-unit={n.unit} data-noexport="" className={`nb${hoverUnit === n.unit ? ' hot' : ''}${dockUnit === n.unit ? ' dock-hot' : ''}`} dangerouslySetInnerHTML={{ __html: n[part] }} />
  );

  // the dock's quick jumps: only this unit's own places — its teams (department areas), its team leaders'
  // desks and its meeting rooms; a kind the unit has none of keeps its slot with a "None" badge
  const jumps = useMemo(() => ({
    rooms: items.filter((z) => z.type === 'zone' && z.kind === 'meeting')
      .map((z) => ({ id: z.id, it: z, label: z.label || t('Meeting room'), sub: [z.en, t(z.on ? 'In use' : 'Free')].filter(Boolean).join(' · ') })),
  }), [items, t]);
  const hovered = !ghost && !placing && hoverId && hoverId !== selected ? items.find((i) => i.id === hoverId) : null;
  const feet = (jumpGroup ? jumps[jumpGroup].map((j) => renderFoot(K, j.it, 'foot hover')).join('') : '') +
    (teams.find((x) => x.label === navTeam)?.zones || []).map((z) => renderFoot(K, z, 'foot hover')).join('') +
    (hovered ? renderFoot(K, hovered, 'foot hover') : '') +
    // (not for a department's area picked as the focus: the focus itself shows it, and no tint is left on its floor)
    (sel && !lifted && !(focusTeam && sel.type === 'zone') ? renderFoot(K, sel, 'foot sel') : '') +
    (ghost ? renderFoot(K, ghost.item, `foot${ghost.ok ? '' : ' bad'}`) : '') +
    (hover && !ghost && !hovered ? renderCell(K, hover.cx, hover.cy) : '');

  // the screenshot button: the view exactly as it shows, at twice the screen's size (at least 2400 px wide)
  const shoot = async ({ hide } = {}) => {
    const svg = svgRef.current;
    const name = `wefloor-floor-${plan.floor}-unit-${plan.unit}${team ? `-${team.replace(/[\\/:*?"<>|\s·]+/g, '-')}` : ''}${top ? '-2d' : ''}.png`;
    // framed tight round the unit itself (its plate and outline, its pieces, names and area labels), not the
    // whole screen; the neighbours inside that frame stay as context
    const own = svg.querySelectorAll(':scope > .own-plate, :scope > .zone-tags, :scope > .desk-callouts, :scope > g.it:not(.nbi, .nbc, .core-faded)');
    try { return await exportPng(svg, { filename: name, viewBox: tightBox(own, shownBox(svg)), width: SHOT_W, shot: true, save: false, hide }); }
    catch (err) { setMsg(['screenshot failed: {e}', { e: err.message }]); return null; }
  };
  useShot(active, shoot);   // the zoom dock's screenshot button takes this view while it is on screen
  const exportPlan = async () => {
    try { await exportPng(svgRef.current, { filename: `floor-${plan.floor}-unit-${plan.unit}.png`, viewBox: K.viewBox }); setMsg(['exported png']); }
    catch (err) { setMsg(['export failed: {e}', { e: err.message }]); }
  };

  const status = hoverUnit ? t('Unit {u} · Click to open', { u: hoverUnit }) : teamOn ? [
    t('Team view'), teamOn.label, t('{n} people', { n: teamOn.people }),
  ].join(' · ') : [
    t('Floor {n}, Unit {u}', { n: plan.floor, u: plan.unit }),
    t('{a} of {d} seats taken', { a: st.assigned, d: st.desks }),
    savedAt ? t('Saved {time}', { time: savedAt }) : t('Not saved'),
  ].join(' · ');


  // navigation as one row of round buttons at the bottom left of the drawing (as on the floor
  // view): back to the floor, the floors with this floor's units (this one ringed; another glides over
  // to it), and fit
  const jumpTo = (j) => {
    const f = footprint(j.it);
    setSelected(j.id); setMsg('');
    cam.glideTo(focusBox(K, { gx: j.it.gx, gy: j.it.gy, w: f.w, d: f.d }, VB0));
  };

  // the inspector: the info button just right of the dock, its frosted panel growing out of it to full height;
  // closed when the unit opens, opening by itself when an item is selected (its fields are where it is edited)
  const inspector = (
    <MenuPanel open={panelOpen} onOpen={setPanelOpen} fill label={t('Unit {u} details', { u: plan.unit })}>
      <div className="flex items-center gap-2 border-b border-[color-mix(in_srgb,var(--ink)_18%,transparent)] px-2.5 py-1.5">
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink-hi">
          {sel ? t('Selected') : t('Unit {u}', { u: plan.unit })}<span className="text-ink"> · {t('{a}/{d} seats', { a: st.assigned, d: st.desks })}</span>
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
          custom={custom}
          showCore={showCore}
          onSave={saveToPanel}
          onReplace={replaceWith}
        />
      </div>
    </MenuPanel>
  );

  const tools = (
    <ViewTools before={(
      <Palette placing={placing} setPlacing={setPlacing} showCore={showCore}
        custom={custom} onRemoveCustom={(k) => { removeCustom(k); if (placing?.key === k) setPlacing(null); }} />
    )} menu={inspector} after={<>
      {/* editing actions: round frosted buttons floating beside the dock (R and Delete still work); Rotate shows
          only while there is something to turn (a movable item selected, or one being placed) and Delete only
          while a removable item is selected (Undo sits at the bottom right, by the menu button) */}
      <div className="flex items-center gap-2" role="toolbar" aria-label={t('Edit')}>
        {((sel && !sel.locked) || placing) && (
          <span className="pop-in"><SceneButton place="above" tall label={t('Rotate')} tip={t('Turn the selected item (or the one being placed) · R')} onClick={rotate}>
            {icon(<><path d="M13 8a5 5 0 1 1-1.5-3.6" /><path d="M13 2.5V5h-2.5" /></>)}</SceneButton></span>
        )}
        {sel && LAYERED.has(sel.type) && (<>
          <span className="pop-in"><SceneButton place="above" tall label={t('Bring forward')} tip={`${t('Draw it over what it overlaps')} · ]${sel.layer ? ` · ${t('layer {n}', { n: sel.layer })}` : ''}`} onClick={() => layer(1)}>
            {icon(<><rect x="5.5" y="2.5" width="8" height="8" rx="1" /><path d="M2.5 6v6.5a1 1 0 0 0 1 1H10" /></>)}</SceneButton></span>
          <span className="pop-in"><SceneButton place="above" tall label={t('Send backward')} tip={`${t('Draw it under what it overlaps')} · [${sel.layer ? ` · ${t('layer {n}', { n: sel.layer })}` : ''}`} onClick={() => layer(-1)}>
            {icon(<><rect x="2.5" y="5.5" width="8" height="8" rx="1" /><path d="M5.5 2.5h7a1 1 0 0 1 1 1v7" strokeDasharray="1.6 1.4" /></>)}</SceneButton></span>
        </>)}
        {sel && !sel.locked && (
          <span className="pop-in"><SceneButton place="above" tall red label={t('Delete')} tip={t('Remove the selected item · Delete')} onClick={remove}>
            <DeleteIcon size={16} /></SceneButton></span>
        )}
      </div>
    </>}>
      {/* where you are: the building, the floor, this unit (or the next), a team, a meeting room to jump to */}
      <NavMenu floor={plan.floor} unit={plan.unit} onBack={onBack}
        onHoverUnit={setDockUnit}
        onFloor={(f) => onSwitch(f, UNITS[f].includes(plan.unit) ? plan.unit : UNITS[f][0])}
        onUnit={(f, u) => glide(u)}
        teams={teams} team={team} onTeam={showTeam} onHoverTeam={setNavTeam}
        rooms={{ items: jumps.rooms, onPick: jumpTo, onHover: (j) => setHoverId(j?.id || null), onHoverAll: (on) => setJumpGroup(on ? 'rooms' : null) }} />
      <Divider />
      <ViewModeMenu top={top} onChange={(v) => shared?.setPref('top', v)} />
    </ViewTools>
  );

  return (
    <div className="relative flex flex-1 min-h-0">

      <div className="flex flex-col flex-1 min-w-0">
        <div ref={stageRef} className="relative flex-1 min-h-0 overflow-hidden stage-glow">
          <svg
            ref={svgRef}
            className="office-lit cam-over select-none touch-none"
            data-hot={hoverUnit || undefined}
            data-team={focusTeam ? 'on' : undefined}
            data-top={top ? 'on' : undefined}
            style={{ cursor: placing ? 'copy' : undefined }}
            viewBox={cam.box}
            role="img"
            aria-label={t('Isometric floor plan of floor {n}, unit {u}. Drag desks and partitions to move them on the 20 cm grid; R rotates, Delete removes.', { n: plan.floor, u: plan.unit })}
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
            {/* the building's floor under the core round the unit (the corridor by the lifts and storage rooms …) */}
            {core?.ground && <g data-noexport="" className="nb core-out" pointerEvents="none" dangerouslySetInnerHTML={{ __html: core.ground }} />}
            {neighbours.filter(nearby).map(nbG('flat'))}
            {core && <g data-noexport="" className="nb core" dangerouslySetInnerHTML={{ __html: core.flat }} />}
            {/* the core's floors outside the unit (the shared corridor, the stairs' landings): faded like the neighbours */}
            {core?.flatOut && <g data-noexport="" className="nb core-out" pointerEvents="none" dangerouslySetInnerHTML={{ __html: core.flatOut }} />}
            {neighbours.filter(nearby).map(nbG('behind'))}
            {/* the neighbours' glass doors, shut, in the same faded look as the rest of them */}
            {neighbours.filter(nearby).map((n) => n.doors && <g key={`nbd:${n.unit}`} className="nb nb-doors" pointerEvents="none" data-noexport="" dangerouslySetInnerHTML={{ __html: n.doors }} />)}
            <Html html={plate} className={dockUnit === plan.unit ? 'own-plate hot' : 'own-plate'} />
            {floorNodes.map((it) => <ItemG key={it.id} K={K} item={it} cls={clsOf(it)} cut={cutH} />)}
            <Html html={shadows} className="shell-shadows" />
            <Html html={feet} data-noexport="" data-ui="" />
            {solidNodes.map((n) => {
              if (n.slot) return <g key={`slot:${n.slot}`} className="door-slot" data-door={n.slot} pointerEvents="none" data-noexport="" />;
              const key = n.ghost ? 'ghost' : n.faded ? `f:${n.it.id}` : n.it.id, back = !n.ghost && frost.get(n.it.id);
              return [back && <Html key={`fb:${key}`} html={back} />, <ItemG key={key} K={K} item={n.it} cls={n.cls} cut={cutH} ghost={n.ghost} faded={n.faded} unit={n.unit} />];
            })}
            <g className="door-swing" ref={doorsRef} pointerEvents="none" data-noexport="" />
            <Html html={tags} className="zone-tags" />
            <Html html={callouts} className="desk-callouts" />
            {neighbours.filter(nearby).map(nbG('ahead'))}
          </svg>
          <HoverTip tip={tip} />
          {/* the selected desk's card beside it: its employee's picture and name, assigned right there */}
          {cardDesk && (
            <DeskCard key={cardDesk.id} desk={cardDesk} svgRef={svgRef} stageRef={stageRef}
              patch={(p) => dispatch({ type: 'patch', plan: pid, id: cardDesk.id, patch: p })} />
          )}
          {closingCard && closingCard.id !== cardDesk?.id && (
            <DeskCard key={`closing-${closingCard.id}`} desk={closingCard} svgRef={svgRef} stageRef={stageRef} patch={() => {}} closing
              onClosed={() => setClosingCard((c) => (c?.id === closingCard.id ? null : c))} />
          )}
          {tools}
          {/* the status line (and any message above it), top centre */}
          <StatusLine>
            {msg ? <div className="text-accent-hi">{sentence(t(msg))}</div> : null}
            <div className="text-ink-hi">{status}</div>
          </StatusLine>
        </div>
      </div>

      {/* Undo, always there, just left of the ⋯ menu on the bottom line (⌘Z still works) */}
      <div className="absolute bottom-3 right-[3.75rem] z-10">   {/* 0.75rem edge + 40px button + 0.5rem gap */}
        <SceneButton place="above" tall label={t('Undo')} tip={t('Undo the last change · ⌘Z')} onClick={() => dispatch({ type: 'undo' })}>
          {icon(<><path d="M5.5 3 2.5 6l3 3" /><path d="M2.5 6H10a3.5 3.5 0 0 1 0 7H7" /></>)}</SceneButton>
      </div>
      {/* the ⋯ menu, bottom right */}
      <CornerMenu items={[
        { label: 'Export PNG', icon: 'export', onClick: exportPlan },
        { label: 'Reset to PDF', icon: 'reset', danger: true, onClick: () => { if (confirm(t('Reset floor {n} unit {u} to the official PDF layout? (Undo can restore your version.)', { n: plan.floor, u: plan.unit }))) dispatch({ type: 'reset', plan: pid }); } },
      ]} />
    </div>
  );
}
