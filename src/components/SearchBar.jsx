// Header search: one box that finds anything on the rented floors — employees, desks, units, rooms,
// storage — and, on a pick, opens its page with the camera gliding onto it (see svgCamera).
// ⌘K / Ctrl K or "/" focuses it; ↑ ↓ move through the results, Enter opens one, Escape clears.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { buildIndex, search } from '../model/search.js';
import { icon } from './SceneButton.jsx';
import { useOneOpen } from '../lib/oneOpen.js';
import { useT } from '../lib/i18n.js';

const KIND = {
  floor: icon(<><path d="M2.5 6 8 3l5.5 3L8 9z" /><path d="M2.5 9.5 8 12.5l5.5-3" /></>),
  unit: icon(<><rect x="3" y="3" width="10" height="10" rx="1" /><path d="M8 3v5h5" /></>),
  person: icon(<><circle cx="8" cy="5.5" r="2.5" /><path d="M3.5 13.5c0-2.6 2-4.2 4.5-4.2s4.5 1.6 4.5 4.2" /></>),
  desk: icon(<><path d="M2.5 6.5h11M4 6.5v6M12 6.5v6" /><rect x="6" y="3.5" width="4" height="3" rx=".5" /></>),
  room: icon(<><path d="M4 13.5V3h8v10.5M2.5 13.5h11" /><path d="M9.5 8.5h.01" /></>),
  storage: icon(<><rect x="3" y="3" width="10" height="10" rx="1" /><path d="M3 8h10M7 5.5h2M7 10.5h2" /></>),
};
const KIND_NAME = { floor: 'Floor', unit: 'Unit', person: 'Employee', desk: 'Desk', room: 'Room', storage: 'Storage' };

/** The index's own English bits (model/search) in the display language; names and room labels stay as they are. */
const LOC = [
  [/^Floor (\d+) · Unit (\w+)$/, (m, t) => t('Floor {n} · Unit {u}', { n: m[1], u: m[2] })],
  [/^Floor (\d+)$/, (m, t) => t('Floor {n}', { n: m[1] })],
  [/^Unit (\w+)$/, (m, t) => t('Unit {u}', { u: m[1] })],
  [/^Units (.+)$/, (m, t) => t('Units {u}', { u: m[1] })],
  [/^Desk (.+)$/, (m, t) => t('Desk {x}', { x: m[1] })],
];
const loc = (s, t) => { for (const [re, f] of LOC) { const m = re.exec(s || ''); if (m) return f(m, t); } return t(s); };

export default function SearchBar({ plans, onPick }) {
  const t = useT();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  useOneOpen(open, () => setOpen(false));
  // the index is built once the box is first used (and kept current with the plans from then on)
  const [used, setUsed] = useState(false);
  useEffect(() => { if (open) setUsed(true); }, [open]);
  const index = useMemo(() => (used || open ? buildIndex(plans) : []), [plans, used, open]);
  const [act, setAct] = useState(0);
  const results = useMemo(() => search(index, q), [index, q]);
  const input = useRef(null), list = useRef(null), box = useRef(null);
  const id = useId();

  useEffect(() => { setAct(0); }, [q]);
  // ⌘K / Ctrl K anywhere, or "/" outside a text field, focuses the box
  useEffect(() => {
    const onKey = (e) => {
      const typing = e.target.closest?.('input, textarea, select, [contenteditable="true"]');
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing)) {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  // keep the highlighted result in view
  useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [act]);

  const pick = (r) => {
    if (!r) return;
    setOpen(false);
    input.current?.blur();
    onPick(r);
  };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setAct((i) => Math.min(results.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAct((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(results[act]); }
    else if (e.key === 'Escape') { if (q) setQ(''); else input.current?.blur(); setOpen(false); }
  };
  const show = open && q.trim();

  return (
    <div ref={box} className="pointer-events-auto relative w-[min(16rem,34vw)]">
      <div className={`frost-panel frost-edge frost-thin flex h-10 items-center gap-2 rounded-full pl-3.5 pr-2.5 ${open ? 'ring-1 ring-accent' : ''}`}>
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true" className="shrink-0 text-ink">
          <circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" />
        </svg>
        <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKeyDown}
          type="search" role="combobox" aria-expanded={Boolean(show)} aria-controls={`${id}-list`} aria-autocomplete="list"
          aria-activedescendant={show && results[act] ? `${id}-${act}` : undefined} aria-label={t('Search employees, units, rooms and storage')}
          placeholder={t('Search people, rooms…')} spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-[14px] text-ink-hi outline-none placeholder:text-ink/70 [&::-webkit-search-cancel-button]:hidden" />
        {q ? (
          <button type="button" onClick={() => { setQ(''); input.current?.focus(); }} aria-label={t('Clear search')}
            className="grid size-5 shrink-0 place-items-center rounded-full text-ink hover:text-accent">
            {icon(<path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />)}
          </button>
        ) : (
          <kbd className="shrink-0 font-sans text-[11px] leading-4 text-ink">Ctrl K</kbd>
        )}
      </div>
      {show && (
        <div className="menu-frost absolute bottom-full left-0 right-0 z-40 mb-2 overflow-hidden rounded-[10px]">
          {results.length ? (
            <ul ref={list} id={`${id}-list`} role="listbox" aria-label={t('Search results')} className="no-scrollbar max-h-[min(26rem,60vh)] overflow-y-auto p-0.5">
              {results.map((r, i) => (
                <li key={r.key} id={`${id}-${i}`} role="option" aria-selected={i === act}
                  onPointerDown={(e) => e.preventDefault()} onPointerEnter={() => setAct(i)} onClick={() => pick(r)}
                  className="menu-item flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 leading-4">
                  <span className={`grid size-5 shrink-0 place-items-center rounded-full ${i === act ? 'text-accent' : 'text-ink'}`} title={t(KIND_NAME[r.kind])}>{KIND[r.kind]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] text-ink-hi">{loc(r.title, t)}</span>
                    <span className="block truncate text-[11px] text-ink">{loc(r.sub, t)}</span>
                  </span>
                  <span className="shrink-0 text-right text-[10px] leading-tight text-ink tabular-nums">{loc(r.where, t)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-3 text-[12px] text-ink">{t('No matches for “{q}”', { q: q.trim() })}</p>
          )}
          <p className="border-t border-[color-mix(in_srgb,var(--ink)_18%,transparent)] px-3 py-1.5 text-[10px] text-ink">{t('↑ ↓ to move · Enter to open · Esc to close')}</p>
        </div>
      )}
    </div>
  );
}
