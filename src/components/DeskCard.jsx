// The desk card: a small frosted card beside the selected desk, to assign it on the spot. The employee's
// profile picture (click it to upload one, then drag and zoom to frame the face: saved as a small square JPEG
// kept on the desk) and
// their name (Enter or leaving the field saves it; Escape puts it back). It follows the desk while the
// camera pans and zooms, and keeps to the side of the desk with room for it.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { animalOf } from '../iso/render.js';
import { icon } from './SceneButton.jsx';
import { useT } from '../lib/i18n.js';

const W = 224, BW = 92, NOTCH = 7, GAP = 8, EDGE = 12;   // the card's width; as a grown name bubble, its width and its tip
const camera = icon(<><path d="M2.5 5.5h2.2l1-1.5h4.6l1 1.5h2.2v7h-11z" /><circle cx="8" cy="8.8" r="2.2" /></>);

/** The picked file as a loaded image (its object URL is revoked by the cropper). */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => { URL.revokeObjectURL(img.src); reject(new Error('not an image')); };
    img.src = URL.createObjectURL(file);
  });
}

const V = 208, OUT = 128, ZMAX = 5;   // the crop window (px), the saved picture (px), the closest zoom

/**
 * The crop step after a picture is picked: a square window over the image, which is dragged to place it and
 * zoomed with the slider or the wheel (always covering the window). It starts top-aligned, where the face
 * is in a whole-body shot. Save draws the framed square into a 128 px JPEG.
 */
function Cropper({ img, onSave, onCancel }) {
  const t = useT();
  const nw = img.naturalWidth, nh = img.naturalHeight, base = V / Math.min(nw, nh);
  const clamp = (o, z) => {
    const k = base * z;
    return { x: Math.min(0, Math.max(V - nw * k, o.x)), y: Math.min(0, Math.max(V - nh * k, o.y)) };
  };
  const [z, setZ] = useState(1);
  const [o, setO] = useState(() => clamp({ x: (V - nw * base) / 2, y: 0 }, 1));
  const view = useRef(null), drag = useRef(null), now = useRef({ z, o });
  now.current = { z, o };
  useEffect(() => () => URL.revokeObjectURL(img.src), [img]);
  /** zoom to z2 about the window's centre */
  const zoom = (z2) => {
    const { z: z1, o: o1 } = now.current, c = V / 2;
    z2 = Math.max(1, Math.min(ZMAX, z2));
    setZ(z2);
    setO(clamp({ x: c - (c - o1.x) * (z2 / z1), y: c - (c - o1.y) * (z2 / z1) }, z2));
  };
  useEffect(() => {   // the wheel zooms (a native listener: React's is passive and the page would scroll)
    const el = view.current;
    const onWheel = (e) => { e.preventDefault(); zoom(now.current.z * Math.exp(-e.deltaY * 0.002)); };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const save = () => {
    const k = base * z, c = document.createElement('canvas');
    c.width = c.height = OUT;
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, OUT, OUT);
    x.imageSmoothingQuality = 'high';
    x.drawImage(img, -o.x / k, -o.y / k, V / k, V / k, 0, 0, OUT, OUT);
    onSave(c.toDataURL('image/jpeg', 0.88));
  };
  const k = base * z;
  return (
    <div className="flex flex-col gap-2.5" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } }}>
      <span className="text-[12px] font-medium text-ink-hi">{t('Frame the face')}</span>
      <div ref={view} role="img" aria-label={t('Drag to move the picture; the slider or the wheel zooms')}
        className="relative cursor-grab touch-none select-none overflow-hidden rounded-lg bg-[color-mix(in_srgb,var(--ink)_9%,transparent)] active:cursor-grabbing"
        style={{ width: V, height: V }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { sx: e.clientX, sy: e.clientY, o }; }}
        onPointerMove={(e) => { const d = drag.current; if (d) setO(clamp({ x: d.o.x + e.clientX - d.sx, y: d.o.y + e.clientY - d.sy }, z)); }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        <img src={img.src} alt="" draggable={false} className="pointer-events-none absolute left-0 top-0 max-w-none"
          style={{ width: nw * k, height: nh * k, transform: `translate(${o.x}px, ${o.y}px)` }} />
        {/* thirds, to help centre the face */}
        <div className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-inset ring-white/70"
          style={{ backgroundImage: 'linear-gradient(to right, transparent 33.2%, rgb(255 255 255 / .45) 33.3%, transparent 33.6%, transparent 66.5%, rgb(255 255 255 / .45) 66.6%, transparent 66.9%), linear-gradient(to bottom, transparent 33.2%, rgb(255 255 255 / .45) 33.3%, transparent 33.6%, transparent 66.5%, rgb(255 255 255 / .45) 66.6%, transparent 66.9%)' }} />
      </div>
      <label className="flex items-center gap-2 text-ink">
        <span className="text-[11px]">{t('Zoom')}</span>
        <input type="range" min={1} max={ZMAX} step={0.01} value={z} onChange={(e) => zoom(Number(e.target.value))}
          aria-label={t('Zoom')} className="min-w-0 flex-1 accent-[var(--accent)]" />
      </label>
      <div className="flex justify-end gap-1">
        <button type="button" onClick={onCancel} className="menu-item rounded-md px-2.5 py-1 text-[12px] text-ink-hi outline-none">{t('Cancel')}</button>
        <button type="button" onClick={save} autoFocus
          className="rounded-md bg-accent px-3 py-1 text-[12px] font-medium text-white outline-none hover:brightness-110 focus-visible:ring-2 focus-visible:ring-accent/40">{t('Save')}</button>
      </div>
    </div>
  );
}

