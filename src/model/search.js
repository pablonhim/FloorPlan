// Global search: one flat index over every rented floor — floors, units, employees (desks), rooms and
// storage — each entry carrying the view it opens and, where there is one, the spot the camera focuses on.
import { RENTED, UNITS, PLANS, CORE, planId } from './floors.js';
import { SIZES, ZONE_KINDS } from './catalog.js';
import { footprint } from '../iso/grid.js';

/** A focus rect: cells, in the coordinates of the view it opens (unit-local, or floor for the floor view). */
export const focusOf = (it) => ({ id: it.id, gx: it.gx, gy: it.gy, ...footprint(it) });

const where = (floor, unit) => `Floor ${floor} · Unit ${unit}`;

/**
 * entries: [{ key, kind: 'floor' | 'unit' | 'person' | 'desk' | 'room' | 'storage', title, sub, where, text,
 * view }] — `text` is everything it can be found by (lower case); `view` is an App view, with `focus`
 * ({ id?, gx, gy, w, d }) for a single item.
 */
export function buildIndex(plans) {
  const out = [];
  for (const floor of RENTED) {
    out.push({
      key: `F${floor}`, kind: 'floor', title: `Floor ${floor}`, sub: `Units ${UNITS[floor].join(' · ')}`, where: 'Building',
      text: `floor ${floor} f${floor} ${floor}f ${floor}층`, view: { kind: 'floor', floor },
    });
    for (const unit of UNITS[floor]) {
      const id = planId(floor, unit), p = PLANS[id], items = plans[id] || [];
      out.push({
        key: id, kind: 'unit', title: `Unit ${unit}`, sub: p.subtitleEn || p.subtitle, where: `Floor ${floor}`,
        text: `unit ${unit} ${id} ${floor}${unit} ${p.title || ''} ${p.subtitle || ''} ${p.subtitleEn || ''} ${(p.legend || []).join(' ')}`,
        view: { kind: 'unit', floor, unit },
      });
      // a team's English name, from the department zone of the same (Korean) name
      const teamEn = new Map(items.filter((z) => z.type === 'zone' && z.label && z.en).map((z) => [z.label, z.en]));
      for (const it of items) {
        const focus = focusOf(it);
        if (it.type === 'desk') {
          const name = (it.name || '').trim(), team = it.team || '', en = teamEn.get(team) || '';
          out.push({
            key: `${id}:${it.id}`, kind: name ? 'person' : 'desk', title: name || `Desk ${it.label || ''}`.trim(),
            sub: [it.label, team, en].filter(Boolean).join(' · ') || (it.note || 'Unassigned'), where: where(floor, unit),
            text: `${name} ${it.label || ''} ${team} ${en} ${it.note || ''} ${name ? '' : 'unassigned free desk'}`,
            view: { kind: 'unit', floor, unit, focus },
          });
        } else if (it.type === 'zone' && it.kind !== 'note' && (it.label || it.en)) {
          const storage = it.kind === 'cabinet' || /storage|스토리지/i.test(`${it.label} ${it.en}`);
          const kindName = ZONE_KINDS[it.kind] || '';
          out.push({
            key: `${id}:${it.id}`, kind: storage ? 'storage' : 'room', title: it.en || it.label,
            sub: [it.en ? it.label : '', kindName].filter(Boolean).join(' · '), where: where(floor, unit),
            text: `${it.label || ''} ${it.en || ''} ${kindName} ${it.kind || ''} ${storage ? 'storage' : 'room'}`,
            view: { kind: 'unit', floor, unit, focus },
          });
        }
      }
    }
    // the storage rooms off the common corridor (building core, on the floor view)
    CORE.storerooms.forEach((r, i) => {
      const side = r.doorSide === 'e' ? 'west' : 'east';
      out.push({
        key: `F${floor}:store-${i}`, kind: 'storage', title: 'Storage room', sub: `스토리지 · corridor, by the ${side} lifts`, where: `Floor ${floor}`,
        text: `storage room storeroom 스토리지 corridor ${side}`,
        view: { kind: 'floor', floor, focus: { gx: r.x, gy: CORE.liftY, w: SIZES.storeroom.w, d: SIZES.storeroom.d } },
      });
    });
  }
  return out;
}

const RANK = { floor: 0, unit: 1, person: 2, room: 3, storage: 3, desk: 4 };

/** The best `limit` entries for `query`: every word must match; title matches and prefixes rank first. */
export function search(index, query, limit = 30) {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits = [];
  for (const e of index) {
    const title = e.title.toLowerCase(), all = `${title} ${e.sub.toLowerCase()} ${e.text.toLowerCase()}`;
    if (!words.every((w) => all.includes(w))) continue;
    let score = RANK[e.kind] ?? 5;
    for (const w of words) score -= title.startsWith(w) ? 6 : title.includes(w) ? 3 : 0;
    hits.push([score, e]);
  }
  return hits.sort((a, b) => a[0] - b[0]).slice(0, limit).map(([, e]) => e);
}
