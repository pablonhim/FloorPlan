// Info icon (a circled "i") that turns into an ✕ while `open`: the two cross-fade with a quarter turn on a
// springy ease (slight overshoot); the motion is dropped for users who prefer reduced motion.

const PART = 'origin-center [transform-box:view-box] transition-[transform,opacity] duration-[450ms] ease-[cubic-bezier(.34,1.56,.64,1)] motion-reduce:transition-none';

export default function MenuIcon({ open, size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <g className={PART} style={{ opacity: open ? 0 : 1, transform: open ? 'rotate(90deg) scale(.6)' : 'none' }}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5.5" />
        <circle cx="12" cy="7.6" r=".4" fill="currentColor" />
      </g>
      <g className={PART} style={{ opacity: open ? 1 : 0, transform: open ? 'none' : 'rotate(-90deg) scale(.6)' }}>
        <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
      </g>
    </svg>
  );
}
