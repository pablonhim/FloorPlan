// The dock's dropdowns open when the mouse moves onto them, not only on a click: entering the button (or its open
// menu) opens it, leaving both closes it after a short grace (so the pointer can cross the gap between the
// button and the menu above it). A click no longer shuts a menu the hover just opened; on touch, where there
// is no hover, the click still toggles it. hold(): true while the menu must stay (a drag out of it under way).
import { useCallback, useEffect, useRef } from 'react';

const GRACE = 220;   // ms after leaving before it closes

export function useHoverOpen(open, setOpen, { hold } = {}) {
  const timer = useRef(0);
  const viaHover = useRef(false);   // opened by the hover (vs a click or the keyboard)
  const holdRef = useRef(hold);
  holdRef.current = hold;
  useEffect(() => { if (!open) viaHover.current = false; }, [open]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const onPointerEnter = useCallback((e) => {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(timer.current);
    if (!open) { viaHover.current = true; setOpen(true); }
  }, [open, setOpen]);
  const onPointerLeave = useCallback((e) => {
    if (e.pointerType !== 'mouse' || e.buttons || holdRef.current?.()) return;   // (a button held: a drag)
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { if (!holdRef.current?.()) setOpen(false); }, GRACE);
  }, [setOpen]);
  // the button's click: toggles, except that it leaves open a menu the hover opened
  const toggle = useCallback(() => setOpen((o) => (o && viaHover.current ? true : !o)), [setOpen]);
  return { hover: { onPointerEnter, onPointerLeave }, toggle, viaHover };
}
