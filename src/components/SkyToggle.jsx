// The header's time-of-day toggle: a pill track (frosted like the bottom dock) with a white knob carrying an
// icon, no text, and three stops: morning, evening, night, each marked on the track by a faint icon (two, light
// and dark, while the weather background is off).
// A click on a stop slides the knob there; arrow keys step through them (a radio group). The knob shows the
// chosen time's icon. The toggle sits outside the theme's cross-fade (view-transition-name in index.css), so
// the knob slides on the live page instead of fading between its two places.
import { SKIES } from '../lib/sky.js';

const I = (d) => (
  <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const OPT = {
  morning: { label: 'Morning', icon: I(<><circle cx="8" cy="8" r="3" /><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" /></>) },
  evening: { label: 'Evening', icon: I(<><path d="M4.5 11a3.5 3.5 0 0 1 7 0" /><path d="M1.5 11h13M8 3v3M3.8 5.8l1.2 1.2M12.2 5.8 11 7" /></>) },
  night: { label: 'Night', icon: I(<path d="M13 9.5A5.5 5.5 0 0 1 6.5 3 5.5 5.5 0 1 0 13 9.5z" />) },
};
const STEP = 22;   // knob travel per stop (px): knob 20px, 2px inset

export default function SkyToggle({ sky, onChange, weather = true }) {
  // without the weather background (the dock's ⋯ menu) it is a plain light / dark switch: two stops, the light
  // one standing for morning or evening (whichever is on; picking it from night brings back morning)
  const stops = weather ? SKIES : ['light', 'night'];
  const at = (s) => (weather ? s : s === 'night' ? 'night' : 'light');
  const i = Math.max(0, stops.indexOf(at(sky)));
  const pick = (s) => {
    if (s === 'light') { if (sky === 'night') onChange('morning'); return; }
    onChange(s);
  };
  const onKey = (e) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    pick(stops[Math.max(0, Math.min(stops.length - 1, i + d))]);
  };
  const opt = (s) => OPT[s === 'light' ? 'morning' : s];
  return (
    <div role="radiogroup" aria-label={weather ? 'Time of day' : 'Light or dark'} tabIndex={0} onKeyDown={onKey}
      className="sky-toggle switch group pointer-events-auto inline-flex shrink-0 items-center rounded-full outline-none">
      {/* the track: the same see-through frost as the bottom dock, whatever is behind it */}
      <span className="frost-panel frost-edge frost-thin relative h-6 rounded-full transition-[width] duration-300 ease-[cubic-bezier(.4,0,.2,1)]"
        style={{ width: (stops.length - 1) * STEP + 24 }}>
        {/* the stops' own icons, faint, under the knob: always the same three, so switching the weather background
            slides them into place (night moves in, evening fades out) instead of swapping them */}
        {SKIES.map((s) => {
          const k = { morning: 0, evening: weather ? 1 : 0.5, night: weather ? 2 : 1 }[s], gone = !weather && s === 'evening';
          return (
            <span key={s} aria-hidden="true" className="pointer-events-none absolute top-[1px] grid size-5 place-items-center text-ink-hi/60 transition-[left,opacity,scale] duration-300 ease-[cubic-bezier(.4,0,.2,1)]"
              style={{ left: 1 + k * STEP, opacity: gone ? 0 : 1, scale: gone ? '.5' : '1' }}>{OPT[s].icon}</span>
          );
        })}
        <span className="switch-knob pointer-events-none absolute left-0 top-[1px] grid size-5 place-items-center rounded-full bg-white text-[#1f2933] transition-transform duration-300 ease-[cubic-bezier(.4,0,.2,1)]"
          style={{ transform: `translateX(${1 + i * STEP}px)` }}>
          {opt(stops[i]).icon}
        </span>
        {/* the stops, each an equal share of the track */}
        <span className="absolute inset-0 flex">
          {stops.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={s === stops[i]} aria-label={s === 'light' ? 'Light' : opt(s).label} title={s === 'light' ? 'Light' : opt(s).label}
              tabIndex={-1} onClick={() => pick(s)} className="h-full flex-1 rounded-full outline-none" />
          ))}
        </span>
      </span>
    </div>
  );
}
