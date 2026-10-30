// Fig 1 · TELA Office Building — the building as an 11-storey exterior schematic (G, then floors 1–10), extruded from the real footprint
// traced off the official layout's key plan (see model/building.js): stepped façades, the WC and stair
// core bumps and the recessed north centre all run the full height. Rented floors (2 and 4) glow and
// open the floor view; their lit windows track how many desks on that floor have someone assigned.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { frame, slits } from '../iso/kernel.js';
import { depthSort } from '../iso/depth.js';
import { renderParts } from '../iso/parts.js';
import { elevatorParts } from '../model/catalog.js';
import { shadowLayer, roundedRectPath } from '../iso/shadow.js';
import { RENTED, TOTAL_FLOORS, UNITS, PLANS, planId, stats } from '../model/floors.js';
import { FOOTPRINT, EXTENT, PILLARS, LIFTS, facades, strips } from '../model/building.js';
import IsoDefs from './IsoDefs.jsx';
import SceneButton, { icon } from './SceneButton.jsx';
import { ViewTools, Divider } from './ViewTools.jsx';
import { vehicle, VEHICLE_DEFS } from '../iso/vehicles.js';
import { leg, cubicLeg, pose, person, planPath, duration } from '../iso/scenes.js';
import { showVia, setBox } from '../lib/svgCamera.js';
import { exportPng } from '../lib/exportPng.js';
import DockMenu from './DockMenu.jsx';
import { factorOf, fracOf, onZoomCommand, setZoom } from '../lib/zoomStore.js';

/*  World units: 1 m = M units. The building stands on a site plate with a 6.4 m margin.
    plate      0..PW × 0..PD, height PZ
    building   footprint extruded from PZ: NF storeys (G, 1, 2 …) × FH (3.2 m) + a parapet of PARA
    roof       walkable: a 1.2 m guard parapet follows the whole outline; penthouse over the
               corridor, lift overruns over both cores
    basement   B1 parking slab under the plate (BZ deep): the P↓IN ramp beside the east façade, and
               the P↑OUT ramp on the west side, surfacing onto the loop beside the street exit
    courtyard  south of the building. One shared, one-way single-lane (3.6 m) loop: in from the
               street at the south-east, west along the façade past the P↓IN ramp and the drop-off
               lay-by under the entrance canopy, past the P↑OUT ramp, out at the south-west.
    VIP route  leaves the loop right beside the P↓IN ramp as two lanes split by a raised centre
               curb: entrance lane on the right (outer, north-bound), exit lane on the left (inner,
               south-bound). It runs north up the east side, west behind the building and south
               down the west side to ten VIP bays, where the curb ends in a turning area.
               A perimeter wall lines the route's outer edge: up the east side, along the back and
               down the west side to the loop.
    Ten regular angled bays on the loop's south kerb, then one continuous front lawn.            */
const M = 5, NM = 48, WM = 70, EM = 65; // site margins: 9.6 m north (VIP lanes), 14 m west (VIP lanes + bays), east: up to the VIP wall's outer face (no strip beyond it)
const PZ = 7, FH = 16, NF = TOTAL_FLOORS + 1, PARA = 3, BZ = 14;   // NF storeys: G (floor 0) + floors 1…TOTAL_FLOORS
const GUARD = { h: 6, t: 1.25 }; // walkable roof: 1.2 m guard parapet, 0.25 m thick, along the whole outline
const H = NF * FH + PARA, ZTOP = PZ + H;
const wx = (x) => WM + x * M, wy = (y) => NM + y * M;
// courtyard bands (world y, measured from the south façade line YB)
const YB = wy(EXTENT.d);
// park: the front lawn, right up against the front edge of the site
// bays: the front car park, set down next to the lawn (cars reach it from the loop across the paving)
const YARD = { plaza: [YB, YB + 26], road: [YB + 26, YB + 44], bays: [YB + 60, YB + 85], park: [YB + 89, YB + 121] };
const PW = EXTENT.w * M + WM + EM, PD = YB + 119, PLATE_R = 12;   // site depth unchanged by moving the lawn
// The concrete platform extends PAD beyond the site layout on every side (0..PW × 0..PD), so roads,
// curbs and walls always sit inside its rounded edge; courtyard paving is also clipped to that edge.
const PAD = 6, EDGE = 1.5; // EDGE: inset of the inner perimeter line the paving runs flush to
const PLATE = { x0: -PAD, y0: -PAD, x1: PW + PAD, y1: PD + PAD };
const CX = wx(16.3); // centre line of the south façade: entrance, walkway and parking are centred on it
const DROP = [YB + 18, YB + 26];           // drop-off lay-by in front of the canopy (y band)
const DROP_HALF = 20;                      // …and its half-width: it runs between the canopy's front pillars
const LANE = 18, CURB = 2;    // one 3.6 m lane; raised centre curb 0.4 m
const IN_X = wx(EXTENT.w) + 5; // the P↓IN ramp's west edge, against the east façade
// VIP route (two lanes + centre curb). Each leg lists [outer, inner] lane bands: the outer lane is the
// entrance (right-hand side when driving in), the inner one the exit.
const VIP_GAP = 1.5;          // one shared wall (0.3 m) between the P↓IN ramp and the VIP lanes
const RAMP_W = 24;             // underground ramps: 4.8 m wide (deck and tunnel mouth)
const VIP_X = IN_X + RAMP_W + VIP_GAP;
const VIP_E = { out: [VIP_X + LANE + CURB, VIP_X + 2 * LANE + CURB], in: [VIP_X, VIP_X + LANE] }; // x bands
const VIP_N = { out: [5, 5 + LANE], in: [5 + LANE + CURB, 5 + 2 * LANE + CURB] };                                      // y bands
// west side: the VIP bays line the perimeter wall (cars nose-in toward the wall, away from the building);
// the two lanes run between them and the building, the entrance lane right beside the bays
const VIPZ = { x0: 4, x1: 29, y0: VIP_N.in[1] + 6, n: 10 };
const VIP_W = { out: [VIPZ.x1 + 1, VIPZ.x1 + 1 + LANE], in: [VIPZ.x1 + 1 + LANE + CURB, VIPZ.x1 + 1 + 2 * LANE + CURB] }; // x bands
const TURN_Y = VIPZ.y0 + VIPZ.n * 12.5;                // west leg ends in a turning area below the last bay
const ENTRY = VIP_E.out, EXIT = [4, 22];
// front lawn (x band): as wide as the yard allows, clear of both street lanes and their sliding gates
// the site entrance's sliding gate spans the lane and the paving beside it toward the yard (x band);
// two telescopic leaves that park stacked over half its width, west of it
const ENTRY_GATE = [ENTRY[0] - 12, ENTRY[1]];
const LAWN = [EXIT[1] + 22, ENTRY_GATE[0] - (ENTRY_GATE[1] - ENTRY_GATE[0] + 1) / 2 - 5];
const PENT = { x0: wx(12.4), y0: wy(15.2), x1: wx(20.1), y1: wy(24.6), h: 14 };
const MAST = [wx(16.3), wy(19.9)]; // roof centre (used to frame the view)
// parking ramps in the side margins (world units): 3.6 m wide, 20 m long; the street end (y1) opens
// onto the driveway
const RAMPS = [
  { x0: IN_X, x1: IN_X + RAMP_W, y0: YARD.road[0] - 100, y1: YARD.road[0], dir: 'in', label: 'ENTRANCE · IN' },
  // west exit: up from B1 onto the loop just before the south-west street exit; starts below the
  // last VIP bay so the two never overlap
  { x0: 43, x1: 43 + RAMP_W, y0: TURN_Y + 26, y1: YARD.road[0], dir: 'out', label: 'EXIT · OUT' },
];

/** Flat courtyard surfaces on the plate: entrance band, the loop lane, VIP spur and zone, bays, park. */
function courtyard() {
  const { TOP } = K;
  const [p0, p1] = YARD.plaza, [r0, r1] = YARD.road, [b0, b1] = YARD.bays;
  const BAY = 12.5, NB = 10;
  // everything below is clipped to the platform's inner perimeter (same rounded corners, inset EDGE)
  let s = `<g transform="${TOP(0, 0, PZ)}"><clipPath id="yard-clip"><rect x="${PLATE.x0 + EDGE}" y="${PLATE.y0 + EDGE}" ` +
    `width="${PLATE.x1 - PLATE.x0 - 2 * EDGE}" height="${PLATE.y1 - PLATE.y0 - 2 * EDGE}" rx="${PLATE_R - EDGE}"/></clipPath><g clip-path="url(#yard-clip)">`;
  // front band: entrance paving and the drop-off lay-by in front of the canopy
  s += `<rect class="yard-paving" x="${wx(3.6)}" y="${p0}" width="${wx(28.9) - wx(3.6)}" height="${p1 - p0}"/>`;
  s += slits(CX - 28, CX + 28, 6, p0 + 1, DROP[0] - 1, true, 'detail floor-grid');
  s += `<rect class="yard-road" x="${CX - DROP_HALF}" y="${DROP[0]}" width="${2 * DROP_HALF}" height="${p1 - DROP[0]}"/>`;
  s += slits(CX - DROP_HALF + 2, CX + DROP_HALF - 2, 4, DROP[0] + 1, p1 - 1, true, 'dropoff-hatch');
  s += `<text class="lane-text" x="${CX}" y="${DROP[0] + 5.6}" font-size="3.4" text-anchor="middle" letter-spacing="1">DROP-OFF</text>`;
  // the loop: one-way, east → west along the façade, kerb lines broken at every junction
  // the loop runs right out to the east edge of the VIP / entry lanes, so the three meet with no gap
  s += `<rect class="yard-road" x="${EXIT[0]}" y="${r0}" width="${ENTRY[1] - EXIT[0]}" height="${r1 - r0}"/>`;
  for (const ax of [PW * 0.3, PW * 0.5, PW * 0.7, PW * 0.88]) s += arrow(ax, (r0 + r1) / 2, 'w');
  // (the VIP lanes are a raised deck with a graded ramp: see vipDeck)
  // west side: perimeter paving around the P↑OUT ramp (the ramp is cut into it, drawn afterwards)
  // one plain paving plane from the perimeter wall to the building, from the end of the VIP bays down to
  // the loop (the raised turnaround sits on it): no grid lines, no seams
  const pave0 = VIPZ.y0 + VIPZ.n * 12.5 + 2;
  s += `<rect class="yard-paving" x="${VIPZ.x0 - 1}" y="${pave0}" width="${wx(3.6) - 4 - VIPZ.x0 + 1}" height="${YARD.road[0] - pave0}"/>`;
  // street connectors: in at the south-east (north-bound), out at the south-west (south-bound)
  s += `<rect class="yard-road" x="${ENTRY[0]}" y="${r1}" width="${ENTRY[1] - ENTRY[0]}" height="${PLATE.y1 - EDGE - r1}"/>`;
  s += `<rect class="yard-road" x="${EXIT[0]}" y="${r1}" width="${EXIT[1] - EXIT[0]}" height="${PLATE.y1 - EDGE - r1}"/>`;
  for (const ay of [r1 + 22, PD - 26]) {
    s += arrow((ENTRY[0] + ENTRY[1]) / 2, ay, 'n');
    s += arrow((EXIT[0] + EXIT[1]) / 2, ay, 's');
  }
  s += `<text class="lane-text" x="${(ENTRY[0] + ENTRY[1]) / 2}" y="${PD - 2}" font-size="3.6" text-anchor="middle" letter-spacing="1">ENTRY</text>`;
  s += `<text class="lane-text" x="${(EXIT[0] + EXIT[1]) / 2}" y="${PD - 2}" font-size="3.6" text-anchor="middle" letter-spacing="1">EXIT</text>`;
  // the open ground round the front car park (driveway to front edge, between the exit and entry lanes),
  // laid first so the bay lines and P numbers sit on top of it:
  // the roads' grained grey; the open ground elsewhere stays light grey
  s += `<rect class="yard-road" x="${EXIT[1]}" y="${r1}" width="${ENTRY[0] - EXIT[1]}" height="${PLATE.y1 - r1}"/>`;
  // pedestrian pavers (ការ៉ូឡា, running bond) round the pool and the ATM room: as wide as the garden
  // wall, from its front face out to just past them
  s += `<rect class="yard-plaza" x="${LAWN[0] - 1.2}" y="${GARDEN_WALL.y1}" width="${LAWN[1] - LAWN[0] + 2.4}" height="${YARD.park[1] + 1.2 - GARDEN_WALL.y1}"/>`;
  // ten 60° angled bays along the loop's south kerb, slanting with the west-bound flow toward the exit
  const { pitch, run, x0: ax0 } = STALLS;
  const ax1 = ax0 + pitch * NB;
  s += `<path class="yard-road" d="M${ax0} ${b0}H${ax1}L${ax1 - run} ${b1}H${ax0 - run}Z"/>`; // asphalt, so the white stall lines read
  for (let i = 0; i <= NB; i++) s += `<line class="slot-line" x1="${ax0 + i * pitch}" y1="${b0 + 1}" x2="${ax0 + i * pitch - run}" y2="${b1 - 1}"/>`;
  s += `<line class="slot-line" x1="${ax0 - run}" y1="${b1 - 1}" x2="${ax1 - run}" y2="${b1 - 1}"/>`;
  for (let i = 0; i < NB; i++) s += `<text class="slot-text" x="${ax0 + (i + 0.5) * pitch - run + 2}" y="${b1 - 4}" font-size="3" text-anchor="middle">P${i + 1}</text>`;
  // front yard: a lawn 38 m wide, centred on the entrance, with plain paving either side out to the
  // street connectors
  return s + `</g></g>`;
}

/** Direction arrow painted on the ground (TOP plane units), pointing w / n / s / e. */
function arrow(x, y, dir) {
  const rot = { w: 0, n: 90, s: -90, e: 180 }[dir];
  return `<path class="road-arrow" transform="rotate(${rot} ${x} ${y})" d="M${x + 6} ${y - 1.1}h-8v-2.2l-4.5 3.3 4.5 3.3v-2.2h8z"/>`;
}

/** Cars in some regular bays (pointing north) and some VIP bays (nose-in, pointing east). */
const PARKED = [0, 1, 3, 4, 6, 8];
// 60° angled stalls: 2.5 m wide → 2.89 m along the kerb (pitch); the stall lines run back and west
// by `run` over the 5 m depth, so west-bound cars swing straight in
const STALLS = (() => { const pitch = 12.5 / Math.sin(Math.PI / 3), run = 25 / Math.tan(Math.PI / 3);
  return { pitch, run, x0: CX - (pitch * 10) / 2 + run / 2 }; })();
const VIP_PARKED = [0, 1, 3, 5, 6, 8];
const VIP_REVERSED = new Set([1, 5, 8]);   // backed in: these face the building (east) instead of the wall
// who is parked where: low-poly models (iso/vehicles.js) and paints, by bay
const VIP_FLEET = [['taycan', 'black'], ['cybertruck', 'steel'], ['model3', 'white'], ['ferrari', 'red'], ['p911', 'silver'], ['modelY', 'blue']];
const BAY_FLEET = [['model3', 'red'], ['byd', 'blue'], ['modelY', 'white'], ['p911', 'grey'], ['byd', 'white'], ['model3', 'black']];
const CAR_M = M * 0.92;   // cars a touch under true scale, so the longest (Cybertruck) clears a 5 m bay
/** VIP cars sit behind the tower (west side), nose-in pointing east: drawn before it. */
const vipCars = (arrived = new Map(), gone = new Set()) => VEHICLE_DEFS + parked([...VIP_PARKED.map((i, k) => [i, VIP_FLEET[k % VIP_FLEET.length]]), ...arrived]
  .filter(([i]) => !gone.has(i))
  .map(([i, [model, paint]]) => ({ model, paint, cx: VIPZ.x0 + 12.5, cy: VIPZ.y0 + i * 12.5 + 6.25, ux: VIP_REVERSED.has(i) && !arrived.has(i) ? 1 : -1, uy: 0, z: VZ, m: CAR_M })));
/** Parked cars: every car's shadows merged under one blur each (2 filters for the group, not 2 per
 *  shape per car), then the cars themselves. */
function parked(list) {
  const sh = list.map((c) => vehicle(K, { ...c, shadow: 'only' }));
  return `<g class="car-shadow"><g filter="url(#car-pen)">${sh.map((x) => x.cast).join('')}</g><g filter="url(#car-ao)">${sh.map((x) => x.ao).join('')}</g></g>` +
    list.map((c) => vehicle(K, { ...c, shadow: false })).join('');
}
/** Cars in the angled front bays (aligned to the stall axis) sit in front of the tower: drawn after it. */
function cars(away = new Set()) {
  const { pitch, run, x0 } = STALLS, b0 = YARD.bays[0], b1 = YARD.bays[1];
  const len = Math.hypot(run, b1 - b0), ux = -run / len, uy = (b1 - b0) / len; // stall axis, kerb → back
  // driven in forwards: the nose points to the back of the stall
  return parked(PARKED.flatMap((i, k) => {
    if (away.has(i)) return [];   // driven off by a scene (see the scene paths below)
    const [model, paint] = BAY_FLEET[k % BAY_FLEET.length];
    return [{ model, paint, cx: x0 + (i + 0.5) * pitch - run / 2, cy: (b0 + b1) / 2, ux, uy, z: PZ, m: CAR_M }];
  }));
}

/**
 * Raised centre curbs of the VIP route. The north leg and the upper east leg are open — lanes only, no
 * curb — so on the east side the curb covers just the route's mouth, alongside the P↓IN ramp; the west
 * leg keeps its curb down to the turning area.
 */
