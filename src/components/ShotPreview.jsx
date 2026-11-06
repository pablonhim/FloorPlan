// The screenshot's moment: a quick white flash over the screen as the picture is taken (ShotFlash), then the
// picture itself (ShotPreview) floating over the page like a photo — a thin white frame and a soft shadow, the
// page behind it blurred — with Discard, Crop and Download floating inside the photo, at its bottom. Crop puts a
// frame on the picture (corners and edges to resize, inside to move, a drag outside draws a new one); Apply cuts
// the picture to it, which Download then saves. Show switches along its top leave parts out of the picture
// (people's names, department and room labels, …: exportPng's SHOT_PARTS; only those the view has), taking it
// again without them and cutting it to the same crop. Escape (or a click outside) backs out of cropping, then discards.
// Take another (+) keeps the picture as it is (cropped) and closes, to take the next one (a document scan's
// pages): the pictures kept so far show along the photo's left, and Save offers them all, with this one, as one
// PDF or PowerPoint (lib/shotPack), or this picture alone as a PNG.
// Every blob url made here is let go when it closes, except a kept picture's (the stack owns it then).
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../lib/i18n.js';
import { DeleteIcon, DownloadIcon, FrameIcon } from './AnimatedIcons.jsx';
import { SHOT_PARTS } from '../lib/exportPng.js';
import { savePdf, savePptx } from '../lib/shotPack.js';

/** A white flash over the whole screen; `n` changes on every shot (each one flashes again). */
export function ShotFlash({ n }) {
  if (!n) return null;
  return createPortal(<div key={n} className="shot-flash pointer-events-none fixed inset-0 z-[90]" aria-hidden="true" />, document.body);
}

