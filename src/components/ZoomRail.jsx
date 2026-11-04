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
  const shoot = async () => {
    if (busy || !shot) return;
    setBusy(true);
    setFlash((n) => n + 1);
    try { const r = await shot(); if (r?.url) setTaken(r); } finally { setBusy(false); }
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
      {taken && <ShotPreview shot={taken} onClose={() => setTaken(null)} />}
    </div>
  );
}
