// Element catalog. Each element is authored once in its local frame (footprint w × d cells,
// facing +y) as a list of boxes; the part engine handles rotation, depth order and projection.
// Sizes are in cells (1 cell = 20 cm), part coordinates in world units (1 unit = 2 cm).

import { CELL, PILLAR_H, WALL_H } from '../iso/units.js';
import { esc, slits } from '../iso/kernel.js';

/**
 * Footprint (cells, unrotated), height (world units) and metadata.
 * `sizable` lists which of w/d an item may override (walls only change length).
 */
export const SIZES = {
  desk:         { w: 7, d: 6, h: 54, label: 'Desk', note: '140 × 120 cm incl. chair', sizable: 'wd' },
  drawer:       { w: 2, d: 2, h: 30, label: 'Lead drawer', kr: '팀장의 서랍' },
  stool:        { w: 2, d: 2, h: 24, label: 'Stool' },
  table:        { w: 9, d: 2, h: 38, label: 'Table', kr: '책상 익스텐션', sizable: 'wd' },
  roundTable:   { w: 6, d: 6, h: 38, label: 'Round table' },
  meetingTable: { w: 20, d: 10, h: 38, label: 'Meeting table' },
  counter:      { w: 12, d: 4, h: 66, label: 'Barista counter', kr: '바리스타' },
  pillar:       { w: 4, d: 4, h: PILLAR_H, label: 'Pillar', km: 'សសរ', kr: '기둥' },
  wall:         { w: 10, d: 1, h: WALL_H, label: 'Wall', kr: '벽', sizable: 'w' },
  glass:        { w: 10, d: 1, h: WALL_H, label: 'Glass wall', kr: '유리벽', sizable: 'w' },
  partition:    { w: 10, d: 1, h: 26, label: 'Partition', kr: '파티션', sizable: 'w' },
  door:         { w: 4, d: 4, h: 0, label: 'Door' },
  zone:         { w: 15, d: 12, h: 0, label: 'Zone / room', sizable: 'wd' },
  elevator:     { w: 9, d: 9, h: 56, label: 'Elevator' },
  restroom:     { w: 12, d: 9, h: 40, label: 'Restroom', kr: 'WC' },
  stair:        { w: 6, d: 14, h: 0.5, label: 'Stairwell', kr: '계단' },   // an open flight going down: flat
  wc:           { w: 32, d: 18, h: 40, label: 'WC', kr: '화장실', sizable: 'wd' },
  cabinet:      { w: 6, d: 3, h: 34, label: 'Storage cabinet', kr: '수납장' },
  storeroom:    { w: 18, d: 9, h: 56, label: 'Storage room', kr: '스토리지' }, // two lift shafts side by side
};

/**
 * Building core services. They belong to the shared core outside the rented units, so the office
 * view hides them; they show only in building-core (schematic) mode.
 */
export const CORE = new Set(['elevator', 'restroom', 'stair', 'wc', 'cabinet', 'storeroom']);

/** Collision layer per type (see grid.collides). */
export const LAYER = Object.fromEntries(Object.keys(SIZES).map((t) => [t,
  t === 'zone' || t === 'door' ? 'floor'
    : ['wall', 'glass', 'partition', 'pillar'].includes(t) ? 'structure' : 'furniture']));

export const ZONE_KINDS = {
  dept: 'Department',
  meeting: 'Meeting room',
  ceo: 'Executive office',
  server: 'Server room',
  cabinet: 'Cabinet room (A/C)',
  massage: 'Massage room',
  cafe: 'WeCafe',
  barista: 'Barista',
  entrance: 'Entrance',
  core: 'Building core',
  note: 'Note',
};

/** Palette order and grouping. */
export const PALETTE = [
  { group: 'Seating', types: ['desk', 'drawer', 'stool'] },
  { group: 'Tables', types: ['table', 'roundTable', 'meetingTable', 'counter'] },
  { group: 'Structure', types: ['pillar', 'wall', 'glass', 'partition', 'door'] },
  { group: 'Zones', types: ['zone'] },
  { group: 'Building core', core: true, types: ['elevator', 'storeroom', 'wc', 'cabinet', 'restroom', 'stair'] },
];

