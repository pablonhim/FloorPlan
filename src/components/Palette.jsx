// Element palette: drag onto the floor, or click to stamp repeatedly (Esc to stop).
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { frame } from '../iso/kernel.js';
import { CELL } from '../iso/units.js';
import { renderItem } from '../iso/render.js';
import { PALETTE, SIZES, NEUTRAL_TYPES, leadCls } from '../model/catalog.js';

// how an item is previewed: as it is placed (plain, not lit up as assigned / in use), only resized to fit
const PREVIEW = { counter: { on: true }, zone: { kind: 'dept', label: 'Room' }, wall: { w: 6 }, glass: { w: 6 }, partition: { w: 6 }, table: { w: 9, d: 3 } };

/** An object's thumbnail: a built-in type, or a saved object (`preset`: its exact configuration, as placed). */
export function Preview({ type, preset }) {
  const item = useMemo(() => ({ id: 'p', type, gx: 0, gy: 0, ...(preset ? { ...preset, rot: 0 } : { rot: 0, ...PREVIEW[type] }) }), [type, preset]);
  const html = useMemo(() => {
    const s = SIZES[type];
    const rot = item.rot % 180, w = (item.w || s.w) * CELL, d = (item.d || s.d) * CELL;
    const W = rot ? d : w, D = rot ? w : d, H = Math.max(s.h, 4);
    const K = frame([[0, 0, 0], [W, 0, 0], [0, D, 0], [W, D, 0], [0, 0, H], [W, 0, H], [0, D, H]], 0.08, 4 / 3);
    return { vb: K.viewBox, svg: renderItem(K, item) };
  }, [type, item]);
  return (
    // the same palette as the floor drawing (office-lit at night) and plain item styling, so it looks as placed
    <svg viewBox={html.vb} className="office-lit w-14 h-10 shrink-0" aria-hidden="true">
      <g className={`it${NEUTRAL_TYPES.has(type) ? ' cafe' : ''}${leadCls(item)}`} dangerouslySetInnerHTML={{ __html: html.svg }} />
    </svg>
  );
}

