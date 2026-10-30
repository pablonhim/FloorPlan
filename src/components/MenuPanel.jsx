// A bottom-right menu button (hamburger ⇄ ✕) with a floating frosted panel that pops up above it, as on the
// building page's floor list: the same quick springy pop as the dock's ⋯ menu (.menu-pop), gone at once on
// close; always mounted, inert while closed; the button wobbles as it closes.
import { useState } from 'react';
import MenuIcon from './MenuIcon.jsx';
import { useOneOpen } from '../lib/oneOpen.js';

/**
 * open / onOpen(next): the panel's state (the caller owns it). `fill`: the panel takes the full height above
 * the button (a long, scrolling panel) instead of fitting its content.
 */
export default function MenuPanel({ open, onOpen, label, fill = false, width = 'w-60', children }) {
  const [jelly, setJelly] = useState(false);
  useOneOpen(open, () => onOpen(false));
  const toggle = () => { if (open) setJelly(true); onOpen(!open); };
  return (
    <div className={`pointer-events-none absolute top-[3.75rem] bottom-3 right-3 z-10 flex ${width} flex-col items-end justify-end gap-2`}>
      <aside inert={!open} aria-hidden={!open} aria-label={label}
        className={`frost-panel frost-edge frost-thin ${width} min-h-0 ${fill ? 'flex-1' : ''} rounded-xl flex flex-col ${open ? 'menu-pop pointer-events-auto visible' : 'pointer-events-none invisible'}`}>
        {children}
      </aside>
      <button type="button" onClick={toggle} onAnimationEnd={() => setJelly(false)}
        aria-expanded={open} aria-label={open ? `Close ${label}` : `Open ${label}`} title={open ? 'Close' : label}
        className={`frost-panel frost-edge frost-thin pointer-events-auto grid size-10 shrink-0 place-items-center rounded-full text-ink-hi hover:text-accent ${jelly ? 'jelly' : ''}`}>
        <MenuIcon open={open} />
      </button>
    </div>
  );
}