/** Defaults for a freshly placed item. */
export function defaults(type) {
  if (type === 'zone') return { kind: 'dept', label: 'New zone' };
  if (type === 'counter') return { on: true };
  return {};
}

/** Whether an item is "live" (gets the accent): what is lit in iso-glow terms. */
export function isLive(item) {
  switch (item.type) {
    case 'desk': return Boolean(item.name && item.name.trim());
    case 'counter': return Boolean(item.on);
    case 'elevator': return true;
    case 'zone': return item.kind === 'server' || (['meeting', 'cafe', 'barista'].includes(item.kind) && Boolean(item.on));
    default: return false;
  }
}

/** Short human description for the readout / title tooltip. */
export function describe(item) {
  const s = SIZES[item.type];
  if (item.type === 'desk') {
    const who = item.name ? item.name + (item.team ? ` · ${item.team}` : '') : item.note || 'unassigned';
    return `${item.label || 'desk'} · ${who}`;
  }
  if (item.type === 'zone') {
    const state = item.kind === 'meeting' ? (item.on ? ' · in use' : ' · free') : ['cafe', 'barista'].includes(item.kind) ? (item.on ? ' · open' : ' · closed') : '';
    return `${item.label || ZONE_KINDS[item.kind || 'dept']}${item.en ? ` (${item.en})` : ''}${state}`;
  }
  if (item.type === 'pillar') return `pillar · ${s.km} · ${s.kr}`;
  if (item.type === 'wc') return item.gender === 'm' ? "men's WC · 남자 화장실" : "women's WC · 여자 화장실";
  if (['wall', 'glass', 'partition', 'table'].includes(item.type)) return `${s.label.toLowerCase()} · ${(item.w || s.w) * 20} cm`;
  return s.label.toLowerCase();
}

// ---------- shared bits ----------

const glassPanel = (on) => (w, h) =>
  `<rect class="glass${on ? ' hot' : ''}" x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="1"/>`;

const fitText = (text, room, max) => Math.max(3, Math.min(max, room / Math.max(1, [...text].length * 0.92)));

const seat = (x, y, live, s = 16) => [
  { x: x + s / 2 - 1.5, y: y + s / 2 - 1.5, z: 0, w: 3, d: 3, h: 20, cls: 'furn' },
  { x, y, z: 20, w: s, d: s, h: 4, r: s / 3, cls: live ? 'seat furn live' : 'seat furn' },
];

// ---------- elements ----------

function desk(item, W, D) {
  const live = isLive(item);
  const name = (item.name || '').trim();
  const top = Math.round(D * 0.58);            // worktop depth; the rest is the chair zone
  return [
    { x: 3, y: 3, z: 0, w: 2, d: top - 6, h: 36, cls: 'furn' },                    // legs
    { x: W - 5, y: 3, z: 0, w: 2, d: top - 6, h: 36, cls: 'furn' },
    {
      x: 1, y: 1, z: 36, w: W - 2, d: top - 1, h: 2, cls: live ? 'deskTop furn live' : 'deskTop furn',
      top: (w, d) => {
        if (!name) return `<text class="label desk-name" x="${w / 2}" y="${d / 2 + 2}" font-size="5" text-anchor="middle">${esc(item.note || '—')}</text>`;
        const fs = fitText(name, w - 6, 8.5);
        return `<text class="${live ? 'scr' : 'label'} desk-name" x="${w / 2}" y="${d / 2 + fs * 0.35}" font-size="${fs.toFixed(1)}" text-anchor="middle">${esc(name)}</text>`;
      },
    },
    {
      x: W / 2 - 11, y: 5, z: 38, w: 22, d: 2, h: 14, cls: 'furn',                   // monitor, screen faces the chair
      deco: {
        '+y': (w, h) => glassPanel(live)(w, h) +
          (live ? `<rect class="scr-accent" x="4" y="4" width="${w * 0.5}" height="1.6"/><rect class="scr-accent" x="4" y="7.5" width="${w * 0.32}" height="1.6"/>` : ''),
      },
    },
    ...seat(W / 2 - 9, top + 3, live, 18),
    { x: W / 2 - 9, y: D - 5, z: 24, w: 18, d: 3, h: 20, r: 1, cls: live ? 'seat furn live' : 'seat furn' },  // backrest
  ];
}

