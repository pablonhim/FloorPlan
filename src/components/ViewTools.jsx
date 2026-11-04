// A view's tools as one frosted dock pill at the bottom left of its drawing (compact buttons inside, thin
// dividers between groups), and the floor / unit buttons shared by the floor view and the unit editor.
// Hints and the floor menu open upward, away from the bottom edge.
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
export function ViewTools({ children, menu = null, after = null, left = '1rem' }) {
  const t = useT();
  return (
    <div className="absolute bottom-3 z-20 flex h-10 items-center gap-2" style={{ left }}>
      <div className="frost-panel frost-edge frost-thin flex h-10 items-center gap-0 rounded-full px-1" role="toolbar" aria-label={t('View tools')}>{children}</div>
      {menu}
      {after}
    </div>
  );
}

const TEAM_ICON = icon(<><circle cx="6" cy="5.5" r="2.2" /><path d="M2 13c.4-2.3 2-3.6 4-3.6s3.6 1.3 4 3.6" /><path d="M10.5 3.6a2 2 0 0 1 0 3.8M12 9.7c1.1.5 1.8 1.6 2 3.3" /></>);

/**
 * Team / Department view, in the dock: a round button whose menu (opening upward) lists the view's teams
 * with how many people sit in each; picking one shows only that team (its people, desks and areas), the rest
 * stepping back; "All teams" (or Escape) goes back. teams: teamList(); team: the label shown, or null.
 */
