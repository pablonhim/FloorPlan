// Zoom depth of the current view (building, floor or unit), shared by the view and the zoom rail. The view
// reports how far it is zoomed in (frac: 0 = as far out as it goes, 1 = as close) and handles the rail's
// commands.
import { useSyncExternalStore } from 'react';

let state = { frac: 0 };
const subs = new Set();
let handler = null;

export function setZoom(patch) {
  const next = { ...state, ...patch };
  if (next.frac === state.frac) return;
  state = next;
  subs.forEach((f) => f());
}
const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };
/** The zoom state, for the rail (re-renders only the component that reads it). */
export const useZoom = () => useSyncExternalStore(subscribe, () => state);

/** A view takes the rail's commands: { step: ±1 } (zoom in / out a notch) or { frac } (go to that depth). */
export function onZoomCommand(f) {
  handler = f;
  return () => { if (handler === f) handler = null; };
}
export const zoomCommand = (cmd) => handler?.(cmd);

/** frac for a zoom factor f within [fMin (closest), fMax (farthest)], on a log scale. */
export const fracOf = (f, fMin, fMax) => Math.max(0, Math.min(1, Math.log(fMax / f) / Math.log(fMax / fMin)));
/** …and back. */
export const factorOf = (frac, fMin, fMax) => fMax * (fMin / fMax) ** Math.max(0, Math.min(1, frac));