function drawer() {
  const face = (w, h) => slits(h / 3, h - 2, h / 3, 2, w - 2, false) + `<rect class="detail" x="${w / 2 - 3}" y="3" width="6" height="1.2"/>`;
  return [{ x: 1, y: 1, z: 0, w: 18, d: 18, h: 30, cls: 'drawer furn', deco: { '+y': face, '+x': face } }];
}

const stool = () => seat(2, 2, false);

function table(item, W, D) {
  return [
    { x: 1, y: 1, z: 0, w: 2, d: 2, h: 36, cls: 'furn' }, { x: W - 3, y: 1, z: 0, w: 2, d: 2, h: 36, cls: 'furn' },
    { x: 1, y: D - 3, z: 0, w: 2, d: 2, h: 36, cls: 'furn' }, { x: W - 3, y: D - 3, z: 0, w: 2, d: 2, h: 36, cls: 'furn' },
    { x: 0, y: 0, z: 36, w: W, d: D, h: 2, cls: 'tableTop furn' },
  ];
}

function roundTable() {
  return [
    { x: 27, y: 27, z: 0, w: 6, d: 6, h: 36, cls: 'furn' },
    { x: 2, y: 2, z: 36, w: 56, d: 56, h: 2, r: 28, cls: 'tableTop furn' },
  ];
}

function meetingTable() {
  return [
    ...[40, 80, 120, 150].flatMap((x) => seat(x, 6, false)),
    ...seat(8, 42, false),
    { x: 70, y: 46, z: 0, w: 8, d: 8, h: 36 }, { x: 122, y: 46, z: 0, w: 8, d: 8, h: 36 },
    { x: 30, y: 26, z: 36, w: 140, d: 48, h: 2, r: 20, cls: 'tableTop' },
    ...seat(176, 42, false),
    ...[40, 80, 120, 150].flatMap((x) => seat(x, 78, false)),
  ];
}

function counter(item) {
  const on = Boolean(item.on);
  const sign = (w) => `<rect class="face recess" x="${w / 2 - 26}" y="4" width="52" height="11" rx="1"/>` +
    `<text class="${on ? 'scr' : 'label'}" ${on ? 'filter="url(#soft)"' : ''} x="${w / 2}" y="12.4" font-size="7.2" letter-spacing="1" text-anchor="middle">WECAFE</text>`;
  return [
    { x: 0, y: 6, z: 0, w: 120, d: 34, h: 50, cls: 'furn', deco: { '+y': sign } },
    { x: 10, y: 9, z: 50, w: 22, d: 14, h: 16, deco: { '+y': (w, h) =>
      `<circle class="led${on ? ' hot' : ''}" cx="4" cy="3" r="1.6"/><circle class="led${on ? ' hot' : ''}" cx="8.5" cy="3" r="1.6"/>` +
      `<rect class="face recess" x="5" y="6" width="9" height="${h - 6}"/>` } },
    { x: 50, y: 10, z: 50, w: 34, d: 14, h: 10, cls: on ? 'pane live' : 'pane' },
  ];
}

function pillar() {
  return [{ x: 0, y: 0, z: 0, w: 40, d: 40, h: PILLAR_H, cls: 'pillar struct',
    top: (w, d) => `<rect class="pillar-cap" x="4" y="4" width="${w - 8}" height="${d - 8}"/>` }];
}

function wall(item, W) {
  return [{ x: 0, y: 0, z: 0, w: W, d: CELL, h: WALL_H, cls: 'wall struct' }];
}

function glass(item, W) {
  const face = (w, h) => slits(30, w - 0.01, 30, 0, h, true, 'mullion') + `<line class="mullion" x1="0" y1="${h * 0.12}" x2="${w}" y2="${h * 0.12}"/>`;
  return [{ x: 0, y: 3, z: 0, w: W, d: 4, h: WALL_H, cls: 'pane', deco: { '+y': face, '-y': face } }];
}

/** Office partition (파티션): a solid low wall in the light blue furniture tint, plain faces. */
function partition(item, W) {
  return [{ x: 0, y: 3, z: 0, w: W, d: 4, h: 26, cls: 'partition furn' }]; // solid, blue-tinted, plain faces
}

