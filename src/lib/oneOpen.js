// Only one menu or side panel is open at a time: each one registers here, and when one opens every other
// open one closes itself.
import { useEffect, useRef } from 'react';

const subs = new Set();

/** open: whether this menu is open now; close(): closes it (called when another one opens). */
export function useOneOpen(open, close) {
  const me = useRef(null);
  const state = useRef({ open, close });
  state.current = { open, close };
  useEffect(() => {
    const f = (who) => { if (who !== f && state.current.open) state.current.close(); };
    me.current = f;
    subs.add(f);
    return () => { subs.delete(f); };
  }, []);
  useEffect(() => {
    if (open) for (const f of [...subs]) f(me.current);
  }, [open]);
}
