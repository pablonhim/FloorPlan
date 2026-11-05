// The objects: a round button in the bottom dock opening a menu of them; drag one onto the floor, or click to stamp repeatedly (Esc to stop).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useOneOpen } from '../lib/oneOpen.js';
import { GripIcon } from './AnimatedIcons.jsx';
import { frame } from '../iso/kernel.js';
import { CELL } from '../iso/units.js';
import { renderItem } from '../iso/render.js';
import { PALETTE, SIZES, NEUTRAL_TYPES, STOOL_COLORS, leadCls, partsFor } from '../model/catalog.js';
import { useT } from '../lib/i18n.js';

// how an item is previewed: as it is placed (plain, not lit up as assigned / in use), only resized to fit; the
// desk as an occupied one, so its thumbnail keeps its monitor (an empty desk has none)
const PREVIEW = { desk: { name: '·' }, counter: { on: true }, zone: { kind: 'dept', label: 'Room' }, wall: { w: 6 }, glass: { w: 6 }, partition: { w: 6 }, table: { w: 9, d: 3 } };

/** An object's thumbnail: a built-in type, or a saved object (`preset`: its exact configuration, as placed). */
export function Preview({ type, preset, big = false }) {
  const item = useMemo(() => ({ id: 'p', type, gx: 0, gy: 0, ...(preset ? { ...preset, rot: 0 } : { rot: 0, ...PREVIEW[type] }) }), [type, preset]);
  const html = useMemo(() => {
    const s = SIZES[type];
    const rot = item.rot % 180, w = (item.w || s.w) * CELL, d = (item.d || s.d) * CELL;
    const W = rot ? d : w, D = rot ? w : d, H = Math.max(s.h, 4);
    // big (the hover square): framed on the corners of the object's own parts (not its whole box), square,
    // with a little margin, so it fills the square as far as it can and never past it
    const corners = big ? partsFor(item).parts.flatMap((q) => [q.x, q.x + q.w].flatMap((x) => [q.y, q.y + q.d].flatMap((y) => [[x, y, q.z], [x, y, q.z + (q.h || 0)]]))) : null;
    const K = big ? frame(corners, 0.06, 1) : frame([[0, 0, 0], [W, 0, 0], [0, D, 0], [W, D, 0], [0, 0, H], [W, 0, H], [0, D, H]], 0.08, 4 / 3);
    return { vb: K.viewBox, svg: renderItem(K, item) };
  }, [type, item, big]);
  return (
    // the same palette as the floor drawing (office-lit at night) and plain item styling, so it looks as placed
    <svg viewBox={html.vb} className={`office-lit w-14 h-10 shrink-0${big ? ' overflow-hidden' : ''}`} aria-hidden="true">
      <g className={`it${NEUTRAL_TYPES.has(type) ? ' cafe' : ''}${leadCls(item)}`} dangerouslySetInnerHTML={{ __html: html.svg }} />
    </svg>
  );
}

const PEEK = 96;   // the hovered object's square, beside the menu (px)


/**
 * The objects, as a round button at the left of the bottom dock: a click opens a menu above it listing every
 * object with its thumbnail, name and size, in groups. Click one to stamp it (again, or Esc, to stop), or
 * drag it onto the floor; the menu steps aside while dragging and closes when the drag ends.
 */
