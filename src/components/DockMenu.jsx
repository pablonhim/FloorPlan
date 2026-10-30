// The "More" button at the end of a view's bottom-left dock: one round button whose frosted menu opens
// upward with the view's own actions (Export, Reset …) and the app's shared ones — History and the Labels
// switch — which come from DockMenuContext (App). Closes on a choice, a click outside or Escape; ↑ ↓ move
// through it.
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { icon } from './SceneButton.jsx';

/** { openHistory(), labels, setLabels(on) } — provided by App. */
export const DockMenuContext = createContext(null);

const I = {
  more: icon(<><circle cx="3.5" cy="8" r=".9" /><circle cx="8" cy="8" r=".9" /><circle cx="12.5" cy="8" r=".9" /></>),
  history: icon(<><circle cx="8" cy="8" r="5.5" /><path d="M8 5v3.2l2 1.3" /></>),
  export: icon(<path d="M8 2.5v8M4.5 7L8 10.5 11.5 7M3 13.5h10" />),
  reset: icon(<><path d="M3 8a5 5 0 1 0 1.5-3.6" /><path d="M3 2.5V5h2.5" /></>),
  labels: icon(<path d="M3 4.5h10M8 4.5v8" />),
};

/** items: the view's own actions, [{ label, onClick, icon?: 'export' | 'reset', danger? }]. */
export default function DockMenu({ items = [] }) {
  const shared = useContext(DockMenuContext);
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    box.current?.querySelector('[role^="menuitem"]')?.focus();
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const onKey = (e) => {
    const els = [...box.current.querySelectorAll('[role^="menuitem"]')], i = els.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); els[(i + 1) % els.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); els[(i - 1 + els.length) % els.length]?.focus(); }
  };
  const row = 'flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-left text-[12px] outline-none hover:bg-accent-dim focus-visible:bg-accent-dim';
  const choose = (fn) => () => { setOpen(false); fn(); };
  return (
    <div ref={box} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label="More" onClick={() => setOpen((o) => !o)}
        className={`group relative grid size-8 place-items-center rounded-full transition-colors ${open ? 'bg-accent-dim text-accent' : 'text-ink-hi hover:bg-accent-dim hover:text-accent'}`}>
        {I.more}
        {!open && (
          <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 whitespace-nowrap rounded-full frost-panel frost-edge px-2.5 py-1 text-[11px] font-medium leading-none text-ink-hi opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100">More</span>
        )}
      </button>
      {open && (
        <div role="menu" aria-label="More" onKeyDown={onKey}
          className="frost-panel frost-edge dock-menu absolute bottom-full left-1/2 z-40 mb-2 flex min-w-[172px] -translate-x-1/2 flex-col rounded-xl p-1">
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" onClick={choose(it.onClick)}
              className={`${row} ${it.danger ? 'text-[#e5484d]' : 'text-ink-hi'}`}>
              <span className="text-ink">{I[it.icon || 'export']}</span>{it.label}
            </button>
          ))}
          {items.length > 0 && <div className="mx-2 my-1 h-px bg-[color-mix(in_srgb,var(--ink)_18%,transparent)]" />}
          {shared && (
            <>
              <button type="button" role="menuitem" onClick={choose(shared.openHistory)} className={`${row} text-ink-hi`}>
                <span className="text-ink">{I.history}</span>History
              </button>
              {/* Labels: a switch row (the menu stays open, so it can be flicked on and off) */}
              <button type="button" role="menuitemcheckbox" aria-checked={shared.labels} onClick={() => shared.setLabels(!shared.labels)}
                className={`${row} text-ink-hi`}>
                <span className="text-ink">{I.labels}</span>
                <span className="flex-1">Labels</span>
                <span className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${shared.labels ? 'bg-accent' : 'bg-[color-mix(in_srgb,var(--ink)_30%,transparent)]'}`}>
                  <span className={`absolute top-0.5 size-3 rounded-full bg-white shadow transition-[left] ${shared.labels ? 'left-3.5' : 'left-0.5'}`} />
                </span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
