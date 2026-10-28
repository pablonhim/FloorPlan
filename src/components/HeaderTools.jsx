// A view's tools as one row of round buttons centred in the app header (App renders the #header-tools slot;
// a view portals its row into it), and the floor / unit buttons shared by the floor view and the unit editor.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import SceneButton from './SceneButton.jsx';
import { RENTED, UNITS, PLANS, planId } from '../model/floors.js';

/** Renders its children into the header's centre slot. */
export function HeaderTools({ children }) {
  const target = typeof document !== 'undefined' ? document.getElementById('header-tools') : null;
  return target ? createPortal(<div className="flex items-center gap-2" role="toolbar" aria-label="View tools">{children}</div>, target) : null;
}

/** A short vertical divider between groups of header buttons. */
export const Divider = () => <span className="mx-0.5 block h-6 w-px bg-[color-mix(in_srgb,var(--ink)_35%,transparent)]" aria-hidden="true" />;

/**
 * Floor picker: a frosted pill showing the floor shown; clicking it opens a frosted menu of the rented floors
 * (the one shown checked). Closes on a choice, a click outside or Escape; arrow keys move through it.
 */
function FloorDropdown({ floor, onFloor }) {
  const [open, setOpen] = useState(false);
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
        className={`frost-panel frost-edge flex h-9 items-center gap-1.5 rounded-full pl-3.5 pr-2.5 text-[12px] font-semibold tabular-nums ${open ? 'text-accent ring-1 ring-accent' : 'text-ink-hi hover:text-accent'}`}>
        Floor {floor}
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true" className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}><path d="M4 6l4 4 4-4" /></svg>
      </button>
      {open && (
        <div role="menu" aria-label="Floor" onKeyDown={onMenuKey}
          className="frost-panel frost-edge absolute left-1/2 top-full z-30 mt-2 min-w-[132px] -translate-x-1/2 rounded-xl p-1">
          {RENTED.map((f) => (
            <button key={f} type="button" role="menuitemradio" aria-checked={f === floor} onClick={() => pick(f)}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] outline-none focus-visible:bg-accent-dim ${f === floor ? 'text-accent-hi' : 'text-ink-hi hover:bg-accent-dim'}`}>
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
export function FloorUnitButtons({ floor, unit = null, onFloor, onUnit }) {
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={`Floor ${floor} and its units`}>
      <FloorDropdown floor={floor} onFloor={onFloor} />
      {UNITS[floor].map((u) => {
        const p = PLANS[planId(floor, u)];
        return (
          <SceneButton below key={u} label={`Unit ${u}`} active={u === unit} onClick={() => u !== unit && onUnit(floor, u)}
            tip={u === unit ? `Editing unit ${u} · ${p.subtitleEn || p.subtitle}` : `Open unit ${u}'s layout · ${p.subtitleEn || p.subtitle}`}>
            <span className="text-[12px] font-semibold">{u}</span>
          </SceneButton>
        );
      })}
    </div>
  );
}