export default function Palette({ placing, setPlacing, showCore, custom = [], onRemoveCustom }) {
  const tr = useT();   // (t is a type in here)
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [peek, setPeek] = useState(null);   // the hovered row's object, shown larger in a square beside the menu: { t, preset, y }
  useEffect(() => { if (!open) setPeek(null); }, [open]);
  useOneOpen(open, () => setOpen(false));
  const box = useRef(null);
  const quiet = useRef(false);   // true while the menu focuses its first row on opening (no preview then)
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    quiet.current = true;   // the first row takes focus as the menu opens: no preview for that
    box.current?.querySelector('[role=menu] [role=menuitem]')?.focus();
    quiet.current = false;
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const onKey = (e) => {   // arrow keys move through the rows
    const list = [...(box.current?.querySelectorAll('[role=menu] [role=menuitem]') || [])], i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
  };

  const mine = custom.filter((c) => showCore || !PALETTE.some((g) => g.core && g.types.includes(c.preset.type)));
  const groups = PALETTE.filter((g) => (showCore || !g.core) && g.panel !== false);
  const size = (s) => `${s.w * 20}×${s.d * 20} cm`;

  // a built-in type, or a ready-made variant / saved object `c` ({ key, label, preset }): placed with its preset
  // and rotation
  const props = (t, c) => {
    const active = c ? placing?.key === c.key : placing?.type === t && !placing?.key;
    const start = (via) => (c ? { type: t, rot: c.preset.rot || 0, preset: c.preset, key: c.key, via } : { type: t, rot: 0, via });
    return {
      type: 'button', role: 'menuitem', draggable: true, 'aria-current': active || undefined,
      onDragStart: (e) => {
        e.dataTransfer.setData('text/plain', t);
        e.dataTransfer.effectAllowed = 'copy';
        setPlacing(start('drag'));
        setDragging(true);
        setPeek(null);
      },
      onDragEnd: () => { setPlacing((p) => (p?.via === 'drag' ? null : p)); setDragging(false); setOpen(false); },
      onClick: () => { setPlacing(active ? null : start('click')); setOpen(false); },
      className: `menu-item flex w-full items-center gap-2 rounded-md py-0.5 pl-1 pr-2 text-left outline-none cursor-grab ${active ? 'on text-accent-hi' : 'text-ink-hi'}`,
    };
  };
  // the stool's colours, as swatches on its row (each places a stool in that colour, by click or drag)
  const stoolOf = (color) => (color ? { key: `stool-${color}`, label: tr('{x} stool', { x: tr(STOOL_COLORS.find((k) => k.color === color).label) }), preset: { type: 'stool', color } } : null);
  const swatches = (
    <span role="group" aria-label={tr('Stool colour')} className="absolute right-1.5 top-1/2 flex -translate-y-1/2 gap-1">
      {/* each colour a swatch; the selected one (being placed) gets a double ring: a white gap, then its colour */}
      {STOOL_COLORS.map(({ color, label, swatch }) => {
        const c = stoolOf(color), { className, role, ...rest } = props('stool', c);   // eslint-disable-line no-unused-vars
        return (
          <button key={color || 'natural'} {...rest} aria-label={color ? c.label : tr(label)} title={tr(label)}
            onMouseEnter={(e) => look(e, 'stool', c)} onFocus={(e) => look(e, 'stool', c)}
            className="size-3.5 cursor-grab rounded-full transition-transform hover:scale-125 focus-visible:scale-125 focus-visible:outline-none"
            style={{ background: swatch, boxShadow: rest['aria-current'] ? `0 0 0 1.5px #fff, 0 0 0 3px ${swatch}` : undefined }} />
        );
      })}
    </span>
  );
  const row = (key, t, c, label, s, own = false) => (
    <div key={key} className="group relative">
      <button {...props(t, c)} aria-label={`${label} · ${size(s)}`} onMouseEnter={(e) => look(e, t, c)} onFocus={(e) => look(e, t, c)}>
        <span className="pal-thumb grid h-7 w-9 shrink-0 place-items-center"><Preview type={t} preset={c?.preset} /></span>
        <span className="min-w-0 flex-1 truncate text-[12px]">{label}</span>
        {t === 'stool' && !c ? <span className="w-[6.5rem] shrink-0" aria-hidden="true" /> : <span className="shrink-0 text-[11px] text-ink tabular-nums">{size(s)}</span>}
      </button>
      {t === 'stool' && !c && swatches}
      {own && (
        <button type="button" aria-label={tr('Remove {x} from My objects', { x: c.label })} title={tr('Remove from My objects')}
          onClick={() => onRemoveCustom?.(c.key)}
          className="absolute right-1 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full bg-[color-mix(in_srgb,var(--ink)_14%,transparent)] text-[11px] leading-none text-ink opacity-0 transition-opacity hover:text-ink-hi focus:opacity-100 group-hover:opacity-100">×</button>
      )}
    </div>
  );
  // each section's small heading; the sections are set apart by a little space (mt on the one after)
  const head = (label) => <div className="px-2 pb-0.5 pt-1.5 text-[10px] font-medium uppercase tracking-[.14em] text-ink">{label}</div>;
  const placingNow = Boolean(placing && placing.via === 'click');
  // the square sits just right of the menu, centred on the hovered row (kept from running below the button)
  const look = (e, t, c) => {
    if (quiet.current) return;
    const r = e.currentTarget.getBoundingClientRect(), b = box.current.getBoundingClientRect();
    setPeek({ t, preset: c?.preset, y: Math.min(r.top + r.height / 2 - b.top, -PEEK / 2 - 8) });
  };

  return (
    <div ref={box} className="relative" onKeyDown={onKey}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={tr('Objects')} title={tr('Objects')} onClick={() => setOpen((o) => !o)}
        className={`pop-ico frost-panel frost-edge frost-thin grid size-10 place-items-center rounded-full transition-colors ${open || placingNow ? 'text-accent' : 'text-ink-hi hover:text-accent'}`}>
        <span className="ico"><GripIcon size={17} /></span>
      </button>
      {open && (
        <div role="menu" aria-label={tr('Objects')} onMouseLeave={() => setPeek(null)}
          className={`menu-frost see-through menu-pop-up no-scrollbar absolute bottom-full left-0 z-30 mb-2 max-h-[min(70vh,34rem)] w-64 overflow-y-auto rounded-[12px] p-1 ${dragging ? 'pointer-events-none opacity-0' : ''}`}
          style={{ transformOrigin: '20px 100%' }}>
          {mine.length > 0 && <div role="group" aria-label={tr('My objects')} className="[&+div]:mt-2.5">{head(tr('My objects'))}{mine.map((c) => {
            const s = SIZES[c.preset.type];
            return row(c.key, c.preset.type, c, c.label, { ...s, w: c.preset.w || s.w, d: c.preset.d || s.d }, true);
          })}</div>}
          {groups.map(({ group, types }) => (
            <div key={group} role="group" aria-label={tr(group)} className="[&+div]:mt-2.5">
              {head(tr(group))}
              {types.map((e) => {
                if (typeof e === 'string') return row(e, e, null, tr(SIZES[e].label), SIZES[e]);
                const s = SIZES[e.type];
                return row(e.key, e.type, { ...e, label: tr(e.label) }, tr(e.label), { ...s, w: e.preset.w || s.w, d: e.preset.d || s.d });
              })}
            </div>
          ))}
        </div>
      )}
      {open && peek && !dragging && (
        <div aria-hidden="true" className="menu-frost see-through pointer-events-none absolute left-[calc(16rem+0.5rem)] z-30 grid -translate-y-1/2 place-items-center overflow-hidden rounded-[12px] p-1.5"
          style={{ top: peek.y, width: PEEK, height: PEEK }}>
          <span key={peek.preset ? JSON.stringify(peek.preset) : peek.t} className="pal-thumb peek-in grid size-full place-items-center"><Preview type={peek.t} preset={peek.preset} big /></span>
        </div>
      )}
    </div>
  );
}
