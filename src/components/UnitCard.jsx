// The floor's top-down view (FloorOverview, 2D): a unit clicked once is picked, and this frosted card stands
// beside its block listing what is inside — its departments (with their seats), its rooms (meeting rooms,
// cabinet room, server room, café) and its other furniture. The unit's own labels all show meanwhile
// (FloorOverview); a double-click on the unit opens it.
// It follows the block as the camera moves (placed each frame from the block's on-screen box).
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { SIZES, ZONE_KINDS } from '../model/catalog.js';
import { useT } from '../lib/i18n.js';

const ROOM_KINDS = ['meeting', 'cabinet', 'server', 'cafe', 'barista', 'massage'];   // (an executive office is listed with the departments)
// furniture worth naming (structure, doors, desks and chairs are not)
const SKIP = new Set(['wall', 'pillar', 'door', 'glass', 'glassDoor', 'partition', 'zone', 'desk', 'chair', 'curtain', 'rug']);

/** What one unit holds, from its items (floor coordinates, `unit` set). */
export function unitContents(items) {
  const desks = items.filter((it) => it.type === 'desk');
  const zones = items.filter((it) => it.type === 'zone');
  const depts = [];
  const seen = new Map();
  const add = (label, en, n) => {
    if (!label) return;
    if (seen.has(label)) return;
    const own = desks.filter((d) => d.team === label);
    const row = { label, en: en && en !== label ? en : '', n: n ?? 99, desks: own.length, taken: own.filter((d) => (d.name || '').trim()).length,
      // what lights up on the plan while its row is hovered: its areas' floors (its desks stay as they are)
      zones: zones.filter((z) => z.label === label), ids: [] };
    seen.set(label, row); depts.push(row);
  };
  for (const z of zones.filter((z) => ['dept', 'ceo'].includes(z.kind || 'dept'))) add(z.label, z.en, z.n);
  for (const d of desks) if (d.team) add(d.team, '', 99);   // a team seated without an area of its own
  depts.sort((a, b) => a.n - b.n);
  const rooms = zones.filter((z) => ROOM_KINDS.includes(z.kind))
    .map((z) => ({ kind: z.kind, label: z.label || ZONE_KINDS[z.kind], en: z.en && z.en !== z.label ? z.en : '', on: z.on, zones: [z], ids: [] }));
  const counts = new Map();
  for (const it of items) if (!SKIP.has(it.type) && SIZES[it.type]) counts.set(it.type, [...(counts.get(it.type) || []), it.id]);
  const things = [...counts].map(([type, ids]) => ({ type, n: ids.length, ids, zones: [], label: SIZES[type].label || type })).sort((a, b) => b.n - a.n);
  return { depts, rooms, things, seats: desks.length, taken: desks.filter((d) => (d.name || '').trim()).length };
}

const ROOM_DOT = { meeting: 'bg-accent', cabinet: 'bg-detail', server: 'bg-[#4c8f6a]', cafe: 'bg-[#c98b4a]', barista: 'bg-[#c98b4a]', massage: 'bg-[#a77bc4]' };

/**
 * unit: the picked unit's letter; items: its items; areaOf(): its block's element on screen (the card sits
 * beside its box, right of it when there is room, else left); onClose.
 */
/** teams: the floor's teams (teamView.teamList); team: the one shown (or null); onTeam(label | null): show a
 *  department (its row clicked) or go back to the whole unit (the header's back button, the row again). */
