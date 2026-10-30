// Theme (light / dark). The accent is fixed: a bright blue, the only hue in the drawing.
import { useCallback, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

/** Accent per theme: [accent, accent-hi]. */
const ACCENT = { dark: ['#2f8fff', '#9fd0ff'], light: ['#1f7bff', '#0b5ed7'] };

const read = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };

function applyTheme(theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  const [a, hi] = ACCENT[theme] || ACCENT.light;
  root.style.setProperty('--accent', a);
  root.style.setProperty('--accent-hi', hi);
  root.style.setProperty('--accent-dim', `color-mix(in srgb, ${a} 12%, transparent)`);
}

export function useTheme() {
  // light by default: the white architectural shell reads best on a white page
  const [theme, setThemeNow] = useState(() => read('floorplan.theme.v2', 'light'));

  useEffect(() => {
    applyTheme(theme);
    write('floorplan.theme.v2', theme);
  }, [theme]);

  // switching themes cross-fades the whole page (a view transition, timing in index.css); browsers without
  // the API, or with reduced motion requested, switch instantly
  // (also: `changes`, more to do inside the same fade, e.g. the time of day's sky — lib/sky)
  const setTheme = useCallback((next, changes = null) => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const run = () => {
      applyTheme(next);
      flushSync(() => { setThemeNow(next); changes?.(); });
    };
    if (!document.startViewTransition || reduce) { run(); return; }
    document.startViewTransition(run);
  }, []);

  // in-drawing text (room, team and employee names, signs, ground markings) can be hidden
  const [labels, setLabels] = useState(() => read('floorplan.labels', 'on') !== 'off');
  useEffect(() => {
    document.documentElement.dataset.labels = labels ? 'on' : 'off';
    write('floorplan.labels', labels ? 'on' : 'off');
  }, [labels]);

  return { theme, setTheme, light: theme === 'light', labels, setLabels };
}
