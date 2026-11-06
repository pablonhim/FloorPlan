// Zoom rail: a slim frosted slider at the bottom right, just left of the menu button (`right`: a CSS length),
// on the line of the bottom-left dock, showing how far
// the current view is zoomed — its own range only (building, floor or unit) — with − / + buttons. Grey at
// rest; while the thumb is dragged it takes the accent colour and the zoom follows the pointer at once. A
// click on the track glides to that depth; Fit glides back to the whole view; Screenshot saves the view as it
// shows; the live compass ends the bar.
// The thumb follows the zoom (zoomStore).
import { useRef, useState } from 'react';
import { useZoom, zoomCommand } from '../lib/zoomStore.js';
import SceneButton, { icon } from './SceneButton.jsx';
import Compass from './Compass.jsx';
import { useShotAction } from '../lib/shotStore.js';
import ShotPreview, { ShotFlash } from './ShotPreview.jsx';
import { useT } from '../lib/i18n.js';

const SHOT_ICON = icon(<><path d="M2.5 5.5a1 1 0 0 1 1-1h2l1-1.5h3l1 1.5h2a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z" /><circle cx="8" cy="8.5" r="2.3" /></>);
const NAME = { building: 'Building', floor: 'Floor', unit: 'Unit' };
const TRACK = 88;             // px

const HIDE_KEY = 'wefloor.shot.hide';