function door(item) {
  // item.flip: the mirror-image leaf (hinge on the other side) — the right leaf of a double door
  return [{ x: 0, y: 0, z: 0, w: 40, d: 40, h: 0, flat: true, cls: 'bare',
    top: (w, d, rot) => `<g transform="rotate(${rot} ${w / 2} ${d / 2})${item?.flip ? ` translate(${w} 0) scale(-1 1)` : ''}">` +
      `<path class="door-arc" d="M2 2L${w - 2} 2A${w - 4} ${d - 4} 0 0 1 2 ${d - 2}Z"/>` +
      `<line class="door-leaf" x1="2" y1="2" x2="2" y2="${d - 2}"/></g>` }];
}

function zone(item, W, D) {
  const live = isLive(item);
  const kind = item.kind || 'dept';
  return [{ x: 0, y: 0, z: 0, w: W, d: D, h: 0, flat: true, cls: `zone zone-${kind}${live ? ' live' : ''}`,
    top: (w, d) => (kind === 'cabinet' || kind === 'server' ? slits(8, d - 4, 8, 3, w - 3, false, 'zone-hatch') : '') +
      `<rect class="zone-edge" x="1.5" y="1.5" width="${w - 3}" height="${d - 3}" rx="2"/>` }];
}

/**
 * A zone's name tag, drawn in face-local floor units (w × d world units). It is rendered as an
 * overlay above the furniture so room and department names are never hidden behind desks.
 */
export function zoneTag(item, w, d) {
  const kind = item.kind || 'dept';
  const label = item.label || ZONE_KINDS[kind];
  const x = item.n ? 20 : 6;
  const fs = fitText(label, w - x - 6, Math.min(16, Math.max(6, d * 0.45)));
  const badge = item.n ? `<rect class="zone-badge" x="5" y="5" width="11" height="11" rx="2" transform="rotate(45 10.5 10.5)"/><text class="zone-badge-n" x="10.5" y="13.4" font-size="8" text-anchor="middle">${item.n}</text>` : '';
  const sub = item.en && d > 50 ? `<text class="zone-sub" x="${x}" y="${fs + 15}" font-size="${Math.min(7, fs * 0.6).toFixed(1)}">${esc(item.en)}</text>` : '';
  const status = kind === 'meeting' ? (item.on ? 'IN USE' : 'FREE') : ['cafe', 'barista'].includes(kind) ? (item.on ? 'OPEN' : 'CLOSED') : kind === 'server' ? 'LIVE' : '';
  return `${badge}<text class="zone-label" x="${x}" y="${fs + 5}" font-size="${fs.toFixed(1)}">${esc(label)}</text>${sub}` +
    (status && d > 30 ? `<text class="zone-status" x="${x}" y="${fs + (sub ? 25 : 15)}" font-size="6.5">${status}</text>` : '');
}

function elevator() {
  const doors = (w, h) => {
    const dw = 40, x0 = (w - dw) / 2, top = 12;
    return `<rect class="face recess" x="${x0 - 2}" y="${top - 2}" width="${dw + 4}" height="${h - top + 2}"/>` +
      `<rect class="face" x="${x0}" y="${top}" width="${dw / 2}" height="${h - top}"/>` +
      `<rect class="face" x="${x0 + dw / 2}" y="${top}" width="${dw / 2}" height="${h - top}"/>` +
      `<rect class="glass hot" x="${w / 2 - 8}" y="2.5" width="16" height="7" rx="1"/>` +
      `<text class="scr" x="${w / 2}" y="8" font-size="5" text-anchor="middle">▲▼</text>`;
  };
  return [
    { x: 18, y: 78, z: 0, w: 54, d: 12, h: 1, cls: 'sill' },
    { x: 0, y: 0, z: 0, w: 90, d: 78, h: 56, cls: 'struct', deco: { '+y': doors },
      top: (w, d) => `<rect class="detail" x="4" y="4" width="${w - 8}" height="${d - 8}"/><line class="detail" x1="4" y1="4" x2="${w - 4}" y2="${d - 4}"/><line class="detail" x1="${w - 4}" y1="4" x2="4" y2="${d - 4}"/>` },
  ];
}

