// A header actions pill: one frosted pill that opens a frosted menu of actions below it (a single action is
// just the pill). Closes on a choice, a click outside or Escape; arrow keys move through it.
import { useEffect, useRef, useState } from 'react';

const pill = 'frost-panel frost-edge flex h-6 items-center gap-1 rounded-full px-3 text-[12px] font-medium leading-none';

/** items: [{ label, onClick, accent? }] */
export default function ActionMenu({ label = 'Actions', items }) {
  const [open, setOpen] = useState(false);
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
  if (items.length === 1) {
    const [it] = items;
    return <button type="button" onClick={it.onClick} className={`${pill} ${it.accent ? 'text-accent-hi' : 'text-ink-hi'} hover:text-accent`}>{it.label}</button>;
  }
  const onKey = (e) => {
    const els = [...box.current.querySelectorAll('[role="menuitem"]')], i = els.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); els[(i + 1) % els.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); els[(i - 1 + els.length) % els.length]?.focus(); }
  };
  return (
    <div ref={box} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className={`${pill} pr-2 ${open ? 'text-accent ring-1 ring-accent' : 'text-ink-hi hover:text-accent'}`}>
        {label}
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true" className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}><path d="M4 6l4 4 4-4" /></svg>
      </button>
      {open && (
        <div role="menu" aria-label={label} onKeyDown={onKey}
          className="frost-panel frost-edge absolute right-0 top-full z-40 mt-2 min-w-[150px] rounded-xl p-1">
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" onClick={() => { setOpen(false); it.onClick(); }}
              className={`flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-[12px] outline-none hover:bg-accent-dim focus-visible:bg-accent-dim ${it.accent ? 'text-accent-hi' : 'text-ink-hi'}`}>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