export default function ZoomRail({ stage, right = '3.75rem' }) {
  const t = useT();
  const { frac } = useZoom();
  const track = useRef(null);
  const [drag, setDrag] = useState(false);
  // Screenshot: the view on screen exactly as it shows (the active view's, lib/shotStore), as a PNG
  const shot = useShotAction();
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(0);        // each shot flashes the screen
  const [taken, setTaken] = useState(null);     // the picture, shown in the preview until kept or discarded
  // the parts left out of the picture (the preview's Show switches), remembered for the next one
  const [hide, setHide] = useState(() => { try { return JSON.parse(localStorage.getItem(HIDE_KEY)) || []; } catch { return []; } });
  // the pictures kept with "Take another" (ShotPreview), to save together as one PDF or deck; while there are
  // some, a pill above the dock shows them, to save from there or keep going
  const [pages, setPages] = useState([]);
  const dropPages = (list) => list.forEach((p) => URL.revokeObjectURL(p.url));
  const unlock = () => document.documentElement.classList.remove('shot-lock');
  const [packing, setPacking] = useState(false);
  const pack = async (kind) => {
    if (packing || !pages.length) return;
    setPacking(true);
    try { const m = await import('../lib/shotPack.js'); await (kind === 'pdf' ? m.savePdf(pages) : m.savePptx(pages)); dropPages(pages); setPages([]); }
    finally { setPacking(false); }
  };
  const keepHide = (h) => { setHide(h); try { localStorage.setItem(HIDE_KEY, JSON.stringify(h)); } catch { /* storage blocked */ } };
  const shoot = async () => {
    if (busy || !shot) return;
    setBusy(true);
    setFlash((n) => n + 1);
    // the screen is "snapped": it flashes and the whole page shrinks a little while the picture is taken, then
    // springs back behind the preview, which drops in as the paper photo (index.css .shot-snap, .shot-photo)
    // (it shrinks first and only then is the picture made — the making blocks the page, which would stutter the
    // shrink — with scrolling locked throughout, so nothing ever scrolls or shows a scrollbar)
    const root = document.getElementById('root'), html = document.documentElement;
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    html.classList.add('shot-lock');
    root?.classList.add('shot-snap');
    if (!calm) await new Promise((res) => setTimeout(res, 300));
    let kept = false;
    try { const r = await shot({ hide }); if (r?.url) { setTaken(r); kept = true; } } finally {
      root?.classList.remove('shot-snap');
      // (still locked while the preview is open — its photo pops in a touch larger than the window — and
      // unlocked when it closes; without a picture, once the page is back)
      if (!kept) setTimeout(() => html.classList.remove('shot-lock'), 450);
      setBusy(false);
    }
  };
  const fracAt = (e) => { const r = track.current.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left - 4) / (r.width - 8))); };
  const onDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    track.current.setPointerCapture(e.pointerId);
    setDrag(true);
    zoomCommand({ frac: fracAt(e), now: true });
  };
  const onMove = (e) => { if (drag) zoomCommand({ frac: fracAt(e), now: true }); };
  const onUp = () => { if (drag) { setDrag(false); zoomCommand({ settle: true }); } };
  return (
    <div className="frost-panel frost-edge frost-thin absolute bottom-3 z-[5] flex h-10 items-center gap-1 rounded-full px-1" style={{ right }}
      role="group" aria-label={t('Zoom: {v} view', { v: t(NAME[stage] || '') })}>
      <SceneButton place="above" compact docked label={t('Zoom out')} tip={t('Zoom out (scroll down)')} onClick={() => zoomCommand({ step: -1 })}>
        {icon(<path d="M3.5 8h9" />)}
      </SceneButton>
      <div ref={track} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        className={`relative h-full touch-none ${drag ? 'cursor-grabbing' : 'cursor-pointer'}`} style={{ width: TRACK }}
        role="slider" aria-label={t('{v} zoom', { v: t(NAME[stage] || '') })} aria-orientation="horizontal" aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={Math.round(frac * 100)} aria-valuetext={`${Math.round(frac * 100)}% zoomed`}>
        <div className="absolute inset-x-1 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[color-mix(in_srgb,var(--ink)_20%,transparent)]" />
        <div className={`absolute left-1 top-1/2 h-1 -translate-y-1/2 rounded-full ${drag ? 'bg-accent' : 'bg-[color-mix(in_srgb,var(--ink)_55%,transparent)] transition-[width] duration-100'}`}
          style={{ width: frac * (TRACK - 8) }} />
        <div className={`absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-panel shadow ${drag ? 'scale-125 border-accent' : 'border-ink-hi transition-[left] duration-100'}`}
          style={{ left: 4 + frac * (TRACK - 8) }} />
      </div>
      <SceneButton place="above" compact docked label={t('Zoom in')} tip={t('Zoom in (scroll up)')} onClick={() => zoomCommand({ step: 1 })}>
        {icon(<path d="M8 3.5v9M3.5 8h9" />)}
      </SceneButton>
      <span className="mx-0.5 block h-5 w-px bg-[color-mix(in_srgb,var(--ink)_30%,transparent)]" aria-hidden="true" />
      <SceneButton place="above" compact docked label={t('Fit')} tip={t('Fit the whole view')} onClick={() => zoomCommand({ fit: true })}>
        {icon(<path d="M3 6V3h3M10 3h3v3M13 10v3h-3M6 13H3v-3" />)}
      </SceneButton>
      {/* Fit, Screenshot and the compass together, no dividers between them */}
      {shot && (
        <span className={busy ? 'shot-busy' : undefined}>
          <SceneButton place="above" compact docked label={t('Screenshot')} tip={t('Save this view as a picture, without the buttons and panels')} onClick={shoot} disabled={busy}>
            {SHOT_ICON}
          </SceneButton>
        </span>
      )}
      <span className="grid size-8 place-items-center"><Compass size={28} /></span>
      <ShotFlash n={flash} />
      {taken && (
        <ShotPreview shot={taken} hide={hide} retake={(h) => { keepHide(h); return shot?.({ hide: h }); }}
          pages={pages}
          onAnother={(p) => { setPages((list) => [...list, p]); setTaken(null); unlock(); }}
          onRemovePage={(i) => setPages((list) => { URL.revokeObjectURL(list[i].url); return list.filter((_, k) => k !== i); })}
          onSaved={() => { dropPages(pages); setPages([]); }}
          onClose={() => { setTaken(null); unlock(); }} />
      )}
      {/* the kept pictures, above the dock: how many, the newest on top of the pile; save them, or drop them */}
      {pages.length > 0 && !taken && (
        <div className="frost-panel frost-edge absolute bottom-full right-0 mb-2 flex items-center gap-1.5 rounded-full py-1 pl-1.5 pr-1" role="group" aria-label={t('Kept pictures')}>
          <span className="relative block h-7 w-9 shrink-0">
            {pages.slice(-3).map((p, i, a) => (
              <img key={p.url} src={p.url} alt="" className="absolute inset-0 m-auto h-6 w-8 rounded-[3px] border border-white bg-white object-cover shadow"
                style={{ transform: `rotate(${(i - (a.length - 1)) * 7}deg) translateX(${(i - (a.length - 1)) * 2}px)` }} />
            ))}
          </span>
          <span className="whitespace-nowrap text-[12px] text-ink-hi tabular-nums">{t('{n} kept', { n: pages.length })}</span>
          {[['pdf', 'PDF'], ['pptx', 'PPT']].map(([k, label]) => (
            <button key={k} type="button" onClick={() => pack(k)} disabled={packing} title={t(k === 'pdf' ? 'Save them as one PDF' : 'Save them as one PowerPoint')}
              className="h-7 rounded-full bg-accent px-2.5 text-[11.5px] font-medium text-white hover:brightness-110 disabled:opacity-60">{label}</button>
          ))}
          <button type="button" onClick={() => { dropPages(pages); setPages([]); }} aria-label={t('Drop the kept pictures')} title={t('Drop the kept pictures')}
            className="grid size-7 place-items-center rounded-full text-ink hover:text-[#d9534f]">
            <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}
