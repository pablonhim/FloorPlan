// A view's tools as one frosted dock pill at the bottom left of its drawing (compact controls inside, thin
// dividers between groups) and the dropdowns that fill it: where you are (NavMenu), 3D or 2D (ViewModeMenu)
// and the floor's facilities (FacilityMenu). Their menus open upward, away from the bottom edge.
import { useEffect, useRef, useState } from 'react';
import SceneButton, { icon } from './SceneButton.jsx';
import { RENTED, UNITS, PLANS, planId } from '../model/floors.js';
import { useOneOpen } from '../lib/oneOpen.js';
import { useT } from '../lib/i18n.js';

/**
 * The bottom-left tool dock (place it in the drawing's positioned container); `menu` (the info button) sits
 * just right of it as a round button of its own, `after` floats beside that, and `left` (a CSS length) moves it
 * right, e.g. past a panel floating at the left.
 */
export function ViewTools({ children, menu = null, after = null, before = null, left = '1rem' }) {
  const t = useT();
  return (
    <div className="absolute bottom-3 z-20 flex h-10 items-center gap-2" style={{ left }}>
      {before}
      <div className="frost-panel frost-edge frost-thin flex h-10 items-center gap-0 rounded-full px-1" role="toolbar" aria-label={t('View tools')}>{children}</div>
      {menu}
      {after}
    </div>
  );
}

const TEAM_ICON = icon(<><circle cx="6" cy="5.5" r="2.2" /><path d="M2 13c.4-2.3 2-3.6 4-3.6s3.6 1.3 4 3.6" /><path d="M10.5 3.6a2 2 0 0 1 0 3.8M12 9.7c1.1.5 1.8 1.6 2 3.3" /></>);

/** A view's status line (and any message below it), centred at the top on the header's line. */
export function StatusLine({ children }) {
  return (
    <div className="sky-head pointer-events-none absolute top-0 left-1/2 z-10 flex min-h-14 -translate-x-1/2 flex-col items-center justify-center whitespace-nowrap text-center text-[12px] leading-tight tabular-nums"
      aria-live="polite">{children}</div>
  );
}

/** A status message in sentence case. */
export const sentence = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** A short vertical divider between groups of header buttons. */
export const Divider = () => <span className="mx-0.5 block h-5 w-px bg-[color-mix(in_srgb,var(--ink)_35%,transparent)]" aria-hidden="true" />;

const VIEW_ICON = {
  flat: icon(<><rect x="2.5" y="2.5" width="11" height="11" rx="1" /><path d="M2.5 8h11M8 2.5v11" /></>),   // a plan, from above
  iso: icon(<><path d="M8 2.2 13.5 5.3v5.4L8 13.8 2.5 10.7V5.3z" /><path d="M2.5 5.3 8 8.4l5.5-3.1M8 8.4v5.4" /></>),   // a box, in 3D
};

// ---------- the dock's combined dropdowns ----------

const chevUp = (open) => (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" className={`shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}><path d="M4 10l4-4 4 4" /></svg>
);
const CHECK = <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0"><path d="M3.5 8.5l3 3 6-7" /></svg>;
const CHEV_R = <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-ink"><path d="M6 4l4 4-4 4" /></svg>;
const ROW = 'menu-item flex w-full min-w-0 items-center gap-2 whitespace-nowrap rounded-md px-2 py-1 text-left text-[12px] leading-4 outline-none';
const dockBtn = (on) => `flex h-8 items-center gap-1.5 rounded-full pl-2.5 pr-2 text-[11.5px] font-semibold transition-colors ${on ? 'bg-accent-dim text-accent' : 'text-ink-hi hover:bg-[color-mix(in_srgb,var(--ink)_12%,transparent)]'}`;

/** A dock dropdown's open state: closes on a click outside, Escape, or another menu opening (useOneOpen). */
function useDropdown(onClose) {
  const [open, setOpen] = useState(false);
  useOneOpen(open, () => setOpen(false));
  const box = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) { close.current?.(); return undefined; }
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    (box.current?.querySelector('[role=menu] [aria-checked="true"]') || box.current?.querySelector('[role=menu] [role^="menuitem"]'))?.focus();
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  // arrow keys move through the items of the list the focus is in
  const onKey = (e) => {
    const menu = e.target.closest('[role=menu]');
    if (!menu) return;
    const list = [...menu.querySelectorAll(':scope > [role^="menuitem"], :scope > div > [role^="menuitem"]')], i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
  };
  return { open, setOpen, box, onKey };
}

