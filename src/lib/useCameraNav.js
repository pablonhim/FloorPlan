// Navigation between the views (building → floor → unit): the view switches at once and the new one
// settles in with a short, light ease (.view-enter in index.css; none for reduced motion).
import { useCallback, useState } from 'react';

const keyOf = (v) => `${v.kind}-${v.floor ?? ''}-${v.unit ?? ''}`;

export function useCameraNav(initial) {
  const [view, setView] = useState(initial);
  const go = useCallback((next) => setView(next), []);
  // one layer, keyed by the view so each switch remounts it and replays the enter animation
  const layers = [{ key: keyOf(view), view, style: undefined, enter: true }];
  const stageRef = useCallback(() => {}, []);
  const bindLayer = useCallback(() => () => {}, []);
  return { view, go, stageRef, layers, bindLayer };
}
