// The "More" button at the end of a view's bottom-left dock: one round button whose frosted menu opens
// upward with the view's own actions (Export, Reset …) and the app's shared ones — History, and the Labels,
// Show weather background and Show floor grid switches (the architectural model's colours are the one look
// now: no material-style switches) — which come from DockMenuContext (App).
// Closes on a choice, a click outside or Escape; ↑ ↓ move through it.
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { icon } from './SceneButton.jsx';
import { useOneOpen } from '../lib/oneOpen.js';

/** { openHistory(), labels, setLabels(on), prefs, setPref(key, on) } — provided by App. */
export const DockMenuContext = createContext(null);

const I = {
  more: icon(<><circle cx="3.5" cy="8" r=".9" /><circle cx="8" cy="8" r=".9" /><circle cx="12.5" cy="8" r=".9" /></>),
  history: icon(<><circle cx="8" cy="8" r="5.5" /><path d="M8 5v3.2l2 1.3" /></>),
  export: icon(<path d="M8 2.5v8M4.5 7L8 10.5 11.5 7M3 13.5h10" />),
  reset: icon(<><path d="M3 8a5 5 0 1 0 1.5-3.6" /><path d="M3 2.5V5h2.5" /></>),
  labels: icon(<path d="M3 4.5h10M8 4.5v8" />),
  weather: icon(<><circle cx="6" cy="6" r="2.5" /><path d="M5 13h6.5a2.5 2.5 0 0 0 0-5 3.5 3.5 0 0 0-6.6 1A2 2 0 0 0 5 13z" /></>),
  grid: icon(<path d="M2.5 5.5h11M2.5 10.5h11M5.5 2.5v11M10.5 2.5v11" />),
};

/** items: the view's own actions, [{ label, onClick, icon?: 'export' | 'reset', danger? }]. */
export default function DockMenu({ items = [] }) {
  const shared = useContext(DockMenuContext);
  const [open, setOpen] = useState(false);
  useOneOpen(open, () => setOpen(false));
  const box = useRef(null), menu = useRef(null);
  // the menu is drawn at the page's top level, placed over the button: inside the dock (itself frosted) its
  // backdrop blur would only see the dock, not the drawing behind it
  const [at, setAt] = useState(null);
  const toggle = () => {
    if (!open) {
      const r = box.current.getBoundingClientRect();
      setAt({ left: r.left + r.width / 2, bottom: window.innerHeight - r.top + 8 });
    }
    setOpen((o) => !o);
  };
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!box.current?.contains(e.target) && !menu.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    menu.current?.querySelector('[role^="menuitem"]')?.focus();
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const onKey = (e) => {
    const els = [...menu.current.querySelectorAll('[role^="menuitem"]')], i = els.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); els[(i + 1) % els.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); els[(i - 1 + els.length) % els.length]?.focus(); }
  };
  const row = 'menu-item flex w-full items-center gap-2 whitespace-nowrap rounded-md px-2 py-1 text-left text-[12px] leading-4 outline-none';
  const choose = (fn) => () => { setOpen(false); fn(); };
  return (
    <div ref={box} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label="More" onClick={toggle}
        className={`pop-ico group relative grid size-8 place-items-center rounded-full transition-colors ${open ? 'bg-accent-dim text-accent' : 'text-ink-hi hover:bg-[color-mix(in_srgb,var(--ink)_12%,transparent)]'}`}>
        <span className="ico">{I.more}</span>
        {!open && (
          <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 whitespace-nowrap rounded-full frost-panel frost-edge px-2.5 py-1 text-[11px] font-medium leading-none text-ink-hi opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100">More</span>
        )}
      </button>
      {open && at && createPortal(
        <div ref={menu} role="menu" aria-label="More" onKeyDown={onKey} style={{ left: at.left, bottom: at.bottom }}
          className="menu-frost dock-menu fixed z-50 flex min-w-[210px] -translate-x-1/2 flex-col rounded-[10px] p-0.5">
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" onClick={choose(it.onClick)}
              className={`${row} ${it.danger ? 'text-[#e5484d]' : 'text-ink-hi'}`}>
              <span className="text-ink">{I[it.icon || 'export']}</span>{it.label}
            </button>
          ))}
          {items.length > 0 && <div className="mx-1.5 my-0.5 h-px bg-[color-mix(in_srgb,var(--ink)_18%,transparent)]" />}
          {shared && (
            <>
              <button type="button" role="menuitem" onClick={choose(shared.openHistory)} className={`${row} text-ink-hi`}>
                <span className="text-ink">{I.history}</span>History
              </button>
              {/* Labels and the view settings: switch rows (the menu stays open, so they can be flicked on and off) */}
              {[
                { label: 'Labels', icon: I.labels, on: shared.labels, set: shared.setLabels },
                ...(shared.prefs ? [
                  { label: 'Show weather background', icon: I.weather, on: shared.prefs.weather, set: (v) => shared.setPref('weather', v) },
                  { label: 'Show floor grid', icon: I.grid, on: shared.prefs.grid, set: (v) => shared.setPref('grid', v) },
                ] : []),
              ].map((r) => (
                <button key={r.label} type="button" role="menuitemcheckbox" aria-checked={r.on} onClick={() => r.set(!r.on)}
                  className={`${row} text-ink-hi`}>
                  <span className="text-ink">{r.icon}</span>
                  <span className="flex-1">{r.label}</span>
                  <span className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${r.on ? 'bg-accent' : 'bg-[color-mix(in_srgb,var(--ink)_30%,transparent)]'}`}>
                    <span className={`absolute top-0.5 size-3 rounded-full bg-white shadow transition-[left] ${r.on ? 'left-3.5' : 'left-0.5'}`} />
                  </span>
                </button>
              ))}
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