// ---- VIP deck: the VIP route sits 0.8 m above the main driveway. Its east leg climbs to it along the
// centre-curb stretch on a constant grade (about 4 %: 0.8 m over 20 m), from the loop up to the deck.
const VIP_RISE = 4, VZ = PZ + VIP_RISE;
const VIP_SLOPE = { y0: RAMPS[0].y0, y1: YARD.road[0] };   // the graded stretch of the east leg (y band)
/** Road height on the VIP route at (x, y): the loop below, the graded east ramp, the deck above. */
// The grade follows a smoothstep: zero slope where it leaves the (flat) loop and where it reaches the
// (flat) deck, steepest (about 6 %) halfway — vertical curves at both ends, so cars roll on and off it.
const rampT = (y) => { const t = Math.min(1, Math.max(0, (VIP_SLOPE.y1 - y) / (VIP_SLOPE.y1 - VIP_SLOPE.y0))); return t * t * (3 - 2 * t); };
const vipZ = (x, y) => (y >= VIP_SLOPE.y1 ? PZ : x >= VIP_E.in[0] - 1 && y > VIP_SLOPE.y0 ? PZ + VIP_RISE * rampT(y) : VZ);
function vipDeck() {
  const { box, TOP } = K, E = VIP_E, N = VIP_N, W = VIP_W, sl = VIP_SLOPE, BAY = 12.5;
  const mid = (b) => (b[0] + b[1]) / 2;
  // slabs back to front (their tops are the road): north leg, bay apron, west leg + turn, east leg
  // north leg with its cut north-east corner (VIP_CUT): top, east side and front faces (the cut face
  // runs along the view direction, so it is seen edge-on)
  const xr = E.out[1], c = VIP_CUT;
  const top = [[W.out[0], N.out[0]], [xr - c, N.out[0]], [xr, N.out[0] + c], [xr, N.in[1]], [W.out[0], N.in[1]]];
  let s = `<path class="face side vip-deck" d="${K.path([[xr, N.out[0] + c, PZ], [xr, N.in[1], PZ], [xr, N.in[1], VZ], [xr, N.out[0] + c, VZ]])}Z"/>` +
    `<path class="face front vip-deck" d="${K.path([[W.out[0], N.in[1], PZ], [xr, N.in[1], PZ], [xr, N.in[1], VZ], [W.out[0], N.in[1], VZ]])}Z"/>` +
    `<path class="face top vip-deck" d="${K.path(top.map(([x, y]) => [x, y, VZ]))}Z"/>`;
  // the bay apron and the west leg end in the turnaround: no step face across their south ends, so the
  // surface there reads as one flat, seamless plane
  const open = (svgBox) => svgBox.replace(/<path class="face front[^>]*\/>/, '');
  s += open(box(VIPZ.x0, VIPZ.y0 - 2, PZ, VIPZ.x1 + 1 - VIPZ.x0, VIPZ.n * BAY + 4, VIP_RISE, 0, 'vip-deck pave'));
  s += open(box(W.out[0], N.in[1], PZ, W.in[1] - W.out[0], TURN_Y + 22 - N.in[1], VIP_RISE, 0, 'vip-deck'));
  s += box(E.in[0], N.in[1], PZ, E.out[1] - E.in[0], sl.y0 - N.in[1], VIP_RISE, 0, 'vip-deck');
  // the graded ramp: its sloped road surface and the wedge-shaped side it shows on the east
  // its curved profile as 16 strips (one path each would be planar; the S-curve needs the steps)
  const STEPS = 16, ys = [...Array(STEPS + 1)].map((_, k) => sl.y0 + ((sl.y1 - sl.y0) * k) / STEPS);
  const zr = (y) => vipZ(E.in[0], y);
  s += `<path class="face side vip-deck" d="${K.path([[E.out[1], sl.y1, PZ], [E.out[1], sl.y0, PZ], ...ys.map((y) => [E.out[1], y, zr(y)])])}Z"/>`;
  s += ys.slice(1).map((y, k) => `<path class="face top vip-deck" d="${K.path([[E.in[0], ys[k], zr(ys[k])], [E.out[1], ys[k], zr(ys[k])], [E.out[1], y, zr(y)], [E.in[0], y, zr(y)]])}Z"/>`).join('');
  // markings: on the deck (flat, at VZ) and on the ramp (each at the ramp's height where it lies)
  let deck = '', ramp = '';
  const onRamp = (y, m) => `<g transform="${TOP(0, 0, zr(y) + 0.05)}">${m}</g>`;
  for (const ay of [YARD.road[0] - 22, (N.in[1] + YARD.road[0]) / 2, N.in[1] + 24]) {
    const m = arrow(mid(E.out), ay, 'n') + arrow(mid(E.in), ay + 10, 's');
    if (ay > sl.y0) ramp += onRamp(ay, m); else deck += m;
  }
  for (const ax of [PW * 0.3, PW * 0.55, PW * 0.8]) deck += arrow(ax, mid(N.out), 'w') + arrow(ax - 12, mid(N.in), 'e');
  for (const ay of [N.in[1] + 20, (N.in[1] + TURN_Y) / 2]) deck += arrow(mid(W.out), ay, 's') + arrow(mid(W.in), ay + 10, 'n');
  ramp += onRamp(YARD.road[0] - 42, `<text class="lane-text" transform="translate(${mid(E.out) + 1.3} ${YARD.road[0] - 42}) rotate(-90)" font-size="3.4" text-anchor="middle" letter-spacing="1">VIP IN</text>` +
    `<text class="lane-text" transform="translate(${mid(E.in) + 1.3} ${YARD.road[0] - 42}) rotate(-90)" font-size="3.4" text-anchor="middle" letter-spacing="1">VIP OUT</text>`);
  deck += `<text class="lane-text" x="${mid([W.out[0], W.in[1]])}" y="${TURN_Y + 14}" font-size="3" text-anchor="middle" letter-spacing=".8">TURN</text>`;
  for (let i = 0; i < VIPZ.n; i++) {
    const y = VIPZ.y0 + i * BAY;
    deck += `<rect class="vip-bay" x="${VIPZ.x0 + 0.8}" y="${y + 0.8}" width="${VIPZ.x1 - VIPZ.x0 - 1.6}" height="${BAY - 1.6}" rx="1"/>`;
    deck += `<text class="vip-text" x="${VIPZ.x1 - 2}" y="${y + BAY / 2 + 1.2}" font-size="3.2" text-anchor="end">VIP ${i + 1}</text>`;
  }
  return s + `<g transform="${TOP(0, 0, VZ)}">${deck}</g>${ramp}`;
}

/**
 * Graded centre curb (x0..x0+w × y0..y0+len, height h): sloped sides (the top is narrower than the
 * base) and long tapered noses at both ends that ramp down to the road over `nose`, so the lane
 * divider eases out of the paving instead of starting as a sheer block. A convex solid: its faces
 * turned to the viewer are drawn, shaded by which way they face.
 */
function gradedCurb(x0, y0, w, len, h = 1.5, nose = 7, base = () => PZ) {
  const y1 = y0 + len, inset = w * 0.28;
  const bot = [[x0, y0], [x0 + w, y0], [x0 + w, y1], [x0, y1]].map(([x, y]) => [x, y, base(y)]);
  const top = [[x0 + inset, y0 + nose], [x0 + w - inset, y0 + nose], [x0 + w - inset, y1 - nose], [x0 + inset, y1 - nose]].map(([x, y]) => [x, y, base(y) + h]);
  const c = [x0 + w / 2, (y0 + y1) / 2, base((y0 + y1) / 2) + h / 2];
  const faces = [top, ...bot.map((_, i) => { const j = (i + 1) % 4; return [bot[i], bot[j], top[j], top[i]]; })];
  return faces.map((f) => {
    const u = f[1].map((v, k) => v - f[0][k]), v2 = f[2].map((v, k) => v - f[0][k]);
    let n = [u[1] * v2[2] - u[2] * v2[1], u[2] * v2[0] - u[0] * v2[2], u[0] * v2[1] - u[1] * v2[0]];
    const m = [0, 1, 2].map((k) => f.reduce((a, p) => a + p[k], 0) / 4 - c[k]);
    if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] < 0) n = n.map((x) => -x);
    if (n[0] + n[1] + n[2] <= 0) return '';                       // faces away from the viewer
    const shade = n[2] > Math.max(Math.abs(n[0]), Math.abs(n[1])) ? 'top' : n[0] > n[1] ? 'side' : 'front';
    return `<path class="face ${shade} struct" d="${K.path(f)}Z"/>`;
  }).join('');
}
/**
 * VIP checkpoint, halfway along the east centre curb: a small booth on the curb island and one
 * motorised barrier per lane. The arms are drawn in their lane's vertical cross-section plane and
 * rotate about their pivot (CSS, `.vip-gate.open`): the entry arm reaches east across VIP IN, the exit
 * arm west across VIP OUT. Both open for a car stopped at them and close once it has passed.
 */
const VIP_GATE = { y: Math.round((RAMPS[0].y0 + YARD.road[0] - 4) / 2), x0: VIP_E.in[1] - 2, x1: VIP_E.in[1] + CURB + 2 };
function vipGate() {
  const { box, FRONT, SIDE } = K, g = VIP_GATE, zb = vipZ(VIP_E.in[1], g.y), bh = 11, arm = 15, armZ = zb + 5;
  let s = box(g.x0, g.y - 4, zb, g.x1 - g.x0, 8, bh, 0, 'struct booth');
  // windows on the two faces we see, and a roof slab
  s += `<g transform="${FRONT(g.x0, g.y + 4, zb + bh)}"><rect class="booth-glass" x=".8" y="2.2" width="${g.x1 - g.x0 - 1.6}" height="4.6"/></g>`;
  s += `<g transform="${SIDE(g.x1, g.y + 4, zb + bh)}"><rect class="booth-glass" x=".8" y="2.2" width="6.4" height="4.6"/></g>`;
  s += box(g.x0 - 1, g.y - 5, zb + bh, g.x1 - g.x0 + 2, 10, 1.2, 0, 'struct cap');
  // the two barriers: post, then the arm (striped, a lamp at its tip that turns green when open)
  const bar = (dir) => {
    const len = dir * arm, x = dir > 0 ? g.x1 : g.x0;
    const stripes = [...Array(5)].map((_, i) => `<rect class="gate-stripe" x="${Math.min(0, len) + (i * 2 + 0.5) * Math.abs(len) / 10}" y="-.55" width="${Math.abs(len) / 10}" height="1.1"/>`).join('');
    return box(x - 0.6, g.y - 0.6, zb, 1.2, 1.2, 5.6, 0, 'struct') +
      `<g class="vip-gate ${dir > 0 ? 'in' : 'out'}" transform="${FRONT(x, g.y, armZ)}"><g class="gate-arm">` +
      `<rect class="gate-bar" x="${Math.min(0, len)}" y="-.55" width="${Math.abs(len)}" height="1.1" rx=".5"/>${stripes}` +
      `<circle class="gate-lamp" cx="${len - dir * 0.6}" cy="0" r=".7"/></g></g>`;
  };
  return s + bar(-1) + bar(1);
}

const curbEast = () => gradedCurb(VIP_E.in[1], RAMPS[0].y0, CURB, YARD.road[0] - 4 - RAMPS[0].y0, 1.5, 7, (y) => vipZ(VIP_E.in[1], y)); // follows the ramp

/**
 * Perimeter wall (≈1.6 m high, 0.3 m thick) along the outer edge of the VIP route: up the east leg,
 * parallel to the VIP lanes and the P↓IN ramp, round the back corner along the north leg, and down the
 * west leg to the shared loop. Same white podium material, linework and shading as the curbs.
 */
const VIP_WALL = { x: VIP_E.out[1] + 1, t: 1.5, h: 8, y0: VIP_N.out[0] - 2.5, y1: YARD.road[0] - 3 };
/**
 * External public restroom: a compact single-storey block (6.4 × 6 m) on the paved platform west of the
 * P↑OUT ramp, between the VIP turning area and the shared loop. White podium finish, flat roof with a
 * parapet line, and a single entrance door on the face toward the P↑OUT ramp, under a
 * "공용 화장실 · PUBLIC RESTROOM" sign band.
 */
const PUBLIC_WC = { x: 4, y: TURN_Y + 38, w: 32, d: 30, h: 17 };   // clear of the (wider) exit ramp
function publicWC() {
  const { SIDE, TOP, box } = K, b = PUBLIC_WC;
  const z1 = PZ + b.h;
  // soft shadow on the paving, then the block
  let s = `<g class="pwc-shadow">` + shadowLayer(K, [{ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.d, h: b.h }],
    { z: PZ, clipId: 'pwc-clip', clip: roundedRectPath(K, PLATE, PLATE_R, PZ), slices: 4, darkness: 0.22, spread: [0.6, 3], cls: 'twr-ground-shadow' }) + `</g>`;
  // interior, only seen when the block is x-rayed: three stalls along the west wall and a basin counter
  for (let i = 0; i < 3; i++) s += box(b.x + 1, b.y + 2 + i * 9, PZ, 9, 0.6, 9, 0, 'partition fixture');
  s += box(b.x + 1, b.y + 2 + 27, PZ, 9, 0.6, 9, 0, 'partition fixture');
  s += box(b.x + b.w - 14, b.y + 1, PZ, 12, 3.5, 4.5, 0, 'fixture counter');
  s += `<g class="pwc">`;
  s += box(b.x, b.y, PZ, b.w, b.d, b.h, 0, 'struct');
  s += `<g transform="${TOP(b.x, b.y, z1)}"><rect class="detail" x="1.2" y="1.2" width="${b.w - 2.4}" height="${b.d - 2.4}"/></g>`;
  // one entrance, on the east (+x) face: it faces the P↑OUT parking exit ramp, with the sign above it
  const dw = 7, dx = (b.d - dw) / 2;
  s += `<g transform="${SIDE(b.x + b.w, b.y + b.d, z1)}">` +
    `<rect class="face recess" x="2.5" y="1" width="${b.d - 5}" height="3" rx=".5"/>` +
    `<text class="pwc-sign" x="${b.d / 2}" y="3.1" font-size="1.9" text-anchor="middle" letter-spacing=".3">공용 화장실 · PUBLIC RESTROOM</text>` +
    `<text class="pwc-glyph" x="${b.d / 2}" y="${b.h - 12.4}" font-size="2.6" text-anchor="middle">♀ ♂</text>` +
    `<rect class="face recess" x="${dx - 0.6}" y="${b.h - 11.6}" width="${dw + 1.2}" height="11.6"/>` +
    `<rect class="pwc-doorway" x="${dx}" y="${b.h - 11}" width="${dw}" height="11"/>` +     // the dark opening, seen while the door is open
    `<rect class="face pwc-door" x="${dx}" y="${b.h - 11}" width="${dw}" height="11"/>` +
    `<line class="entry-handle" x1="${dx + dw - 1.4}" y1="${b.h - 6.5}" x2="${dx + dw - 1.4}" y2="${b.h - 4.5}"/></g>`;
  s += `</g>`;
  // seen through (a visitor inside): a frosted body — its two visible walls and roof — and a hairline
  // outline, the same treatment as the building
  const x0 = b.x, x1 = b.x + b.w, y0 = b.y, y1 = b.y + b.d, P = K.path;
  s += `<g class="anim-pwc"></g>`; // whoever is inside, under the frost and outline (filled per frame)
  s += `<g class="pwc-frost"><path d="${P([[x0, y1, PZ], [x1, y1, PZ], [x1, y1, z1], [x0, y1, z1]])}Z"/>` +
    `<path d="${P([[x1, y0, PZ], [x1, y1, PZ], [x1, y1, z1], [x1, y0, z1]])}Z"/>` +
    `<path d="${P([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]])}Z"/></g>`;
  const ring = (z) => `<path d="${P([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]])}Z"/>`;
  s += `<g class="pwc-outline">${ring(PZ)}${ring(z1)}` + [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => `<path d="${P([[x, y, PZ], [x, y, z1]])}"/>`).join('') + `</g>`;
  return s;
}

/** The back (north) run, corner to corner, and the west run down to the shared loop. */
// the west run continues along the platform's edge past the loop, beside the exit lane, to its gate
const VIP_WALL_W = { x: VIPZ.x0 - 2.5, y0: VIP_WALL.y0, y1: PLATE.y1 - PLATE_R - 0.6 };
const VIP_CUT = 22;   // the VIP route's outer north-east corner is cut at 45° (4.4 m), road and wall alike
const VIP_WALL_N = { x0: VIP_WALL_W.x, x1: VIP_WALL.x + VIP_WALL.t - VIP_CUT, y: VIP_WALL.y0 };
/** A straight wall from (ax, ay) to (bx, by), thickness t to its left, height h: its faces that turn to
 *  the viewer and its top (for the diagonal corner piece). */
function wallSeg(ax, ay, bx, by, t, h) {
  const L = Math.hypot(bx - ax, by - ay), nx = ((by - ay) / L) * t, ny = (-(bx - ax) / L) * t;
  const foot = [[ax, ay], [bx, by], [bx + nx, by + ny], [ax + nx, ay + ny]];
  const c = [(ax + bx + nx) / 2, (ay + by + ny) / 2];
  let s = '';
  foot.forEach((p, i) => {
    const q = foot[(i + 1) % 4], ex = q[0] - p[0], ey = q[1] - p[1];
    let fx = ey, fy = -ex;                                   // outward horizontal normal
    if (fx * ((p[0] + q[0]) / 2 - c[0]) + fy * ((p[1] + q[1]) / 2 - c[1]) < 0) { fx = -fx; fy = -fy; }
    if (fx + fy <= 1e-6) return;                             // turned away (or edge-on)
    s += `<path class="face ${fx > fy ? 'side' : 'front'} struct" d="${K.path([[p[0], p[1], PZ], [q[0], q[1], PZ], [q[0], q[1], PZ + h], [p[0], p[1], PZ + h]])}Z"/>`;
  });
  return s + `<path class="face top struct" d="${K.path(foot.map(([x, y]) => [x, y, PZ + h]))}Z"/>`;
}
function vipWallBack() {
  const w = VIP_WALL, n = VIP_WALL_N, ww = VIP_WALL_W;
  const ao = (x0, y0, x1, y1) => `<path d="${K.path([[x0, y0, PZ], [x1, y0, PZ], [x1, y1, PZ], [x0, y1, PZ]])}Z"/>`;
  // contact shadow only under the north run: along the west run it read as a thick dark border beside
  // the exit lane
  return `<g class="ao" filter="url(#ao)">${ao(n.x0, n.y - 1, n.x1, n.y + w.t + 1)}</g>` +
    K.box(ww.x, ww.y0, PZ, w.t, ww.y1 - ww.y0, w.h, 0, 'struct') +   // west run (further back on screen: drawn first)
    K.box(n.x0, n.y, PZ, n.x1 - n.x0, w.t, w.h, 0, 'struct') +       // north run
    wallSeg(w.x + w.t, n.y + VIP_CUT, n.x1, n.y, w.t * 2.5, w.h);     // the cut corner: a broader, thicker piece (thickness inward)
}
/** The building's north-east corner (metres): where its east face begins. */
const FOOTPRINT_NE = FOOTPRINT.reduce((best, p) => (p[0] - p[1] > best[0] - best[1] ? p : best));