const NAV_ICON = {
  back: icon(<path d="M10 3.5 5.5 8l4.5 4.5" />),
  place: icon(<><path d="M8 14s-4.5-4.2-4.5-7.5a4.5 4.5 0 0 1 9 0C12.5 9.8 8 14 8 14z" /><circle cx="8" cy="6.5" r="1.6" /></>),
  floor: icon(<><path d="M8 2.5 14 5.5 8 8.5 2 5.5z" /><path d="M2 8.5l6 3 6-3M2 11.2l6 3 6-3" /></>),
  unit: icon(<><rect x="2.5" y="2.5" width="11" height="11" rx="1" /><path d="M8 2.5v6h5.5" /></>),
  team: TEAM_ICON,
  room: icon(<><rect x="4" y="5.5" width="8" height="5" rx="1" /><path d="M5.5 3.5h1M9.5 3.5h1M5.5 12.5h1M9.5 12.5h1" /></>),
};

/**
 * Where you are: a home button (back to the Building), then one dropdown naming the place shown (floor, unit,
 * team) whose menu (opening upward) opens a submenu at its side to pick a Floor, a Unit, a
 * Department / Team (Team view) or a Meeting room. Rooms come as a list to jump to (rooms.items) or, on the
 * floor view, as one switch that lights them all up (rooms.on / rooms.onToggle).
 */
