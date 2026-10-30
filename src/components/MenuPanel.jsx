// A bottom-right menu button (hamburger ⇄ ✕) with a floating frosted panel that grows out of it, as on the
// building page's floor list: always mounted, so it can scale out of / back into the button (springy open,
// quick close), inert while closed; the button wobbles once the panel has shrunk back into it.
import { useState } from 'react';
import MenuIcon from './MenuIcon.jsx';

/**
 * open / onOpen(next): the panel's state (the caller owns it). `fill`: the panel takes the full height above
 * the button (a long, scrolling panel) instead of fitting its content.
 */
export default function MenuPanel({ open, onOpen, label, fill = false, width = 'w-60', children }) {
  const [jelly, setJelly] = useState(false);
  const toggle = () => { if (open) setJelly(true); onOpen(!open); };
  return (
    <div className={`pointer-events-none absolute top-[3.75rem] bottom-3 right-3 z-10 flex ${width} flex-col items-end justify-end gap-2`}>
      {/* scales from the button's centre: 20px in from its right edge and 28px below the panel (8px gap + half
          the 40px button) */}
      <aside inert={!open} aria-hidden={!open} aria-label={label}
        className={`frost-panel frost-edge ${width} min-h-0 ${fill ? 'flex-1' : ''} origin-[calc(100%-20px)_calc(100%+28px)] rounded-2xl flex flex-col transition-[scale,visibility] motion-reduce:transition-none ${open ? 'pointer-events-auto visible scale-100 duration-[420ms] ease-[cubic-bezier(.34,1.56,.64,1)]' : 'pointer-events-none invisible scale-0 duration-[260ms] ease-[cubic-bezier(.55,0,.75,.2)]'}`}>
        {children}
      </aside>
      <button type="button" onClick={toggle} onAnimationEnd={() => setJelly(false)}
        aria-expanded={open} aria-label={open ? `Close ${label}` : `Open ${label}`} title={open ? 'Close' : label}
        className={`frost-panel frost-edge pointer-events-auto grid size-10 shrink-0 place-items-center rounded-full text-ink-hi hover:text-accent ${jelly ? 'jelly' : ''}`}>
        <MenuIcon open={open} />
      </button>
    </div>
  );
}