/** readOnly (a Viewer): the picture and name only, nothing to change. */
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

/**
 * A name bubble's sizes on screen (render.renderDeskCallouts, at the camera's zoom and any hover lift): its card
 * width, padding and corner, the picture, the name's gap, size and line, and its tip. The grown card starts at
 * exactly these and eases each one to its own, so the bubble itself seems to grow (and shrinks back the same way).
 */
function bubbleMetrics(b) {
  // the top-down name badge (render.renderDeskCallouts, top view): no picture, the name alone on a frosted badge
  const badge = b?.querySelector('.top-badge');
  if (badge && badge.offsetWidth) {
    const k = badge.getBoundingClientRect().width / badge.offsetWidth, bs = getComputedStyle(badge), nm = badge.querySelector('span');
    const fs = parseFloat(bs.fontSize) * k, H = badge.offsetHeight * k, nameH = (nm?.offsetHeight || parseFloat(bs.fontSize)) * k;
    const n = parseFloat(bs.getPropertyValue('--n')) * k || 4 * k;
    return { w: badge.offsetWidth * k, pt: (H - nameH) / 2, px: parseFloat(bs.paddingLeft) * k, pb: (H - nameH) / 2, r: parseFloat(bs.borderTopLeftRadius) * k,
      pic: 0, gap: 0, fs, nameH, nw: n * 2.2, nh: n };
  }
  const card = b?.querySelector('.callout-card'), pic = b?.querySelector('.callout-pic'), nm = b?.querySelector('.callout-name'), tip = b?.querySelector('.callout-notch');
  if (!card || !pic || !nm || !card.offsetWidth) return null;
  const k = card.getBoundingClientRect().width / card.offsetWidth, cs = getComputedStyle(card), ns = getComputedStyle(nm);
  return {
    w: card.offsetWidth * k, pt: parseFloat(cs.paddingTop) * k, px: parseFloat(cs.paddingLeft) * k, pb: parseFloat(cs.paddingBottom) * k,
    r: parseFloat(cs.borderTopLeftRadius) * k, pic: pic.offsetWidth * k, gap: parseFloat(ns.marginTop) * k,
    fs: parseFloat(ns.fontSize) * k, nameH: nm.offsetHeight * k, nw: (tip?.offsetWidth || 12) * k, nh: (tip?.offsetHeight || 5) * k,
  };
}

