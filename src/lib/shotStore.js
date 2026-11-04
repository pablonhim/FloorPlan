// The screenshot button lives in the zoom dock (ZoomRail, drawn by App), but what it captures is the view on
// screen: the active view registers its shot here (useShot), the dock reads it (useShotAction).
import { useEffect, useRef, useSyncExternalStore } from 'react';

let current = null;
const subs = new Set();
const set = (fn) => { current = fn; subs.forEach((s) => s()); };

/** Registers `shoot` (returning a promise) as the screenshot while `active`; the newest closure is always used. */
export function useShot(active, shoot) {
  const ref = useRef(shoot);
  ref.current = shoot;
  useEffect(() => {
    if (!active) return undefined;
    const fn = () => ref.current();
    set(fn);
    return () => { if (current === fn) set(null); };
  }, [active]);
}

/** The active view's screenshot, or null while none is registered. */
export const useShotAction = () => useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => current);