/** The VIP entrance leg's inner (west) wall, shared with the P↓IN ramp: one wall on the boundary
 *  between them, from the back of the route down to the loop. */
function vipWallInner() {
  // a cross wall closes the strip between the building and this wall: from the building's north-east
  // corner (starting just inside it, so it sits flush on the façade) straight across, in line with the
  // building's north wall; this wall starts at that cross wall, so the two meet in a clean L
  const [cx0, cy] = [wx(FOOTPRINT_NE[0]) - 0.5, wy(FOOTPRINT_NE[1])];
  const { box } = K, w = VIP_WALL, x = VIP_E.in[0] - w.t, y0 = cy, L = w.y1 - y0;
  const ao = (x0, ya, x1, yb) => `<path d="${K.path([[x0, ya, PZ], [x1, ya, PZ], [x1, yb, PZ], [x0, yb, PZ]])}Z"/>`;
  return `<g class="ao" filter="url(#ao)">${ao(x - 1, y0, x + w.t + 1, w.y1)}${ao(cx0, cy - 1, x, cy + w.t + 1)}</g>` +
    box(cx0, cy, PZ, x - cx0, w.t, w.h, 0, 'struct') +
    box(x, y0, PZ, w.t, L, w.h, 0, 'struct');
}

function vipWall() {
  // starts below the cut corner and runs straight along the platform's east edge, beside the entry lane,
  // to the entrance gate (which sits where the platform's corner starts to round)
  const { box } = K, w = { ...VIP_WALL, y0: VIP_WALL.y0 + VIP_CUT, y1: PLATE.y1 - PLATE_R - 0.6 }, L = w.y1 - w.y0;
  // soft contact shadow so the wall sits on the ground, then the wall
  return `<g class="ao" filter="url(#ao)"><path d="${K.path([[w.x - 1, w.y0, PZ], [w.x + w.t + 1, w.y0, PZ], [w.x + w.t + 1, w.y1, PZ], [w.x - 1, w.y1, PZ]])}Z"/></g>` +
    box(w.x, w.y0, PZ, w.t, L, w.h, 0, 'struct');
}

