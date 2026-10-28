// On/off switch: a pill track with a sliding knob that carries an icon (no text label beside it; the
// name is the tooltip and the accessible label). The knob always casts a soft shadow; a switch that is
// on (or has keyboard focus) gets a light accent glow behind its track for depth.

const I = (d, extra = null) => (
  <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}{extra}
  </svg>
);

/** Small icon set for the switches: [off, on]. */
export const ICONS = {
  theme: [
    I(<><circle cx="8" cy="8" r="3" /><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" /></>), // sun
    I(<path d="M13 9.5A5.5 5.5 0 0 1 6.5 3 5.5 5.5 0 1 0 13 9.5z" />),                                                                                   // moon
  ],
  labels: [
    I(<><path d="M3 4.5h10M8 4.5v8" /><path d="M2.5 13.5l11-11" /></>),                                                                                  // T, struck through
    I(<path d="M3 4.5h10M8 4.5v8" />),                                                                                                                  // T
  ],
  cutaway: [I(<><rect x="2.5" y="2.5" width="11" height="11" rx="1" /><path d="M2.5 9.5h11" strokeDasharray="1.6 1.6" /></>)],                        // box with a cut line
  core: [I(<><rect x="3" y="2" width="10" height="12" rx="1" /><path d="M6 6.5l2-2 2 2M6 9.5l2 2 2-2" /></>)],                                        // lift
  inUse: [I(<><circle cx="8" cy="5" r="2.5" /><path d="M3.5 14c0-2.8 2-4.5 4.5-4.5s4.5 1.7 4.5 4.5" /></>)],                                          // person
  open: [I(<><path d="M3 6h8v4a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6z" /><path d="M11 7h1.2a1.8 1.8 0 0 1 0 3.6H11M5.5 2.5v1.5M8 2.5v1.5" /></>)],          // cup
  lock: [
    I(<><rect x="3.5" y="7.5" width="9" height="6.5" rx="1" /><path d="M5.5 7.5V5a2.5 2.5 0 0 1 4.9-.7" /></>),                                       // unlocked
    I(<><rect x="3.5" y="7.5" width="9" height="6.5" rx="1" /><path d="M5.5 7.5V5a2.5 2.5 0 0 1 5 0v2.5" /></>),                                       // locked
  ],
};

export default function Switch({ checked, onChange, label, title, icon }) {
  const glyph = icon ? (checked ? icon[icon.length - 1] : icon[0]) : null;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title || label}
      onClick={() => onChange(!checked)}
      className="switch group inline-flex shrink-0 items-center rounded-full outline-none"
    >
      <span
        className={`switch-track relative h-6 w-11 rounded-full transition-colors duration-200 ${checked ? 'bg-accent' : 'bg-detail'}`}
        data-on={checked || undefined}
      >
        <span
          className={`switch-knob absolute top-0.5 grid size-5 place-items-center rounded-full bg-white transition-transform duration-200 ${checked ? 'text-accent' : 'text-ink'}`}
          style={{ transform: `translateX(${checked ? 22 : 2}px)` }}
        >
          {glyph}
        </span>
      </span>
    </button>
  );
}