export function TeamPicker({ teams, team, onTeam, onHover }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  useOneOpen(open, () => setOpen(false));
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    (box.current?.querySelector('[aria-checked="true"]') || box.current?.querySelector('[role^="menuitem"]'))?.focus();
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const onMenuKey = (e) => {
    const list = [...box.current.querySelectorAll('[role^="menuitem"]')], i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
  };
  if (!teams.length) return null;
  const pick = (label) => { setOpen(false); onHover?.(null); onTeam(label); };
  const row = 'menu-item flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left leading-4 outline-none';
  const check = <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>;
  return (
    <div ref={box} className="group relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={team ? t('Team view: {x}', { x: team }) : t('Team view')}
        onClick={() => setOpen((o) => !o)}
        className={`relative flex h-8 items-center gap-1 rounded-full transition-colors ${team ? 'pl-2 pr-2.5' : 'w-8 justify-center'} ${open || team ? 'bg-accent-dim text-accent' : 'text-ink-hi hover:bg-[color-mix(in_srgb,var(--ink)_12%,transparent)]'}`}>
        <span className="ico">{TEAM_ICON}</span>
        {team && <span className="max-w-[9rem] truncate text-[11.5px] font-semibold">{team}</span>}
      </button>
      {!open && (
        <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 whitespace-nowrap rounded-full frost-panel frost-edge px-2.5 py-1 text-[11px] font-medium leading-none text-ink-hi opacity-0 group-hover:opacity-100">
          {t('Team view')}
        </span>
      )}
      {open && (
        <div role="menu" aria-label={t('Team view')} onKeyDown={onMenuKey}
          className="menu-frost no-scrollbar absolute bottom-full left-1/2 z-30 mb-2 max-h-[50vh] min-w-[200px] max-w-[280px] -translate-x-1/2 overflow-y-auto rounded-[10px] p-0.5">
          <div className="px-2 pb-1 pt-1 text-[10px] uppercase tracking-[.16em] text-ink">{t('Team view')}</div>
          <button type="button" role="menuitemradio" aria-checked={!team} onClick={() => pick(null)}
            className={`${row} ${!team ? 'text-accent-hi' : 'text-ink-hi'}`}>
            <span className="flex-1 truncate text-[12px]">{t('All teams')}</span>
            {!team && check}
          </button>
          {teams.map((x) => (
            <button key={x.label} type="button" role="menuitemradio" aria-checked={x.label === team} onClick={() => pick(x.label)}
              onPointerEnter={() => onHover?.(x.label)} onPointerLeave={() => onHover?.(null)}
              className={`${row} ${x.label === team ? 'text-accent-hi' : 'text-ink-hi'}`}>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[12px]">{x.label}</span>
                {x.en && x.en !== x.label && <span className="truncate text-[10.5px] text-ink">{x.en}</span>}
              </span>
              <span className="shrink-0 text-[11px] tabular-nums text-ink">{t('{n} people', { n: x.people })}</span>
              {x.label === team && check}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
/** The floor view's and the unit editor's view switch: the isometric 3D view ↔ the flat top-down plan. */
export function ViewModeButton({ top, onChange }) {
  const t = useT();
  return (
    <SceneButton place="above" compact docked label={t(top ? '3D view' : 'Top-down view')}
      tip={t(top ? 'Back to the isometric 3D view' : 'The flat 2D plan, seen from straight above')} onClick={() => onChange(!top)}>
      {top ? VIEW_ICON.iso : VIEW_ICON.flat}
    </SceneButton>
  );
}

/**
 * Floor picker: a pill in the dock showing the floor shown; clicking it opens (upward) a frosted menu of the rented floors
 * (the one shown checked). Closes on a choice, a click outside or Escape; arrow keys move through it.
 */
function FloorDropdown({ floor, onFloor }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  useOneOpen(open, () => setOpen(false));
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    box.current?.querySelector('[aria-checked="true"]')?.focus();
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const pick = (f) => { setOpen(false); if (f !== floor) onFloor(f); };
  const onMenuKey = (e) => {
    const items = [...box.current.querySelectorAll('[role="menuitemradio"]')], i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
  };
  return (
    <div ref={box} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className={`flex h-8 items-center gap-1 rounded-full pl-3 pr-2 text-[11.5px] font-semibold tabular-nums transition-colors ${open ? 'bg-accent-dim text-accent' : 'text-ink-hi hover:bg-[color-mix(in_srgb,var(--ink)_12%,transparent)]'}`}>
        {t('Floor {n}', { n: floor })}
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true" className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}><path d="M4 10l4-4 4 4" /></svg>
      </button>
      {open && (
        <div role="menu" aria-label={t('Floor')} onKeyDown={onMenuKey}
          className="menu-frost absolute bottom-full left-1/2 z-30 mb-2 w-max -translate-x-1/2 rounded-[10px] p-0.5">
          {RENTED.map((f) => (
            <button key={f} type="button" role="menuitemradio" aria-checked={f === floor} onClick={() => pick(f)}
              className={`menu-item flex w-full items-center gap-2 whitespace-nowrap rounded-md px-2 py-1 text-left text-[12px] leading-4 outline-none ${f === floor ? 'text-accent-hi' : 'text-ink-hi'}`}>
              <span className="w-7 font-semibold tabular-nums">{f}F</span>
              <span className="flex-1 text-ink">{t('Units {u}', { u: UNITS[f].join(' · ') })}</span>
              {f === floor && <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The floor picker, then the floor shown's units as round buttons (the unit open, if any, ringed).
 * onFloor(f) for another floor, onUnit(f, u) for a unit.
 */
export function FloorUnitButtons({ floor, unit = null, onFloor, onUnit, onHoverUnit, only = false }) {
  const t = useT();
  return (
    <div className="flex items-center gap-0" role="group" aria-label={t(only ? 'Floor {n}' : 'Floor {n} and its units', { n: floor })}>
      <FloorDropdown floor={floor} onFloor={onFloor} />
      {/* only: inside a unit, just the floor picker (choosing units is left to the floor view) */}
      {!only && UNITS[floor].map((u) => {
        const p = PLANS[planId(floor, u)];
        return (
          <SceneButton place="above" compact docked key={u} label={t('Unit {u}', { u })} active={u === unit} onClick={() => u !== unit && onUnit(floor, u)}
            onPointerEnter={() => onHoverUnit?.(u)} onPointerLeave={() => onHoverUnit?.(null)}
            tip={`${t(u === unit ? 'Editing unit {u}' : "Open unit {u}'s layout", { u })} · ${p.subtitleEn || p.subtitle}`}>
            <span className="text-[12px] font-semibold">{u}</span>
          </SceneButton>
        );
      })}
    </div>
  );
}

/**
 * A quick-jump slot in the dock: a round button whose menu (opening upward) lists the places of one kind in
 * the view — meeting rooms … — each taking the camera there. When there are none it is left out altogether.
 * items: [{ id, label, sub? }]; onPick(item).
 */
export function QuickJump({ label, icon: glyph, items, onPick, onHover, onHoverAll }) {
  const [open, setOpen] = useState(false);
  useOneOpen(open, () => setOpen(false));
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    box.current?.querySelector('[role="menuitem"]')?.focus();
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const onMenuKey = (e) => {
    const list = [...box.current.querySelectorAll('[role="menuitem"]')], i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
  };
  if (!items.length) return null;
  return (
    <div ref={box} className="group relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={`${label} · ${items.length}`}
        onClick={() => setOpen((o) => !o)}
        onPointerEnter={() => onHoverAll?.(true)} onPointerLeave={() => onHoverAll?.(false)}
        className={`relative grid size-8 place-items-center rounded-full transition-colors ${open ? 'bg-accent-dim text-accent' : 'text-ink-hi hover:bg-[color-mix(in_srgb,var(--ink)_12%,transparent)]'}`}>
        <span className="ico">{glyph}</span>
        {/* how many */}
        <span className="absolute -top-1 -right-1.5 rounded-full bg-accent px-1 text-[8.5px] font-semibold leading-[13px] tabular-nums text-white">
          {items.length}
        </span>
      </button>
      {!open && (
        <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 whitespace-nowrap rounded-full frost-panel frost-edge px-2.5 py-1 text-[11px] font-medium leading-none text-ink-hi opacity-0 group-hover:opacity-100">
          {label}
        </span>
      )}
      {open && (
        <div role="menu" aria-label={label} onKeyDown={onMenuKey}
          className="menu-frost no-scrollbar absolute bottom-full left-1/2 z-30 mb-2 max-h-[50vh] min-w-[180px] max-w-[260px] -translate-x-1/2 overflow-y-auto rounded-[10px] p-0.5">
          <div className="px-2 pb-1 pt-1 text-[10px] uppercase tracking-[.16em] text-ink">{label}</div>
          {items.map((it) => (
            <button key={it.id} type="button" role="menuitem" onClick={() => { setOpen(false); onHover?.(null); onPick(it); }}
              onPointerEnter={() => onHover?.(it)} onPointerLeave={() => onHover?.(null)}
              className="menu-item flex w-full min-w-0 flex-col rounded-md px-2 py-1 text-left leading-4 outline-none">
              <span className="truncate text-[12px] text-ink-hi">{it.label}</span>
              {it.sub && <span className="truncate text-[10.5px] text-ink">{it.sub}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