const MIN = 0.04;   // the crop frame's smallest side, as a share of the picture
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Cut the picture shown in `img` (already loaded) to `r` (shares of its size): a new png blob url and its size. */
async function cropTo(img, r, natural) {
  const W = natural.width || img.naturalWidth, H = natural.height || img.naturalHeight;
  const sx = Math.round(r.x * img.naturalWidth), sy = Math.round(r.y * img.naturalHeight);
  const sw = Math.max(1, Math.round(r.w * img.naturalWidth)), sh = Math.max(1, Math.round(r.h * img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = sw; c.height = sh;
  c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  return { url: URL.createObjectURL(blob), width: Math.round(r.w * W), height: Math.round(r.h * H) };
}

/**
 * shot: { url, filename, width, height, parts } from exportPng(…, { save: false }); hide: the parts it was taken
 * without; retake(hide): the same view again without those (a promise of a new shot); onClose() after either choice.
 */
export default function ShotPreview({ shot, hide: hide0 = [], retake, onClose, pages = [], onAnother, onRemovePage, onSaved }) {
  const t = useT();
  const dl = useRef(null), box = useRef(null), drag = useRef(null), shown = useRef(null), alive = useRef(false);
  const [pic, setPic] = useState({ url: shot.url, width: shot.width, height: shot.height });   // as cropped so far
  const [crop, setCrop] = useState(null);   // the frame while cropping: { x, y, w, h } as shares of the picture
  const made = useRef([shot.url]);          // every url to let go at the end
  const cropping = Boolean(crop);
  const [busy, setBusy] = useState(false);   // cutting the picture (a big png takes a moment)
  const close = useRef(onClose);
  const [hide, setHide] = useState(hide0);
  const menuOpen = useRef(false);
  const full = useRef(shot);                    // the latest whole (uncut) picture
  const cut = useRef({ x: 0, y: 0, w: 1, h: 1 });   // the crop applied so far, as shares of the whole picture
  const parts = SHOT_PARTS.filter((p) => (shot.parts || []).includes(p.key));
  close.current = onClose;

  useEffect(() => {
    dl.current?.focus();
    const esc = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (menuOpen.current) { setSaveOpen(false); return; }
      setCrop((c) => { if (!c) close.current(); return null; });   // out of cropping first, then away
    };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, []);
  // the urls go once the preview has really closed (not on the development double mount's quick unmount)
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      setTimeout(() => { if (!alive.current) made.current.forEach((u) => URL.revokeObjectURL(u)); }, 1000);
    };
  }, []);

  // keep this picture for a set and close to take the next; its url now belongs to the stack (ZoomRail)
  const another = () => {
    made.current = made.current.filter((u) => u !== pic.url);
    onAnother?.({ ...pic, filename: shot.filename });
  };
  // the set (the pictures kept so far, then this one) as one file
  const [saveOpen, setSaveOpen] = useState(false);
  menuOpen.current = saveOpen;
  const [saving, setSaving] = useState(false);
  const saveAll = async (kind) => {
    setSaveOpen(false);
    if (kind === 'png') { download(); return; }
    setSaving(true);
    try {
      const all = [...pages, pic];
      if (kind === 'pdf') await savePdf(all); else await savePptx(all);
      onSaved?.();
      setTimeout(onClose, 0);
    } finally { if (alive.current) setSaving(false); }
  };
  const download = () => {
    const a = document.createElement('a');
    a.href = pic.url;
    a.download = shot.filename;
    a.click();
    // the urls are revoked when the preview unmounts, after the click has started the download
    setTimeout(onClose, 0);
  };
  const apply = async () => {
    if (!crop || busy) return;
    const full = crop.x <= 0.001 && crop.y <= 0.001 && crop.w >= 0.999 && crop.h >= 0.999;
    if (!full) {
      setBusy(true);
      try {
        const next = await cropTo(shown.current, crop, pic);
        made.current.push(next.url);
        setPic(next);
        const c = cut.current;
        cut.current = { x: c.x + crop.x * c.w, y: c.y + crop.y * c.h, w: crop.w * c.w, h: crop.h * c.h };
      } finally { setBusy(false); }
    }
    setCrop(null);
    requestAnimationFrame(() => dl.current?.focus());
  };

  // a Show switch: the picture taken again without (or with) that part, then cut to the crop so far
  const toggle = async (key) => {
    if (busy || !retake) return;
    const next = hide.includes(key) ? hide.filter((k) => k !== key) : [...hide, key];
    setHide(next);
    setBusy(true);
    try {
      const r = await retake(next);
      if (!r?.url || !alive.current) return;
      made.current.push(r.url);
      full.current = r;
      const c = cut.current;
      if (c.w >= 0.999 && c.h >= 0.999) { setPic({ url: r.url, width: r.width, height: r.height }); return; }
      const img = new Image();
      img.src = r.url;
      await img.decode();
      const cropped = await cropTo(img, c, r);
      made.current.push(cropped.url);
      setPic(cropped);
    } finally { setBusy(false); }
  };

  // dragging the frame: `mode` is 'move', 'new', or the sides it moves ('n', 'se', …)
  const at = (e) => { const r = box.current.getBoundingClientRect(); return { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp((e.clientY - r.top) / r.height, 0, 1) }; };
  const start = (mode) => (e) => {
    e.preventDefault(); e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { mode, p0: at(e), c0: crop };
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const p = at(e), dx = p.x - d.p0.x, dy = p.y - d.p0.y, c = d.c0;
    if (d.mode === 'move') { setCrop({ ...c, x: clamp(c.x + dx, 0, 1 - c.w), y: clamp(c.y + dy, 0, 1 - c.h) }); return; }
    if (d.mode === 'new') {
      const x0 = Math.min(d.p0.x, p.x), y0 = Math.min(d.p0.y, p.y);
      setCrop({ x: x0, y: y0, w: Math.max(MIN, Math.abs(dx)), h: Math.max(MIN, Math.abs(dy)) });
      return;
    }
    let { x, y, w, h } = c;
    if (d.mode.includes('w')) { const nx = clamp(c.x + dx, 0, c.x + c.w - MIN); w = c.x + c.w - nx; x = nx; }
    if (d.mode.includes('e')) w = clamp(c.w + dx, MIN, 1 - c.x);
    if (d.mode.includes('n')) { const ny = clamp(c.y + dy, 0, c.y + c.h - MIN); h = c.y + c.h - ny; y = ny; }
    if (d.mode.includes('s')) h = clamp(c.h + dy, MIN, 1 - c.y);
    setCrop({ x, y, w, h });
  };
  const end = () => { drag.current = null; };

  const pct = (v) => `${(v * 100).toFixed(3)}%`;
  const HANDLES = { nw: 'left-0 top-0 cursor-nwse-resize', ne: 'right-0 top-0 cursor-nesw-resize', sw: 'left-0 bottom-0 cursor-nesw-resize', se: 'right-0 bottom-0 cursor-nwse-resize' };
  const EDGES = { n: 'inset-x-3 top-0 h-2 -translate-y-1/2 cursor-ns-resize', s: 'inset-x-3 bottom-0 h-2 translate-y-1/2 cursor-ns-resize',
    w: 'inset-y-3 left-0 w-2 -translate-x-1/2 cursor-ew-resize', e: 'inset-y-3 right-0 w-2 translate-x-1/2 cursor-ew-resize' };
  // the choices as round icon buttons (their names as tooltips and for screen readers)
  const btn = 'shot-btn frost-panel frost-edge grid size-10 place-items-center rounded-full text-ink-hi';
  const main = 'shot-btn grid size-10 place-items-center rounded-full bg-accent text-white shadow-lg';
  const ico = (d) => <svg viewBox="0 0 16 16" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
  const I = {
    discard: <DeleteIcon />,   // (animated, AnimatedIcons: the lid lifts, the arrow drops, the frame spreads)
    crop: <FrameIcon />,
    download: <DownloadIcon />,
    cancel: ico(<path d="M4 4l8 8M12 4l-8 8" />),
    apply: ico(<path d="M3.2 8.4l3.1 3.1 6.5-7" />),
    another: ico(<><rect x="2.5" y="4.5" width="9" height="9" rx="1.5" /><path d="M5.5 2.5h6.5a1.5 1.5 0 0 1 1.5 1.5v6.5M7 7v4M5 9h4" /></>),
  };

  return createPortal(
    <div className="shot-backdrop fixed inset-0 z-[80] grid place-items-center overflow-hidden p-4" role="dialog" aria-modal="true" aria-label={t('Screenshot')}
      onPointerDown={(e) => { if (e.target === e.currentTarget) { if (cropping) setCrop(null); else onClose(); } }}>
      <figure className="shot-photo relative m-0 rounded-[6px] bg-white p-[6px]">
        <div ref={box} className="relative" onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
          <img ref={shown} src={pic.url} alt={t('Screenshot')} draggable={false} className="block max-h-[93vh] max-w-[min(76vw,1240px)] select-none rounded-[3px] object-contain"
            style={{ aspectRatio: `${pic.width} / ${pic.height}` }} />
          {crop && (
            // the frame: the picture outside it dimmed (a huge shadow round it, clipped to the picture), corner
            // handles and edges to resize, inside to move; a drag on the dimmed part draws a new frame
            <div className="absolute inset-0 cursor-crosshair touch-none overflow-hidden rounded-[3px]" onPointerDown={start('new')}>
              <div className="absolute cursor-move border border-white shadow-[0_0_0_9999px_rgb(0_0_0_/_.5)]" onPointerDown={start('move')}
                style={{ left: pct(crop.x), top: pct(crop.y), width: pct(crop.w), height: pct(crop.h) }}>
                <span className="pointer-events-none absolute inset-x-0 top-1/3 border-t border-white/40" />
                <span className="pointer-events-none absolute inset-x-0 top-2/3 border-t border-white/40" />
                <span className="pointer-events-none absolute inset-y-0 left-1/3 border-l border-white/40" />
                <span className="pointer-events-none absolute inset-y-0 left-2/3 border-l border-white/40" />
                {Object.entries(EDGES).map(([k, c]) => <span key={k} className={`absolute ${c}`} onPointerDown={start(k)} />)}
                {Object.entries(HANDLES).map(([k, c]) => (
                  <span key={k} className={`absolute ${c} size-3.5 -m-[7px] rounded-full border-2 border-white bg-accent shadow`} onPointerDown={start(k)} />
                ))}
              </div>
            </div>
          )}
        </div>
        {/* the Show switches, floating inside the photo along its top (not while cropping) */}
        {!cropping && parts.length > 0 && (
          <div className="absolute inset-x-0 top-4 flex justify-center px-4">
            <div role="group" aria-label={t('Show')} aria-busy={busy}
              className="frost-panel frost-edge flex max-w-full flex-wrap items-center justify-center gap-1 rounded-full px-1.5 py-1">
              <span className="px-1.5 text-[11px] uppercase tracking-[.14em] text-ink">{t('Show')}</span>
              {parts.map((p) => {
                const on = !hide.includes(p.key);
                return (
                  <button key={p.key} type="button" role="switch" aria-checked={on} disabled={busy} onClick={() => toggle(p.key)}
                    className={`shot-chip flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] transition-colors disabled:cursor-progress ${on ? 'bg-accent text-white' : 'text-ink-hi hover:bg-[color-mix(in_srgb,var(--ink)_10%,transparent)]'}`}>
                    <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      {on ? <path d="M3.2 8.4l3.1 3.1 6.5-7" /> : <path d="M8 3.5v9M3.5 8h9" />}
                    </svg>
                    {t(p.label)}
                  </button>
                );
              })}
              {busy && <span className="mx-1 size-3.5 animate-spin rounded-full border-2 border-[color-mix(in_srgb,var(--ink)_25%,transparent)] border-t-accent" aria-hidden="true" />}
            </div>
          </div>
        )}
        {/* the pictures kept so far (Take another), along the photo's left; each can be dropped */}
        {!cropping && pages.length > 0 && (
          <ol aria-label={t('Kept pictures')} className="no-scrollbar absolute bottom-5 left-4 top-16 flex w-[76px] flex-col justify-end gap-1.5 overflow-y-auto">
            {pages.map((p, i) => (
              <li key={p.url} className="group relative shrink-0">
                <img src={p.url} alt={t('Picture {n}', { n: i + 1 })} className="block w-full rounded-[4px] border-2 border-white bg-white object-contain shadow-md" style={{ aspectRatio: `${p.width} / ${p.height}` }} />
                <span className="absolute left-1 top-1 rounded-full bg-black/55 px-1.5 text-[10px] leading-4 text-white tabular-nums">{i + 1}</span>
                <button type="button" onClick={() => onRemovePage?.(i)} aria-label={t('Remove picture {n}', { n: i + 1 })}
                  className="absolute -right-1.5 -top-1.5 hidden size-5 place-items-center rounded-full bg-white text-[#d9534f] shadow group-hover:grid">
                  <svg viewBox="0 0 16 16" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
                </button>
              </li>
            ))}
          </ol>
        )}
        {/* the choices, floating inside the photo at its bottom */}
        <figcaption className="absolute inset-x-0 bottom-5 flex justify-center gap-2">
          {cropping ? <>
            <button type="button" onClick={() => setCrop(null)} disabled={busy} aria-label={t('Cancel')} title={t('Cancel')} className={`${btn} disabled:opacity-50`}>{I.cancel}</button>
            <button type="button" onClick={apply} disabled={busy} aria-busy={busy} aria-label={t(busy ? 'Cropping…' : 'Apply')} title={t(busy ? 'Cropping…' : 'Apply')}
              className={`${main} disabled:opacity-80`}>{busy ? <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : I.apply}</button>
          </> : <>
            <button type="button" onClick={onClose} aria-label={t('Discard')} title={t('Discard')} className={btn}>{I.discard}</button>
            <button type="button" onClick={() => setCrop({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 })} aria-label={t('Crop')} title={t('Crop')} className={btn}>{I.crop}</button>
            {onAnother && (
              <button type="button" onClick={another} disabled={busy || saving} aria-label={t('Take another')} title={t('Keep this one and take another (save them all as one PDF or PowerPoint)')}
                className={`${btn} disabled:opacity-50`}>{I.another}</button>
            )}
            <div className="relative">
              <button ref={dl} type="button" onClick={() => setSaveOpen((o) => !o)} disabled={busy || saving} aria-haspopup="menu" aria-expanded={saveOpen}
                aria-label={t(pages.length ? 'Save {n} pictures' : 'Save', { n: pages.length + 1 })} title={t(pages.length ? 'Save {n} pictures' : 'Save', { n: pages.length + 1 })}
                className={`${main} relative disabled:opacity-60`}>
                {saving ? <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : I.download}
                {pages.length > 0 && <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-white px-1 text-[10.5px] font-semibold text-accent shadow tabular-nums">{pages.length + 1}</span>}
              </button>
              {saveOpen && (
                <div role="menu" aria-label={t('Save')} className="menu-frost menu-pop-up absolute bottom-full left-1/2 mb-2 w-max min-w-[200px] -translate-x-1/2 rounded-[10px] p-0.5">
                  {[
                    { k: 'pdf', label: t('PDF · {n} pages', { n: pages.length + 1 }) },
                    { k: 'pptx', label: t('PowerPoint · {n} slides', { n: pages.length + 1 }) },
                    { k: 'png', label: t(pages.length ? 'This picture only (PNG)' : 'Picture (PNG)') },
                  ].map((o) => (
                    <button key={o.k} type="button" role="menuitem" onClick={() => saveAll(o.k)}
                      className="menu-item flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-[12.5px] text-ink-hi outline-none">{o.label}</button>
                  ))}
                </div>
              )}
            </div>
          </>}
        </figcaption>
      </figure>
    </div>,
    document.body,
  );
}