export function NavMenu({ floor, unit = null, onBack, onFloor, onUnit, onHoverUnit, teams = [], team = null, onTeam, onHoverTeam, rooms = null }) {
  const t = useT();
  const [sub, setSub] = useState(null);   // the submenu open: 'floor' | 'unit' | 'team' | 'room'
  const { open, setOpen, box, onKey } = useDropdown(() => { setSub(null); onHoverUnit?.(null); onHoverTeam?.(null); rooms?.onHover?.(null); rooms?.onHoverAll?.(false); });
  const done = () => setOpen(false);
  const place = [t('Floor {n}', { n: floor }), unit && t('Unit {u}', { u: unit }), team].filter(Boolean).join(' · ');
  const roomList = rooms?.items || [];
  const entries = [
    { key: 'floor', icon: NAV_ICON.floor, label: t('Floor'), value: `${floor}F` },
    { key: 'unit', icon: NAV_ICON.unit, label: t('Unit'), value: unit || '' },
    { key: 'team', icon: NAV_ICON.team, label: t('Department / Team'), value: team || '', none: !teams.length },
    rooms && (rooms.items
      ? { key: 'room', icon: NAV_ICON.room, label: t('Meeting room'), value: roomList.length ? String(roomList.length) : '', none: !roomList.length }
      : { key: 'roomAll', icon: NAV_ICON.room, label: t('Light up every meeting room'), toggle: true, on: rooms.on, none: !rooms.count }),
  ].filter(Boolean);
  // the submenu beside its row, growing up from the row's foot (the dock is at the bottom of the screen)
  const subMenu = (key) => {
    if (sub !== key) return null;
    const head = (s) => <div className="px-2 pb-1 pt-1 text-[10px] uppercase tracking-[.16em] text-ink">{s}</div>;
    let body = null;
    if (key === 'floor') body = <>{head(t('Floor'))}{RENTED.map((f) => (
      <button key={f} type="button" role="menuitemradio" aria-checked={f === floor} onClick={() => { done(); if (f !== floor) onFloor(f); }}
        className={`${ROW} ${f === floor ? 'text-accent-hi' : 'text-ink-hi'}`}>
        <span className="w-7 font-semibold tabular-nums">{f}F</span>
        <span className="flex-1 text-ink">{t('Units {u}', { u: UNITS[f].join(' · ') })}</span>
        {f === floor && CHECK}
      </button>))}</>;
    if (key === 'unit') body = <>{head(t('Unit'))}{UNITS[floor].map((u) => {
      const p = PLANS[planId(floor, u)];
      return (
        <button key={u} type="button" role="menuitemradio" aria-checked={u === unit} onClick={() => { done(); if (u !== unit) onUnit(floor, u); }}
          onPointerEnter={() => onHoverUnit?.(u)} onPointerLeave={() => onHoverUnit?.(null)}
          className={`${ROW} ${u === unit ? 'text-accent-hi' : 'text-ink-hi'}`}>
          <span className="w-7 font-semibold">{u}</span>
          <span className="max-w-[220px] flex-1 truncate text-ink">{p.subtitleEn || p.subtitle}</span>
          {u === unit && CHECK}
        </button>
      );
    })}</>;
    if (key === 'team') body = <>{head(t('Department / Team'))}
      <button type="button" role="menuitemradio" aria-checked={!team} onClick={() => { done(); onTeam(null); }} className={`${ROW} ${!team ? 'text-accent-hi' : 'text-ink-hi'}`}>
        <span className="flex-1">{t('All teams')}</span>{!team && CHECK}
      </button>
      {teams.map((x) => (
        <button key={x.label} type="button" role="menuitemradio" aria-checked={x.label === team} onClick={() => { done(); onTeam(x.label); }}
          onPointerEnter={() => onHoverTeam?.(x.label)} onPointerLeave={() => onHoverTeam?.(null)}
          className={`${ROW} ${x.label === team ? 'text-accent-hi' : 'text-ink-hi'}`}>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate">{x.label}</span>
            {x.en && x.en !== x.label && <span className="truncate text-[10.5px] text-ink">{x.en}</span>}
          </span>
          <span className="shrink-0 text-[11px] tabular-nums text-ink">{t('{n} people', { n: x.people })}</span>
          {x.label === team && CHECK}
        </button>
      ))}</>;
    if (key === 'room') body = <>{head(t('Meeting rooms'))}{roomList.map((it) => (
      <button key={it.id} type="button" role="menuitem" onClick={() => { done(); rooms.onPick(it); }}
        onPointerEnter={() => rooms.onHover?.(it)} onPointerLeave={() => rooms.onHover?.(null)}
        className={`${ROW} flex-col !items-start !gap-0 text-ink-hi`}>
        <span className="max-w-[240px] truncate">{it.label}</span>
        {it.sub && <span className="max-w-[240px] truncate text-[10.5px] text-ink">{it.sub}</span>}
      </button>))}</>;
    return (
      <div role="menu" aria-label={entries.find((e) => e.key === key)?.label}
        onKeyDown={(e) => { if (e.key === 'ArrowLeft') { e.preventDefault(); setSub(null); box.current?.querySelector(`[data-sub="${key}"]`)?.focus(); } }}
        className="menu-frost menu-pop no-scrollbar absolute bottom-0 left-full z-40 ml-1.5 max-h-[60vh] min-w-[180px] overflow-y-auto rounded-[10px] p-0.5">
        {body}
      </div>
    );
  };
  const openSub = (key, focus) => {
    setSub(key);
    rooms?.onHoverAll?.(key === 'room');
    if (focus) requestAnimationFrame(() => (box.current?.querySelector('[role=menu] [role=menu] [aria-checked="true"]') || box.current?.querySelector('[role=menu] [role=menu] [role^="menuitem"]'))?.focus());
  };
  return (<>
    {/* back one level, a button of its own at the dock's start: a unit back to its floor, a floor back to the
        whole building */}
    <SceneButton place="above-start" compact docked label={t('Back')} tip={unit ? t('Back to floor {n}', { n: floor }) : t('Back to the whole building')} onClick={onBack}>{NAV_ICON.back}</SceneButton>
    <Divider />
    <div ref={box} className="relative" onKeyDown={onKey}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={dockBtn(open)} title={t('Go to')}>
        <span className="ico">{NAV_ICON.place}</span>
        <span className="max-w-[16rem] truncate tabular-nums">{place}</span>
        {chevUp(open)}
      </button>
      {open && (
        <div role="menu" aria-label={t('Go to')} className="menu-frost menu-pop absolute bottom-full left-0 z-30 mb-2 w-max min-w-[220px] rounded-[10px] p-0.5">
          {entries.map((e) => (e.toggle ? (
            <button key={e.key} type="button" role="menuitemcheckbox" aria-checked={!!e.on} disabled={e.none} onClick={() => { done(); rooms.onToggle(); }}
              onPointerEnter={() => { setSub(null); rooms.onHover?.('meet'); }} onPointerLeave={() => rooms.onHover?.(null)}
              className={`${ROW} ${e.on ? 'text-accent-hi' : 'text-ink-hi'} disabled:opacity-45`}>
              <span className="text-ink">{e.icon}</span><span className="flex-1">{e.label}</span>{e.on && CHECK}
            </button>
          ) : (
            <div key={e.key} className="relative">
              <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={sub === e.key} data-sub={e.key} disabled={e.none}
                onClick={() => (sub === e.key ? setSub(null) : openSub(e.key, true))} onPointerEnter={() => !e.none && openSub(e.key)}
                onKeyDown={(ev) => { if (ev.key === 'ArrowRight' && !e.none) { ev.preventDefault(); openSub(e.key, true); } }}
                className={`${ROW} ${sub === e.key ? 'bg-[color-mix(in_srgb,var(--ink)_9%,transparent)]' : ''} text-ink-hi disabled:opacity-45`}>
                <span className="text-ink">{e.icon}</span>
                <span className="flex-1">{e.label}</span>
                <span className="max-w-[8rem] truncate text-[11px] text-ink">{e.none ? t('None') : e.value}</span>
                {!e.none && CHEV_R}
              </button>
              {subMenu(e.key)}
            </div>
          )))}
        </div>
      )}
    </div>
  </>);
}

