// History: a frosted drawer from the right edge with two lists — Edits (every change to a unit's layout:
// placing, moving, assigning, resets and undos; kept in this browser) and Releases (the app's own
// revisions, from the commits it was built from). An edit opens its unit with the camera on the item.
import { useEffect, useMemo, useRef, useState } from 'react';
import { PLANS } from '../model/floors.js';
import { icon } from './SceneButton.jsx';
import { getLang, useLang, useT } from '../lib/i18n.js';

/* global __REVISIONS__ */
const REVISIONS = typeof __REVISIONS__ !== 'undefined' ? __REVISIONS__ : [];

// dates and times in the display language's own format
const day = (t) => new Date(t).toLocaleDateString(getLang(), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const time = (t) => new Date(t).toLocaleTimeString(getLang(), { hour: '2-digit', minute: '2-digit' });
const ACTION = { add: 'Added', move: 'Moved', resize: 'Resized', rotate: 'Rotated', patch: 'Edited', remove: 'Removed', reset: 'Reset', undo: 'Undo' };

/** [[dayLabel, entries]] newest first. */
function byDay(entries, at) {
  const out = [];
  for (const e of entries) {
    const d = day(at(e));
    if (out.at(-1)?.[0] === d) out.at(-1)[1].push(e); else out.push([d, [e]]);
  }
  return out;
}

export default function HistoryPanel({ open, onClose, log, onOpenEntry, onClear }) {
  const [lang] = useLang();
  const t = useT();
  const [tab, setTab] = useState('edits');
  const [unit, setUnit] = useState('all');
  const panel = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => { if (e.key === 'Escape') close.current(); };
    document.addEventListener('keydown', esc);
    panel.current?.querySelector('[role="tab"][aria-selected="true"]')?.focus();
    return () => document.removeEventListener('keydown', esc);
  }, [open]);

  const units = useMemo(() => [...new Set(log.map((e) => e.plan).filter((p) => PLANS[p]))].sort(), [log]);
  const edits = useMemo(() => byDay(log.filter((e) => unit === 'all' || e.plan === unit).slice().reverse(), (e) => e.t), [log, unit, lang]);   // eslint-disable-line react-hooks/exhaustive-deps
  const releases = useMemo(() => byDay(REVISIONS, (r) => r.date), [lang]);   // eslint-disable-line react-hooks/exhaustive-deps

  const tabCls = (on) => `flex-1 rounded-full px-3 py-1 text-[12px] ${on ? 'bg-accent-dim text-accent' : 'text-ink-hi hover:text-accent'}`;
  const dayHead = (d) => <h4 className="sticky top-0 z-10 bg-[color-mix(in_srgb,var(--panel)_70%,transparent)] px-1 py-1 text-[10px] uppercase tracking-[.14em] text-ink backdrop-blur-sm">{d}</h4>;

  return (
    <aside ref={panel} inert={!open} aria-hidden={!open} aria-label={t('History')}
      className={`menu-frost fixed bottom-3 right-3 top-[3.75rem] z-50 flex w-[22rem] max-w-[calc(100vw-1.5rem)] flex-col rounded-2xl transition-[translate,opacity,visibility] motion-reduce:transition-none ${open ? 'visible translate-x-0 opacity-100 duration-[380ms] ease-[cubic-bezier(.22,1,.36,1)]' : 'invisible translate-x-[calc(100%+1rem)] opacity-0 duration-[240ms] ease-in'}`}>
      <div className="flex items-center gap-2 border-b border-[color-mix(in_srgb,var(--ink)_18%,transparent)] px-3 py-2">
        <span className="flex-1 text-[13px] font-medium text-ink-hi">{t('History')}</span>
        <button type="button" onClick={onClose} aria-label={t('Close history')} title={t('Close · Esc')}
          className="grid size-7 place-items-center rounded-full text-ink hover:bg-accent-dim hover:text-accent">
          {icon(<path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />)}
        </button>
      </div>
      <div role="tablist" aria-label={t('History lists')} className="mx-3 mt-2 flex gap-1 rounded-full border border-edge p-0.5">
        <button type="button" role="tab" aria-selected={tab === 'edits'} onClick={() => setTab('edits')} className={tabCls(tab === 'edits')}>
          {t('Edits')} <span className="tabular-nums text-ink">{log.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === 'releases'} onClick={() => setTab('releases')} className={tabCls(tab === 'releases')}>
          {t('Releases')} <span className="tabular-nums text-ink">{REVISIONS.length}</span>
        </button>
      </div>

      {tab === 'edits' ? (
        <>
          {/* filter by unit: only units that have changes */}
          <div className="no-scrollbar mx-3 mt-2 flex gap-1 overflow-x-auto">
            {['all', ...units].map((u) => (
              <button key={u} type="button" onClick={() => setUnit(u)} aria-pressed={unit === u}
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] tabular-nums ${unit === u ? 'border-accent text-accent' : 'border-edge text-ink-hi hover:border-accent'}`}>
                {u === 'all' ? t('All units') : `${PLANS[u].floor}F · ${PLANS[u].unit}`}
              </button>
            ))}
          </div>
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2 pt-1">
            {edits.length ? edits.map(([d, es]) => (
              <section key={d}>
                {dayHead(d)}
                <ul className="flex flex-col">
                  {es.map((e) => (
                    <li key={`${e.t}-${e.plan}-${e.id || e.action}`}>
                      <button type="button" onClick={() => onOpenEntry(e)} disabled={!PLANS[e.plan]}
                        title={PLANS[e.plan] ? t('Open floor {n} unit {u}', { n: PLANS[e.plan].floor, u: PLANS[e.plan].unit }) : undefined}
                        className="menu-item flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left outline-none">
                        <span className="w-10 shrink-0 pt-px text-[11px] text-ink tabular-nums">{time(e.t)}</span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-[12px] leading-snug ${e.action === 'undo' || e.action === 'remove' ? 'text-ink-hi/80' : 'text-ink-hi'}`}>{e.text}</span>
                          <span className="block text-[10px] text-ink">
                            {PLANS[e.plan] ? t('Floor {n} · Unit {u}', { n: PLANS[e.plan].floor, u: PLANS[e.plan].unit }) : t('Building')} · {ACTION[e.action] ? t(ACTION[e.action]) : e.action}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )) : (
              <p className="px-2 py-6 text-center text-[12px] leading-relaxed text-ink">
                {t('No edits yet.')}<br />{t('Changes to a unit (placing, moving, assigning seats) are listed here.')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 border-t border-[color-mix(in_srgb,var(--ink)_18%,transparent)] px-3 py-2">
            <span className="flex-1 text-[10px] leading-snug text-ink">{t('Kept in this browser with the layout.')}</span>
            <button type="button" disabled={!log.length}
              onClick={() => { if (confirm(t('Clear the edit history? The layout itself stays as it is.'))) onClear(); }}
              className="rounded-full border border-edge px-2.5 py-0.5 text-[11px] text-ink-hi hover:border-accent hover:text-accent disabled:opacity-40 disabled:hover:border-edge disabled:hover:text-ink-hi">
              {t('Clear')}
            </button>
          </div>
        </>
      ) : (
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2 pt-1">
          {releases.length ? releases.map(([d, rs]) => (
            <section key={d}>
              {dayHead(d)}
              <ul className="flex flex-col">
                {rs.map((r, i) => (
                  <li key={r.hash} className="flex items-start gap-2 rounded-xl px-2 py-1.5">
                    <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${d === releases[0][0] && i === 0 ? 'bg-accent' : 'bg-detail'}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] leading-snug text-ink-hi">{r.subject}</span>
                      <span className="block text-[10px] text-ink tabular-nums">{time(r.date)} · {r.hash}{d === releases[0][0] && i === 0 ? ` · ${t('this version')}` : ''}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )) : (
            <p className="px-2 py-6 text-center text-[12px] text-ink">{t('No release notes in this build.')}</p>
          )}
        </div>
      )}
    </aside>
  );
}
