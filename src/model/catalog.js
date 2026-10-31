// Element catalog. Each element is authored once in its local frame (footprint w × d cells,
// facing +y) as a list of boxes; the part engine handles rotation, depth order and projection.
// Sizes are in cells (1 cell = 20 cm), part coordinates in world units (1 unit = 2 cm).

import { CELL, PILLAR_H, WALL_H } from '../iso/units.js';
import { esc, slits } from '../iso/kernel.js';
import { rotPoint } from '../iso/parts.js';

/**
 * Footprint (cells, unrotated), height (world units) and metadata.
 * `sizable` lists which of w/d an item may override (walls only change length).
 */
export const SIZES = {
  desk:         { w: 7, d: 6, h: 63, label: 'Desk', note: '140 × 120 cm incl. chair', sizable: 'wd' },
  drawer:       { w: 2, d: 2, h: 30, label: 'Lead drawer', kr: '팀장의 서랍' },
  stool:        { w: 2, d: 2, h: 24, label: 'Stool' },
  serverRack:   { w: 3, d: 6, h: 56, label: 'Server rack', kr: '서버 랙', note: '60 × 120 cm, 42U (shown cut)' },
  massageChair: { w: 4, d: 7, h: 50, label: 'Massage chair', kr: '안마의자', note: '80 × 140 cm, reclined' },
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
/**
 * The ambient loops in the plans (monitor rays, server-rack LEDs and scan light) step on one shared tick
 * (s): their durations and delays are whole ticks, so they all change on the same frames and the drawing
 * is repainted ~7 times a second while idle instead of every frame (see iso.css).
 */
export const AMBIENT_TICK = 0.15;

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

/**
 * Furniture always in the building's neutral finish (`.it.cafe`), wherever it is placed: the cafe / lounge
 * pieces (stools, tables, round tables, the barista counter); desks and the other office furniture are
 * blue. Furniture standing in WeCafe or a massage room is neutral too (render.cafeIds).
 */
export const NEUTRAL_TYPES = new Set(['stool', 'table', 'roundTable', 'counter']);

/** Palette order and grouping. */
export const PALETTE = [
  { group: 'Seating', types: ['desk', 'drawer', 'stool', 'massageChair'] },
  { group: 'Tables', types: ['table', 'roundTable', 'meetingTable', 'counter'] },
  { group: 'Equipment', types: ['serverRack'] },
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

/** The team leaders by name (the name alone, or followed by a title: "최기종 부대표"), besides anyone titled 팀장. */
export const LEAD_NAMES = ['정인성', '처언', '최기종', '짠나', '돔', '라타', '쏘찌아', '분나', '뷔뚜', '쀠뚜', '싸카리', '볼레악', '라니'];
/**
 * A team leader's desk: drawn in light wood (CSS .lead). Set per desk in the inspector (item.lead: true / false);
 * otherwise by the name assigned to it — a 팀장 (or team lead) title, or one of LEAD_NAMES.
 */
export const isLead = (item) => {
  if (item.type !== 'desk') return false;
  if (typeof item.lead === 'boolean') return item.lead;
  const name = (item.name || '').trim();
  return /팀장|team lead/i.test(name) || LEAD_NAMES.some((n) => name === n || name.startsWith(`${n} `));
};
/** The lead desk's classes: `lead` and the way its grain runs on the worktop (along its length). */
export const leadCls = (item) => (isLead(item) ? ` lead ${(item.rot || 0) % 180 ? 'lead-y' : 'lead-x'}` : '');

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

/** The hover cards' languages: English, and Korean / Khmer where the catalog has the words. */
export const TIP_LANGS = ['en', 'ko', 'km'];

/** The display language's tip language (the browser's language: ko… → Korean, km… → Khmer, else English). */
export function tipLang() {
  const l = (typeof navigator !== 'undefined' && (navigator.languages?.[0] || navigator.language)) || 'en';
  return TIP_LANGS.find((t) => t !== 'en' && l.toLowerCase().startsWith(t)) || 'en';
}

/**
 * Hover card text for an item in one language: { title, sub }, or null for the ones that get no card
 * (walls, doors, glass, partitions and room areas: they are everywhere, a card on each would be noise).
 * One language only: words the catalog lacks in Korean or Khmer fall back to English.
 */
const NO_TIP = new Set(['zone', 'door', 'wall', 'glass', 'partition']);
export function tipFor(item, lang = 'en') {
  if (!item || NO_TIP.has(item.type)) return null;
  const s = SIZES[item.type], ko = lang === 'ko', km = lang === 'km';
  if (item.type === 'desk') {
    const name = (item.name || '').trim();
    return { title: name || (ko ? '빈 자리' : 'Unassigned desk'), sub: [item.label, item.team].filter(Boolean).join(' · ') || (lang === 'en' ? s.note : '') };
  }
  if (item.type === 'wc') {
    const m = item.gender === 'm';
    return { title: ko ? (m ? '남자 화장실' : '여자 화장실') : (m ? "Men's WC" : "Women's WC"), sub: '' };
  }
  if (item.type === 'elevator') return { title: ko ? '엘리베이터' : 'Elevator', sub: ko ? '전 층 운행 · G – 10' : 'to every floor · G – 10' };
  const title = (km && s.km) || (ko && s.kr) || s.label;
  return { title, sub: lang === 'en' ? s.note || '' : '' };
}

// ---------- shared bits ----------

const fitText = (text, room, max) => Math.max(3, Math.min(max, room / Math.max(1, [...text].length * 0.92)));

const seat = (x, y, live, s = 16) => [
  { x: x + s / 2 - 1.5, y: y + s / 2 - 1.5, z: 0, w: 3, d: 3, h: 20, cls: 'furn' },
  { x, y, z: 20, w: s, d: s, h: 4, r: s / 3, cls: live ? 'seat furn live' : 'seat furn' },
];

/**
 * Modern office chair in a W × D box at (x, y), the sitter facing `facing` ('-y' toward a desk behind
 * -y, '+y', '+x', '-x'), kept minimal: a round foot, a column, a rounded seat (CSS .chair) and one backrest
 * panel with rounded ends, standing on the seat's back edge (no seams across it). Drawn in the -y frame and turned; the boxes never interpenetrate, so the part depth sort stays
 * exact.
 */
function officeChair(x, y, W, D, facing, live) {
  // W across the sitter, D front to back (in the -y frame)
  const c = W / 2, m = D / 2, f = Math.min(W, D) * 0.56, L = live ? ' live' : '';
  const parts = [
    { x: c - f / 2, y: m - f / 2, z: 0, w: f, d: f, h: 1, r: f / 2, cls: 'furn chair-base' },          // round foot
    { x: c - 0.8, y: m - 0.8, z: 1, w: 1.6, d: 1.6, h: 17, cls: 'furn chair-base' },                   // column
    { x: 1, y: 1, z: 18, w: W - 2, d: D - 3, h: 4, r: Math.min(W, D) / 4, cls: `seat furn chair${L}` }, // seat
    // the backrest: one panel, as two thin layers — the sitter's side (shell-in) and the back (shell-out) — so
    // each can be shaded on its own whichever way the chair is turned
    { x: W * 0.09, y: D - 2.6, z: 22, w: W * 0.82, d: 0.8, h: 17, r: 0.4, cls: `seat backrest furn chair shell shell-in${L}` },
    { x: W * 0.09, y: D - 1.8, z: 22, w: W * 0.82, d: 0.8, h: 17, r: 0.4, cls: `seat backrest furn chair shell shell-out${L}` },
  ];
  const turn = ({ x: px, y: py, w, d, ...p }) => (
    facing === '+y' ? { ...p, x: px, y: D - py - d, w, d }
      : facing === '+x' ? { ...p, x: D - py - d, y: px, w: d, d: w }
        : facing === '-x' ? { ...p, x: py, y: px, w: d, d: w }
          : { ...p, x: px, y: py, w, d });
  return parts.map(turn).map((p) => ({ ...p, x: p.x + x, y: p.y + y }));
}

// ---------- elements ----------

/** Teams whose desks have no side extension table. */
const NO_EXT_TEAMS = new Set(['GM']);

/**
 * Wood grain drawn as real lines on a face (a team leader's desk, CSS .lead): gently wavering hairlines
 * running along `along` ('u' the face's local x, 'v' its local y) across a w × h face, about 1.7 apart, each
 * with its own wave from `seed` — part of the drawing itself, so no shared pattern can go missing.
 */
function grain(w, h, along, seed) {
  const L = along === 'u' ? w : h, X = along === 'u' ? h : w;
  let s = '', k = seed >>> 0;
  const rnd = () => ((k = (k * 1103515245 + 12345) >>> 0) / 2 ** 32);
  for (let c = 0.9; c < X - 0.3; c += 1.5 + rnd() * 0.5) {
    const a = (rnd() - 0.5) * 0.7, b = (rnd() - 0.5) * 0.7, q = (n) => n.toFixed(2);
    const pt = (t, off) => (along === 'u' ? `${q(L * t)} ${q(c + off)}` : `${q(c + off)} ${q(L * t)}`);
    s += `<path class="grain${rnd() < 0.35 ? ' fine' : ''}" d="M${pt(0, 0)}C${pt(0.3, a)} ${pt(0.55, b)} ${pt(0.75, a * 0.4)}S${pt(1, -b * 0.5)} ${pt(1, 0)}"/>`;
  }
  return s;
}

function desk(item, W, D) {
  const live = isLive(item);
  const lead = isLead(item), seed = [...String(item.id || '')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 11);
  // a team leader's desk: grain along the worktop's length on top, horizontal on every side face
  const topGrain = (w, d, rot = 0) => (lead ? grain(w, d, rot % 180 ? 'v' : 'u', seed) : '');
  const sideGrain = (fw, h) => grain(fw, h, 'u', seed + Math.round(fw * 7 + h));
  const woodFaces = lead ? { deco: { '+y': sideGrain, '-y': sideGrain, '+x': sideGrain, '-x': sideGrain } } : {};
  const name = (item.name || '').trim();
  const top = Math.round(D * 0.58);            // worktop depth; the rest is the chair zone
  // 25 cm extension table at the x = 0 end (the employee's left); none for the teams in NO_EXT_TEAMS
  const EXT = NO_EXT_TEAMS.has((item.team || '').trim()) ? 0 : 12.5;
  // centre of the desk proper (the extension is a side table at its end, not part of the worktop): the
  // monitor and the chair line up on it
  const mid = EXT + (W - EXT) / 2;
  // desks facing each other in a pair differ by 180°, which would put their extensions at opposite ends;
  // the 180° / 270° desks are mirrored so the extensions of a facing pair line up on the same end
  const flip = (item.rot || 0) >= 180;
  const screen = (w, h) => `<rect class="glass hot monitor" x="0" y="0" width="${w}" height="${h}"/>`;  // frameless: the white glass to the edges
  // the screen's light as a ray across the worktop: a widening, fading beam from just in front of the
  // monitor to the desk's front edge, in the worktop's own frame turned to the desk's rotation (the
  // beam is symmetric, so the mirroring of 180° / 270° desks does not change it); #ray-<rot> fades it
  const ray = (rot) => {
    const pw = W - EXT, pd = top, u = pw / 2;
    const pts = [[u - 13, 12.5], [u + 13, 12.5], [u + 19, pd], [u - 19, pd]].map(([a, b]) => rotPoint(a, b, pw, pd, rot));
    // each desk's beam breathes on its own (CSS beam-breathe), phase and pace seeded from its id — on the
    // shared ambient tick (see AMBIENT_TICK): a pace of 2·n ticks, n steps up and n down, and a phase of whole
    // ticks, so every beam on the floor changes on the same frames (a few repaints a second, not 60)
    const h = [...String(item.id || '')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    const n = 11 + (h % 5);
    const style = `--n:${n};animation-duration:${(2 * n * AMBIENT_TICK).toFixed(2)}s;animation-delay:-${(((h >>> 5) % 30) * AMBIENT_TICK).toFixed(2)}s`;
    return `<path class="monitor-ray" style="${style}" fill="url(#ray-${rot})" d="M${pts.map((p) => p.map((n) => n.toFixed(2)).join(' ')).join('L')}Z"/>`;
  };
  return [
    // flush geometry: the worktop and the extension run edge to edge across the desk's footprint (so the
    // desks of a row, and back-to-back pairs, meet without a gap), and the panel legs are exactly as deep as
    // the worktop and flush with its ends — one under the extension's outer end, one under the seam (its face
    // continuing the seam line straight down), one at the far end — so nothing overhangs
    ...(EXT ? [
      { x: 0, y: 0, z: 0, w: 2, d: top, h: 36, cls: 'furn desk-leg', ...woodFaces },
      { x: 0, y: 0, z: 36, w: EXT, d: top, h: 2, cls: 'deskExt furn', ...woodFaces, top: topGrain },
    ] : []),
    { x: EXT, y: 0, z: 0, w: 2, d: top, h: 36, cls: 'furn desk-leg', ...woodFaces },                     // desk legs
    { x: W - 2, y: 0, z: 0, w: 2, d: top, h: 36, cls: 'furn desk-leg', ...woodFaces },
    {
      x: EXT, y: 0, z: 36, w: W - EXT, d: top, h: 2, cls: live ? 'deskTop furn live' : 'deskTop furn', ...woodFaces,
      top: (w, d, rot = 0) => {
        // the employee's name floats above the desk in a callout (render.renderDeskCallouts); an unassigned
        // desk keeps its small note on the worktop
        if (!name) return topGrain(w, d, rot) + ray(rot) + `<text class="label desk-name" x="${w / 2}" y="${d / 2 + 2}" font-size="5" text-anchor="middle">${esc(item.note || '—')}</text>`;
        return topGrain(w, d, rot) + ray(rot);
      },
    },
    // the monitor on its stand: a flat foot on the worktop, a neck rising at the back, and the screen
    // held up on it (the boxes never interpenetrate, so the part depth sort stays exact)
    // set a little in from the back edge, toward the sitter
    { x: mid - 5.5, y: 8.5, z: 38, w: 11, d: 6, h: 0.8, r: 1.5, cls: 'furn monitor-stand' },       // foot
    { x: mid - 1.25, y: 9.5, z: 38.8, w: 2.5, d: 1.5, h: 6.2, cls: 'furn monitor-stand' },        // neck
    {
      x: mid - 15, y: 11, z: 45, w: 30, d: 1.5, h: 18, cls: 'furn monitor-body',                 // screen, facing the chair
      deco: {
        // every desk's screen is on, assigned or not, facing its own chair; from behind (a desk turned
        // away) the monitor shows its back, with the screen's glow spilling round its edge
        '+y': screen,
        '-y': (w, h) => `<rect class="monitor-halo" x="-.5" y="-.5" width="${w + 1}" height="${h + 1}" rx="1.5"/>` +
          `<rect class="monitor-back" x="0" y="0" width="${w}" height="${h}"/>`,                       // frameless back, edge to edge
      },
    },
    ...officeChair(mid - 14, top + 3, 28, Math.min(22, D - top - 4), '-y', live),   // wide, as deep as the chair zone allows
  ].map((p) => (flip ? { ...p, x: W - p.x - p.w } : p));
}

function drawer(item) {
  // the team leader's drawer pedestal (팀장의 서랍) in the same light wood as the lead desk: the grain drawn as
  // real lines (grain) on its faces and top, under the front's seam and handle
  const seed = [...String(item?.id || 'drawer')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 5);
  const wood = (w, h) => grain(w, h, 'u', seed + Math.round(w * 3 + h));
  // two drawers: one seam across the middle, and a handle near the top
  const face = (w, h) => wood(w, h) + `<line class="drawer-line" x1="2" y1="${h / 2}" x2="${w - 2}" y2="${h / 2}"/>` + `<rect class="drawer-line" x="${w / 2 - 3}" y="3" width="6" height="1.2"/>`;
  return [{ x: 1, y: 1, z: 0, w: 18, d: 18, h: 30, cls: 'drawer furn', deco: { '+y': face, '+x': face, '-y': wood, '-x': wood }, top: (w, d) => grain(w, d, 'u', seed) }];
}

const stool = () => seat(2, 2, false);

/**
 * Server rack (60 × 120 cm, 42U), front door facing +y: a charcoal cabinet with a stack of server units
 * on the front, each with two status LEDs that blink forever (CSS `rack-led`, each at its own rate and
 * phase, seeded from the rack id so a re-render never restarts them out of step), a yellow light that
 * runs down the door forever (`rack-scan`), and vents on the side.
 */
function serverRack(item) {
  let seed = [...String(item.id || 'rack')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const front = (w, h) => {
    let s = `<rect class="rack-door" x="1.2" y="1.2" width="${w - 2.4}" height="${h - 2.4}" rx=".6"/>`;
    // a soft yellow light running down the door, over and over (CSS `rack-scan`), clipped to the door
    const cid = `rack-clip-${seed}`;
    s += `<defs><clipPath id="${cid}"><rect x="1.2" y="1.2" width="${w - 2.4}" height="${h - 2.4}" rx=".6"/></clipPath>` +
      `<linearGradient id="rack-scan-grad" x1="0" y1="0" x2="0" y2="1"><stop class="rack-scan-stop" offset="0" stop-opacity="0"/>` +
      `<stop class="rack-scan-stop" offset=".5" stop-opacity="1"/><stop class="rack-scan-stop" offset="1" stop-opacity="0"/></linearGradient></defs>` +
      `<g clip-path="url(#${cid})"><rect class="rack-scan" x="1.2" y="-10" width="${w - 2.4}" height="10" fill="url(#rack-scan-grad)" ` +
      `style="--run:${h + 10}px;animation-delay:-${(Math.floor(rnd() * 18) * AMBIENT_TICK).toFixed(2)}s"/></g>`;
    for (let y = 3; y + 3.4 <= h - 2; y += 4.6) {
      s += `<rect class="rack-unit" x="2.6" y="${y}" width="${w - 5.2}" height="3.4" rx=".3"/>`;
      for (const [k, x] of [[0, w - 7.4], [1, w - 5.4]]) {
        const tone = rnd() < 0.18 ? 'amber' : k ? 'blue' : 'green';
        s += `<rect class="rack-led ${tone}" x="${x}" y="${y + 1.2}" width="1.1" height="1" ` +
          `style="animation-duration:${((1 + Math.floor(rnd() * 4)) * 4 * AMBIENT_TICK).toFixed(2)}s;animation-delay:-${(Math.floor(rnd() * 16) * AMBIENT_TICK).toFixed(2)}s"/>`;
      }
    }
    return s;
  };
  const side = (w, h) => slits(4, h - 4, 2.4, 4, w - 4, false, 'rack-vent');
  return [{ x: 1, y: 1, z: 0, w: 28, d: 58, h: 56, cls: 'rack', deco: { '+y': front, '+x': side, '-x': side } }];
}

/**
 * Massage chair (80 × 140 cm, reclined), the sitter facing +y: two chunky armrest shells, a seat
 * cushion on the base, a reclined back with its cushion and a head hood, and the leg rest out front.
 * The boxes never interpenetrate, so the part depth sort stays exact.
 */
function massageChair() {
  return [
    { x: 1, y: 16, z: 0, w: 7, d: 36, h: 28, r: 2, cls: 'mchair furn' },     // armrests
    { x: 32, y: 16, z: 0, w: 7, d: 36, h: 28, r: 2, cls: 'mchair furn' },
    { x: 8, y: 18, z: 0, w: 24, d: 34, h: 12, cls: 'mchair furn' },           // base
    { x: 8, y: 22, z: 12, w: 24, d: 30, h: 6, r: 2, cls: 'mchair furn' },     // seat cushion
    { x: 8, y: 4, z: 8, w: 24, d: 14, h: 32, r: 3, cls: 'mchair furn' },      // back
    { x: 10, y: 18, z: 18, w: 20, d: 4, h: 22, r: 1, cls: 'mchair furn' },    // back cushion
    { x: 8, y: 2, z: 40, w: 24, d: 12, h: 10, r: 4, cls: 'mchair furn' },     // head hood
    { x: 11, y: 52, z: 0, w: 18, d: 16, h: 14, r: 2, cls: 'mchair furn' },    // leg rest
  ];
}

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
    ...[40, 80, 120, 150].flatMap((x) => officeChair(x - 1, 5, 18, 18, '+y')),
    ...officeChair(7, 41, 18, 18, '+x'),
    { x: 70, y: 46, z: 0, w: 8, d: 8, h: 36, cls: 'furn' }, { x: 122, y: 46, z: 0, w: 8, d: 8, h: 36, cls: 'furn' },
    { x: 30, y: 26, z: 36, w: 140, d: 48, h: 2, r: 20, cls: 'tableTop furn' },
    ...officeChair(175, 41, 18, 18, '-x'),
    ...[40, 80, 120, 150].flatMap((x) => officeChair(x - 1, 77, 18, 18, '-y')),
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

/**
 * Elevator parts (also reused by the tower's "Go to KOSIGN" scene, scaled to the building): `open`
 * (0 shut … 1 open) slides the two door leaves apart over the lit car inside, `label` is the indicator
 * above the doors.
 */
export function elevatorParts({ open = 0, label = '▲▼' } = {}) {
  const doors = (w, h) => {
    const dw = 40, x0 = (w - dw) / 2, top = 12, slide = open * (dw / 2) * 0.92;
    return `<rect class="face recess" x="${x0 - 2}" y="${top - 2}" width="${dw + 4}" height="${h - top + 2}"/>` +
      (open > 0 ? `<rect class="lift-gap" x="${x0}" y="${top}" width="${dw}" height="${h - top}"/>` : '') +
      `<rect class="face" x="${x0 - slide}" y="${top}" width="${dw / 2}" height="${h - top}"/>` +
      `<rect class="face" x="${x0 + dw / 2 + slide}" y="${top}" width="${dw / 2}" height="${h - top}"/>` +
      `<rect class="glass hot" x="${w / 2 - 8}" y="2.5" width="16" height="7" rx="1"/>` +
      `<text class="scr" x="${w / 2}" y="8" font-size="5" text-anchor="middle">${esc(label)}</text>`;
  };
  return [
    { x: 0, y: 0, z: 0, w: 90, d: 78, h: 56, cls: 'struct', deco: { '+y': doors },
      top: (w, d) => `<rect class="detail" x="4" y="4" width="${w - 8}" height="${d - 8}"/><line class="detail" x1="4" y1="4" x2="${w - 4}" y2="${d - 4}"/><line class="detail" x1="${w - 4}" y1="4" x2="4" y2="${d - 4}"/>` },
  ];
}

const elevator = () => elevatorParts();

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
  const LAMPS = [0.2, 0.5, 0.8];   // wall lights along the counter's wall (fractions of its length)
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
      ? { x: W - t - bw, y: t + 6, z: 0, w: bw, d: D - 2 * t - 30, h: 22, cls: 'fixture counter',
        top: (w, d) => [0.3, 0.7].map((f) => `<ellipse class="basin" cx="${w / 2}" cy="${d * f}" rx="${w * 0.28}" ry="${Math.min(d / 3, 30) * 0.32}"/>`).join('') +
          // men: the right-wall lamps' beams falling across the counter, brightest at the wall (+x side)
          (men ? LAMPS.map((f) => { const c = ((D - 2 * t) * f - 6) * (d / (D - 2 * t - 30)); return `<path class="wc-beam" fill="url(#wall-beam-x)" d="M${w} ${c - 4}L${w} ${c + 4}L0 ${c + 12}L0 ${c - 12}Z"/>`; }).join('') : '') }
      : { x: g[0] + 4, y: t, z: 0, w: W - t - 2 - (g[0] + 4), d: 16, h: 22, cls: 'fixture counter', top: basins(3) });
    return out;
  };
  // women: the men's layout built for the mirrored door, flipped back across the room, minus the urinals
  const inside = men ? fit(dg, true)
    : fit([W - dg[1], W - dg[0]], true).filter((p) => !p.urinal).map((p) => ({ ...p, x: W - p.x - p.w }));
  const parts = [
    { x: 0, y: 0, z: 0, w: W, d: D, h: 0, flat: true, cls: 'tile',
      top: (w, d) => slits(15, w - 15, 15, 2, d - 2, true, 'detail tile-line') + slits(15, d - 15, 15, 2, w - 2, false, 'detail tile-line') },
    { x: 0, y: 0, z: 0, w: W, d: t, h, cls: 'wall struct' },                                      // back wall
    // side walls, with wall lights over the basin counter (vanity lights), so the two rooms mirror each
    // other: at night each lamp throws a warm beam (`wc-beam`, dark theme only). Women: the counter is on the
    // left wall, whose inner face is toward the viewer — the beams run down that face (#wall-beam fades them
    // toward the floor). Men: it is on the right wall, whose inner face is turned away — the lamps sit along
    // its top and their beams fall across the counter top below (#wall-beam-x)
    { x: 0, y: t, z: 0, w: t, d: D - 2 * t, h, cls: 'wall struct', ...(men ? {} : { deco: { '+x': (fw, fh) => LAMPS.map((f) => {
      const u = fw * f;
      return `<path class="wc-beam" fill="url(#wall-beam)" d="M${u - 3} 4L${u + 3} 4L${u + 13} ${fh}L${u - 13} ${fh}Z"/>` +
        `<rect class="wc-lamp" x="${u - 4}" y="2.4" width="8" height="2.2" rx="1"/>`;
    }).join('') } }) },
    { x: W - t, y: t, z: 0, w: t, d: D - 2 * t, h, cls: 'wall struct', ...(men ? {
      top: (w, d) => LAMPS.map((f) => `<rect class="wc-lamp" x=".6" y="${d * f - 4}" width="${w - 1.2}" height="8" rx="1"/>`).join('') } : {}) },
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

const BUILD = { desk, drawer, stool, massageChair, serverRack, table, roundTable, meetingTable, counter, pillar, wall, glass, partition, door, zone, elevator, restroom, stair, wc, cabinet, storeroom };

/** Parts for an item in its local frame plus its local footprint size in world units. */
export function partsFor(item) {
  const s = SIZES[item.type];
  const w = s.sizable?.includes('w') && item.w ? item.w : s.w;
  const d = s.sizable?.includes('d') && item.d ? item.d : s.d;
  const W0 = w * CELL, D0 = d * CELL;
  return { W0, D0, parts: BUILD[item.type](item, W0, D0) };
}