function restroom() {
  const t = 4, h = 40, W = 120, Dd = 90;
  const sign = (w) => `<rect class="face recess" x="${w / 2 - 9}" y="6" width="18" height="10" rx="1"/><text class="label" x="${w / 2}" y="13.6" font-size="7" text-anchor="middle">WC</text>`;
  return [
    { x: 0, y: 0, z: 0, w: W, d: Dd, h: 0, flat: true, cls: 'tile',
      top: (w, d) => slits(15, w - 15, 15, 2, d - 2, true, 'detail tile-line') + slits(15, d - 15, 15, 2, w - 2, false, 'detail tile-line') },
    { x: 0, y: 0, z: 0, w: W, d: t, h },
    { x: 0, y: t, z: 0, w: t, d: Dd - 2 * t, h },
    { x: 40, y: t, z: 0, w: 2, d: 34, h: 34 }, { x: 80, y: t, z: 0, w: 2, d: 34, h: 34 },
    ...[12, 52, 92].map((x) => ({ x, y: 9, z: 0, w: 16, d: 18, h: 10, r: 7 })),
    { x: t, y: 52, z: 0, w: 18, d: 32, h: 22, top: (w, d) => `<ellipse class="detail" cx="${w / 2}" cy="${d / 2}" rx="${w / 3}" ry="${d / 4}"/>` },
    { x: W - t, y: t, z: 0, w: t, d: Dd - 2 * t, h },
    { x: 0, y: Dd - t, z: 0, w: 48, d: t, h, deco: { '+y': sign } },
    { x: 78, y: Dd - t, z: 0, w: W - 78, d: t, h },
  ];
}

function stair(item, W, D) {
  // a flight going DOWN below the floor: it starts at floor level at the -y end
  // (by the landing) and descends toward +y — drawn as flat treads, each a shade darker (deeper) than
  // the one before, so the well reads as sunken without anything painting over the floor around it
  // (no side walls: just the flight, so it reads open from the corridor)
  const steps = 12, run = D / steps;
  return Array.from({ length: steps }, (_, i) => ({ x: 0, y: i * run, z: 0, w: W, d: run, h: 0, flat: true, cls: `stair-step s${i}` }));
}

/**
 * Core restroom (sizable; default 6.4 × 3.6 m), its door on the corridor (+y) wall — at the front-left
 * end, or mirrored to the front-right with item.doorSide 'r', moved item.doorOff (world units) in from
 * that end. The men's room, walking in (facing the back wall): four enclosed cubicles in a row along the
 * front wall right beside the door, three wall-mounted urinals with two divider screens on the back
 * wall opposite them, and a two-basin counter down the RIGHT side wall. The women's room is its mirror
 * image (without urinals).
 */