export default function UnitCard({ unit, items, stageRef, areaOf, onClose, onHint, teams = [], team = null, onTeam }) {
  const t = useT();
  const card = useRef(null);
  const [pos, setPos] = useState(null);
  const info = useMemo(() => unitContents(items), [items]);
  const known = useMemo(() => new Set(teams.map((x) => x.label)), [teams]);
  const here = team && info.depts.some((d) => d.label === team) ? team : null;   // the team shown, if it is this unit's
  // hovering (or focusing) a row lights its things on the plan: { zones, ids }, or null
  const hint = (row) => ({ onPointerEnter: () => onHint?.(row), onPointerLeave: () => onHint?.(null), onFocus: () => onHint?.(row), onBlur: () => onHint?.(null), tabIndex: 0 });
  useLayoutEffect(() => () => onHint?.(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  // placed beside the block every frame (the camera glides and pans with CSS transforms)
  useLayoutEffect(() => {
    let raf = 0;
    const place = () => {
      raf = requestAnimationFrame(place);
      const el = areaOf(), st = stageRef.current, c = card.current;
      if (!el || !st || !c) return;
      const b = el.getBoundingClientRect(), s = st.getBoundingClientRect();
      const cw = c.offsetWidth, ch = c.offsetHeight, gap = 14, pad = 12;
      let x = b.right - s.left + gap;
      if (x + cw > s.width - pad) x = b.left - s.left - gap - cw;          // no room on the right: on its left
      x = Math.min(Math.max(x, pad), s.width - cw - pad);
      const y = Math.min(Math.max(b.top - s.top, 64), s.height - ch - 64);
      setPos((p) => (p && Math.abs(p.x - x) < 0.5 && Math.abs(p.y - y) < 0.5 ? p : { x, y }));
    };
    place();
    return () => cancelAnimationFrame(raf);
  }, [areaOf, stageRef, unit]);

  return (
    <div ref={card} role="dialog" aria-label={t('Unit {u}', { u: unit })}
      className="menu-frost menu-pop absolute z-20 w-64 rounded-[12px] p-1 text-left"
      style={{ left: pos?.x ?? -9999, top: pos?.y ?? 0, visibility: pos ? 'visible' : 'hidden' }}
      onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex items-start justify-between gap-2 px-2.5 pt-2">
        {here ? (
          // a department shown: the way back to the whole unit, where the unit's name was
          <div className="min-w-0">
            <button type="button" onClick={() => onTeam?.(null)} title={t('Back to the whole unit')}
              className="menu-item -ml-1.5 flex items-center gap-0.5 rounded-md py-0.5 pl-1 pr-1.5 text-[12px] font-medium text-accent-hi outline-none">
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 3.5L5.5 8 10 12.5" /></svg>
              {t('Unit {u}', { u: unit })}
            </button>
            <div className="truncate text-[15px] font-semibold leading-5 text-ink-hi">{here}</div>
          </div>
        ) : (
          <div>
            <div className="text-[15px] font-semibold leading-5 text-ink-hi">{t('Unit {u}', { u: unit })}</div>
            <div className="text-[11px] leading-4 text-ink tabular-nums">{t('{a} of {d} seats taken', { a: info.taken, d: info.seats })}</div>
          </div>
        )}
        <button type="button" onClick={onClose} aria-label={t('Close')} className="menu-item -mr-1 grid size-6 place-items-center rounded-full text-ink hover:text-ink-hi">
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </button>
      </div>
      <div className="no-scrollbar mt-1.5 flex max-h-[60vh] flex-col gap-2.5 overflow-y-auto px-2.5 pb-2">
        {info.depts.length > 0 && (
          <section>
            <h4 className="mb-1 text-[10px] uppercase tracking-[.16em] text-ink">{t('Departments')}</h4>
            <ul className="flex flex-col gap-0.5">
              {info.depts.map((d) => (
                <li key={d.label} {...hint(d)}
                  // a department with an area of its own: a click shows it (again: back to the whole unit)
                  {...(known.has(d.label) ? { role: 'button', 'aria-pressed': here === d.label, onClick: () => onTeam?.(here === d.label ? null : d.label),
                    onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTeam?.(here === d.label ? null : d.label); } } } : {})}
                  className={`menu-item -mx-1.5 flex items-baseline gap-2 rounded-md px-1.5 py-0.5 text-[12px] leading-4 outline-none ${known.has(d.label) ? 'cursor-pointer' : 'cursor-default'} ${here === d.label ? 'on bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]' : ''} ${here && here !== d.label ? 'opacity-55' : ''}`}>
                  <span className="size-1.5 shrink-0 translate-y-[-1px] rounded-full bg-accent" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ink-hi">{d.label}</span>
                    {d.en && <span className="block truncate text-[10.5px] text-ink">{d.en}</span>}
                  </span>
                  {d.desks > 0 && <span className="shrink-0 text-[11px] text-accent-hi tabular-nums">{d.taken}/{d.desks}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
        {info.rooms.length > 0 && (
          <section>
            <h4 className="mb-1 text-[10px] uppercase tracking-[.16em] text-ink">{t('Rooms')}</h4>
            <ul className="flex flex-col gap-0.5">
              {info.rooms.map((r, i) => (
                <li key={`${r.label}-${i}`} {...hint(r)} className="menu-item -mx-1.5 flex cursor-default items-baseline gap-2 rounded-md px-1.5 py-0.5 text-[12px] leading-4 outline-none">
                  <span className={`size-1.5 shrink-0 translate-y-[-1px] rounded-full ${ROOM_DOT[r.kind] || 'bg-detail'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ink-hi">{r.label}</span>
                    {r.en && <span className="block truncate text-[10.5px] text-ink">{r.en}</span>}
                  </span>
                  {r.kind === 'meeting' && <span className={`shrink-0 text-[11px] ${r.on ? 'text-[#d9534f]' : 'text-accent-hi'}`}>{t(r.on ? 'In use' : 'Free')}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
        {info.things.length > 0 && (
          <section>
            <h4 className="mb-1 text-[10px] uppercase tracking-[.16em] text-ink">{t('Furniture')}</h4>
            <ul className="flex flex-wrap gap-1">
              {info.things.map((x) => (
                <li key={x.type} {...hint(x)} className="cursor-default rounded-full bg-[color-mix(in_srgb,var(--ink)_8%,transparent)] px-2 py-0.5 text-[11px] leading-4 text-ink-hi outline-none hover:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] focus-visible:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]">
                  {t(x.label)} <span className="text-ink tabular-nums">×{x.n}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
