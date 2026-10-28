// Navigation between the views (building → floor → unit): the view switches at once and the new one
// settles in with a short, light ease (.view-enter in index.css; none for reduced motion).
import { useCallback, useState } from 'react';

// unit views share one key per floor: going to another unit on the same floor keeps the editor mounted, so
// its own camera glide (FloorEditor) hands over to the new unit without a remount; the floor view keeps one
// key for every floor, so switching floor 2 ↔ 4 there swaps just the plan, not the whole page
const keyOf = (v) => (v.kind === 'unit' ? `unit-${v.floor}` : v.kind === 'floor' ? 'floor' : v.kind);

export function useCameraNav(initial) {
  const [view, setView] = useState(initial);
  const go = useCallback((next) => setView(next), []);
  // one layer, keyed by the view so each switch remounts it and replays the enter animation
  const layers = [{ key: keyOf(view), view, style: undefined, enter: true }];
  const stageRef = useCallback(() => {}, []);
  const bindLayer = useCallback(() => () => {}, []);
  return { view, go, stageRef, layers, bindLayer };
}