function wc(item, W, D) {
  const men = item.gender === 'm', mirror = item.doorSide === 'r';
  const t = 4, h = 40, off = item.doorOff || 0;
  // the door gap along the front wall, in the room's own x (west → east)
  const dg = mirror ? [W - (t + 26 + off), W - (t + 2 + off)] : [t + 2 + off, t + 26 + off];
  const sign = (w) => `<rect class="face recess" x="${w / 2 - 16}" y="6" width="32" height="12" rx="1.5"/>` +
    `<text class="label" x="${w / 2}" y="14.8" font-size="7" text-anchor="middle">${men ? 'MEN' : 'WOMEN'}</text>`;
  const basins = (n) => (w, d) => [...Array(n)].map((_, i) => `<ellipse class="basin" cx="${(w * (i + 0.5)) / n}" cy="${d / 2}" rx="${Math.min(w / n, 30) * 0.32}" ry="${d * 0.28}"/>`).join('');
  /** The men's layout for a door gap g (room x): four cubicles in a row along the front wall right beside
   *  the door (on its left as you walk in), three urinals with two dividers on the back wall opposite
   *  them, and a two-basin counter down the right side wall. */
  const fit = (g, sideBasins = false) => {
    const out = [], n = 4, cd = 70, x0 = t + 2, x1 = g[0] - 8, cw = (x1 - x0) / n, fy = D - t - cd;
    for (let i = 0; i <= n; i++) out.push({ x: x0 + i * cw - 1, y: fy, z: 0, w: 2, d: cd, h: 30, cls: 'partition struct cap' });
    for (let i = 0; i < n; i++) {
      out.push({ x: x0 + i * cw + 1, y: fy, z: 0, w: cw - 2, d: 2, h: 30, cls: 'partition struct cap' });             // cubicle front
      out.push({ x: x0 + i * cw + cw / 2 - 7, y: D - t - 6 - 18, z: 0, w: 14, d: 18, h: 10, r: 6, cls: 'fixture' });  // toilet
    }
    // the urinals: on the back wall straight across from the cubicles, facing their fronts
    const bw = 16, ux0 = t + 6, ux1 = g[0] - 12, us = (ux1 - ux0) / 3;
    for (let i = 0; i < 3; i++) out.push({ x: ux0 + i * us + us / 2 - 6, y: t, z: 8, w: 12, d: 10, h: 18, r: 4, cls: 'fixture', urinal: true });
    for (let i = 1; i < 3; i++) out.push({ x: ux0 + i * us - 1, y: t, z: 0, w: 2, d: 24, h: 30, cls: 'partition struct cap', urinal: true });
    // the basin counter: down the side wall (both rooms, mirror images of each other), or on the back wall
    // past the urinals
    out.push(sideBasins
      ? { x: W - t - bw, y: t + 6, z: 0, w: bw, d: D - 2 * t - 30, h: 22, cls: 'furn',
        top: (w, d) => [0.3, 0.7].map((f) => `<ellipse class="basin" cx="${w / 2}" cy="${d * f}" rx="${w * 0.28}" ry="${Math.min(d / 3, 30) * 0.32}"/>`).join('') }
      : { x: g[0] + 4, y: t, z: 0, w: W - t - 2 - (g[0] + 4), d: 16, h: 22, cls: 'furn', top: basins(3) });
    return out;
  };
  // women: the men's layout built for the mirrored door, flipped back across the room, minus the urinals
  const inside = men ? fit(dg, true)
    : fit([W - dg[1], W - dg[0]], true).filter((p) => !p.urinal).map((p) => ({ ...p, x: W - p.x - p.w }));
  const parts = [
    { x: 0, y: 0, z: 0, w: W, d: D, h: 0, flat: true, cls: 'tile',
      top: (w, d) => slits(15, w - 15, 15, 2, d - 2, true, 'detail tile-line') + slits(15, d - 15, 15, 2, w - 2, false, 'detail tile-line') },
    { x: 0, y: 0, z: 0, w: W, d: t, h, cls: 'wall struct' },                                      // back wall
    { x: 0, y: t, z: 0, w: t, d: D - 2 * t, h, cls: 'wall struct' },                              // side walls
    { x: W - t, y: t, z: 0, w: t, d: D - 2 * t, h, cls: 'wall struct' },
    ...inside.map(({ urinal, ...p }) => p),
  ];
  // front wall with the door gap (the sign on its longer stretch)
  const signLeft = dg[0] > W - dg[1];
  parts.push({ x: 0, y: D - t, z: 0, w: dg[0], d: t, h, cls: 'wall struct', ...(signLeft ? { deco: { '+y': sign } } : {}) });
  parts.push({ x: dg[1], y: D - t, z: 0, w: W - dg[1], d: t, h, cls: 'wall struct', ...(signLeft ? {} : { deco: { '+y': sign } }) });
  return parts;
}

/** Corridor storage cabinet (1.2 × 0.6 m): a pair of doors with handles on its front (+y) face. */
function cabinet() {
  const doors = (w, h) => `<line class="detail" x1="${w / 2}" y1="1.5" x2="${w / 2}" y2="${h - 1.5}"/>` +
    `<rect class="detail" x="1.2" y="1.2" width="${w - 2.4}" height="${h - 2.4}"/>` +
    `<line class="entry-handle" x1="${w / 2 - 2}" y1="${h * 0.42}" x2="${w / 2 - 2}" y2="${h * 0.58}"/>` +
    `<line class="entry-handle" x1="${w / 2 + 2}" y1="${h * 0.42}" x2="${w / 2 + 2}" y2="${h * 0.58}"/>`;
  return [{ x: 0.5, y: 0.5, z: 0, w: 59, d: 29, h: 34, cls: 'furn', deco: { '+y': doors } }];
}

