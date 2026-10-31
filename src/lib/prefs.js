// View preferences from the dock's ⋯ menu (DockMenu): show the time-of-day
// weather (sky and its light) and the floor grid. Remembered per viewer (localStorage) and written on the
// root as data-weather / data-grid, which index.css reads; nothing is redrawn. (The architectural model's
// colours are the one look now: the old material-style switches, `clay` and `corten`, are gone, and remembered
// values of them are dropped, so data-clay / data-corten are never set.)
import { useCallback, useLayoutEffect, useState } from 'react';
import { flushSync } from 'react-dom';

const KEY = 'floorplan.view';
const DEFAULTS = { weather: true, grid: true };
/** Material styles: none any more (the architectural model's colours are the one look). */
const STYLES = [];
const read = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    return Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, typeof saved[k] === 'boolean' ? saved[k] : DEFAULTS[k]]));
  } catch { return { ...DEFAULTS }; }
};

/** [prefs, set(key, on)] */
export function useViewPrefs() {
  const [prefs, setPrefs] = useState(read);
  // written before paint (a layout effect), so a change made inside a view transition is in its new snapshot
  useLayoutEffect(() => {
    const root = document.documentElement;
    for (const k of Object.keys(DEFAULTS)) root.dataset[k] = prefs[k] ? 'on' : 'off';
    delete root.dataset.clay; delete root.dataset.corten;   // the retired material-style switches
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* storage blocked */ }
  }, [prefs]);
  // the weather background changes the whole page (sky, light, wall colours, the time-of-day switch's stops):
  // it cross-fades like a theme change instead of snapping (the switch itself, outside the fade, slides)
  const set = useCallback((k, on) => {
    const apply = () => setPrefs((p) => ({ ...p, ...(on && STYLES.includes(k) ? Object.fromEntries(STYLES.map((s) => [s, false])) : {}), [k]: on }));
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (k !== 'weather' || !document.startViewTransition || reduce) { apply(); return; }
    document.startViewTransition(() => flushSync(apply));
  }, []);
  return [prefs, set];
}
