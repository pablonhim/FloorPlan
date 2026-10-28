// Hamburger icon that morphs into an ✕ while `open`: the top and bottom lines slide to the centre and
// turn ±45°, the middle one fades. A springy ease (slight overshoot) stands in for a spring animation;
// the motion is dropped for users who prefer reduced motion.

const LINE = 'origin-center [transform-box:fill-box] transition-[transform,opacity] duration-[450ms] ease-[cubic-bezier(.34,1.56,.64,1)] motion-reduce:transition-none';

export default function MenuIcon({ open, size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line className={LINE} x1="4" x2="20" y1="6" y2="6" style={{ transform: open ? 'translateY(6px) rotate(45deg)' : 'none' }} />
      <line className={LINE} x1="4" x2="20" y1="12" y2="12" style={{ opacity: open ? 0 : 1 }} />
      <line className={LINE} x1="4" x2="20" y1="18" y2="18" style={{ transform: open ? 'translateY(-6px) rotate(-45deg)' : 'none' }} />
    </svg>
  );
}