/**
 * Enclosed storage room in the building core: the size of two lift shafts side by side, with their height
 * and depth, walled in frosted glass, a single-leaf door (item.doorSide) and a "스토리지" sign above it.
 */
function storeroom(item, W, D) {
  // door face: 'e' / 'w' = the east (+x) / west (-x) end, so the two rooms' doors face each other along
  // the corridor; otherwise centred on the corridor (+y) face ('l' / 'r' move it to an end)
  const side = item.doorSide || 'c';
  const face = side === 'e' ? '+x' : side === 'w' ? '-x' : '+y';
  const door = (w, h) => {
    const dw = 18, top = 14;
    const x0 = side === 'l' ? 4 : side === 'r' ? w - dw - 4 : (w - dw) / 2;
    const hinge = side === 'l' ? x0 + 2.5 : x0 + dw - 2.5;
    return `<rect class="face recess" x="${x0 - 1.2}" y="${top - 1.2}" width="${dw + 2.4}" height="${h - top + 1.2}"/>` +
      `<rect class="face" x="${x0}" y="${top}" width="${dw}" height="${h - top}"/>` +
      `<line class="entry-handle" x1="${hinge}" y1="${top + (h - top) * 0.45}" x2="${hinge}" y2="${top + (h - top) * 0.6}"/>` +
      `<rect class="face recess" x="${x0 + dw / 2 - 14}" y="2.5" width="28" height="9.5" rx="1"/>` +
      `<text class="label" x="${x0 + dw / 2}" y="9.6" font-size="6.6" text-anchor="middle">스토리지</text>`;
  };
  // as big as two lift shafts side by side (each 90 × 78, see elevator()), front face on the shafts' line.
  // Frosted-glass enclosure: thin glass walls and roof with white mullions; the shelving inside shows
  // faintly through it. Back and west walls first, then the shelves, then the front, east wall and roof.
  const Dd = 78, H = 56, t = 1.5;
  const mullions = (w, h) => slits(30, w - 0.01, 30, 0, h, true, 'frost-mullion') +
    `<line class="frost-mullion" x1="0" y1="${h * 0.5}" x2="${w}" y2="${h * 0.5}"/>`;
  const withDoor = (f) => (face === f ? (w, h) => mullions(w, h) + door(w, h) : mullions);
  return [
    { x: 0, y: 0, z: 0, w: W, d: t, h: H - t, cls: 'frost-glass' },                                   // back
    { x: 0, y: t, z: 0, w: t, d: Dd - 2 * t, h: H - t, cls: 'frost-glass', deco: { '-x': withDoor('-x') } }, // west
    { x: 8, y: 8, z: 0, w: W - 16, d: 16, h: 40, cls: 'furn frosted-inside' },                        // shelving, seen blurred
    { x: 8, y: Dd - 30, z: 0, w: W - 16, d: 16, h: 40, cls: 'furn frosted-inside' },
    { x: W - t, y: t, z: 0, w: t, d: Dd - 2 * t, h: H - t, cls: 'frost-glass', deco: { '+x': withDoor('+x') } }, // east
    { x: 0, y: Dd - t, z: 0, w: W, d: t, h: H - t, cls: 'frost-glass', deco: { '+y': withDoor('+y') } },  // front
    { x: 0, y: 0, z: H - t, w: W, d: Dd, h: t, cls: 'frost-glass',                                      // roof
      top: (w, d) => `<rect class="frost-mullion" x="2" y="2" width="${w - 4}" height="${d - 4}" fill="none"/>` },
  ];
}

const BUILD = { desk, drawer, stool, table, roundTable, meetingTable, counter, pillar, wall, glass, partition, door, zone, elevator, restroom, stair, wc, cabinet, storeroom };

/** Parts for an item in its local frame plus its local footprint size in world units. */
export function partsFor(item) {
  const s = SIZES[item.type];
  const w = s.sizable?.includes('w') && item.w ? item.w : s.w;
  const d = s.sizable?.includes('d') && item.d ? item.d : s.d;
  const W0 = w * CELL, D0 = d * CELL;
  return { W0, D0, parts: BUILD[item.type](item, W0, D0) };
}
