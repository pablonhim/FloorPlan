// The screenshot's moment: a quick white flash over the screen as the picture is taken (ShotFlash), then the
// picture itself (ShotPreview) floating over the page like a photo — a thin white frame and a soft shadow, the
// page behind it blurred — with Discard, Crop and Download floating inside the photo, at its bottom. Crop puts a
// frame on the picture (corners and edges to resize, inside to move, a drag outside draws a new one); Apply cuts
// the picture to it, which Download then saves. Escape (or a click outside) backs out of cropping, then discards.
// Every blob url made here is let go when it closes.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../lib/i18n.js';
import { DeleteIcon, DownloadIcon, FrameIcon } from './AnimatedIcons.jsx';

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

/** shot: { url, filename, width, height } from exportPng(…, { save: false }); onClose() after either choice. */
export default function ShotPreview({ shot, onClose }) {
  const t = useT();
  const dl = useRef(null), box = useRef(null), drag = useRef(null), shown = useRef(null), alive = useRef(false);
  const [pic, setPic] = useState({ url: shot.url, width: shot.width, height: shot.height });   // as cropped so far
  const [crop, setCrop] = useState(null);   // the frame while cropping: { x, y, w, h } as shares of the picture
  const made = useRef([shot.url]);          // every url to let go at the end
  const cropping = Boolean(crop);
  const [busy, setBusy] = useState(false);   // cutting the picture (a big png takes a moment)
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    dl.current?.focus();
    const esc = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
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
      } finally { setBusy(false); }
    }
    setCrop(null);
    requestAnimationFrame(() => dl.current?.focus());
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
        {/* the choices, floating inside the photo at its bottom */}
        <figcaption className="absolute inset-x-0 bottom-5 flex justify-center gap-2">
          {cropping ? <>
            <button type="button" onClick={() => setCrop(null)} disabled={busy} aria-label={t('Cancel')} title={t('Cancel')} className={`${btn} disabled:opacity-50`}>{I.cancel}</button>
            <button type="button" onClick={apply} disabled={busy} aria-busy={busy} aria-label={t(busy ? 'Cropping…' : 'Apply')} title={t(busy ? 'Cropping…' : 'Apply')}
              className={`${main} disabled:opacity-80`}>{busy ? <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : I.apply}</button>
          </> : <>
            <button type="button" onClick={onClose} aria-label={t('Discard')} title={t('Discard')} className={btn}>{I.discard}</button>
            <button type="button" onClick={() => setCrop({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 })} aria-label={t('Crop')} title={t('Crop')} className={btn}>{I.crop}</button>
            <button ref={dl} type="button" onClick={download} aria-label={t('Download')} title={t('Download')} className={main}>{I.download}</button>
          </>}
        </figcaption>
      </figure>
    </div>,
    document.body,
  );
}
