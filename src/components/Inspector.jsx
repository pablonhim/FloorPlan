// Selected-item inspector, the unit legend from the PDF, and the unit's seating roster (kept brief: the
// editing actions and shortcuts live on the bottom bar).
import { useEffect, useState } from 'react';
import { baseSize, footprint } from '../iso/grid.js';
import { SIZES, ZONE_KINDS, PALETTE } from '../model/catalog.js';
import Switch, { ICONS } from './Switch.jsx';

const inputCls = 'w-full rounded-md border border-edge bg-recess px-2 py-1.5 text-[12px] text-ink-hi outline-none focus:border-accent placeholder:text-ink/60';
const capCls = 'text-[10px] uppercase tracking-[.16em] text-ink';

function Field({ label, value, onCommit, placeholder, list }) {
  const [draft, setDraft] = useState(value || '');
  useEffect(() => { setDraft(value || ''); }, [value]);
  const commit = () => { if (draft.trim() !== (value || '')) onCommit(draft.trim()); };
  return (
    <label className="flex flex-col gap-1">
      <span className={capCls}>{label}</span>
      <input value={draft} placeholder={placeholder} list={list} className={inputCls}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { commit(); e.currentTarget.blur(); } if (e.key === 'Escape') { setDraft(value || ''); e.currentTarget.blur(); } }} />
    </label>
  );
}

function NumField({ label, value, onCommit, min = 1, max = 200 }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  const commit = () => {
    const n = Math.round(Number(draft));
    if (Number.isFinite(n) && n >= min && n <= max && n !== value) onCommit(n);
    else setDraft(String(value));
  };
  return (
    <label className="flex flex-col gap-1 flex-1">
      <span className={capCls}>{label}</span>
      <input type="number" min={min} max={max} value={draft} className={`${inputCls} tabular-nums`}
        onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { commit(); e.currentTarget.blur(); } }} />
    </label>
  );
}

const Btn = ({ children, onClick, on, title }) => (
  <button type="button" onClick={onClick} title={title} aria-pressed={on}
    className={`rounded-md border px-2.5 py-1.5 text-[12px] transition-colors ${on ? 'border-accent bg-accent-dim text-accent-hi' : 'border-edge text-ink-hi hover:border-line'}`}>
    {children}
  </button>
);

