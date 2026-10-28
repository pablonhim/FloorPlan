// Coalesce high-frequency updates (wheel, pointer drags) into one state update per animation frame:
// updater functions queued during a frame are composed and applied together, so a trackpad firing
// 120+ wheel events a second re-renders the view at most once per frame.
import { useCallback, useEffect, useRef } from 'react';

export function useFrameUpdater(set) {
  const queue = useRef([]);
  const id = useRef(0);
  useEffect(() => () => cancelAnimationFrame(id.current), []);
  return useCallback((fn) => {
    queue.current.push(fn);
    if (id.current) return;
    id.current = requestAnimationFrame(() => {
      id.current = 0;
      const fns = queue.current;
      queue.current = [];
      set((v) => fns.reduce((a, f) => f(a), v));
    });
  }, [set]);
}