/** closing: the card just closed, shrinking back into its bubble (or into the desk's side) before it goes. */
export default function DeskCard({ desk, svgRef, stageRef, patch, readOnly = false, closing = false, onClosed }) {
  const t = useT();
  const card = useRef(null), file = useRef(null), input = useRef(null);
  const [draft, setDraft] = useState(desk.name || '');
  const [err, setErr] = useState('');
  const [crop, setCrop] = useState(null);   // a picked picture being framed (Cropper)
  // an assigned seat opened from (or with) its name bubble: the card is that bubble grown big — the same shape
  // and layout (picture over the name, a tip under it), the name now a text field — instead of a side card
  const bubbleSel = `.desk-callouts .desk-callout[data-for="${CSS.escape(desk.id)}"]`;
  const [fromBubble] = useState(() => Boolean(svgRef.current?.querySelector(bubbleSel)));
  const CW = fromBubble ? BW : W;
  const [m] = useState(() => (fromBubble ? bubbleMetrics(svgRef.current?.querySelector(bubbleSel)) : null));
  // small: at the bubble's own sizes. Opening starts small and grows; closing starts grown and goes small, then
  // tells the editor it is done (onTransitionEnd) so the bubble shows again in its place
  const [small, setSmall] = useState(Boolean(m) && !closing);
  useEffect(() => {
    if (!m) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setSmall(false); if (closing) onClosed?.(); return undefined; }
    let r2 = 0;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setSmall(closing)); });   // after a frame at the start size
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setDraft(desk.name || ''); setErr(''); }, [desk.id, desk.name]);

  // Placed every frame while open (the camera moves the drawing with CSS transforms). An assigned seat's name
  // bubble turns into the card: the bubble hides and the card stands where it was, centred on it with its
  // tip on the bubble's tip, and grows out of the bubble's own sizes (small → full, below). A seat with no
  // bubble gets the card beside the desk, popping out of its side (desk-pop). Where the bubble sat relative to
  // the desk is kept, so the card stays put if the seat is unassigned while it is open.
  useLayoutEffect(() => {
    let raf = 0, at = null;   // at: the bubble's tip as a share of the desk's box { x, y }
    const sel = bubbleSel;
    const place = () => {
      const el = card.current, stage = stageRef.current, g = svgRef.current?.querySelector(`g[data-id="${CSS.escape(desk.id)}"]`);
      if (el && stage && g) {
        const s = stage.getBoundingClientRect(), r = g.getBoundingClientRect(), h = el.offsetHeight, w = el.offsetWidth;
        const off = r.right < s.left || r.left > s.right || r.bottom < s.top || r.top > s.bottom;
        const bub = svgRef.current.querySelector(sel);
        let left, top, origin;
        if (bub || at) {
          let cx, tip;
          if (bub) {
            bub.style.visibility = 'hidden';
            const b = bub.getBoundingClientRect();
            cx = (b.left + b.right) / 2; tip = b.bottom;
            at = { x: (cx - r.left) / (r.width || 1), y: (tip - r.top) / (r.height || 1) };
          } else { cx = r.left + at.x * r.width; tip = r.top + at.y * r.height; }
          const nh = el.querySelector('.bubble-notch')?.offsetHeight ?? NOTCH;   // (the tip grows too)
          left = cx - s.left - w / 2; top = tip - s.top - h - nh; origin = `center ${h + nh}px`;   // centred on the bubble, tip on its tip
        } else {
          left = r.right - s.left + GAP; origin = 'left center';
          if (left + w > s.width - EDGE) { left = r.left - s.left - GAP - w; origin = 'right center'; }   // no room on the right: the left side
          top = (r.top + r.bottom) / 2 - s.top - h / 2;
        }
        left = Math.max(EDGE, Math.min(s.width - w - EDGE, left));
        top = Math.max(EDGE + 48, Math.min(s.height - h - EDGE - 56, top));
        // (the `translate` property, not `transform`: the pop's `scale` would scale a transform's offset too,
        // flying the card in from the stage's corner instead of growing it in place)
        el.style.translate = `${left.toFixed(1)}px ${top.toFixed(1)}px`;
        el.style.transformOrigin = origin;
        el.style.visibility = off ? 'hidden' : 'visible';
      }
      raf = requestAnimationFrame(place);
    };
    place();
    return () => {
      cancelAnimationFrame(raf);
      const bub = svgRef.current?.querySelector(sel);
      if (bub) bub.style.visibility = '';   // the bubble back when the card closes
    };
  }, [desk.id, svgRef, stageRef, bubbleSel]);

  const name = (desk.name || '').trim();
  const photo = desk.photo;
  const commit = () => { const v = draft.trim(); if (v !== (desk.name || '')) patch({ name: v }); };
  const upload = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try { setCrop(await loadImage(f)); setErr(''); } catch { setErr(t('That file is not a picture')); }
  };

  const caption = [desk.label && t('Desk {x}', { x: desk.label }), desk.team].filter(Boolean).join(' · ') || t('Unassigned');

  // The name bubble grown (an assigned seat): one element morphing between the bubble's sizes and the card's —
  // the picture grows, the name turns into the text field, the desk line and the buttons unfold under it, the
  // corner, padding and tip ease along, and the frost thickens from the bubble's — nothing swapped or squashed.
  if (m) {
    const S = small, tr = (...ps) => ps.map((q) => `${q} .36s cubic-bezier(.3, 1.2, .45, 1)`).join(', ');
    return (
      <div ref={card} role={closing ? undefined : 'dialog'} aria-hidden={closing || undefined} aria-label={closing ? undefined : t('Desk {x}', { x: desk.label || '' })} inert={closing || undefined}
        className={`menu-frost see-through absolute left-0 top-0 z-20 flex flex-col items-center text-center ${closing ? 'pointer-events-none' : ''}`}
        onTransitionEnd={(e) => { if (closing && e.target === card.current && e.propertyName === 'width') onClosed?.(); }}
        style={{
          visibility: 'hidden', width: S ? m.w : BW, padding: S ? `${m.pt}px ${m.px}px ${m.pb}px` : '7px 7px 5px', borderRadius: S ? m.r : 14,
          backgroundColor: S ? 'rgb(255 255 255 / .5)' : undefined, boxShadow: S ? '0 1px 3px rgb(20 30 50 / .12)' : undefined,
          borderColor: 'transparent', transition: tr('width', 'padding', 'border-radius', 'background-color', 'box-shadow'),
        }}>
        <span className="bubble-notch" aria-hidden="true" style={{ width: S ? m.nw : 16, height: S ? m.nh : 7, transition: tr('width', 'height') }} />
        {crop ? <Cropper img={crop} onCancel={() => setCrop(null)} onSave={(q) => { patch({ photo: q }); setCrop(null); }} /> : <>
          <button type="button" onClick={() => file.current?.click()} disabled={readOnly} tabIndex={readOnly ? -1 : undefined}
            title={readOnly ? undefined : t(photo ? 'Change the profile picture' : 'Upload a profile picture')}
            aria-label={readOnly ? undefined : t(photo ? 'Change the profile picture' : 'Upload a profile picture')}
            className="group relative grid shrink-0 place-items-center overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-accent"
            style={{ width: S ? m.pic : 52, height: S ? m.pic : 52, borderRadius: S ? m.r * 0.8 : 10,
              backgroundColor: S || name || photo ? 'transparent' : 'color-mix(in srgb, var(--ink) 9%, transparent)', transition: tr('width', 'height', 'border-radius', 'background-color') }}>
            {photo ? <img src={photo} alt="" className="size-full object-cover" />
              : name ? <span className="leading-none" style={{ fontFamily: EMOJI, fontSize: S ? m.pic * 0.78 : 40, transition: tr('font-size') }}>{animalOf(name).a}</span>
                : <span className="text-ink">{camera}</span>}
            {!readOnly && <span className="absolute inset-0 grid place-items-center bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">{camera}</span>}
          </button>
          {!readOnly && <input ref={file} type="file" accept="image/*" className="hidden" onChange={upload} />}
          {readOnly
            ? <span className="max-w-full truncate font-semibold text-ink-hi" style={{ fontSize: S ? m.fs : 13, lineHeight: `${S ? m.nameH : 20}px`, marginTop: S ? m.gap : 3, transition: tr('font-size', 'line-height', 'margin-top') }}>{name || t('Unassigned')}</span>
            : <input ref={input} value={draft} placeholder={t('Employee name')} aria-label={t('Employee name')} maxLength={60}
                className="w-full min-w-0 bg-transparent text-center font-semibold text-ink-hi caret-accent outline-none placeholder:font-normal placeholder:text-ink/70"
                style={{ fontSize: S ? m.fs : 13, height: S ? m.nameH : 22, marginTop: S ? m.gap : 3, padding: S ? 0 : '0 6px',
                  transition: tr('font-size', 'height', 'margin-top', 'padding') }}
                onChange={(e) => setDraft(e.target.value)} onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { commit(); e.currentTarget.blur(); }
                  else if (e.key === 'Escape') { setDraft(desk.name || ''); e.currentTarget.blur(); e.stopPropagation(); }
                }} />}
          {/* the buttons unfold under the name (a grid row from 0 to its height); Remove unassigns the seat */}
          <div className="grid w-full" style={{ gridTemplateRows: S ? '0fr' : '1fr', opacity: S ? 0 : 1, transition: tr('grid-template-rows', 'opacity') }}>
            <div className="flex min-h-0 w-full flex-col items-center gap-0.5 overflow-hidden">
              {err && <span className="text-[11px] text-[#e5484d]">{err}</span>}
              {!readOnly && (desk.photo || name) && (
                <div className="flex w-full flex-col items-stretch gap-0.5 pt-1 pb-0.5">
                  {desk.photo && <button type="button" onClick={() => patch({ photo: '' })}
                    className="menu-item rounded-md px-1.5 py-0.5 text-[12px] text-ink-hi outline-none">{t('Remove picture')}</button>}
                  {name && <button type="button" onClick={() => { setDraft(''); patch({ name: '', team: '' }); }} aria-label={t('Unassign seat')}
                    className="w-full rounded-md px-1.5 py-0.5 text-[12px] font-medium text-[#e5484d] outline-none transition-colors hover:bg-[#e5484d]/12 focus-visible:bg-[#e5484d]/12">{t('Remove')}</button>}
                </div>
              )}
            </div>
          </div>
        </>}
      </div>
    );
  }
  const shell = fromBubble
    ? `${closing ? 'desk-unpop' : 'desk-pop'} flex-col items-center rounded-2xl px-2.5 pb-2 pt-2.5 text-center`   // (a bubble it could not measure)
    : `${closing ? 'desk-unpop' : 'desk-pop'} rounded-xl p-2`;
  const ended = closing ? (e) => { if (e.target === e.currentTarget) onClosed?.(); } : undefined;   // the shrink done: gone
  const notch = fromBubble ? <span className="bubble-notch" aria-hidden="true" /> : null;
  const pic = fromBubble ? 'size-16 rounded-xl' : 'size-14 rounded-lg';
  if (readOnly) return (
    <div ref={card} role={closing ? undefined : 'dialog'} aria-hidden={closing || undefined} aria-label={closing ? undefined : t('Desk {x}', { x: desk.label || '' })} style={{ width: CW, visibility: 'hidden' }}
      className={`menu-frost see-through absolute left-0 top-0 z-20 flex items-center gap-2.5 ${closing ? 'pointer-events-none' : ''} ${shell}`} onAnimationEnd={ended}>
      {notch}
      <span className={`grid ${pic} shrink-0 place-items-center overflow-hidden bg-[color-mix(in_srgb,var(--ink)_9%,transparent)]`}>
        {photo ? <img src={photo} alt="" className="size-full object-cover" />
          : name ? <span className="text-[34px] leading-none" style={{ fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif' }}>{animalOf(name).a}</span> : null}
      </span>
      <span className={`flex min-w-0 flex-col gap-1 ${fromBubble ? 'max-w-full items-center' : ''}`}>
        <span className={`max-w-full truncate text-[13px] font-medium ${name ? 'text-ink-hi' : 'text-ink'}`}>{name || t('Unassigned')}</span>
        <span className="truncate text-[11px] text-ink">{caption}</span>
      </span>
    </div>
  );

  return (
    <div ref={card} role={closing ? undefined : 'dialog'} aria-hidden={closing || undefined} aria-label={closing ? undefined : t('Desk {x}', { x: desk.label || '' })} style={{ width: CW, visibility: 'hidden' }}
      className={`menu-frost see-through absolute left-0 top-0 z-20 flex flex-col gap-1.5 ${closing ? 'pointer-events-none' : ''} ${shell}`} onAnimationEnd={ended} inert={closing || undefined}>
      {notch}
      {crop ? <Cropper img={crop} onCancel={() => setCrop(null)} onSave={(p) => { patch({ photo: p }); setCrop(null); }} /> : <>
      <div className={fromBubble ? 'flex w-full flex-col items-center gap-1.5' : 'flex items-center gap-2.5'}>
        <button type="button" onClick={() => file.current.click()} title={t(photo ? 'Change the profile picture' : 'Upload a profile picture')}
          aria-label={t(photo ? 'Change the profile picture' : 'Upload a profile picture')}
          className={`group relative grid ${pic} shrink-0 place-items-center overflow-hidden bg-[color-mix(in_srgb,var(--ink)_9%,transparent)] outline-none focus-visible:ring-2 focus-visible:ring-accent`}>
          {photo ? <img src={photo} alt="" className="size-full object-cover" />
            : name ? <span className={`${fromBubble ? 'text-[40px]' : 'text-[34px]'} leading-none`} style={{ fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif' }}>{animalOf(name).a}</span>
              : <span className="text-ink">{camera}</span>}
          <span className="absolute inset-0 grid place-items-center bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">{camera}</span>
        </button>
        <input ref={file} type="file" accept="image/*" className="hidden" onChange={upload} />
        <div className={`flex min-w-0 flex-col gap-1 ${fromBubble ? 'w-full items-center' : 'flex-1'}`}>
          <input ref={input} value={draft} placeholder={t('Employee name')} aria-label={t('Employee name')} maxLength={60}
            className={`w-full rounded-md border border-[color-mix(in_srgb,var(--ink)_22%,transparent)] bg-white/70 px-2 py-1.5 text-[13px] font-medium text-ink-hi outline-none placeholder:font-normal placeholder:text-ink/70 focus:border-accent ${fromBubble ? 'text-center' : ''}`}
            onChange={(e) => setDraft(e.target.value)} onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { commit(); e.currentTarget.blur(); }
              else if (e.key === 'Escape') { setDraft(desk.name || ''); e.currentTarget.blur(); e.stopPropagation(); }
            }} />
          <span className="max-w-full truncate text-[11px] text-ink">
            {caption}
          </span>
        </div>
      </div>
      {err && <span className="text-[11px] text-[#e5484d]">{err}</span>}
      {(desk.photo || name) && (
        <div className={`-mx-0.5 flex flex-wrap gap-1 ${fromBubble ? 'justify-center' : ''}`}>
          {desk.photo && <button type="button" onClick={() => patch({ photo: '' })}
            className="menu-item rounded-md px-2 py-1 text-[12px] text-ink-hi outline-none">{t('Remove picture')}</button>}
          {name && <button type="button" onClick={() => { setDraft(''); patch({ name: '', team: '' }); }}
            className="menu-item rounded-md px-2 py-1 text-[12px] font-medium text-[#e5484d] outline-none">{t('Unassign seat')}</button>}
        </div>
      )}
      </>}
    </div>
  );
}