function Legend({ plan }) {
  return (
    <section className="flex flex-col gap-1.5">
      <div className="truncate text-[13px] text-ink-hi">{plan.title}</div>
      <ol className="space-y-0.5 text-[12px]">
        {plan.legend.map((l, i) => (
          <li key={l} className="flex min-w-0 gap-2"><span className="w-4 shrink-0 text-accent tabular-nums">{i + (plan.legendStart || 1)}</span><span className="truncate text-ink-hi">{l}</span></li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Replace with…: a picker of the objects in the Objects panel (My objects first) that swaps the selected item
 * for the chosen one in its place, in a single step (FloorEditor replaceWith).
 */
function ReplacePicker({ item, custom, showCore, onReplace }) {
  const groups = PALETTE.filter((g) => showCore || !g.core);
  return (
    <label className="flex flex-col gap-1">
      <span className={capCls}>Replace with…</span>
      <select value="" className={inputCls} disabled={item.locked} title={item.locked ? 'Unlock it to replace it' : 'Swap it for another object, in place'}
        onChange={(e) => {
          const v = e.target.value;
          if (v) onReplace(v.startsWith('c:') ? { key: v.slice(2) } : { type: v.slice(2) });
        }}>
        <option value="">{item.locked ? 'Locked' : 'Choose an object'}</option>
        {custom.length > 0 && (
          <optgroup label="My objects">
            {custom.map((c) => <option key={c.key} value={`c:${c.key}`}>{c.label}</option>)}
          </optgroup>
        )}
        {groups.map((g) => (
          <optgroup key={g.group} label={g.group}>
            {g.types.filter((t) => t !== item.type).map((t) => <option key={t} value={`t:${t}`}>{SIZES[t].label}</option>)}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

export default function Inspector({ plan, item, items, patch, resize, select, custom = [], showCore = true, onSave, onReplace }) {
  const [q, setQ] = useState('');
  const teams = [...new Set(items.filter((i) => i.type === 'zone' && ['dept', 'ceo'].includes(i.kind)).map((i) => i.label))];
  const desks = items.filter((i) => i.type === 'desk')
    .filter((d) => !q || `${d.label} ${d.name || ''} ${d.team || ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.team || '~').localeCompare(b.team || '~') || (a.label || '').localeCompare(b.label || ''));
  const all = items.filter((i) => i.type === 'desk');
  const s = item && SIZES[item.type];
  const size = item && baseSize(item);

  return (
    // scrolls up and down only (long text is cut with an ellipsis), fading out at the bottom as it scrolls
    <div className="fade-bottom no-scrollbar flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto overflow-x-hidden pb-10">
      <datalist id="teams">{teams.map((t) => <option key={t} value={t} />)}</datalist>
      {item ? (
        <section className="flex flex-col gap-3">
          <div className="min-w-0">
            <div className="truncate text-[13px] text-ink-hi">
              {s.label}{item.type === 'desk' && item.label ? <span className="text-ink"> · {item.label}</span> : null}
            </div>
            <div className="text-[11px] text-ink tabular-nums">{footprint(item).w * 20}×{footprint(item).d * 20} cm · {item.rot}°</div>
          </div>

          {item.type === 'desk' && (
            <>
              <Field label="Employee" value={item.name} onCommit={(v) => patch({ name: v })} placeholder="Unassigned" />
              <Field label="Team" value={item.team} onCommit={(v) => patch({ team: v })} placeholder="—" list="teams" />
              <Field label="Desk code" value={item.label} onCommit={(v) => patch({ label: v })} placeholder="2C-01" />
              <Field label="Note" value={item.note} onCommit={(v) => patch({ note: v })} placeholder="e.g. 원격 PC" />
              {item.name ? <Btn onClick={() => patch({ name: '', team: '' })}>Unassign seat</Btn> : null}
            </>
          )}
          {item.type === 'zone' && (
            <>
              <Field label="Name" value={item.label} onCommit={(v) => patch({ label: v })} placeholder="Zone" />
              <Field label="English" value={item.en} onCommit={(v) => patch({ en: v })} placeholder="—" />
              <label className="flex flex-col gap-1">
                <span className={capCls}>Kind</span>
                <select value={item.kind || 'dept'} onChange={(e) => patch({ kind: e.target.value })} className={inputCls}>
                  {Object.entries(ZONE_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              {item.kind === 'meeting' && <Switch checked={!!item.on} onChange={(on) => patch({ on })} label="In use" icon={ICONS.inUse} title={item.on ? 'In use' : 'Free'} />}
              {['cafe', 'barista'].includes(item.kind) && <Switch checked={!!item.on} onChange={(on) => patch({ on })} label="Open" icon={ICONS.open} title={item.on ? 'Open' : 'Closed'} />}
            </>
          )}
          {item.type === 'counter' && <Switch checked={!!item.on} onChange={(on) => patch({ on })} label="Open" icon={ICONS.open} title={item.on ? 'Open' : 'Closed'} />}

          {s.sizable && (
            <div className="flex gap-2">
              <NumField label={s.sizable === 'w' ? 'Length (cells)' : 'Width (cells)'} value={size.w} onCommit={(n) => resize(n, null)} />
              {s.sizable.includes('d') && <NumField label="Depth (cells)" value={size.d} onCommit={(n) => resize(null, n)} />}
            </div>
          )}

          <Switch checked={!!item.locked} onChange={(locked) => patch({ locked })} label="Locked" icon={ICONS.lock}
            title={item.locked ? 'Locked: can be selected but not dragged, nudged, rotated or deleted' : 'Unlocked'} />

          {onReplace && <ReplacePicker item={item} custom={custom} showCore={showCore} onReplace={onReplace} />}
          {onSave && <Btn onClick={onSave} title="Keep this object, exactly as it is, in My objects at the top of the Objects panel">Save to Object Panel</Btn>}
        </section>
      ) : (
        <Legend plan={plan} />
      )}

      <section className="flex min-w-0 flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h3 className={capCls.replace('16em', '18em')}>Seating</h3>
          <span className="text-[11px] text-ink tabular-nums">{all.filter((d) => d.name).length}/{all.length}</span>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search desk, name, team" className={inputCls} />
        <ul className="-mx-1">
          {desks.map((d, i) => (
            <li key={d.id}>
              {(i === 0 || desks[i - 1].team !== d.team) && (
                <div className="truncate px-1 pt-2 pb-0.5 text-[10px] uppercase tracking-[.14em] text-ink">{d.team || 'Unassigned / other'}</div>
              )}
              <button type="button" onClick={() => select(d.id)}
                className={`flex w-full min-w-0 items-center gap-2 rounded px-1 py-1 text-left text-[12px] hover:bg-recess ${item?.id === d.id ? 'bg-recess' : ''}`}>
                <span className={`size-1.5 shrink-0 rounded-full ${d.name ? 'bg-accent' : 'bg-detail'}`} />
                <span className="w-12 shrink-0 text-ink tabular-nums">{d.label || '—'}</span>
                <span className={`truncate ${d.name ? 'text-ink-hi' : 'text-ink'}`}>{d.name || d.note || 'unassigned'}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
