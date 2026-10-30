// Theme (light / dark). The accent is fixed: a bright blue, the only hue in the drawing.
import { useCallback, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

/** Accent per theme: [accent, accent-hi]. */
const ACCENT = { dark: ['#2f8fff', '#9fd0ff'], light: ['#1f7bff', '#0b5ed7'] };

const read = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };

/** Where the pointer last went down: the theme switch's reveal grows from there. */
const lastPress = { at: null };
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', (e) => { lastPress.at = { x: e.clientX, y: e.clientY }; }, { capture: true, passive: true });
}

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

  // switching themes: the new one spreads over the page in a circle from where it was clicked (the toggle),
  // a view transition whose new snapshot is revealed by a growing clip; browsers without the API, or with
  // reduced motion requested, switch instantly
  const setTheme = useCallback((next) => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || reduce) { setThemeNow(next); return; }
    const { x, y } = lastPress.at || { x: window.innerWidth - 40, y: 28 };
    const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    const t = document.startViewTransition(() => {
      applyTheme(next);
      flushSync(() => setThemeNow(next));
    });
    t.ready.then(() => document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 700, easing: 'cubic-bezier(.65, 0, .35, 1)', pseudoElement: '::view-transition-new(root)' },
    )).catch(() => {});
  }, []);

  // in-drawing text (room, team and employee names, signs, ground markings) can be hidden
  const [labels, setLabels] = useState(() => read('floorplan.labels', 'on') !== 'off');
  useEffect(() => {
    document.documentElement.dataset.labels = labels ? 'on' : 'off';
    write('floorplan.labels', labels ? 'on' : 'off');
  }, [labels]);

  return { theme, setTheme, light: theme === 'light', labels, setLabels };
}
