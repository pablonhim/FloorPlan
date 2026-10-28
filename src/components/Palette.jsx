// Element palette: drag onto the floor, or click to stamp repeatedly (Esc to stop).
import { useMemo } from 'react';
import { frame } from '../iso/kernel.js';
import { CELL } from '../iso/units.js';
import { renderItem } from '../iso/render.js';
import { PALETTE, SIZES } from '../model/catalog.js';

const PREVIEW = { desk: { name: '이름' }, counter: { on: true }, zone: { kind: 'meeting', label: 'Room', on: true }, wall: { w: 6 }, glass: { w: 6 }, partition: { w: 6 }, table: { w: 9, d: 3 } };

function Preview({ type }) {
  const html = useMemo(() => {
    const s = SIZES[type];
    const item = { id: 'p', type, gx: 0, gy: 0, rot: 0, ...PREVIEW[type] };
    const W = (item.w || s.w) * CELL, D = (item.d || s.d) * CELL, H = Math.max(s.h, 4);
    const K = frame([[0, 0, 0], [W, 0, 0], [0, D, 0], [W, D, 0], [0, 0, H], [W, 0, H], [0, D, H]], 0.08, 4 / 3);
    return { vb: K.viewBox, svg: renderItem(K, item) };
  }, [type]);
  return (
    <svg viewBox={html.vb} className="w-14 h-10 shrink-0" aria-hidden="true">
      <g className="it live" dangerouslySetInnerHTML={{ __html: html.svg }} />
    </svg>
  );
}

export default function Palette({ placing, setPlacing, showCore }) {
  return (
    <div className="flex flex-col gap-4">
      {PALETTE.filter((g) => showCore || !g.core).map(({ group, types }) => (
        <section key={group}>
          <h3 className="text-[10px] uppercase tracking-[.18em] text-ink mb-1.5">{group}</h3>
          <div className="flex flex-col gap-1">
            {types.map((t) => {
              const s = SIZES[t];
              const active = placing?.type === t;
              return (
                <button
                  key={t}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', t);
                    e.dataTransfer.effectAllowed = 'copy';
                    setPlacing({ type: t, rot: 0, via: 'drag' });
                  }}
                  onDragEnd={() => setPlacing((p) => (p?.via === 'drag' ? null : p))}
                  onClick={() => setPlacing(active ? null : { type: t, rot: 0, via: 'click' })}
                  aria-pressed={active}
                  className={`flex items-center gap-2.5 rounded-md border px-2 py-1 text-left transition-colors cursor-grab
                    ${active ? 'border-accent bg-accent-dim text-ink-hi' : 'border-edge hover:border-line text-ink-hi'}`}
                >
                  <Preview type={t} />
                  <span className="flex flex-col leading-tight">
                    <span className="text-[12px]">{s.label}{s.km ? <span className="text-ink"> · {s.km}</span> : null}</span>
                    <span className="text-[10px] text-ink tabular-nums">{s.kr ? `${s.kr} · ` : ''}{s.w * 20}×{s.d * 20} cm{s.sizable ? ' · sizable' : ''}</span>
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
