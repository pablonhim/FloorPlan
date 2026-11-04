// Team / Department view: one team picked, its people, desks and areas stay as they are and everything else
// steps back (the outline-only "ghost" look of the units round the one being edited, .team-off), with every
// label but the team's own left out. Works on a unit's items or on a whole floor's (items moved onto the floor).
import { footprint } from '../iso/grid.js';

/** A department's or an executive office's area (the zones a team is drawn as). */
export const isTeamZone = (z) => z.type === 'zone' && ['dept', 'ceo'].includes(z.kind || 'dept') && (z.label || '').trim() && z.label !== '여유 좌석';

/** Does item `it` stand in zone `z` (its footprint's centre inside the zone)? */
export const inZone = (z, it) => {
  const f = footprint(it), g = footprint(z), cx = it.gx + f.w / 2, cy = it.gy + f.d / 2;
  return cx >= z.gx && cx < z.gx + g.w && cy >= z.gy && cy < z.gy + g.d;
};

/**
 * The teams among `items`, by name: [{ label, en, zones, desks, people }] — its areas, the desks that are its
 * (a desk's own team, else the area it stands in) and how many of them have someone assigned. Sorted by name.
 */
export function teamList(items) {
  const zones = items.filter(isTeamZone), by = new Map();
  for (const z of zones) {
    const t = by.get(z.label) || { label: z.label, en: z.en || '', zones: [], desks: [], people: 0 };
    t.zones.push(z);
    if (!t.en && z.en) t.en = z.en;
    by.set(z.label, t);
  }
  for (const d of items.filter((i) => i.type === 'desk')) {
    const t = d.team ? by.get(d.team) : [...by.values()].find((x) => x.zones.some((z) => inZone(z, d)));
    if (!t) continue;
    t.desks.push(d);
    if ((d.name || '').trim()) t.people++;
  }
  return [...by.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * What stays in view for team `t` (from teamList): the ids of its desks, its areas and everything standing in
 * them (`ids`), and of its areas alone (`zones`).
 */
export function teamScope(items, t) {
  const ids = new Set([...t.desks, ...t.zones].map((i) => i.id));
  const zoneIds = new Set(t.zones.map((z) => z.id));
  const mine = new Set(t.desks.map((d) => d.id));
  for (const it of items) {
    if (ids.has(it.id) || it.type === 'zone') continue;
    // another team's desk standing in one of this team's areas stays back
    if (it.type === 'desk' && !mine.has(it.id) && it.team && it.team !== t.label) continue;
    if (t.zones.some((z) => inZone(z, it))) ids.add(it.id);
  }
  return { ids, zones: zoneIds };
}

/** The cell rect ({ gx, gy, w, d }) round the team's areas and desks: what the camera frames. */
export function teamBounds(t) {
  const rs = [...t.zones, ...t.desks].map((i) => { const f = footprint(i); return [i.gx, i.gy, i.gx + f.w, i.gy + f.d]; });
  if (!rs.length) return null;
  const x0 = Math.min(...rs.map((r) => r[0])), y0 = Math.min(...rs.map((r) => r[1]));
  return { gx: x0, gy: y0, w: Math.max(...rs.map((r) => r[2])) - x0, d: Math.max(...rs.map((r) => r[3])) - y0 };
}

/**
 * Marks the pieces of a drawing built as one string (the floor view's scene: items carry data-iid) for team
 * view: outside the team .team-off, the team's own areas .team-on; with no team, the marks come off.
 */
export function markTeamItems(root, scope) {
  if (!root) return;
  root.querySelectorAll('g.it[data-iid]').forEach((g) => {
    const id = g.dataset.iid;
    g.classList.toggle('team-off', !!scope && !scope.ids.has(id));
    g.classList.toggle('team-on', !!scope && scope.zones.has(id));
  });
  // pieces with no id of their own (the outer walls): always outside
  root.querySelectorAll('g.it:not([data-iid]):not(.faded)').forEach((g) => g.classList.toggle('team-off', !!scope));
}

/**
 * Marks a drawing's labels for team view: name cards (data-for) of people outside the team and zone tags
 * (data-zone) of other areas get .team-hide; with no team, the marks come off. `scope`: teamScope's result.
 */
export function markTeamLabels(svg, scope) {
  if (!svg) return;
  svg.querySelectorAll('.desk-callout[data-for]').forEach((c) => c.classList.toggle('team-hide', !!scope && !scope.ids.has(c.dataset.for)));
  svg.querySelectorAll('.tag[data-zone]').forEach((c) => c.classList.toggle('team-hide', !!scope && !scope.zones.has(c.dataset.zone)));
}