/** 3D ↔ 2D as a dropdown in the dock: the button shows the view in use; the menu offers both. */
export function ViewModeMenu({ top, onChange }) {
  const t = useT();
  const { open, setOpen, box, onKey } = useDropdown();
  const modes = [
    { top: false, icon: VIEW_ICON.iso, short: '3D', label: t('3D view') },
    { top: true, icon: VIEW_ICON.flat, short: '2D', label: t('Top-down view') },
  ];
  const cur = modes.find((m) => m.top === !!top);
  return (
    <div ref={box} className="relative" onKeyDown={onKey}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={`${t('View')}: ${cur.label}`} onClick={() => setOpen((o) => !o)} className={dockBtn(open)}>
        <span className="ico">{cur.icon}</span><span>{cur.short}</span>{chevUp(open)}
      </button>
      {open && (
        <div role="menu" aria-label={t('View')} className="menu-frost menu-pop-up absolute bottom-full left-1/2 z-30 mb-2 w-max -translate-x-1/2 rounded-[10px] p-0.5">
          {modes.map((m) => (
            <button key={m.short} type="button" role="menuitemradio" aria-checked={m === cur} onClick={() => { setOpen(false); if (m !== cur) onChange(m.top); }}
              className={`${ROW} ${m === cur ? 'text-accent-hi' : 'text-ink-hi'}`}>
              <span className="text-ink">{m.icon}</span><span className="flex-1">{m.label}</span>{m === cur && CHECK}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The building's shared facilities on a floor (stairs, elevators, restrooms) as one dropdown in the dock:
 * hovering a row lights up their floors, a click keeps them glowing (again to stop).
 * items: [{ key, label, icon, n }]; on: the key lit, or null.
 */
export function FacilityMenu({ items, on, onToggle, onHover, icon: glyph }) {
  const t = useT();
  const { open, setOpen, box, onKey } = useDropdown(() => onHover?.(null));
  const cur = items.find((i) => i.key === on);
  return (
    <div ref={box} className="relative" onKeyDown={onKey}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={cur ? `${t('Facilities')}: ${cur.label}` : t('Facilities')} title={t('Facilities')}
        onClick={() => setOpen((o) => !o)} className={dockBtn(open || !!cur)}>
        <span className="ico">{cur ? cur.icon : glyph}</span>
        {cur && <span className="max-w-[7rem] truncate">{cur.label}</span>}
        {chevUp(open)}
      </button>
      {open && (
        <div role="menu" aria-label={t('Facilities')} className="menu-frost menu-pop-up absolute bottom-full left-1/2 z-30 mb-2 w-max min-w-[180px] -translate-x-1/2 rounded-[10px] p-0.5">
          <div className="px-2 pb-1 pt-1 text-[10px] uppercase tracking-[.16em] text-ink">{t('Facilities')}</div>
          {items.map((i) => (
            <button key={i.key} type="button" role="menuitemcheckbox" aria-checked={i.key === on} disabled={!i.n}
              onClick={() => { setOpen(false); onToggle(i.key); }} onPointerEnter={() => onHover?.(i.key)} onPointerLeave={() => onHover?.(null)}
              className={`${ROW} ${i.key === on ? 'text-accent-hi' : 'text-ink-hi'} disabled:opacity-45`}>
              <span className="text-ink">{i.icon}</span><span className="flex-1">{i.label}</span>
              <span className="text-[11px] tabular-nums text-ink">{i.n}</span>
              {i.key === on && CHECK}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
