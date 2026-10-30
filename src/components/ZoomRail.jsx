// Zoom rail: a slim frosted slider at the bottom right, just left of the menu button (`right`: a CSS length),
// on the line of the bottom-left dock, showing how far
// the current view is zoomed — its own range only (building, floor or unit) — with − / + buttons. Grey at
// rest; while the thumb is dragged it takes the accent colour and the zoom follows the pointer at once. A
// click on the track glides to that depth; Fit glides back to the whole view. The thumb follows the zoom
// (zoomStore).
import { useRef, useState } from 'react';
import { useZoom, zoomCommand } from '../lib/zoomStore.js';
import SceneButton, { icon } from './SceneButton.jsx';

const NAME = { building: 'Building', floor: 'Floor', unit: 'Unit' };
const TRACK = 88;             // px

export default function ZoomRail({ stage, right = '3.75rem' }) {
  const { frac } = useZoom();
  const track = useRef(null);
  const [drag, setDrag] = useState(false);
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
      role="group" aria-label={`Zoom: ${NAME[stage] || ''} view`}>
      <SceneButton place="above" compact docked label="Zoom out" tip="Zoom out (scroll down)" onClick={() => zoomCommand({ step: -1 })}>
        {icon(<path d="M3.5 8h9" />)}
      </SceneButton>
      <div ref={track} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        className={`relative h-full touch-none ${drag ? 'cursor-grabbing' : 'cursor-pointer'}`} style={{ width: TRACK }}
        role="slider" aria-label={`${NAME[stage] || ''} zoom`} aria-orientation="horizontal" aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={Math.round(frac * 100)} aria-valuetext={`${Math.round(frac * 100)}% zoomed`}>
        <div className="absolute inset-x-1 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[color-mix(in_srgb,var(--ink)_20%,transparent)]" />
        <div className={`absolute left-1 top-1/2 h-1 -translate-y-1/2 rounded-full ${drag ? 'bg-accent' : 'bg-[color-mix(in_srgb,var(--ink)_55%,transparent)] transition-[width] duration-100'}`}
          style={{ width: frac * (TRACK - 8) }} />
        <div className={`absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-panel shadow ${drag ? 'scale-125 border-accent' : 'border-ink-hi transition-[left] duration-100'}`}
          style={{ left: 4 + frac * (TRACK - 8) }} />
      </div>
      <SceneButton place="above" compact docked label="Zoom in" tip="Zoom in (scroll up)" onClick={() => zoomCommand({ step: 1 })}>
        {icon(<path d="M8 3.5v9M3.5 8h9" />)}
      </SceneButton>
      <span className="mx-0.5 block h-5 w-px bg-[color-mix(in_srgb,var(--ink)_30%,transparent)]" aria-hidden="true" />
      <SceneButton place="above" compact docked label="Fit" tip="Fit the whole view" onClick={() => zoomCommand({ fit: true })}>
        {icon(<path d="M3 6V3h3M10 3h3v3M13 10v3h-3M6 13H3v-3" />)}
      </SceneButton>
    </div>
  );
}