/** Main entrance on the centre of the south façade: framed glass doors and a canopy on two columns. */
// Entrance level: the lobby floor is 0.5 m (ENTRY_RISE) above the plaza. A landing runs along the
// doors under the canopy; three steps lead down to the plaza right at the canopy's front edge, and an
// accessible ramp (ផ្លូវចោត, gentler than 1:12) runs along the façade from each end of the landing — west toward the
// P↑OUT side, east toward the P↓IN side.
const ENTRY_RISE = 2.5;
const LANDING = { x0: CX - 18, x1: CX + 18, y0: YB, y1: YB + 14 };
const STEP = { n: 3, run: 1.5 };                          // three 0.3 m treads, ending just past the canopy (18)
const ACCESS = [                                          // dir: which way the ramp runs down
  // a plain straight slope either side of the steps: from the façade out to the flower beds' back walls
  // (no strip of plaza between them), long as the beds: out to the building's front corners (gentler than 1:12)
  { x0: wx(3.6), x1: LANDING.x0, y0: YB + 1, y1: DROP[0], dir: -1 },
  { x0: LANDING.x1, x1: wx(28.9), y0: YB + 1, y1: DROP[0], dir: 1 },
];
/** Height of the ramp deck at x (0 at its low end, ENTRY_RISE where it meets the landing). */
const rampRise = (a, x) => ENTRY_RISE * (a.dir < 0 ? (x - a.x0) : (a.x1 - x)) / (a.x1 - a.x0);
/** Walking height at the entrance (landing, steps, ramps); plaza level elsewhere. */
const entryZ = (x, y) => {
  if (x >= LANDING.x0 && x <= LANDING.x1) {
    if (y <= LANDING.y1) return PZ + ENTRY_RISE;
    const k = Math.floor((y - LANDING.y1) / STEP.run);
    if (k < STEP.n) return PZ + ENTRY_RISE * (1 - (k + 1) / (STEP.n + 1));
  }
  const a = ACCESS.find((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);
  return a ? PZ + rampRise(a, x) : PZ;
};
/** One accessible ramp: sloped deck and its wedge-shaped open side with a low curb (no handrails). */
function accessRamp(a) {
  const { path } = K, top = PZ + ENTRY_RISE;
  const hi = a.dir < 0 ? a.x1 : a.x0, lo = a.dir < 0 ? a.x0 : a.x1;
  // (no outlines: plain surfaces read cleaner beside the steps)
  let s = `<path class="face top struct entry-deck plain" d="${path([[lo, a.y0, PZ], [hi, a.y0, top], [hi, a.y1, top], [lo, a.y1, PZ]])}Z"/>`;
  s += `<path class="face front struct plain" d="${path([[lo, a.y1, PZ], [hi, a.y1, top], [hi, a.y1, PZ]])}Z"/>`;
  s += `<path class="face front struct plain" d="${path([[lo, a.y1, PZ], [hi, a.y1, top], [hi, a.y1, top + 0.6], [lo, a.y1, PZ + 0.6]])}Z"/>`; // curb
  if (a.dir > 0) {
    s += `<path class="face side struct plain" d="${path([[a.x1, a.y0, PZ], [a.x1, a.y1, PZ], [a.x1, a.y1, PZ + 0.6], [a.x1, a.y0, PZ + 0.6]])}Z"/>`;
  } else {
    // the high end beside the steps: the landing covers it down to its front edge, the step flank below
    s += `<path class="face side struct plain" d="${path([[hi, LANDING.y1, PZ], [hi, a.y1, PZ], [hi, a.y1, top], [hi, LANDING.y1, top]])}Z"/>`;
  }
  return s;
}
/**
 * Raised flower bed (white concrete wall, like the steps and canopy) between x0..x1, y0..y1: soil, a row
 * of rounded low-poly shrubs and white / bright flowers scattered over them (deterministic).
 */
function planter(x0, x1, y0, y1) {
  const { box, TOP } = K, h = 3, z = PZ + h;
  let s = box(x0, y0, PZ, x1 - x0, y1 - y0, h, 0, 'struct planter');
  s += `<g transform="${TOP(x0, y0, z + 0.01)}"><rect class="planter-soil" x="0.8" y="0.8" width="${x1 - x0 - 1.6}" height="${y1 - y0 - 1.6}"/></g>`;
  const n = Math.max(2, Math.round((x1 - x0) / 5.5)), step = (x1 - x0 - 2) / n;
  const shrubs = [];
  for (let i = 0; i < n; i++) {
    for (const row of [0, 1]) {
      const w = 4 + ((i * 7 + row * 3) % 3) * 0.6, d = (y1 - y0 - 2.4) / 2, hh = 2 + ((i * 5 + row) % 3) * 0.6;
      shrubs.push({ x: x0 + 1 + i * step + (step - w) / 2 + (row ? step * 0.25 : 0) % step, y: y0 + 1.2 + row * d, w: Math.min(w, step), d, h: hh });
    }
  }
  shrubs.sort((a, b) => a.x + a.y - (b.x + b.y));
  let flowers = '';
  shrubs.forEach((b, i) => {
    s += box(b.x, b.y, z, b.w, b.d, b.h, Math.min(b.w, b.d) * 0.45, 'shrub');
    for (let k = 0; k < 3; k++) {
      const fx = b.x + b.w * (0.25 + ((i * 3 + k * 5) % 5) * 0.12), fy = b.y + b.d * (0.25 + ((i * 7 + k * 3) % 5) * 0.12);
      const [px, py] = K.P(fx, fy, z + b.h);
      flowers += `<circle class="flower f${(i + k) % 3}" cx="${px.toFixed(2)}" cy="${py.toFixed(2)}" r=".55"/>`;
    }
  });
  return s + flowers;
}

function entryLevel() {
  const { box } = K, L = LANDING;
  // flower beds flanking the drop-off lay-by over its full depth, their inner ends in line with the
  // canopy's front pillars (the lay-by runs between those pillars: DROP_HALF)
  // and their outer ends out at the building's front corners (the south façade's west / east ends)
  const bedY0 = DROP[0], bedY1 = DROP[1] - 0.4, edge = DROP_HALF + 1.5;
  // back to front: the west ramp, the landing, its steps, the east ramp, then the two beds (nearer)
  let s = accessRamp(ACCESS[0]);
  s += box(L.x0, L.y0, PZ, L.x1 - L.x0, L.y1 - L.y0, ENTRY_RISE, 0, 'struct entry-deck');
  for (let k = 0; k < STEP.n; k++) {
    const h = ENTRY_RISE * (1 - (k + 1) / (STEP.n + 1));
    s += box(L.x0 + 2, L.y1 + k * STEP.run, PZ, L.x1 - L.x0 - 4, STEP.run, h, 0, 'struct entry-step');
  }
  return s + accessRamp(ACCESS[1]) +
    planter(wx(3.6), CX - edge, bedY0, bedY1) + planter(CX + edge, wx(28.9), bedY0, bedY1);
}

function entrance() {
  const { FRONT, box } = K;
  const w = 32, x0 = CX - w / 2;
  let s = `<g transform="${FRONT(x0, YB, PZ + FH)}"><rect class="face struct front" width="${w}" height="${FH}"/>` +
    `<rect class="entry-glass" x="1.5" y="2" width="${w - 3}" height="${FH - 2}"/>` +
    slits(1.5 + (w - 3) / 4, w - 1.5 - (w - 3) / 4 + 0.01, (w - 3) / 4, 2, FH, true, 'entry-mullion') +
    `<line class="entry-mullion" x1="1.5" y1="5.5" x2="${w - 1.5}" y2="5.5"/>` +
    `<line class="entry-handle" x1="${w / 2 - 1.2}" y1="${FH * 0.55}" x2="${w / 2 - 1.2}" y2="${FH * 0.75}"/>` +
    `<line class="entry-handle" x1="${w / 2 + 1.2}" y1="${FH * 0.55}" x2="${w / 2 + 1.2}" y2="${FH * 0.75}"/></g>`;
  const cw = 44, c0 = CX - cw / 2, cd = 18, cz = PZ + 12;
  // night: downlights under the canopy — a warm pool on the paving below it, soft cones from three
  // fittings along its front edge, and the fittings themselves (dark mode only; drawn before the posts
  // and the slab so those sit in front of the light)
  const { TOP } = K, ch = cz - PZ, fx = [0.22, 0.5, 0.78].map((f) => cw * f);
  s += `<g class="canopy-light">` +
    `<defs><linearGradient id="canopy-cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="cone-stop" stop-opacity=".55"/><stop offset="1" class="cone-stop" stop-opacity="0"/></linearGradient></defs>` +
    `<g transform="${TOP(c0, YB, PZ)}"><rect class="canopy-pool" x="-4" y="1" width="${cw + 8}" height="${cd + 5}" rx="8" filter="url(#bloom)"/>` +
    `<rect class="canopy-pool core" x="4" y="3" width="${cw - 8}" height="${cd - 3}" rx="5" filter="url(#bloom)"/></g>` +
    `<g transform="${FRONT(c0, YB + cd - 2, cz)}">${fx.map((u) => `<path class="canopy-cone" d="M${u - 1.2} 0L${u + 1.2} 0L${u + 6} ${ch}L${u - 6} ${ch}Z" fill="url(#canopy-cone)"/>`).join('')}</g>` +
    `</g>`;
  s += entryLevel();   // landing, steps and accessible ramp, under / beside the canopy
  s += box(c0 + 1, YB + cd - 3, PZ, 2, 2, cz - PZ, 0, 'struct') + box(c0 + cw - 3, YB + cd - 3, PZ, 2, 2, cz - PZ, 0, 'struct');
  s += box(c0, YB, cz, cw, cd, 1.8, 0, 'struct');
  // the fittings: small lit lenses at the bottom edge of the slab's front face
  s += `<g class="canopy-light" transform="${FRONT(c0, YB + cd, cz + 1.8)}">${fx.map((u) => `<rect class="canopy-lamp" x="${u - 1.4}" y="1.45" width="2.8" height=".35" rx=".15" filter="url(#glow)"/>`).join('')}</g>`;
  s += `<g transform="${FRONT(c0, YB + cd, cz + 1.8)}"><text class="canopy-text" x="${cw / 2}" y="1.45" font-size="1.4" text-anchor="middle" letter-spacing=".4">TELA OFFICE BUILDING</text></g>`;
  return s;
}

export const K = frame([[PLATE.x0, PLATE.y1, -BZ], [PLATE.x1, PLATE.y0, -BZ], [PLATE.x1, PLATE.y1, -BZ], [PLATE.x0, PLATE.y0, PZ], [MAST[0], MAST[1], ZTOP + PENT.h + 6],
  ...FOOTPRINT.map(([x, y]) => [wx(x), wy(y), ZTOP + GUARD.h])], 0.05);

/**
 * Roof furniture as depth-sortable boxes: the guard parapet (one thin box per footprint edge, set just
 * inside the outer wall line so its outer face continues the façade), the lift overruns and the
 * penthouse. The footprint is clockwise, so each edge's interior lies to its right: (-dy, dx).
 */
function roofBoxes() {
  const out = [];
  FOOTPRINT.forEach(([xa, ya], i) => {
    const [xb, yb] = FOOTPRINT[(i + 1) % FOOTPRINT.length];
    const [ix, iy] = [-Math.sign(yb - ya), Math.sign(xb - xa)]; // inward normal
    const x0 = wx(Math.min(xa, xb)), x1 = wx(Math.max(xa, xb)), y0 = wy(Math.min(ya, yb)), y1 = wy(Math.max(ya, yb));
    const b = ya === yb
      ? { x: x0, y: iy > 0 ? y0 : y0 - GUARD.t, w: x1 - x0, d: GUARD.t }
      : { x: ix > 0 ? x0 : x0 - GUARD.t, y: y0, w: GUARD.t, d: y1 - y0 };
    out.push({ ...b, h: GUARD.h, cls: 'struct cap' });
  });
  for (const l of LIFTS) out.push({ x: wx(l.x0), y: wy(l.y0), w: (l.x1 - l.x0) * M, d: (l.y1 - l.y0) * M, h: 9, cls: 'struct cap' });
  out.push({ x: PENT.x0, y: PENT.y0, w: PENT.x1 - PENT.x0, d: PENT.y1 - PENT.y0, h: PENT.h, cls: 'struct cap', pent: true });
  return depthSort(out.map((b) => ({ ...b, x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.d, z0: ZTOP, z1: ZTOP + b.h })));
}

/**
 * A parking ramp cut into the plate: sloped deck from the plate top at the front (y1) down to the
 * basement at the back (y0), the visible inner side wall, the dark tunnel mouth and low curbs.
 * Arrows on the deck point down the slope for the entrance and up it for the exit.
 */
function ramp(r) {
  const { P, plane, FRONT, box, path } = K;
  const w = r.x1 - r.x0, L = r.y1 - r.y0, drop = PZ + BZ - 2;
  let s = '';
  // sloped deck: u across the ramp, v down the slope (toward y0)
  const deck = plane([r.x0, r.y1, PZ], [1, 0, 0], [0, -1, -drop / L]);
  // everything below ground is seen only through the opening in the plate: clip it to that opening,
  // so the deck never paints over the ground surface (lanes, lawn) in front of the ramp
  const hole = `ramp-hole-${r.dir}`;
  s += `<defs><clipPath id="${hole}"><path d="${path([[r.x0, r.y0, PZ], [r.x1, r.y0, PZ], [r.x1, r.y1, PZ], [r.x0, r.y1, PZ]])}Z"/></clipPath></defs><g clip-path="url(#${hole})">`;
  // back to front: tunnel mouth and inner wall sit behind the deck
  // inner west wall of the cut (faces +x): triangle between the plate edge and the deck
  s += `<path class="face struct side" d="${path([[r.x0, r.y1, PZ], [r.x0, r.y0, PZ], [r.x0, r.y0, PZ - drop]])}Z"/>`;
  // tunnel mouth at the low end: the basement car park glows from inside (a bloomed light, no fittings;
  // it fades in at nightfall with the office windows)
  s += `<g transform="${FRONT(r.x0, r.y0, PZ)}"><rect class="tunnel" width="${w}" height="${drop}"/>` +
    `<rect class="park-halo" x="2" y="6" width="${w - 4}" height="${drop - 6}" filter="url(#bloom)"/>` +
    `<rect class="face struct front" width="${w}" height="3"/></g>`;
  s += `<g transform="${deck}"><rect class="ramp" width="${w}" height="${L}"/>` +
    // light from the car park spilling up the bottom of the ramp
    `<rect class="park-spill" x="0" y="${L * 0.6}" width="${w}" height="${L * 0.4}" filter="url(#bloom)"/>` +
    `${[...Array(Math.floor(L / 4))].map((_, i) => `<line class="ramp-groove" x1="1.5" y1="${i * 4 + 2}" x2="${w - 1.5}" y2="${i * 4 + 2}"/>`).join('')}` +
    `<text class="ramp-text" transform="translate(${w / 2 + 2.2} ${L * 0.5}) rotate(90)" font-size="3.6" text-anchor="middle">${r.label}</text></g>`;
  s += `</g>`; // end of the below-ground clip
  // cars on this ramp: drawn here, after its deck but before its curbs (and, for the entrance ramp, the
  // shared wall drawn after it), so those stand in front of the car instead of under it
  s += `<g class="anim-ramp-${r.dir}"></g>`;
  // curbs (above ground, unclipped)
  s += box(r.x0 - 2, r.y0 - 2, PZ, w + 4, 2, 2.5, 0, 'struct');
  // side curbs; the exit ramp has none on its west side (the path to the public restroom runs there)
  // (the entrance ramp's east side is the VIP lanes' shared wall, see vipWallInner)
  // (no curb on either ramp's west side either: the exit has the restroom path there, and the entrance's
  // west edge is left open, flush with the paving beside the building)
  s += r.dir === 'in' ? '' : box(r.x1, r.y0, PZ, 2, L, 2.5, 0, 'struct');
  const [lx, ly] = P(r.x0 + w / 2, r.y1 + 5, PZ);
  return s + `<text class="ramp-sign" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-size="5" text-anchor="middle">${r.dir === 'in' ? 'P ↓ IN' : 'P ↑ OUT'}</text>`;
}

// Façade layout, computed once: each visible face split into bays between the pillars that sit on it,
// each bay into window slots of about 1.6 m. The window column at each end of a face (every corner and
// step of the outline) is left as solid white wall, so the corners read as solid piers.
const FACES = facades().map((f) => {
  const front = f.kind === 'front';
  const len = (front ? f.x1 - f.x0 : f.y1 - f.y0) * M;
  // pilasters: pillars standing just inside this façade line, within its span (face-local u)
  const us = PILLARS
    .filter(([px, py]) => (front ? Math.abs(py - f.y) <= 1.4 && px > f.x0 + 0.3 && px < f.x1 - 0.3
      : Math.abs(px - f.x) <= 1.4 && py > f.y0 + 0.3 && py < f.y1 - 0.3))
    .map(([px, py]) => (front ? (px - f.x0) * M : (f.y1 - py) * M))
    // a pillar right at a corner sits inside the solid corner pier: no separate strip, so corners
    // (e.g. the back north-east one) read as one clean pier rather than a column sticking out
    .filter((u) => u > 9 && u < len - 9)
    .sort((a, b) => a - b);
  const edges = [0, ...us.flatMap((u) => [u - 1.6, u + 1.6]), len];
  const slots = [];
  for (let i = 0; i + 1 < edges.length; i += 2) {
    const a = edges[i] + 0.8, b = edges[i + 1] - 0.8, w = b - a;
    if (w < 4) continue;
    const n = Math.max(1, Math.round(w / 8)), pitch = w / n;
    for (let k = 0; k < n; k++) slots.push({ x: a + k * pitch + 0.6, w: pitch - 1.2 });
  }
  slots.splice(0, 1);  // solid corner pier at the start of the face …
  slots.splice(-1, 1); // … and at its end (narrow faces end up fully solid)
  const node = front
    ? { x0: wx(f.x0), x1: wx(f.x1), y0: wy(f.y) - 0.01, y1: wy(f.y), z0: PZ, z1: ZTOP }
    : { x0: wx(f.x) - 0.01, x1: wx(f.x), y0: wy(f.y0), y1: wy(f.y1), z0: PZ, z1: ZTOP };
  return { ...f, front, len, us, slots, node };
});
const ORDERED = depthSort(FACES.map((f) => f.node)).map((n) => FACES.find((f) => f.node === n));

const SLOTS_PER_FLOOR = FACES.reduce((s, f) => s + f.slots.length, 0);

// deterministic pane order + "lived-in" variants, so lighting a floor fills in the same way every time
function paneOrder(floor) {
  let seed = 97 + floor * 131;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const n = SLOTS_PER_FLOOR;
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  const rank = new Array(n);
  idx.forEach((p, r) => { rank[p] = r; });
  const variant = Array.from({ length: n }, () => { const r = rnd(); return r < 0.2 ? ' dim' : r < 0.38 ? ' hi' : ''; });
  return { rank, variant };
}

export function buildSvg({ occ, cursor, away, vipArrived, vipGone }) {
  const { P, TOP, FRONT, SIDE, box, path } = K;
  const panes = Object.fromEntries(Array.from({ length: NF }, (_, i) => [i, paneOrder(i)]));
  const lit = (i) => {
    const o = occ[i];
    return RENTED.includes(i) && o && o.desks ? Math.round((o.assigned / o.desks) * SLOTS_PER_FLOOR) : 0;
  };
  const flCls = (i) => `fl${RENTED.includes(i) ? ' rent' : ''}${i === 0 ? ' lobby' : ''}${cursor === i ? ' cursor' : ''}`;

  let svg = ASPHALT_GRAIN;   // the road texture (a pattern the driving surfaces fill with)
  // ---- B1 parking basement under the plate ----
  svg += box(PLATE.x0 + 6, PLATE.y0 + 6, -BZ, PLATE.x1 - PLATE.x0 - 12, PLATE.y1 - PLATE.y0 - 12, BZ, 0, 'basement');
  svg += `<g transform="${FRONT(PLATE.x0 + 6, PLATE.y1 - 6, 0)}">${slits(3.5, BZ - 3, 3.5, 2, PLATE.x1 - PLATE.x0 - 14, false, 'detail floor-grid')}` +
    `<text class="label" x="14" y="${BZ / 2 + 2}" font-size="5" letter-spacing=".8">B1 · UNDERGROUND PARKING</text></g>`;
  svg += `<g transform="${SIDE(PLATE.x1 - 6, PLATE.y1 - 6, 0)}">${slits(3.5, BZ - 3, 3.5, 2, PLATE.y1 - PLATE.y0 - 14, false, 'detail floor-grid')}</g>`;
  // ---- site plate ----
  svg += box(PLATE.x0, PLATE.y0, 0, PLATE.x1 - PLATE.x0, PLATE.y1 - PLATE.y0, PZ, PLATE_R, 'struct site'); // its top is paved like the roads
  svg += `<g transform="${TOP(0, 0, PZ)}">
    <rect class="plate-edge" x="${PLATE.x0 + EDGE}" y="${PLATE.y0 + EDGE}" width="${PLATE.x1 - PLATE.x0 - 2 * EDGE}" height="${PLATE.y1 - PLATE.y0 - 2 * EDGE}" rx="${PLATE_R - EDGE}"/>
  </g>`;
  svg += `<g transform="${FRONT(PLATE.x0, PLATE.y1, PZ)}"><text class="label" x="${(PLATE.x1 - PLATE.x0) / 2 - 40}" y="5.2" font-size="4" letter-spacing=".6">TELA OFFICE BUILDING · ${NF} STOREYS · ${EXTENT.w} × ${EXTENT.d} M</text></g>`;

  svg += courtyard();
  svg += vipDeck();      // the raised VIP route with its graded ramp, bays and markings
  svg += vipWallBack();  // VIP perimeter wall along the back (north) of the route
  svg += vipCars(vipArrived, vipGone); // VIP zone on the west (back-left) side, also behind the building
  svg += ramp(RAMPS[1]); // west exit ramp: behind the building and inside its shadow
  svg += `<g class="anim-back"></g>`; // moving actors behind the building (filled per frame)

  // ---- building shadow: lighter, blur growing toward the tip so the far corners round off ----
  svg += `<g class="tower-shadow">`;
  svg += shadowLayer(K, strips().map((r) => ({ x0: wx(r.x0), x1: wx(r.x1), y0: wy(r.y0), y1: wy(r.y1), h: H })),
    // clipped to the plate's own rounded outline, so the shadow follows its corners exactly
    { z: PZ, clipId: 'twr-clip', clip: roundedRectPath(K, PLATE, PLATE_R, PZ), slices: 10, darkness: 0.22, spread: [0.7, 13], cls: 'twr-ground-shadow' }); // soft, light; only a slight blur at the base so it does not bleed onto the lit (right) side
  svg += `</g>`;
  // the external public restroom on the west paved platform: after the building's ground shadow, which
  // lies on the paving round it (drawn before, it painted over most of the restroom's roof)
  svg += publicWC();

  svg += `<g class="bld">`; // the building itself: façades, roof and roof furniture (x-rayed on demand)
  // ---- façades, back to front: wall, per-floor bands with windows, pilasters on the pillar grid ----
  for (const f of ORDERED) {
    const t = f.front ? FRONT(wx(f.x0), wy(f.y), ZTOP) : SIDE(wx(f.x), wy(f.y1), ZTOP);
    const side = f.front ? 'front' : 'side';
    let s = `<g transform="${t}"><rect class="face struct ${side}" width="${f.len}" height="${H}"/>`;
    const base = FACES.slice(0, FACES.indexOf(f)).reduce((a, g) => a + g.slots.length, 0); // slot index offset
    for (let i = 0; i < NF; i++) {   // floor i (G = 0) is storey i + 1 from the ground
      const v = H - (i + 1) * FH;
      const { rank, variant } = panes[i];
      const n = lit(i);
      // the bloom halo only on rented floors: on the others it is never visible, and every blur filter
      // costs a repaint whenever the view moves
      s += `<g class="${flCls(i)}" data-f="${i}"><rect class="face band struct ${side}" y="${v}" width="${f.len}" height="${FH}"/>` +
        // the rented floors and the lobby (lit all night) bloom at night
        (RENTED.includes(i) || i === 0 ? `<rect class="halo" x="-3" y="${v - 2}" width="${f.len + 6}" height="${FH + 4}" filter="url(#bloom)"/>` : '');
      s += `<line class="detail" x1="0" y1="${v + FH - 1.4}" x2="${f.len}" y2="${v + FH - 1.4}"/><g class="win">`;
      f.slots.forEach((sl, k) => {
        const r = rank[base + k];
        if (i === 0) s += `<rect class="pn lobby" x="${sl.x.toFixed(2)}" y="${v + 1.6}" width="${sl.w.toFixed(2)}" height="${FH - 3.4}"/>`;
        // --d: when this window's light switches on as night falls (scattered, so the floor lights up unevenly)
        else s += `<rect class="pn${r < n ? ' on' + variant[base + k] : ''}" style="--d:${500 + ((base + k) * 389 + i * 157) % 1700}ms" x="${sl.x.toFixed(2)}" y="${v + 2.6}" width="${sl.w.toFixed(2)}" height="${FH - 5.2}"/>`;
      });
      s += `</g></g>`;
    }
    s += `<rect class="bld-grain" width="${f.len}" height="${H}"/>`;   // a faint concrete grain over the face
    for (const u of f.us) s += `<rect class="face struct pilaster ${side}" x="${(u - 1.6).toFixed(2)}" y="0" width="3.2" height="${H}"/>`;
    svg += s + `</g>`;
  }

  // ---- roof: the footprint itself, then penthouse and lift overruns ----
  svg += `<path class="face top struct" d="${path(FOOTPRINT.map(([x, y]) => [wx(x), wy(y), ZTOP]))}Z"/>`;
  // guard parapet round the walkable roof, lift overruns and penthouse, back to front — first their
  // shadows on the roof slab (same sun as the ground), clipped to the roof outline
  const rb = roofBoxes();
  svg += shadowLayer(K, rb.map((b) => ({ x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, h: b.h })), {
    z: ZTOP, clipId: 'roof-clip', clip: `${path(FOOTPRINT.map(([x, y]) => [wx(x), wy(y), ZTOP]))}Z`,
    slices: 5, darkness: 0.16, spread: [0.3, 1.4], cls: 'roof-shadow',
  });
  for (const b of rb) {
    svg += box(b.x, b.y, ZTOP, b.w, b.d, b.h, 0, b.cls);
    if (b.pent) svg += `<g transform="${FRONT(PENT.x0, PENT.y1, ZTOP + PENT.h)}">${slits(2.5, PENT.h - 2.5, 1.8, 3, PENT.x1 - PENT.x0 - 3, false)}</g>`;
  }

  svg += `</g>`; // end of the building
  // shown instead of it while something is seen through it: a frosted body (its visible façades and
  // roof, filled solid inside one semi-opaque group so overlaps stay even), then a hairline outline
  const zt = ZTOP + GUARD.h;
  svg += `<g class="bld-frost">` + ORDERED.map((f) => {
    const q = f.front ? [[wx(f.x0), wy(f.y)], [wx(f.x1), wy(f.y)]] : [[wx(f.x), wy(f.y0)], [wx(f.x), wy(f.y1)]];
    return `<path d="${path([[...q[0], PZ], [...q[1], PZ], [...q[1], zt], [...q[0], zt]])}Z"/>`;
  }).join('') + `<path d="${path(FOOTPRINT.map(([x, y]) => [wx(x), wy(y), zt]))}Z"/></g>`;
  // outline: the roof edge, the full ground-floor border all the way round, and the two outermost
  // corners (no inner step corners)
  const sx = ([x, y]) => x - y;   // screen-x order of a footprint corner
  const ends = [FOOTPRINT.reduce((a, b) => (sx(b) < sx(a) ? b : a)), FOOTPRINT.reduce((a, b) => (sx(b) > sx(a) ? b : a))];
  svg += `<g class="bld-outline"><path d="${path(FOOTPRINT.map(([x, y]) => [wx(x), wy(y), zt]))}Z"/>` +
    `<path d="${path(FOOTPRINT.map(([x, y]) => [wx(x), wy(y), PZ]))}Z"/>` +
    ends.map(([x, y]) => `<path d="${path([[wx(x), wy(y), PZ], [wx(x), wy(y), zt]])}"/>`).join('') + `</g>`;
  svg += `<g class="anim-over"></g>`; // actors inside the frosted building (the KOSIGN visitor, the lift)
  svg += entrance();
  svg += ramp(RAMPS[0]); // east entrance: in front of the building's east façade
  svg += vipWallInner();  // the VIP leg's left-hand wall (behind cars in the VIP lanes)
  svg += `<g class="anim-mid1"></g>`; // actors east of the building, west of the VIP centre curb
  svg += curbEast();     // VIP centre curb beside it
  svg += vipGate();      // checkpoint booth and barriers on it
  svg += `<g class="anim-mid2"></g>`; // actors between that curb and the VIP perimeter wall
  svg += vipWall();      // low perimeter wall along the VIP route's outer edge
  svg += cars(away);
  // "No entry" at the P↑OUT ramp mouth (east side), facing the loop: the ramp is exit-only
  svg += noEntrySign(RAMPS[1].x1 + 3.5, YARD.road[0] - 1.5, '진입금지');
  svg += `<g class="anim-front"></g>`; // moving actors in front of it
  svg += lawnBed();      // the front lawn in its low concrete border (in front of the car park and the loop)
  // "No entry" for the site exit, standing on the lawn bed's front corner next to the exit lane, facing
  // the street
  svg += noEntrySign(LAWN[0] + 3, YARD.park[1] - 3, 'NO ENTRY');   // on the paving in front of the garden wall
  // automatic sliding gates where the site meets the street: exit (south-west), entrance (south-east)
  svg += siteGate('exit', EXIT[0], EXIT[1], 1) + siteGate('entry', ENTRY_GATE[0], ENTRY_GATE[1], -1, 2);

  svg += gardenWall();   // the garden's front wall
  svg += reflectingPool(); // a long decorative pool along it (west of the ATM room)
  svg += atmKiosk();     // the ATM room against it, on the paving
  svg += fireflies();    // night only: a few fireflies round the underground ramp mouths
  return svg;
}

// ---- scenes: cars and a pedestrian moving through the site (paths in world units) ----
const ROAD_Y = (YARD.road[0] + YARD.road[1]) / 2;                 // centre of the one-way (west-bound) loop
const OFF = PLATE.y1 + 26;                                         // past the plate's south edge (clipped away)
const EXIT_X = (EXIT[0] + EXIT[1]) / 2, ENTRY_X = (ENTRY[0] + ENTRY[1]) / 2;
const IN_C = (RAMPS[0].x0 + RAMPS[0].x1) / 2, OUT_C = (RAMPS[1].x0 + RAMPS[1].x1) / 2;
const DROP_Z = PZ + BZ - 2;                                        // ramp drop (see ramp())
const rampZ = (r) => (x, y) => (y >= r.y1 ? PZ : PZ - DROP_Z * ((r.y1 - y) / (r.y1 - r.y0)));
const CAR_SPEED = 64, RAMP_SPEED = 32, WALK_SPEED = 30;
/** Scenes play this many times faster than their paths' own timing (cars, walkers, waits, the lift alike). */
const PACE = 1.9;

/** A bay car reverses out, follows the loop west and out at the south-west, comes back in at the
 *  south-east entry (it drives round the block, off the plate), then turns into the P↓IN ramp. */
export function parkInPath(i) {
  const { pitch, run, x0 } = STALLS, [b0, b1] = YARD.bays;
  const len = Math.hypot(run, b1 - b0), ux = -run / len, uy = (b1 - b0) / len;
  const cx = x0 + (i + 0.5) * pitch - run / 2, cy = (b0 + b1) / 2;
  const R = RAMPS[0], plate = { clip: 'twr-clip', speed: CAR_SPEED };
  return [
    cubicLeg([cx, cy], [cx - ux * 12, cy - uy * 12], [cx + 4, ROAD_Y], [cx + 14, ROAD_Y], { reverse: true, speed: 18, ease: true }),
    leg([cx + 14, ROAD_Y], [['L', EXIT_X + 9, ROAD_Y], ['Q', EXIT_X, ROAD_Y, EXIT_X, YARD.road[1]], ['L', EXIT_X, OFF]], plate),
    leg([ENTRY_X, OFF], [['L', ENTRY_X, YARD.road[1]], ['Q', ENTRY_X, ROAD_Y, ENTRY_X - 9, ROAD_Y], ['L', IN_C + 9, ROAD_Y],
      ['Q', IN_C, ROAD_Y, IN_C, R.y1], ['L', IN_C, R.y1 - 14]], { ...plate, z: rampZ(R) }),
    // down the ramp into B1 (clipped to the ramp opening): it simply drives in and is gone
    leg([IN_C, R.y1 - 14], [['L', IN_C, R.y0]], { speed: RAMP_SPEED, clip: 'ramp-hole-in', z: rampZ(R) }),
  ];
}

/** A car climbs out of B1 up the P↑OUT ramp, turns west onto the loop and leaves at the south-west. */
export function leaveB1Path() {
  const R = RAMPS[1];
  return [
    leg([OUT_C, R.y0 + 6], [['L', OUT_C, R.y1 - 14]], { speed: RAMP_SPEED, clip: 'ramp-hole-out', z: rampZ(R) }),
    leg([OUT_C, R.y1 - 14], [['L', OUT_C, R.y1 - 2], ['Q', OUT_C, ROAD_Y, OUT_C - 9, ROAD_Y], ['L', EXIT_X + 9, ROAD_Y],
      ['Q', EXIT_X, ROAD_Y, EXIT_X, YARD.road[1]], ['L', EXIT_X, SITE_GATE_Y - 14]], { speed: CAR_SPEED, clip: 'twr-clip', z: rampZ(R), ease: true }),
    // at the exit gate: a see-through look into the cabin, then off the site
    { wait: 2, len: 0, hold: true, at: { x: EXIT_X, y: SITE_GATE_Y - 14, z: PZ, ux: 0, uy: 1 } },
    leg([EXIT_X, SITE_GATE_Y - 14], [['L', EXIT_X, OFF]], { speed: CAR_SPEED, clip: 'twr-clip' }),
  ];
}

/** A visitor steps out at the drop-off, walks west along the paving, crosses the P↑OUT ramp's mouth
 *  and goes up the path beside it to the public restroom's door, which swings open; they walk in through
 *  it (the restroom turns see-through) and the door shuts behind them. */
export function restroomPath() {
  const b = PUBLIC_WC, door = b.y + b.d / 2, xw = b.x + b.w + 2;
  const step = [b.x + b.w + 1.2, door], inside = [b.x + b.w * 0.55, door];
  return [
    // on the restroom's open (east) side the whole way: drawn in front of it (front), never behind
    leg([CX - 22, DROP[0] - 2], [['L', RAMPS[1].x1 + 8, DROP[0] - 2], ['L', RAMPS[1].x1 + 2, YARD.road[0] + 2],
      ['L', RAMPS[1].x0 - 1, YARD.road[0] + 2], ['L', xw, YARD.road[0] - 2], ['L', xw, door + 2], ['L', ...step]], { speed: WALK_SPEED, front: true }),
    // at the door: it swings open (door)
    { wait: 0.5, len: 0, front: true, door: true, at: { x: step[0], y: step[1], z: PZ, ux: -1, uy: 0 } },
    // in through the doorway: the restroom turns see-through, the visitor seen inside it (layer pwc)
    leg(step, [['L', ...inside]], { speed: WALK_SPEED, door: true, xray: 'xray-pwc', layer: 'pwc' }),
    { wait: 2.5, len: 0, hold: true, xray: 'xray-pwc', at: { x: inside[0], y: inside[1], z: PZ, ux: -1, uy: 0 } },
  ];
}

/** A guest arrives at the south-east entry, drives up the VIP entrance lane (east side), west along the
 *  back and south down the west side, then turns right into VIP bay i, nose to the perimeter wall
 *  (pointing west, like the parked VIP cars). */
export function vipPath(i) {
  const mid = (b) => (b[0] + b[1]) / 2;
  const xe = mid(VIP_E.out), yn = mid(VIP_N.out), xw = mid(VIP_W.out);
  const by = VIPZ.y0 + i * 12.5 + 6.25, bx = VIPZ.x0 + 12.5;
  const gy = VIP_GATE.y;
  return [
    leg([xe, OFF], [['L', xe, gy + 56]], { clip: 'twr-clip', speed: CAR_SPEED, z: vipZ }),
    ...gateStop(xe, gy + 56, gy + 16, gy - 24),
    leg([xe, gy - 24], [['L', xe, yn + 24], ['Q', xe, yn, xe - 24, yn], ['L', xw + 14, yn], ['Q', xw, yn, xw, yn + 14],
      ['L', xw, by - 9], ['Q', xw, by, xw - 9, by]], { speed: CAR_SPEED, z: vipZ }),
    leg([xw - 9, by], [['L', bx, by]], { speed: 16, ease: true, z: vipZ }),
    // parked: the camera holds while the building and the car's cabin turn see-through
    { wait: 1.2, len: 0, hold: true, xray: 'xray-bld', at: { x: bx, y: by, z: VZ, ux: -1, uy: 0 } },
  ];
}
/** Brake to a stop at a barrier (y from → stop), wait for the arm, pull away (→ go). Same x. */
function gateStop(x, from, stop, go) {
  const dir = Math.sign(stop - from);
  return [
    leg([x, from], [['L', x, stop]], { speed: CAR_SPEED / 2, ease: 'out', z: vipZ }),
    { wait: 0.9, len: 0, gate: true, at: { x, y: stop, z: vipZ(x, stop), ux: 0, uy: dir } },
    leg([x, stop], [['L', x, go]], { speed: CAR_SPEED / 2, ease: 'in', z: vipZ }),
  ];
}

/** A parked VIP car leaves: reverses out of bay i (swinging to face south), runs down to the turning
 *  area, U-turns into the exit lane, goes north, east along the back, south down the VIP OUT lane,
 *  stops at the exit barrier, then down the ramp onto the loop and out at the south-west exit. */
export function vipLeavePath(i, facingBuilding = false) {
  const mid = (b) => (b[0] + b[1]) / 2;
  const xw = mid(VIP_W.out), xi = mid(VIP_W.in), yi = mid(VIP_N.in), xo = mid(VIP_E.in);
  const by = VIPZ.y0 + i * 12.5 + 6.25, bx = VIPZ.x0 + 12.5, gy = VIP_GATE.y;
  return [
    // nosed in (facing the wall): reverse out, swinging to face south; backed in (facing the building):
    // simply drive out forwards, turning right into the lane
    facingBuilding
      ? cubicLeg([bx, by], [bx + 13, by], [xw, by + 1], [xw, by + 12], { speed: 16, ease: true, z: vipZ })
      : cubicLeg([bx, by], [bx + 11, by], [xw, by + 2], [xw, by - 12], { reverse: true, speed: 16, ease: true, z: vipZ }),
    leg([xw, facingBuilding ? by + 12 : by - 12], [['L', xw, TURN_Y + 4], ['Q', xw, TURN_Y + 16, (xw + xi) / 2, TURN_Y + 16], ['Q', xi, TURN_Y + 16, xi, TURN_Y + 4],
      ['L', xi, yi + 14], ['Q', xi, yi, xi + 14, yi], ['L', xo - 14, yi], ['Q', xo, yi, xo, yi + 14], ['L', xo, gy - 56]], { speed: CAR_SPEED, z: vipZ }),
    ...gateStop(xo, gy - 56, gy - 16, gy + 24),
    leg([xo, gy + 24], [['L', xo, YARD.road[0] - 2], ['Q', xo, ROAD_Y, xo - 9, ROAD_Y], ['L', EXIT_X + 9, ROAD_Y],
      ['Q', EXIT_X, ROAD_Y, EXIT_X, YARD.road[1]], ['L', EXIT_X, OFF]], { speed: CAR_SPEED, clip: 'twr-clip', z: vipZ }),
  ];
}

const VIP_FREE = [9, 7, 4, 2];   // empty VIP bays, filled in this order
const VIP_GUESTS = [['p911', 'silver'], ['ferrari', 'red'], ['cybertruck', 'steel'], ['taycan', 'black']];

/** Bird's-eye site plan for the mini-map (world plan units, north up): plate, roads, bays, ramps,
 *  the building footprint and the public restroom. Built once. */
const MINIMAP = (() => {
  const r = (x, y, w, h, cls, rx = 0) => `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/>`;
  const [r0, r1] = YARD.road, [b0, b1] = YARD.bays;
  let s = r(PLATE.x0, PLATE.y0, PLATE.x1 - PLATE.x0, PLATE.y1 - PLATE.y0, 'mm-plate', PLATE_R);
  s += r(EXIT[0], r0, PW - 7 - EXIT[0], r1 - r0, 'mm-road');
  s += r(ENTRY[0], r1, ENTRY[1] - ENTRY[0], PLATE.y1 - r1, 'mm-road') + r(EXIT[0], r1, EXIT[1] - EXIT[0], PLATE.y1 - r1, 'mm-road');
  s += r(VIP_E.in[0], VIP_N.out[0], VIP_E.out[1] - VIP_E.in[0], r0 - VIP_N.out[0], 'mm-road', 4);
  s += r(VIP_W.out[0], VIP_N.out[0], VIP_E.out[1] - VIP_W.out[0], VIP_N.in[1] - VIP_N.out[0], 'mm-road', 4);
  s += r(VIP_W.out[0], VIP_N.out[0], VIP_W.in[1] - VIP_W.out[0], TURN_Y + 22 - VIP_N.out[0], 'mm-road', 4);
  s += r(VIPZ.x0, VIPZ.y0, VIPZ.x1 - VIPZ.x0, VIPZ.n * 12.5, 'mm-bays');
  s += `<path class="mm-bays" d="M${STALLS.x0} ${b0}H${STALLS.x0 + STALLS.pitch * 10}L${STALLS.x0 + STALLS.pitch * 10 - STALLS.run} ${b1}H${STALLS.x0 - STALLS.run}Z"/>`;
  for (const R of RAMPS) s += r(R.x0, R.y0, R.x1 - R.x0, R.y1 - R.y0, 'mm-ramp');
  s += r(PUBLIC_WC.x, PUBLIC_WC.y, PUBLIC_WC.w, PUBLIC_WC.d, 'mm-bld');
  s += `<path class="mm-bld" d="M${FOOTPRINT.map(([x, y]) => `${wx(x)} ${wy(y)}`).join('L')}Z"/>`;
  return { svg: s, viewBox: `${PLATE.x0 - 4} ${PLATE.y0 - 4} ${PLATE.x1 - PLATE.x0 + 8} ${PLATE.y1 - PLATE.y0 + 8}` };
})();

// ---- occlusion: the building's on-screen silhouette (convex hull of its footprint at the ground and
// at the parapet top). An actor drawn behind the building whose point lies inside it is hidden by it.
const SILHOUETTE = (() => {
  const pts = FOOTPRINT.flatMap(([x, y]) => [K.P(wx(x), wy(y), PZ), K.P(wx(x), wy(y), ZTOP + GUARD.h)]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of pts) { while (lo.length > 1 && cr(lo.at(-2), lo.at(-1), q) <= 0) lo.pop(); lo.push(q); }
  for (const q of pts.slice().reverse()) { while (up.length > 1 && cr(up.at(-2), up.at(-1), q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
})();
const behindBuilding = ([x, y]) => SILHOUETTE.every((a, i) => {
  const b = SILHOUETTE[(i + 1) % SILHOUETTE.length];
  return (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) >= 0;
});

// ---- route camera: views as viewBox rectangles with the full view's aspect, kept inside it ----
const VIEW_ALL = (() => { const [x, y, w, h] = K.viewBox.split(' ').map(Number); return { x, y, w, h }; })();
const INTRO = 0.8;   // s the actor waits at its start while the camera zooms in on the route
const ZMIN = 0.3;    // the closest view (wheel, zoom rail, routes): this share of the whole site's width
const clampView = (cx, cy, f) => {
  const w = VIEW_ALL.w * f, h = VIEW_ALL.h * f;
  return { w, h, x: Math.min(VIEW_ALL.x + VIEW_ALL.w - w, Math.max(VIEW_ALL.x, cx - w / 2)), y: Math.min(VIEW_ALL.y + VIEW_ALL.h - h, Math.max(VIEW_ALL.y, cy - h / 2)) };
};
/** Still overview of a route: its on-site points (ground and 3 m up), padded, at the view's aspect. */
/** View framing the given screen points (padded, at the full view's aspect, kept inside it). */
function fitScreen(pts, pad = 1.12, minF = 0.3) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const f = Math.min(1, Math.max(minF, pad * Math.max((x1 - x0) / VIEW_ALL.w, (y1 - y0) / VIEW_ALL.h)));
  return clampView((x0 + x1) / 2, (y0 + y1) / 2, f);
}
function fitRoute(path, extra = []) {
  const xs = extra.map((p) => p[0]), ys = extra.map((p) => p[1]);
  for (const l of path) for (const [x, y] of l.pts || []) {
    if (x < PLATE.x0 || x > PLATE.x1 || y < PLATE.y0 || y > PLATE.y1) continue;
    for (const zz of [PZ, PZ + 15]) { const [sx, sy] = K.P(x, y, zz); xs.push(sx); ys.push(sy); }
  }
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const f = Math.min(1, Math.max(0.3, 1.2 * Math.max((x1 - x0) / VIEW_ALL.w, (y1 - y0) / VIEW_ALL.h)));
  return clampView((x0 + x1) / 2, (y0 + y1) / 2, f);
}

/** "Go to KOSIGN": from just outside the entrance, in through the lobby (the building frosts so the
 *  visitor stays visible), across to the right-hand (east) lift core, then the lift rides up to the
 *  floor. The floor view takes over from there (route to KOSIGN's entrance). */
/**
 * The east lift pair, reused from the floor plans: two of the plans' elevators exactly as drawn there
 * (90 × 78 plan units each, cut at the plans' height, sill, doors and ▲▼ indicator in front) side by side,
 * scaled evenly to the building (plan unit = 2 cm, tower unit = 20 cm) and centred in the east core with
 * the sills at its front. The visitor's (west) car rides.
 */
const ELEV = (() => {
  const L = LIFTS[1], S = 0.1, W = 90 * S, x0 = wx(L.x0) + ((L.x1 - L.x0) * M - 2 * W) / 2;
  return { S, W, D: 78 * S, y0: wy(L.y1) - 90 * S, cars: [x0, x0 + W] };
})();
/**
 * The lift core sits deep in the building, so in iso its cars at G read a storey up, level with the floor
 * above the lobby, and every stop a floor too high. The lift (its cars and their shadow) is drawn one
 * storey lower to line up with the façade; the destination storey's outline stays at its true height.
 */
const LIFT_DROP = FH, LZ0 = PZ - LIFT_DROP;
/** One plan elevator at (x, y, z) in tower units: its parts scaled evenly, door leaves `open` 0…1. */
function towerElevator(x, y, z, open) {
  const s = ELEV.S;
  const parts = elevatorParts({ open }).map((p) => ({
    ...p, x: p.x * s, y: p.y * s, z: p.z * s, w: p.w * s, d: p.d * s, h: p.h * s,
    deco: p.deco && Object.fromEntries(Object.entries(p.deco).map(([f, fn]) =>
      [f, () => `<g transform="scale(${s})">${fn(f[1] === 'y' ? p.w : p.d, p.h)}</g>`])),
    top: p.top && ((w, d, rot) => `<g transform="scale(${s})">${p.top(p.w, p.d, rot)}</g>`),
  }));
  return renderParts(K, parts, { W0: 90 * s, D0: 90 * s, rot: 0, ox: x, oy: y, z0: z });
}

export function kosignPath(floor) {
  // in through the lobby, to the doors of the west car of the east lift pair (the one that rides up)
  const L = LIFTS[1], lx = ELEV.cars[0] + ELEV.W / 2, front = wy(L.y1) + 4;
  const inside = { xray: 'xray-bld', inside: true, speed: WALK_SPEED };
  return [
    leg([CX, YB + 16], [['L', CX, YB + 2]], { speed: WALK_SPEED, z: entryZ }),
    // walking in, the visitor steps down with the lowered lift drawing (LIFT_DROP), from the lobby door to
    // the car, so they meet its floor rather than float above it
    leg([CX, YB + 2], [['L', CX, front], ['L', lx, front], ['L', lx, ELEV.y0 + ELEV.D / 2]],
      { ...inside, z: (x, y) => PZ - LIFT_DROP * Math.min(1, Math.max(0, (YB + 2 - y) / (YB + 2 - (ELEV.y0 + ELEV.D / 2)))) }),
  ];
}
/** Arriving: out of the west car at the floor (on the lowered lift drawing, LZ0), to just in front of it. */
export function kosignExitPath(floor) {
  const L = LIFTS[1], lx = ELEV.cars[0] + ELEV.W / 2, zf = LZ0 + floor * FH;
  return [leg([lx, ELEV.y0 + ELEV.D / 2], [['L', lx, wy(L.y1) + 3]],
    { xray: 'xray-bld', inside: true, speed: WALK_SPEED, z: () => zf })];
}
export const LIFT_RISE = 2.4;   // s the car takes from G to the floor
/** The east lift for "Go to KOSIGN": waits lit at the ground floor while the visitor walks over (wait
 *  seconds), rises to the floor, then opens there and holds while the visitor steps out (exit seconds);
 *  after that the floor view takes over, where the visitor steps out of the plan's lift once more. */
export function kosignLiftPath(floor, wait, exit) {
  const L = LIFTS[1], at = { x: wx((L.x0 + L.x1) / 2), y: wy((L.y0 + L.y1) / 2), z: PZ, ux: 0, uy: -1 };
  return [
    { wait, len: 0, liftIdle: true, dest: floor, xray: 'xray-bld', at },
    { wait: LIFT_RISE, len: 0, lift: floor, dest: floor, xray: 'xray-bld', at },
    { wait: exit, len: 0, liftAt: floor, dest: floor, xray: 'xray-bld', at },
  ];
}

// small icons for the scene buttons (16 × 16, stroked in the current colour)
const ICON = {
  parkIn: icon(<><path d="M3 13V3h3.2a2.6 2.6 0 0 1 0 5.2H3" /><path d="M12 4v8M9.5 9.5 12 12l2.5-2.5" /></>),     // P ↓
  parkOut: icon(<><path d="M3 13V3h3.2a2.6 2.6 0 0 1 0 5.2H3" /><path d="M12 12V4M9.5 6.5 12 4l2.5 2.5" /></>),   // P ↑
  vip: icon(<path d="M8 2.2l1.7 3.6 3.9.5-2.9 2.7.8 3.9L8 11l-3.5 1.9.8-3.9L2.4 6.3l3.9-.5z" />),              // star
  leave: icon(<><path d="M9.5 3H13v10H9.5" /><path d="M3 8h7M7 5l3 3-3 3" /></>),                              // exit
  gate: icon(<><path d="M2 13V4M14 13V4M2 6h12M2 11h12" /><path d="M5 6v5M8 6v5M11 6v5" /></>), // sliding gate
  atm: icon(<><rect x="2.5" y="2.5" width="11" height="11" rx="1.5" /><rect x="4.5" y="4.5" width="7" height="3.5" rx=".5" /><path d="M5 11h6" /></>), // cash machine
  walk: icon(<><circle cx="9" cy="2.8" r="1.3" /><path d="M8.5 5.5 7 9.5l2.5 1.5L10 14M7 9.5 5.5 13M8.5 5.5l2.5 2 1.5-.5M8.5 5.5 6 7l-.8 2" /></>), // walker
  reset: icon(<path d="M2.8 8a5.2 5.2 0 1 0 1.6-3.8M2.5 2.5v3h3" />),
};

/** Camera view for the ATM button: the ATM room and a little of the lawn round it. */
const ATM_VIEW = (() => {
  const w = 4 * 6 + 3 * 1.6 + 4, x1 = LAWN[1] - 3, x0 = x1 - w, y1 = YARD.park[1] - 1.2, y0 = y1 - 12;
  const pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].flatMap(([x, y]) => [K.P(x, y, PZ), K.P(x, y, PZ + 14)]);
  return fitScreen(pts, 2.4, 0.12);
})();

const EXIT_FLEET = [['modelY', 'white'], ['taycan', 'grey'], ['cybertruck', 'steel'], ['byd', 'blue']];

/**
 * Automatic sliding gate across a street connector (lane x0..x1) near the plate's front edge: a ground
 * track, a catch post on the closed side, the motor housing with a warning lamp on the open side, and a
 * barred panel that slides along the track to clear the lane (CSS, `.site-gate.open`) while a car is
 * at it.
 */
// both gates sit a little in from the front edge, where the straight side walls end (before the
// platform's corners start to round)
const SITE_GATE_Y = PLATE.y1 - PLATE_R;
const GATE_Y = { exit: SITE_GATE_Y, entry: SITE_GATE_Y };
function siteGate(id, x0, x1, dir = 1, leaves = 1) {
  const { box, FRONT, path } = K, y = GATE_Y[id], w = x1 - x0 + 1, h = 7, lw = w / leaves;
  const shut = dir > 0 ? x0 : x1, open = dir > 0 ? x1 : x0;   // catch post side / motor side
  const run = dir * lw;                                         // how far the gate's stack travels past its open edge
  let s = `<path class="gate-track" d="${path([[Math.min(x0, x0 + run) - 1, y, PZ], [Math.max(x1, x1 + run) + 1, y, PZ]])}"/>`;
  s += box(shut - dir * 1 - 0.6, y - 0.6, PZ, 1.2, 1.2, h + 1, 0, 'struct');            // catch post
  const bars = [...Array(Math.floor(lw / 1.6))].map((_, i) => `<line class="gate-bars" x1="${0.8 + i * 1.6}" y1="0.6" x2="${0.8 + i * 1.6}" y2="${h - 0.6}"/>`).join('');
  // leaves (one, or several telescoping): leaf k (counted from the open side) slides (k + 1) leaf widths,
  // so when open they all stack just past the open edge
  s += `<g class="site-gate" data-gate="${id}" transform="${FRONT(x0 - 0.5, y, PZ + h + 0.4)}">` +
    [...Array(leaves)].map((_, k) => {
      const at = dir > 0 ? w - (k + 1) * lw : k * lw;           // leaf k's offset from x0 (closed)
      return `<g class="gate-slide" style="--slide:${dir * (k + 1) * lw}px"><g transform="translate(${at} 0)">` +
        `<rect class="gate-panel" width="${lw}" height="${h}" rx=".3"/>${bars}<rect class="gate-rail" width="${lw}" height=".7"/><rect class="gate-rail" y="${h - 0.7}" width="${lw}" height=".7"/></g></g>`;
    }).reverse().join('') + `</g>`;
  // motor housing on the open side, its lamp flashing while the gate moves / stands open
  const mx = dir > 0 ? open + 0.6 : open - 3;
  s += box(mx, y + 0.2, PZ, 2.4, 1.6, 3, 0, 'struct');
  const [lx, ly] = K.P(mx + 1.2, y + 1, PZ + 3.6);
  return s + `<circle class="gate-beacon" data-gate="${id}" cx="${lx.toFixed(2)}" cy="${ly.toFixed(2)}" r=".7"/>`;
}

/** The front lawn as a raised bed: a low concrete border (the walls' finish) wrapping it, grass inset on top. */
const LAWN_BED_H = 1.4;   // the lawn's raised border height
// The front garden ends at a wall (GARDEN_WALL, as wide as the garden): the raised lawn lies behind it,
// the ATM room stands on the paving in front of it.
const ATM_DEPTH = 12;
const GARDEN_WALL = { y1: YARD.park[1] - 1.2 - ATM_DEPTH, t: 1.6, h: 10 };   // y1: its front face
const GARDEN_Y1 = GARDEN_WALL.y1 - GARDEN_WALL.t;                           // the lawn's front edge
function gardenWall() {
  const { box, path } = K, g = GARDEN_WALL, x0 = LAWN[0] - 1.2, x1 = LAWN[1] + 1.2, y0 = g.y1 - g.t;
  return `<g class="ao" filter="url(#ao)"><path d="${path([[x0 - 1, y0 - 1, PZ], [x1 + 1, y0 - 1, PZ], [x1 + 1, g.y1 + 1, PZ], [x0 - 1, g.y1 + 1, PZ]])}Z"/></g>` +
    box(x0, y0, PZ, x1 - x0, g.t, g.h, 0, 'struct') +
    box(x0 - 0.3, y0 - 0.3, PZ + g.h, x1 - x0 + 0.6, g.t + 0.6, 0.6, 0, 'struct cap');   // coping
}
/**
 * Decorative reflecting pool along the front of the garden wall, from near the west end to the ATM room:
 * a low white concrete rim, the water surface inset in it, and a few faint ripples drifting across (CSS).
 */
function reflectingPool() {
  const { box, TOP } = K, rim = 1, h = 1.2;
  // centred in the strip between the west end and the ATM room, a little over half its length
  const a0 = LAWN[0] + 8, a1 = LAWN[1] - 3 - (4 * 6 + 3 * 1.6 + 4) - 4, len = 0.55 * (a1 - a0);
  const x0 = (a0 + a1 - len) / 2, x1 = x0 + len;
  const y0 = GARDEN_WALL.y1 + 1, y1 = YARD.park[1] - 2.2, w = x1 - x0, d = y1 - y0;
  let s = box(x0, y0, PZ, w, d, h, 1.2, 'struct');                                    // rim (rounded)
  // wavy ripple lines (gentle quadratic waves, 4 units long, alternating up and down)
  const wave = (yc) => {
    let p = `M${rim + 2} ${yc}`;
    for (let x = rim + 2, k = 0; x + 4 <= w - rim - 2; x += 4, k++) p += `Q${x + 2} ${yc + (k % 2 ? 0.7 : -0.7)} ${x + 4} ${yc}`;
    return p;
  };
  const ripples = [0.3, 0.55, 0.78].map((f, i) => `<path class="pool-ripple" style="animation-delay:-${(i * 21 * TICK).toFixed(2)}s" d="${wave(rim + (d - 2 * rim) * f)}"/>`).join('');
  return s + `<g transform="${TOP(x0, y0, PZ + h - 0.25)}"><rect class="pool-water" x="${rim}" y="${rim}" width="${w - 2 * rim}" height="${d - 2 * rim}" rx=".8"/>${ripples}</g>`;
}

function lawnBed() {
  const [k0] = YARD.park, k1 = GARDEN_Y1, t = 1.2, h = LAWN_BED_H;
  return K.box(LAWN[0] - t, k0 - t, PZ, LAWN[1] - LAWN[0] + 2 * t, k1 - k0 + 2 * t, h, 5, 'struct') +
    `<g transform="${K.TOP(0, 0, PZ + h + 0.01)}"><rect class="yard-lawn" x="${LAWN[0]}" y="${k0}" width="${LAWN[1] - LAWN[0]}" height="${k1 - k0}" rx="4"/></g>`;
}

/**
 * ATM room at the east end of the front lawn, in front of the right-hand trees: a white base slab, white
 * corner posts and roof slab (with an "ATM" fascia sign), frosted-glass walls, and inside four cash
 * machines side by side facing the yard. They are seen through the frost (softly blurred); their
 * screens pulse in brightness (CSS, forever, slightly out of step).
 */
function atmKiosk() {
  const { box, FRONT, SIDE } = K;
  const N = 4, mw = 6, gap = 1.6, w = N * mw + (N - 1) * gap + 4;   // four machines and their spacing
  const x1 = LAWN[1] - 3, x0 = x1 - w, y1 = YARD.park[1] - 1.2, y0 = y1 - ATM_DEPTH, d = y1 - y0;
  const z0 = PZ, z1 = z0 + 0.6, H = 11, post = 0.8;   // on the paving, its back against the garden wall
  let s = box(x0 - 0.6, y0 - 0.6, z0, w + 1.2, d + 1.2, 0.6, 0, 'struct');                // base slab
  // back posts (behind the machine)
  s += box(x0, y0, z1, post, post, H, 0, 'struct') + box(x1 - post, y0, z1, post, post, H, 0, 'struct');
  // the cash machines, side by side against the back glass, facing the yard (+y), back to front in x
  const my = y0 + 1.2, md = 3.4, mh = 8.6;
  let atm = '';
  for (let i = 0; i < N; i++) {
    const mx = x0 + 2 + i * (mw + gap);
    atm += box(mx, my, z1, mw, md, mh, 0, 'atm-body') +
      `<g transform="${FRONT(mx, my + md, z1 + mh)}">` +
      `<rect class="atm-hood" x=".3" y=".3" width="${mw - 0.6}" height="1.1" rx=".2"/>` +
      `<rect class="atm-bezel" x=".7" y="1.6" width="${mw - 1.4}" height="3.1" rx=".25"/>` +
      `<rect class="atm-screen" style="animation-delay:${(-i * 0.65).toFixed(2)}s" x="1" y="1.9" width="${mw - 2}" height="2.5" rx=".15"/>` +
      `<rect class="atm-keys" x="1.6" y="5.4" width="2" height="1.5" rx=".15"/>` +
      `<rect class="atm-slot" x="4" y="5.6" width="1.3" height=".35" rx=".1"/>` +
      `<rect class="atm-slot" x="4" y="6.5" width="1.3" height=".25" rx=".1"/></g>`;
  }
  s += `<g class="atm-inside" filter="url(#frost-soft)">${atm}</g>`;
  // the frosted glass we look through (front and east side), then the front posts and the roof
  // front glass in four bays; the entrance door is the right-hand bay
  const dx = (w * 3) / 4 + 0.8, dw = w / 4 - 1.6;
  s += `<g transform="${FRONT(x0, y1, z1 + H)}"><rect class="atm-glass" width="${w}" height="${H}"/>` +
    [1, 2, 3].map((k) => `<line class="atm-mullion" x1="${(w * k) / 4}" y1="0" x2="${(w * k) / 4}" y2="${H}"/>`).join('') +
    `<rect class="atm-door" x="${dx}" y="1" width="${dw}" height="${H - 1}"/>` +
    `<line class="entry-handle" x1="${dx + 1}" y1="${H * 0.5}" x2="${dx + 1}" y2="${H * 0.65}"/></g>`;
  s += `<g transform="${SIDE(x1, y1, z1 + H)}"><rect class="atm-glass" width="${d}" height="${H}"/></g>`;
  s += box(x0, y1 - post, z1, post, post, H, 0, 'struct') + box(x1 - post, y1 - post, z1, post, post, H, 0, 'struct');
  s += box(x0 - 0.6, y0 - 0.6, z1 + H, w + 1.2, d + 1.2, 1.4, 0, 'struct');
  s += `<g transform="${FRONT(x0 - 0.6, y1 + 0.6, z1 + H + 1.4)}"><text class="atm-sign" x="${(w + 1.2) / 2}" y="1.15" font-size="1.2" text-anchor="middle" letter-spacing=".3">ATM</text></g>`;
  return `<g class="atm-kiosk">${s}</g>`;
}

/**
 * A few fireflies just inside the two underground ramp openings (dark mode only): each a tiny warm
 * speck drifting a little about its spot and twinkling, out of step with the others. Pure CSS animation
 * on plain dots (no glow, no filter), so they cost next to nothing.
 */
/**
 * The site's ambient loops (pool ripples, fireflies, the ATM screen) step on one shared tick (s): their
 * durations and delays are whole ticks, so they change on the same frames — 12.5 updates a second while
 * idle instead of every frame (see iso.css).
 */
const TICK = 0.08;

function fireflies() {
  let seed = 11, s = '';
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (const R of RAMPS) {
    for (let i = 0; i < 7; i++) {
      // just inside the opening: over the ramp deck near its mouth, a little above the slope
      const x = R.x0 + 3 + rnd() * (R.x1 - R.x0 - 6), y = R.y1 - 4 - rnd() * 26, z = rampZ(R)(x, y) + 1.5 + rnd() * 5;
      const [px, py] = K.P(x, y, z);
      const v = (k) => `--${k}:${((rnd() - 0.5) * 6).toFixed(1)}px`;
      // drift and blink on the site's ambient tick (TICK): durations and delay in whole ticks, n steps a
      // keyframe stretch, so every firefly (and the pool, the ATM) moves on the same frames
      const drift = 2 * TICK * Math.round((5 + rnd() * 5) / (2 * TICK)), blink = 5 * TICK * Math.round((1.6 + rnd() * 2.4) / (5 * TICK));
      s += `<circle class="firefly ff-core" style="${v('dx')};${v('dy')};${v('ex')};${v('ey')};--dur:${drift.toFixed(2)}s;--nd:${Math.round(drift / (2 * TICK))};` +
        `--blink:${blink.toFixed(2)}s;--nb:${Math.round(blink / (5 * TICK))};--delay:-${(TICK * Math.floor(rnd() * 100)).toFixed(2)}s" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r=".28"/>`;
    }
  }
  return `<g class="fireflies">${s}</g>`;
}


/** Road sign: post and a round "no entry" disc (red, white bar) facing south (+y), at (x, y) on the plate. */
function noEntrySign(x, y, label, z = PZ) {
  const { box, FRONT } = K;
  return `<g class="no-entry">` + box(x - 0.35, y - 0.35, z, 0.7, 0.7, 9, 0, 'struct sign-post') +
    `<g transform="${FRONT(x - 2.2, y + 0.4, z + 13)}">` +
    `<circle class="sign-disc" cx="2.2" cy="2.2" r="2"/><rect class="sign-bar" x=".85" y="1.75" width="2.7" height=".9" rx=".2"/>` +
    `<rect class="sign-plate" x=".2" y="4.6" width="4" height="1.5" rx=".25"/>` +
    `<text class="sign-text" x="2.2" y="5.7" font-size=".95" text-anchor="middle">${label}</text></g></g>`;
}

/**
 * Asphalt: the road colour with a fine fractal-noise texture. The noise is an SVG turbulence rendered
 * once as a small seamless image (stitched tiles) and repeated by a pattern, so it costs no live filter.
 */
const ASPHALT_GRAIN = (() => {
  const noise = `<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'><filter id='n' x='0' y='0' width='100%' height='100%'>` +
    `<feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/>` +
    `<feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .55 -.12'/></filter><rect width='96' height='96' filter='url(#n)'/></svg>`;
  const img = `href="data:image/svg+xml,${encodeURIComponent(noise)}"`;
  // the same noise alone (no base colour), for a faint grain laid over the building's walls and roof
  const bld = `<pattern id="bld-noise" width="14" height="14" patternUnits="userSpaceOnUse"><image width="14" height="14" preserveAspectRatio="none" ${img}/></pattern>`;
  // interlocking pavers: 0.6 × 0.3 m bricks in running bond, fine joints (laid in the ground plane)
  const pavers = `<pattern id="paver-tiles" width="6" height="3" patternUnits="userSpaceOnUse"><rect class="paver-base" width="6" height="3"/>` +
    `<path class="paver-joint" d="M0 0H6M0 1.5H6M0 0V1.5M3 0V1.5M1.5 1.5V3M4.5 1.5V3"/></pattern>`;
  return `<defs>${bld}${pavers}<pattern id="asphalt-grain" width="12" height="12" patternUnits="userSpaceOnUse"><rect class="grain-base" width="12" height="12"/>` +
    `<image class="asphalt-noise" width="12" height="12" preserveAspectRatio="none" href="data:image/svg+xml,${encodeURIComponent(noise)}"/></pattern></defs>`;
})();

/** What a rented floor holds, per unit: who it is for, seats, teams and rooms (from the live plans). */
function floorInfo(floor, plans) {
  const ROOMS = { meeting: 1, server: 1, cafe: 1, barista: 1, massage: 1, ceo: 1 };
  return UNITS[floor].map((u) => {
    const id = planId(floor, u), items = plans[id] || [], meta = PLANS[id];
    const zones = items.filter((i) => i.type === 'zone');
    const uniq = (xs) => [...new Set(xs)];
    return {
      unit: u, title: meta.subtitle, en: meta.subtitleEn, seats: stats(items),
      teams: uniq(zones.filter((z) => z.kind === 'dept' && z.label !== '여유 좌석').map((z) => z.label)), // spare-seat areas are not teams
      rooms: uniq(zones.filter((z) => ROOMS[z.kind]).map((z) => z.label)),
    };
  });
}

/** Floating card next to the pointer for a hovered rented floor. */
function FloorTip({ floor, plans, x, y, box }) {
  const info = floorInfo(floor, plans);
  const total = info.reduce((a, u) => ({ d: a.d + u.seats.desks, s: a.s + u.seats.assigned }), { d: 0, s: 0 });
  const left = x + 340 > box.width ? x - 336 : x + 16;   // keep the card inside the stage
  // clamp vertically by the card's measured height so it never runs past the stage's bottom edge
  const card = useRef(null);
  const [h, setH] = useState(0);
  useLayoutEffect(() => { if (card.current) setH(card.current.offsetHeight); }, [floor, plans]);
  return (
    <div ref={card} className="frost floor-tip absolute z-20 w-80 max-h-[calc(100%-1rem)] overflow-hidden pointer-events-none rounded-xl p-3"
      style={{ left, top: Math.max(8, Math.min(y - 20, box.height - h - 8)) }} role="tooltip">
      {/* the invitation first, a little louder, then whose floor it is */}
      <div className="mb-0.5 text-[11px] font-semibold tracking-wide text-ink-hi">Click to hop in →</div>
      <div className="flex items-baseline justify-between">
        <span className="text-[14px] font-semibold text-ink-hi">KOSIGN Floor {floor}</span>
        <span className="text-[11px] text-ink tabular-nums">{info.length} units · {total.s}/{total.d} seats</span>
      </div>
      <ul className="mt-2 flex flex-col gap-2">
        {info.map((u) => (
          <li key={u.unit} className="border-t border-edge pt-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12px] text-ink-hi"><span className="font-semibold">Unit {u.unit}</span> · {u.title}</span>
              <span className="shrink-0 text-[11px] text-ink tabular-nums">{u.seats.desks ? `${u.seats.assigned}/${u.seats.desks}` : 'no desks'}</span>
            </div>
            <div className="text-[10.5px] text-ink">{u.en}</div>
            {u.teams.length > 0 && <div className="mt-1 text-[11px] text-ink-hi"><span className="text-ink">Teams </span>{u.teams.join(', ')}</div>}
            {u.rooms.length > 0 && <div className="text-[11px] text-ink-hi"><span className="text-ink">Rooms </span>{u.rooms.join(', ')}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}

let duskPlayed = false; // the nightfall plays once per page load on mount, then only on theme switches

export default function TowerView({ occupancy, plans, onOpen, onGuide, light, svgRef, active = true }) {
  const activeNow = useRef(active);
  activeNow.current = active;
  const [tip, setTip] = useState(null); // { floor, x, y } while a rented floor is hovered
  const [cursor, setCursor] = useState(RENTED[0]);
  const [msg, setMsg] = useState('');
  const holder = useRef(null);
  // scenes: bay cars that have driven off (hidden from the static scene) and the actors now moving
  const [away, setAway] = useState(() => new Set());
  const actors = useRef([]);
  const loop = useRef(0);
  const nextExit = useRef(0);
  const [vipArrived, setVipArrived] = useState(() => new Map());   // VIP bay → [model, paint], parked by a scene
  const [vipGone, setVipGone] = useState(() => new Set());          // VIP bays whose car has driven off
  const [b1Next, setB1Next] = useState('park');     // the B1 button's next action: 'park' or 'leave'
  const [vipNext, setVipNext] = useState('drive');  // the VIP button's next action: 'drive' or 'leave'
  const vipPending = useRef(new Set());                             // bays claimed by a car still driving there
  // the scene string does not depend on the hovered floor: hovering just moves the .cursor class
  // (rebuilding and re-parsing ~2,000 elements per hover was the main source of hover lag)
  const svg = useMemo(() => buildSvg({ occ: occupancy, cursor: null, away, vipArrived, vipGone }), [occupancy, away, vipArrived, vipGone]);
  useLayoutEffect(() => {
    const el = holder.current;
    if (!el) return;
    el.querySelectorAll('.twr .fl.cursor').forEach((g) => g.classList.remove('cursor'));
    el.querySelectorAll(`.twr .fl[data-f="${cursor}"]`).forEach((g) => g.classList.add('cursor'));
    // gates held open by the Gate button stay open when the scene is redrawn
    if (gatesHeld.current) el.querySelectorAll('.site-gate, .gate-beacon').forEach((g) => g.classList.add('open'));
  }, [svg, cursor]);

  // follow camera: while something moves, the view eases in on the newest actor and tracks it; when the
  // last one is done it eases back out to the whole site (exponential smoothing on the viewBox)
  const cam = useRef(null);
  const camSettled = useRef(false);
  // the viewBox last written on the svg (null: the full view) and the svg's size while the camera moves:
  // the move itself is a CSS transform; the viewBox is written once it settles (see svgCamera)
  const camDrawn = useRef(null), camSize = useRef([1, 1]), camAimed = useRef(null);
  const gatesHeld = useRef(false);   // the Gate button holds the site gates open
  const [map, setMap] = useState(null);   // route shown on the mini-map ({ d, len }), while something moves
  const mapFor = useRef(null);
  const mm = useRef({});
  const last = useRef(0);

  // one animation loop for every actor: each frame rebuilds the two actor layers (behind / in front of
  // the building) from the actors' poses; actors drop out when their path ends
  // Fixed route camera (no frame-by-frame tracking): for the newest actor the camera eases to its
  // start (while it waits there), then out to a still overview framing the whole route, holds there
  // while it moves, and closes in on the destination for the see-through hold at the end. A camera at
  // rest is not written at all, so frames where it does not move cost no scene repaint.
  // Each actor keeps its own DOM node: an outer <g> (in the layer it belongs to, with its clip) and an
  // inner <g> it slides with a translate. A car is drawn at the origin and only redrawn when its look
  // changes (heading to the degree, lights, see-through); otherwise a frame is one transform write. The
  // walker (a few boxes, legs swinging) is redrawn each frame.
  const NS = 'http://www.w3.org/2000/svg';
  const place = (a, layerEl, clip) => {
    if (!a.node) {
      a.node = document.createElementNS(NS, 'g');
      a.inner = document.createElementNS(NS, 'g');
      a.node.appendChild(a.inner);
    }
    if (layerEl && a.node.parentNode !== layerEl) layerEl.appendChild(a.node);
    const c = clip ? `url(#${clip})` : null;
    if (a.clip !== c) { if (c) a.node.setAttribute('clip-path', c); else a.node.removeAttribute('clip-path'); a.clip = c; }
  };
  const drop = (a) => { a.node?.remove(); a.node = null; };
  const tick = (now) => {
    const el = holder.current;
    const layer = {};
    for (const k of ['back', 'front', 'mid1', 'mid2', 'pwc', 'ramp-in', 'ramp-out', 'over']) layer[k] = el?.querySelector(`.anim-${k}`);
    let xray = '', lead = null, doorOpen = false;
    actors.current = actors.current.filter((a) => {
      const p = pose(a.path, ((now - a.t0) / 1000) * PACE);
      if (!p) { a.onArrive?.(); drop(a); return false; }
      const z = p.z ?? PZ;
      const hold = !!p.leg.hold;
      if (p.leg.xray) xray = p.leg.xray;
      const isBack = p.leg.inside || (!p.leg.front && (p.y < wy(0) || (p.x < wx(0) && p.y < YB)));
      // passing behind the building: see through it right away, so the actor never disappears
      if (isBack && !xray && behindBuilding(K.P(p.x, p.y, z + 3))) xray = 'xray-bld';
      lead = { a, p, z };                             // the newest actor leads camera and mini-map
      a.last = p;
      // behind the building (north of it, or west of it and north of its south facade): drawn before it;
      // east side, beside the VIP lanes (and the entry lane): drawn before the curb / wall in front of it
      const east = !isBack && !p.leg.front && p.x > wx(EXTENT.w) && (p.y < YARD.road[0] || p.x > ENTRY[0] - 2);
      const onRamp = a.kind === 'car' && RAMPS.find((R) => p.x >= R.x0 - 1 && p.x <= R.x1 + 1 && p.y >= R.y0 - 2 && p.y <= R.y1);
      // inside the frosted building (the KOSIGN visitor, the lift): over it, clear and unblurred
      const where = p.leg.layer || (a.kind === 'lift' || p.leg.inside ? 'over' : onRamp ? `ramp-${onRamp.dir}` : hold && p.leg.xray === 'xray-pwc' ? 'pwc' : isBack ? 'back' : !east ? 'front'
        : p.x < VIP_E.in[1] ? 'mid1' : p.x < VIP_WALL.x ? 'mid2' : 'front');
      if (p.leg.door) doorOpen = true;   // someone is going in through the public restroom's door
      place(a, layer[where], p.leg.clip && !(hold && p.leg.unclip) ? p.leg.clip : null);
      if (a.kind === 'lift') {
        // the lift car, lit: it appears only once the camera has finished zooming in, its two doors
        // sliding open; they close before it rises in the east shaft to the floor (eased)
        if (!a.shownAt && camSettled.current) a.shownAt = now;
        a.inner.removeAttribute('transform');
        if (!a.shownAt) { a.inner.innerHTML = ''; a.look = null; return true; }
        // the plans' twin elevators in the east core: the visitor's (west) car opens, closes and rises;
        // the other waits at G
        const k = p.leg.lift ? p.k : 0, e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        const ease = (t) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
        // floor n sits n storeys above G; at G the car opens for the visitor, rising it shuts and climbs,
        // arrived (liftAt) it opens at the floor
        const lz = p.leg.liftAt ? LZ0 + p.leg.liftAt * FH : LZ0 + e * (p.leg.lift || 0) * FH;
        const open = p.leg.liftAt ? ease(p.k * 4) : p.leg.lift ? 1 - ease(p.k * 5) : ease((now - a.shownAt) / 700);
        const car = (x0, z, op) => towerElevator(x0, ELEV.y0, z, op);
        const [xa, xb] = ELEV.cars, y0 = ELEV.y0, d = ELEV.D, cw = ELEV.W;
        // no shaft outline or level marks (the frosted building is enough); a contact shadow grounds the cars
        const sx0 = xa - 0.5, sx1 = xb + cw + 0.5, sy0 = y0 - 0.5, sy1 = y0 + d + 0.5;
        const shadow = `<path class="lift-ground" d="${K.path([[sx0, sy0, LZ0], [sx1, sy0, LZ0], [sx1, sy1, LZ0], [sx0, sy1, LZ0]])}Z"/>`;
        // the destination floor's name beside the car's stop at the shaft (no outline round the floor)
        const dest = p.leg.dest || 0;
        const [tx, ty] = K.P(sx1 + 2, sy1, LZ0 + dest * FH + FH * 0.45);
        const tag = dest > 0 ? `<text class="lift-dest-tag" x="${tx.toFixed(2)}" y="${ty.toFixed(2)}" font-size="4.5">${dest}F</text>` : '';
        // the rented floors (2 and 4) glow as bands round the frosted building, the destination brightest
        const bands = RENTED.map((fl) => {
          const z0 = PZ + fl * FH, z1 = z0 + FH;
          return `<g class="lift-band${fl === dest ? ' dest' : ''}">` + ORDERED.map((f) => `<path d="${K.path(f.front
            ? [[wx(f.x0), wy(f.y), z0], [wx(f.x1), wy(f.y), z0], [wx(f.x1), wy(f.y), z1], [wx(f.x0), wy(f.y), z1]]
            : [[wx(f.x), wy(f.y0), z0], [wx(f.x), wy(f.y1), z0], [wx(f.x), wy(f.y1), z1], [wx(f.x), wy(f.y0), z1]])}Z"/>`).join('') + `</g>`;
        }).join('');
        a.inner.innerHTML = bands + tag + shadow + car(xa, lz, open) + car(xb, LZ0, 0);
        a.look = null;
      } else if (a.kind === 'car') {
        const deg = Math.round((Math.atan2(p.uy, p.ux) * 180) / Math.PI);
        const look = `${deg}|${hold ? 1 : 0}`;
        if (a.look !== look) {
          const r = (deg * Math.PI) / 180;
          a.inner.innerHTML = vehicle(K, { model: a.model, paint: a.paint, cx: 0, cy: 0, ux: Math.cos(r), uy: Math.sin(r), z: 0, m: CAR_M, lights: !hold, interior: hold });
          a.look = look;
        }
        const [tx, ty] = K.D(p.x, p.y, z);
        a.inner.setAttribute('transform', `translate(${tx.toFixed(2)} ${ty.toFixed(2)})`);
      } else {
        a.inner.removeAttribute('transform');
        a.inner.innerHTML = person(K, { x: p.x, y: p.y, z, ux: p.ux, uy: p.uy, dist: p.dist, m: M });
      }
      if (pose(a.path, ((now - a.t0) / 1000) * PACE + 1 / 30) === null) a.onArrive?.();
      return true;
    });
    // the public restroom's door stands open while someone goes in through it
    el?.querySelectorAll('.pwc-door, .pwc-doorway').forEach((d) => { if (d.classList.contains('open') !== doorOpen) d.classList.toggle('open', doorOpen); });
    // mini-map: the lead actor's arrow and how much of its route is done (two attribute writes a frame)
    if (lead) {
      const { a, p } = lead;
      if (mapFor.current !== a) { mapFor.current = a; setMap(a.map); }   // shows the map (rendered next frame)
      mm.current.marker?.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${(Math.atan2(p.uy, p.ux) * 180 / Math.PI).toFixed(1)})`);
      mm.current.trail?.setAttribute('stroke-dashoffset', (a.map.len - (p.along ?? 0)).toFixed(1));
    } else if (!lead && mapFor.current) { mapFor.current = null; setMap(null); }

    // camera target: one still view framing the lead actor's whole route (one zoom in, one zoom out);
    // the full site when nothing moves
    // (nothing moving: a fixed focus, e.g. the ATM view, or the whole site)
    const t = lead ? lead.a.views.over : focusView.current || VIEW_ALL;
    const dt = Math.min(0.1, (now - (last.current || now)) / 1000);
    last.current = now;
    const c = cam.current || (cam.current = { ...VIEW_ALL });
    const k = 1 - Math.exp(-dt * (lead ? 4 : 6));   // back to the full view a little quicker
    const d = Math.abs(t.x - c.x) + Math.abs(t.y - c.y) + Math.abs(t.w - c.w);
    camSettled.current = !!lead && d < 1.5;   // the camera has (nearly) finished its move
    const svgEl = el?.querySelector('svg.twr');
    // VIP barriers: up while a car is at or passing its arm (entry: north-bound in VIP IN; exit:
    // south-bound in VIP OUT), down otherwise — CSS animates the swing
    let gateIn = false, gateOut = false;
    for (const a of actors.current) {
      const q = a.last;
      if (!q || a.kind !== 'car') continue;
      const dy = q.y - VIP_GATE.y;
      if (q.x > VIP_E.out[0] && q.x < VIP_E.out[1] && dy > -18 && dy < 38) gateIn = true;
      if (q.x > VIP_E.in[0] && q.x < VIP_E.in[1] && dy < 18 && dy > -38) gateOut = true;
    }
    // site gates: open while a car is within ~8 m of them in their lane
    const near = (lane, gy) => actors.current.some((a) => a.kind === 'car' && a.last && a.last.x > lane[0] - 2 && a.last.x < lane[1] + 2 && Math.abs(a.last.y - gy) < 40);
    // (held open by the Gate button, or opening for a car)
    const siteOpen = { exit: gatesHeld.current || near(EXIT, GATE_Y.exit), entry: gatesHeld.current || near(ENTRY, GATE_Y.entry) };
    el?.querySelectorAll('.site-gate, .gate-beacon').forEach((g) => {
      const want = siteOpen[g.dataset.gate];
      if (g.classList.contains('open') !== want) g.classList.toggle('open', want);
    });
    el?.querySelectorAll('.vip-gate').forEach((g) => {
      const want = g.classList.contains('in') ? gateIn : gateOut;
      if (g.classList.contains('open') !== want) g.classList.toggle('open', want);
    });
    // zooming out (a scene ending, Fit, Reset): the wider view is drawn first and the camera enlarges it
    // toward that view, so the whole of it is there all the way (shrinking the zoomed-in drawing instead
    // showed blank margins until the move ended)
    if (t !== camAimed.current) {
      camAimed.current = t;
      if (svgEl && t.w > c.w * 1.02 && d > 0.6) {
        setBox(svgEl, t);
        camDrawn.current = t === VIEW_ALL ? null : { ...t };
        if (!svgEl.style.transform) { const r = svgEl.parentElement.getBoundingClientRect(); camSize.current = [r.width, r.height]; }
        showVia(svgEl, camSize.current, camDrawn.current || VIEW_ALL, c);
      }
    }
    if (svgEl) {
      for (const cls of ['xray-bld', 'xray-pwc']) if (svgEl.classList.contains(cls) !== (xray === cls)) svgEl.classList.toggle(cls, xray === cls);
      if (d > 0.05) {                                // moving: ease toward the target
        c.x += (t.x - c.x) * k; c.y += (t.y - c.y) * k; c.w += (t.w - c.w) * k; c.h += (t.h - c.h) * k;
        if (d < 0.6) {                               // there: snap onto it and write the viewBox, once
          Object.assign(c, t);
          setBox(svgEl, c);
          camDrawn.current = t === VIEW_ALL ? null : { ...c };
          showVia(svgEl, null, null, null);
        } else {                                     // on the way: only the compositor moves the drawing
          if (!svgEl.style.transform) { const r = svgEl.parentElement.getBoundingClientRect(); camSize.current = [r.width, r.height]; }
          showVia(svgEl, camSize.current, camDrawn.current || VIEW_ALL, c);
        }
      }
    }
    setZoom({ frac: fracOf(c.w / VIEW_ALL.w, ZMIN, 1) });   // the zoom rail follows the camera
    const done = !lead && d <= 0.05;
    if (done && t === VIEW_ALL) { setBox(svgEl, VIEW_ALL); showVia(svgEl, null, null, null); camDrawn.current = null; cam.current = null; }
    if (done) last.current = 0;
    loop.current = done ? 0 : requestAnimationFrame(tick);
  };
  const start = (actor) => {
    const first = pose(actor.path, 0);
    // the intro wait keeps the first leg's clip, x-ray and inside-the-building layer (an actor starting inside
    // the frosted building, like the visitor stepping out of the lift, stays visible while it waits)
    const path = [{ wait: INTRO, len: 0, at: { x: first.x, y: first.y, z: first.z, ux: first.ux, uy: first.uy },
      clip: first.leg.clip, xray: first.leg.xray, inside: first.leg.inside }, ...actor.path];
    actors.current.push({ ...actor, path, t0: performance.now(), map: planPath(actor.path),
      views: { over: actor.view || fitRoute(actor.path, actor.camPts) } });
    if (!loop.current) loop.current = requestAnimationFrame(tick);
  };
  const exitTimer = useRef(0);   // "Go to KOSIGN": when the visitor steps out of the lift at the floor
  useEffect(() => () => { cancelAnimationFrame(loop.current); clearTimeout(exitTimer.current); }, []);

  const parkIn = () => {
    const k = [...PARKED.keys()].reverse().find((j) => !away.has(PARKED[j]));
    if (k === undefined) { setMsg('All the cars are already parked in B1'); return; }
    const [model, paint] = BAY_FLEET[k % BAY_FLEET.length];
    setAway((s) => new Set(s).add(PARKED[k]));
    start({ kind: 'car', model, paint, path: parkInPath(PARKED[k]) });
    setMsg(`Car P${PARKED[k] + 1} is heading down to B1`);
  };
  const leaveB1 = () => {
    const [model, paint] = EXIT_FLEET[nextExit.current++ % EXIT_FLEET.length];
    start({ kind: 'car', model, paint, path: leaveB1Path() });
    setMsg('A car is driving out of B1');
  };
  const toVip = () => {
    const taken = (b) => (VIP_PARKED.includes(b) || vipArrived.has(b)) && !vipGone.has(b);
    const bay = [...VIP_FREE, ...VIP_PARKED].find((b) => !taken(b) && !vipPending.current.has(b));
    if (bay === undefined) { setMsg('The VIP bays are full'); return; }
    vipPending.current.add(bay);
    const [model, paint] = VIP_GUESTS[VIP_FREE.indexOf(bay) % VIP_GUESTS.length];
    let done = false;
    start({ kind: 'car', model, paint, path: vipPath(bay),
      // just before the drive ends the car is handed to the static scene, so it stays parked in its bay
      onArrive: () => {
        if (done) return;
        done = true;
        vipPending.current.delete(bay);
        setVipArrived((m) => new Map(m).set(bay, [model, paint]));
        setVipGone((s) => { const n = new Set(s); n.delete(bay); return n; });
      } });
    setMsg(`A guest is heading to VIP ${bay + 1}`);
  };
  const leaveVip = () => {
    // the most recent arrival leaves first, otherwise the last of the original VIP cars
    const parkedNow = [...VIP_PARKED.filter((b) => !vipGone.has(b)), ...[...vipArrived.keys()].filter((b) => !vipGone.has(b))];
    const bay = parkedNow.at(-1);
    if (bay === undefined) { setMsg('No VIP cars are parked'); return; }
    const [model, paint] = vipArrived.get(bay) || VIP_FLEET[VIP_PARKED.indexOf(bay) % VIP_FLEET.length];
    setVipGone((s) => new Set(s).add(bay));
    start({ kind: 'car', model, paint, path: vipLeavePath(bay, VIP_REVERSED.has(bay) && !vipArrived.has(bay)) });
    setMsg(`VIP ${bay + 1} is heading out`);
  };
  const goKosign = (floor) => {
    setCursor(floor);   // the target floor is highlighted while the visitor heads there
    // camera: not close — the whole lower building, ground to above the 4th floor, and the entrance
    const pts = FOOTPRINT.flatMap(([x, y]) => [K.P(wx(x), wy(y), PZ), K.P(wx(x), wy(y), PZ + 5 * FH + 6)]).concat([K.P(CX, YB + 20, PZ)]);
    const view = fitScreen(pts);
    const walk = kosignPath(floor), exit = kosignExitPath(floor);
    let done = false;
    // the lift first (it waits lit at the ground floor during the walk), then the visitor (the newest
    // actor leads); once the visitor is in, the lift leads and rises; at the floor its doors open and the
    // visitor steps out (a new walker, started as the car arrives); then the floor view takes over, where
    // the visitor steps out of the plan's lift once more and waits in front of it (FloorOverview guide)
    start({ kind: 'lift', path: kosignLiftPath(floor, duration(walk), INTRO + duration(exit) + 0.4), view,
      onArrive: () => { if (done) return; done = true; onGuide?.(floor); } });
    start({ kind: 'person', path: walk, view });
    clearTimeout(exitTimer.current);
    exitTimer.current = setTimeout(() => start({ kind: 'person', path: exit, view }), ((INTRO + duration(walk) + LIFT_RISE) * 1000) / PACE);
    setMsg(`On the way to KOSIGN, floor ${floor}`);
  };
  // ATM button: zoom the camera to the ATM room, or back out to the whole site
  const focusView = useRef(null);
  const [atmZoom, setAtmZoom] = useState(false);
  const focusAtm = (on) => {
    focusView.current = on ? ATM_VIEW : null;
    setAtmZoom(on);
    setMsg(on ? 'ATM room · four cash machines on the front lawn' : '');
    if (!loop.current) loop.current = requestAnimationFrame(tick);
  };
  // Gate button: hold both site gates open, or let them close again (cars still open them as they pass)
  const [gatesOpen, setGatesOpen] = useState(false);
  const holdGates = (on) => {
    gatesHeld.current = on;
    setGatesOpen(on);
    holder.current?.querySelectorAll('.site-gate, .gate-beacon').forEach((g) => g.classList.toggle('open', on));
    setMsg(on ? 'site gates open' : 'site gates closed');
  };
  const toRestroom = () => {
    start({ kind: 'person', path: restroomPath() });
    setMsg('A visitor is walking to the restroom');
  };
  const resetScene = () => {
    clearTimeout(exitTimer.current);
    actors.current.forEach((a) => a.node?.remove());
    actors.current = [];
    cancelAnimationFrame(loop.current);
    loop.current = 0;
    holder.current?.querySelectorAll('.anim-back, .anim-front, .anim-mid1, .anim-mid2, .anim-pwc').forEach((g) => { g.innerHTML = ''; });
    holder.current?.querySelector('svg.twr')?.classList.remove('xray-bld', 'xray-pwc');
    mapFor.current = null;
    setMap(null);
    setAway(new Set());
    setVipArrived(new Map());
    setVipGone(new Set());
    setB1Next('park');
    setVipNext('drive');
    focusView.current = null;
    setAtmZoom(false);
    gatesHeld.current = false;
    setGatesOpen(false);
    vipPending.current.clear();
    if (cam.current) loop.current = requestAnimationFrame(tick);   // ease the camera back out
    setMsg('All cars are back in their bays');
  };

  useEffect(() => { if (active) holder.current?.focus({ preventScroll: true }); }, [active]);   // ↑ ↓ Enter work at once, also on coming back


  // wheel / zoom rail: the camera's own target (focusView), zoomed about the pointer between the whole site
  // and ZMIN of it. While a scene runs, it drives the camera.
  const zoomBy = (deltaY, at) => {
    if (actors.current.length) return;
    const c = focusView.current || VIEW_ALL, f0 = c.w / VIEW_ALL.w, raw = f0 * Math.exp(deltaY * 0.0015);
    if (deltaY < 0 && f0 <= ZMIN * 1.001) return;     // as close as it goes
    // as far out as it goes: the whole site, centred again (also after a drag moved it aside)
    if (deltaY > 0 && f0 >= 0.999) { if (focusView.current) { focusView.current = null; if (!loop.current) loop.current = requestAnimationFrame(tick); } return; }
    const f = Math.max(ZMIN, Math.min(1, raw)), k = f / f0, p = at || { x: c.x + c.w / 2, y: c.y + c.h / 2 };
    // about the pointer, wherever the view has been dragged to (no pulling it back inside the site view)
    focusView.current = f >= 0.999 && c === VIEW_ALL ? null : { x: p.x - (p.x - c.x) * k, y: p.y - (p.y - c.y) * k, w: c.w * k, h: c.h * k };
    setAtmZoom(false);
    if (!loop.current) loop.current = requestAnimationFrame(tick);
  };
  const zoomRef = useRef(zoomBy);
  zoomRef.current = zoomBy;
  useEffect(() => {
    const el = holder.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      // the svg point under the pointer, in the view shown now (the svg fills the holder)
      const r = el.getBoundingClientRect(), c = cam.current || VIEW_ALL, k = Math.min(r.width / c.w, r.height / c.h);
      zoomRef.current(e.deltaY, { x: c.x + (e.clientX - r.left - (r.width - c.w * k) / 2) / k, y: c.y + (e.clientY - r.top - (r.height - c.h * k) / 2) / k });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    // drag pans the view, at any zoom and as freely as in the floor and unit views: straight on the compositor
    // while dragging (svgCamera's showVia), the viewBox written once on release; a press without movement
    // is still a click (it picks a floor)
    let drag = null;
    const svgOf = () => el.querySelector('svg.twr');
    // show view v at once (no easing): the camera's target and position both jump there, moved on the
    // compositor; commitNow() writes it as the viewBox (pan release, zoom-rail drag release)
    const showNow = (v) => {
      cancelAnimationFrame(loop.current); loop.current = 0;
      focusView.current = v;
      cam.current = { ...v };
      const svgEl = svgOf();
      if (!svgEl.style.transform) { const rr = svgEl.parentElement.getBoundingClientRect(); camSize.current = [rr.width, rr.height]; }
      showVia(svgEl, camSize.current, camDrawn.current || VIEW_ALL, v);
      setZoom({ frac: fracOf(v.w / VIEW_ALL.w, ZMIN, 1) });
      };
    const commitNow = () => {
      const svgEl = svgOf(), v = cam.current;
      if (!v || !svgEl.style.transform) return;
      setBox(svgEl, v);
      camDrawn.current = { ...v };
      showVia(svgEl, null, null, null);
    };
    const onDown = (e) => {
      if (e.button !== 0 || actors.current.length || e.target.closest('button, figure, a, input')) return;
      // the drawing's labels are not text to select: a press on one starts a drag, never a selection (and a
      // selection left from elsewhere is dropped, so the drag cannot pick it up and stick)
      if (e.target.closest('svg.twr')) { e.preventDefault(); window.getSelection()?.removeAllRanges(); el.focus({ preventScroll: true }); }
      const r = el.getBoundingClientRect(), c = { ...(cam.current || focusView.current || VIEW_ALL) };
      drag = { sx: e.clientX, sy: e.clientY, c, k: Math.min(r.width / c.w, r.height / c.h), id: e.pointerId, moved: false };
    };
    const onMove = (e) => {
      if (!drag) return;
      if (!drag.moved) {
        if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
        drag.moved = true;
        el.setPointerCapture?.(drag.id);
        el.classList.add('panning');
      }
      const { c, k } = drag;
      showNow({ x: c.x - (e.clientX - drag.sx) / k, y: c.y - (e.clientY - drag.sy) / k, w: c.w, h: c.h });
    };
    const onUp = () => {
      if (!drag) return;
      const { moved } = drag;
      drag = null;
      el.classList.remove('panning');
      if (!moved) return;
      commitNow();
      // the click that ends a drag is not a floor pick
      const swallow = (ev) => ev.stopPropagation();
      el.addEventListener('click', swallow, true);
      setTimeout(() => el.removeEventListener('click', swallow, true), 0);
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    zoomCmd.current = (cmd) => {
      if (cmd.step) { zoomRef.current(-cmd.step * 260); return; }
      if (cmd.settle) { commitNow(); return; }
      if (cmd.fit) {            // the whole site, centred
        if (actors.current.length) return;
        focusView.current = null;
        setAtmZoom(false);
        if (!loop.current) loop.current = requestAnimationFrame(tick);
        return;
      }

      if (cmd.now) {            // dragging the rail's thumb: the zoom follows it at once, about the view's centre
        if (actors.current.length) return;
        const c = cam.current || focusView.current || VIEW_ALL, f = factorOf(cmd.frac, ZMIN, 1), w = VIEW_ALL.w * f, h = VIEW_ALL.h * f;
        showNow({ x: c.x + c.w / 2 - w / 2, y: c.y + c.h / 2 - h / 2, w, h });
        return;
      }
      const c = focusView.current || VIEW_ALL, f = factorOf(cmd.frac, ZMIN, 1);
      zoomRef.current(Math.log(f / (c.w / VIEW_ALL.w)) / 0.0015 || 0.0001);
    };
    setZoom({ frac: cam.current ? fracOf(cam.current.w / VIEW_ALL.w, ZMIN, 1) : 0 });
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp); el.removeEventListener('pointercancel', onUp);
    };
  }, []);

  // the svg reaches past the holder (svgCamera's .cam-over): its viewBox follows the holder's size
  useLayoutEffect(() => {
    const el = holder.current, svgEl = svgRef.current;
    if (!el || !svgEl) return undefined;
    const fit = () => { if (!svgEl.style.transform) setBox(svgEl, camDrawn.current || VIEW_ALL); };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // entering dark mode: the windows start dark, then the lights flicker on one by one and the floors bloom
  const mounting = useRef(true);
  useLayoutEffect(() => {
    const el = holder.current?.querySelector('svg.twr');
    const mount = mounting.current;
    mounting.current = false;
    if (!el || light || (mount && duskPlayed)) return undefined;
    duskPlayed = true;
    el.classList.remove('dusk');
    void el.getBoundingClientRect();           // restart the animation if it was already running
    el.classList.add('dusk');
    const t = setTimeout(() => el.classList.remove('dusk'), 4500);
    return () => { clearTimeout(t); el.classList.remove('dusk'); };
  }, [light]);

  const pick = (i) => {
    setCursor(i);
    if (RENTED.includes(i)) onOpen(i);
    else setMsg(i === 0 ? `G is the lobby · only floors ${RENTED.join(' and ')} are rented` : `floor ${i} is vacant · only floors ${RENTED.join(' and ')} are rented`);
  };

  const onKey = (e) => {
    if (e.target !== e.currentTarget) return;   // keys on the scene buttons stay theirs
    if (e.key === 'ArrowUp') { setCursor((c) => Math.min(TOTAL_FLOORS, c + 1)); setMsg(''); }
    else if (e.key === 'ArrowDown') { setCursor((c) => Math.max(0, c - 1)); setMsg(''); }
    else if (e.key === 'g' || e.key === 'G') setCursor(0);
    else if (e.key === 'Enter' || e.key === ' ') pick(cursor);
    else if (/^[1-9]$/.test(e.key)) setCursor(+e.key);
    else if (e.key === '0') setCursor(10);
    else return;
    e.preventDefault();
  };
  // the zoom rail drives this view only while it is on screen (kept alive by App otherwise)
  const zoomCmd = useRef(null);
  useEffect(() => {
    if (!active) return undefined;
    setZoom({ frac: cam.current ? fracOf(cam.current.w / VIEW_ALL.w, ZMIN, 1) : 0 });
    return onZoomCommand((cmd) => zoomCmd.current?.(cmd));
  }, [active]);
  // Esc, anywhere on the page: stop every scene and go back to the default view (as Reset). Left to the
  // search box, menus and panels while one of them has the key (they close themselves on Esc)
  const resetRef = useRef(null);
  resetRef.current = resetScene;
  useEffect(() => {
    const onEsc = (e) => {
      if (!activeNow.current || e.key !== 'Escape' || e.defaultPrevented || e.target.closest?.('input, textarea, select, [role="menu"], [role="dialog"]')) return;
      if (!actors.current.length && !focusView.current && !cam.current) return;   // nothing to stop
      resetRef.current();
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, []);

  const o = occupancy[cursor];
  const read = msg || (RENTED.includes(cursor)
    ? `Floor ${cursor} · ${o.assigned} of ${o.desks} seats taken`
    : cursor === 0 ? 'Ground floor · Lobby' : `Floor ${cursor} · Vacant`);

  return (
    <div ref={holder} tabIndex={0} onKeyDown={onKey} className="relative flex-1 min-h-0 overflow-hidden outline-none stage-glow">
      {map && (
        <figure className="pointer-events-none absolute left-4 bottom-14 z-10 w-40" aria-label="Mini-map: live route">
          <svg viewBox={MINIMAP.viewBox} className="block w-full h-auto" aria-hidden="true">
            <g dangerouslySetInnerHTML={{ __html: MINIMAP.svg }} />
            <path className="mm-route" d={map.d} />
            <path ref={(e) => { mm.current.trail = e; }} className="mm-trail" d={map.d} pathLength={map.len}
              strokeDasharray={`${map.len} ${map.len}`} strokeDashoffset={map.len} />
            <g ref={(e) => { mm.current.marker = e; }}>
              <circle className="mm-halo" r="9" />
              <path className="mm-car" d="M9 0L-6 -6L-3 0L-6 6Z" />
            </g>
          </svg>
        </figure>
      )}
      {/* scene controls (animate traffic and a visitor through the site): the bottom-left dock, as on the floor
          and unit pages; hovering a button shows its hint above it at once */}
      <ViewTools>
        {[
          // paired scenes share one button: after parking it offers leaving (in red), and back again
          b1Next === 'park'
            ? ['Park in B1', () => { parkIn(); setB1Next('leave'); }, 'A bay car reverses out and drives down the P\u2193IN ramp into B1', false, ICON.parkIn]
            : ['Leave B1', () => { leaveB1(); setB1Next('park'); }, 'A car comes up the P\u2191OUT ramp and drives out of the compound', true, ICON.parkOut],
          vipNext === 'drive'
            ? ['Park at VIP', () => { toVip(); setVipNext('leave'); }, 'A guest car drives in by the VIP lane, through the barrier, and parks in a free VIP bay', false, ICON.vip]
            : ['Leave VIP', () => { leaveVip(); setVipNext('drive'); }, 'A parked VIP car drives out through the VIP exit barrier and off the site', true, ICON.leave],
          ['Restroom', toRestroom, 'A visitor walks from the drop-off to the public restroom', false, ICON.walk],
          atmZoom
            ? ['Exit ATM', () => focusAtm(false), 'Back out to the whole site', true, ICON.atm]
            : ['ATM', () => focusAtm(true), 'Zoom in to the ATM room on the front lawn', false, ICON.atm],
          gatesOpen
            ? ['Close gates', () => holdGates(false), 'Slide the site entrance and exit gates shut', true, ICON.gate]
            : ['Open gates', () => holdGates(true), 'Slide the site entrance and exit gates open (and keep them open)', false, ICON.gate],
        ].map(([label, fn, tip, leave, glyph], i) => (
          <SceneButton key={label} place={i ? 'above' : 'above-start'} compact docked label={label} tip={tip} onClick={fn} red={leave}>{glyph}</SceneButton>
        ))}
        {/* a divider sets the KOSIGN floor buttons apart from the site scenes */}
        <Divider />
        {RENTED.map((f) => (
          <SceneButton key={f} place="above" compact docked label={`KOSIGN ${f}F`} tip={`Walk in, take the east lift to floor ${f} and follow the route to KOSIGN`} onClick={() => goKosign(f)}>
            <span className="text-[11px] font-semibold tabular-nums">{f}F</span>
          </SceneButton>
        ))}
        <Divider />
        <SceneButton place="above" compact docked label="Reset" tip="Every car back in its bay, every scene stopped" onClick={resetScene}>{ICON.reset}</SceneButton>
        <Divider />
        <DockMenu items={[{ label: 'Export PNG', icon: 'export', onClick: () => exportPng(svgRef.current, { filename: 'tela-office-building.png' }).catch(() => {}) }]} />
      </ViewTools>
      <svg
        ref={svgRef}
        className="twr cam-over select-none touch-none"
        viewBox={K.viewBox}
        data-view={K.viewBox}
        role="img"
        aria-label="Isometric view of the TELA Office Building, 11 storeys including the ground floor. Floors 2 and 4 are rented and glow; click one, or use arrow keys and Enter, to open its floor plan."
        onClick={(e) => { const f = e.target.closest('.fl'); if (f) pick(+f.dataset.f); }}
        onMouseOver={(e) => { const f = e.target.closest('.fl'); if (f) { setCursor(+f.dataset.f); setMsg(''); } }}
        onMouseMove={(e) => {
          const f = e.target.closest('.fl'), n = f ? +f.dataset.f : 0;
          if (!RENTED.includes(n)) { setTip(null); return; }
          const r = holder.current.getBoundingClientRect();
          setTip({ floor: n, x: e.clientX - r.left, y: e.clientY - r.top });
        }}
        onMouseLeave={() => setTip(null)}
      >
        <IsoDefs light={light} />
        <g dangerouslySetInnerHTML={{ __html: svg }} />
      </svg>
      {tip && plans && <FloorTip {...tip} plans={plans} box={holder.current.getBoundingClientRect()} />}
      {/* bottom centre, on the docks' 40px line: the floor picked, or what a scene is doing */}
      <div className="pointer-events-none absolute top-0 left-1/2 flex h-14 -translate-x-1/2 items-center whitespace-nowrap text-[12px] text-ink-hi tabular-nums" aria-live="polite">{read}</div>
    </div>
  );
}
