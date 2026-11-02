// The info button (ⓘ ⇄ ✕) just right of a view's bottom-left dock, with a floating white frosted panel that pops up
// above it, starting at its left edge: the same quick springy pop as the ⋯ menu (.menu-pop), gone at once on
// close; always mounted, inert while closed; the button wobbles as it closes. (The ⋯ menu has the bottom-right
// corner.)
import { useState } from 'react';
import MenuIcon from './MenuIcon.jsx';
import { useOneOpen } from '../lib/oneOpen.js';
import { useT } from '../lib/i18n.js';

/**
 * open / onOpen(next): the panel's state (the caller owns it). `fill`: the panel takes the full height above
 * the button, up to the header (a long, scrolling panel), instead of fitting its content (and scrolling past
 * that height). `id` names the panel for the button's aria-controls.
 */
export default function MenuPanel({ open, onOpen, label, fill = false, width = 'w-60', id, children }) {
  const t = useT();
  const [jelly, setJelly] = useState(false);
  useOneOpen(open, () => onOpen(false));
  const toggle = () => { if (open) setJelly(true); onOpen(!open); };
  // the header's 3.75rem above, the button's bottom line (0.75rem + 40px + 0.5rem gap) below
  const tall = 'calc(100dvh - 3.75rem - 3.75rem)';
  return (
    <div className="relative shrink-0">
      <aside id={id} inert={!open} aria-hidden={!open} aria-label={label} style={fill ? { height: tall } : { maxHeight: tall }}
        className={`menu-frost absolute bottom-full left-0 mb-2 ${width} rounded-[10px] flex flex-col ${open ? 'menu-pop pointer-events-auto visible' : 'pointer-events-none invisible'}`}>
        {children}
      </aside>
      <button type="button" onClick={toggle} onAnimationEnd={() => setJelly(false)}
        aria-expanded={open} aria-controls={id} aria-label={t(open ? 'Close {x}' : 'Open {x}', { x: label })}
        className={`frost-panel frost-edge frost-thin pointer-events-auto grid size-10 shrink-0 place-items-center rounded-full text-ink-hi hover:text-accent ${jelly ? 'jelly' : ''}`}>
        <MenuIcon open={open} />
      </button>
    </div>
  );
}