export default function Palette({ placing, setPlacing, showCore, collapsed = false, custom = [], onRemoveCustom }) {
  const [tip, setTip] = useState(null);   // collapsed: the hovered icon's card { s, x, y }
  useEffect(() => {   // no stale card after expanding, or while the list scrolls under the pointer
    setTip(null);
    if (!collapsed) return undefined;
    const off = () => setTip(null);
    window.addEventListener('scroll', off, true);
    return () => window.removeEventListener('scroll', off, true);
  }, [collapsed]);
  // a built-in type, or a saved object `c` ({ key, label, preset }): placed with its preset and rotation
  const props = (t, c) => {
    const active = c ? placing?.key === c.key : placing?.type === t && !placing?.key;
    const start = (via) => (c ? { type: t, rot: c.preset.rot || 0, preset: c.preset, key: c.key, via } : { type: t, rot: 0, via });
    return {
      type: 'button', draggable: true, 'aria-pressed': active,
      onDragStart: (e) => {
        e.dataTransfer.setData('text/plain', t);
        e.dataTransfer.effectAllowed = 'copy';
        setPlacing(start('drag'));
      },
      onDragEnd: () => setPlacing((p) => (p?.via === 'drag' ? null : p)),
      onClick: () => setPlacing(active ? null : start('click')),
    };
  };
  const tone = (t, c) => ((c ? placing?.key === c.key : placing?.type === t && !placing?.key) ? 'bg-accent-dim ring-1 ring-accent' : 'hover:bg-accent-dim');
  const mine = custom.filter((c) => showCore || !PALETTE.some((g) => g.core && g.types.includes(c.preset.type)));
  const size = (s) => `${s.w * 20}×${s.d * 20} cm${s.sizable ? ' · sizable' : ''}`;
  const groups = PALETTE.filter((g) => showCore || !g.core);

  // collapsed: just the icons in one column, groups set apart by thin lines; hovering (or focusing) one shows
  // a frosted card beside it with its name and size — drawn on the page itself, pinned to the icon, so the
  // scrolling, fading list cannot clip it
  if (collapsed) {
    const show = (e, s) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ s, x: r.right + 12, y: r.top + r.height / 2 }); };
    return (
      <div className="flex flex-col items-center gap-1">
        {mine.length > 0 && (
          <div role="group" aria-label="My objects" className="flex flex-col items-center gap-1">
            {mine.map((c) => (
              <button key={c.key} {...props(c.preset.type, c)} aria-label={c.label}
                onMouseEnter={(e) => show(e, { label: c.label, w: c.preset.w || SIZES[c.preset.type].w, d: c.preset.d || SIZES[c.preset.type].d })}
                onFocus={(e) => show(e, { label: c.label, w: c.preset.w || SIZES[c.preset.type].w, d: c.preset.d || SIZES[c.preset.type].d })}
                onMouseLeave={() => setTip(null)} onBlur={() => setTip(null)} onDragStartCapture={() => setTip(null)}
                className={`grid place-items-center rounded-lg p-0.5 transition-colors cursor-grab ${tone(c.preset.type, c)}`}>
                <Preview type={c.preset.type} preset={c.preset} />
              </button>
            ))}
            <span className="my-1 block h-px w-6 bg-[color-mix(in_srgb,var(--ink)_30%,transparent)]" aria-hidden="true" />
          </div>
        )}
        {tip && createPortal(
          <div role="tooltip" className="pointer-events-none fixed z-50 -translate-y-1/2 whitespace-nowrap rounded-lg frost-panel frost-edge px-2.5 py-1.5 text-left text-[11px] leading-snug"
            style={{ left: tip.x, top: tip.y }}>
            <span className="block font-semibold text-ink-hi">{tip.s.label}</span>
            <span className="block text-ink tabular-nums">{size(tip.s)}</span>
          </div>, document.body)}
        {groups.map(({ group, types }, gi) => (
          <div key={group} role="group" aria-label={group} className="flex flex-col items-center gap-1">
            {gi > 0 && <span className="my-1 block h-px w-6 bg-[color-mix(in_srgb,var(--ink)_30%,transparent)]" aria-hidden="true" />}
            {types.map((t) => {
              const s = SIZES[t];
              return (
                <button key={t} {...props(t)} aria-label={`${s.label} · ${size(s)}`}
                  onMouseEnter={(e) => show(e, s)} onFocus={(e) => show(e, s)} onMouseLeave={() => setTip(null)} onBlur={() => setTip(null)}
                  onDragStartCapture={() => setTip(null)}
                  className={`grid place-items-center rounded-lg p-0.5 transition-colors cursor-grab ${tone(t)}`}>
                  <Preview type={t} />
                </button>
              );
            })}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {mine.length > 0 && (
        <section>
          <h3 className="text-[10px] uppercase tracking-[.18em] text-ink mb-0.5 pl-1.5">My objects</h3>
          <div className="flex flex-col gap-0.5">
            {mine.map((c) => {
              const s = SIZES[c.preset.type];
              return (
                <div key={c.key} className="group relative">
                  <button {...props(c.preset.type, c)}
                    className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-0.5 pr-6 text-left text-ink-hi transition-colors cursor-grab ${tone(c.preset.type, c)}`}>
                    <Preview type={c.preset.type} preset={c.preset} />
                    <span className="flex min-w-0 flex-col leading-tight">
                      <span className="truncate text-[12px]">{c.label}</span>
                      <span className="text-[10px] text-ink tabular-nums">{size({ ...s, w: c.preset.w || s.w, d: c.preset.d || s.d })}</span>
                    </span>
                  </button>
                  <button type="button" aria-label={`Remove ${c.label} from My objects`} title="Remove from My objects"
                    onClick={() => onRemoveCustom?.(c.key)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 rounded px-1 text-[13px] leading-none text-ink opacity-0 transition-opacity hover:text-ink-hi focus:opacity-100 group-hover:opacity-100">×</button>
                </div>
              );
            })}
          </div>
        </section>
      )}
      {groups.map(({ group, types }) => (
        <section key={group}>
          <h3 className="text-[10px] uppercase tracking-[.18em] text-ink mb-0.5 pl-1.5">{group}</h3>
          <div className="flex flex-col gap-0.5">
            {types.map((t) => {
              const s = SIZES[t];
              return (
                <button key={t} {...props(t)}
                  className={`flex items-center gap-2 rounded-lg px-1.5 py-0.5 text-left text-ink-hi transition-colors cursor-grab ${tone(t)}`}>
                  <Preview type={t} />
                  <span className="flex flex-col leading-tight">
                    {/* name and size only: other-language names come with the language toggle */}
                    <span className="text-[12px]">{s.label}</span>
                    <span className="text-[10px] text-ink tabular-nums">{size(s)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
