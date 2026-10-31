// A view's tools as one frosted dock pill at the bottom left of its drawing (compact buttons inside, thin
// dividers between groups), and the floor / unit buttons shared by the floor view and the unit editor.
// Hints and the floor menu open upward, away from the bottom edge.
import { useEffect, useRef, useState } from 'react';
import SceneButton from './SceneButton.jsx';
import Compass from './Compass.jsx';
import { RENTED, UNITS, PLANS, planId } from '../model/floors.js';
import { useOneOpen } from '../lib/oneOpen.js';

/**
 * The bottom-left tool dock (place it in the drawing's positioned container); `after` floats beside it, and
 * `left` (a CSS length) moves it right, e.g. past a panel floating at the left.
 */
export function ViewTools({ children, after = null, left = '1rem' }) {
  return (
    <div className="absolute bottom-3 z-20 flex h-10 items-center gap-2" style={{ left }}>
      <Compass />
      <div className="frost-panel frost-edge frost-thin flex h-10 items-center gap-0 rounded-full px-1" role="toolbar" aria-label="View tools">{children}</div>
      {after}
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

/**
 * Floor picker: a pill in the dock showing the floor shown; clicking it opens (upward) a frosted menu of the rented floors
 * (the one shown checked). Closes on a choice, a click outside or Escape; arrow keys move through it.
 */
function FloorDropdown({ floor, onFloor }) {
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
        Floor {floor}
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true" className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}><path d="M4 10l4-4 4 4" /></svg>
      </button>
      {open && (
        <div role="menu" aria-label="Floor" onKeyDown={onMenuKey}
          className="menu-frost absolute bottom-full left-1/2 z-30 mb-2 min-w-[132px] -translate-x-1/2 rounded-xl p-1">
          {RENTED.map((f) => (
            <button key={f} type="button" role="menuitemradio" aria-checked={f === floor} onClick={() => pick(f)}
              className={`menu-item flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] outline-none ${f === floor ? 'text-accent-hi' : 'text-ink-hi'}`}>
              <span className="w-7 font-semibold tabular-nums">{f}F</span>
              <span className="flex-1 text-ink">Units {UNITS[f].join(' · ')}</span>
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
  return (
    <div className="flex items-center gap-0" role="group" aria-label={`Floor ${floor} and its units`}>
      <FloorDropdown floor={floor} onFloor={onFloor} />
      {/* only: inside a unit, just that unit's own button (the other units are left to the floor view) */}
      {UNITS[floor].filter((u) => !only || u === unit).map((u) => {
        const p = PLANS[planId(floor, u)];
        return (
          <SceneButton place="above" compact docked key={u} label={`Unit ${u}`} active={u === unit} onClick={() => u !== unit && onUnit(floor, u)}
            onPointerEnter={() => onHoverUnit?.(u)} onPointerLeave={() => onHoverUnit?.(null)}
            tip={u === unit ? `Editing unit ${u} · ${p.subtitleEn || p.subtitle}` : `Open unit ${u}'s layout · ${p.subtitleEn || p.subtitle}`}>
            <span className="text-[12px] font-semibold">{u}</span>
          </SceneButton>
        );
      })}
    </div>
  );
}

/**
 * A quick-jump slot in the dock: a round button whose menu (opening upward) lists the places of one kind in
 * the view — a unit's teams, team leaders' desks, meeting rooms … — each taking the camera there. When there
 * are none, the slot stays (the dock keeps its shape) but is greyed with a small "None" badge.
 * items: [{ id, label, sub? }]; onPick(item).
 */
export function QuickJump({ label, icon: glyph, items, onPick, onHover }) {
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
  const none = !items.length;
  const onMenuKey = (e) => {
    const list = [...box.current.querySelectorAll('[role="menuitem"]')], i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
  };
  return (
    <div ref={box} className="group relative">
      <button type="button" aria-haspopup={none ? undefined : 'menu'} aria-expanded={none ? undefined : open} aria-disabled={none}
        aria-label={none ? `${label}: none in this unit` : `${label} · ${items.length}`}
        onClick={() => !none && setOpen((o) => !o)}
        className={`relative grid size-8 place-items-center rounded-full transition-colors ${none ? 'cursor-default text-ink opacity-45'
          : open ? 'bg-accent-dim text-accent' : 'text-ink-hi hover:bg-[color-mix(in_srgb,var(--ink)_12%,transparent)]'}`}>
        <span className="ico">{glyph}</span>
        {/* how many, or a grey "None" badge when the unit has none (the slot keeps its place) */}
        <span className={`absolute -top-1 -right-1.5 rounded-full px-1 text-[8.5px] font-semibold leading-[13px] tabular-nums ${none ? 'bg-[color-mix(in_srgb,var(--ink)_22%,var(--panel))] text-ink' : 'bg-accent text-white'}`}>
          {none ? 'None' : items.length}
        </span>
      </button>
      {!open && (
        <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 whitespace-nowrap rounded-full frost-panel frost-edge px-2.5 py-1 text-[11px] font-medium leading-none text-ink-hi opacity-0 group-hover:opacity-100">
          {none ? `${label} · none in this unit` : label}
        </span>
      )}
      {open && (
        <div role="menu" aria-label={label} onKeyDown={onMenuKey}
          className="menu-frost no-scrollbar absolute bottom-full left-1/2 z-30 mb-2 max-h-[50vh] min-w-[180px] max-w-[260px] -translate-x-1/2 overflow-y-auto rounded-xl p-1">
          <div className="px-2.5 pb-1 pt-1 text-[10px] uppercase tracking-[.16em] text-ink">{label}</div>
          {items.map((it) => (
            <button key={it.id} type="button" role="menuitem" onClick={() => { setOpen(false); onHover?.(null); onPick(it); }}
              onPointerEnter={() => onHover?.(it)} onPointerLeave={() => onHover?.(null)}
              className="menu-item flex w-full min-w-0 flex-col rounded-lg px-2.5 py-1.5 text-left outline-none">
              <span className="truncate text-[12px] text-ink-hi">{it.label}</span>
              {it.sub && <span className="truncate text-[10.5px] text-ink">{it.sub}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
