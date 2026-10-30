// View preferences from the dock's ⋯ menu (DockMenu): show the time-of-day
// weather (sky and its light) and the floor grid. Remembered per viewer (localStorage) and written on the
// root as data-weather / data-grid / data-clay / data-corten, which index.css reads;
// nothing is redrawn. (clay: the architectural model look; corten: the Corten & terracotta look; both off by
// default, and only one at a time.)
import { useCallback, useLayoutEffect, useState } from 'react';
import { flushSync } from 'react-dom';

const KEY = 'floorplan.view';
const DEFAULTS = { weather: true, grid: true, clay: false, corten: false };
/** Material styles: at most one at a time (the architectural model or Corten & terracotta). */
const STYLES = ['clay', 'corten'];
const read = () => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; } };

/** [prefs, set(key, on)] */
export function useViewPrefs() {
  const [prefs, setPrefs] = useState(read);
  // written before paint (a layout effect), so a change made inside a view transition is in its new snapshot
  useLayoutEffect(() => {
    const root = document.documentElement;
    for (const k of Object.keys(DEFAULTS)) root.dataset[k] = prefs[k] ? 'on' : 'off';
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
