// Time of day for the backdrop and the light on the drawing: morning, evening or night, chosen with the
// header's toggle (SkyToggle) and remembered; until one is chosen it follows the viewer's clock (evening from
// 16:00 to 20:00, morning by day, night in the dark theme). Night is the dark theme, morning and evening the
// light one. Written on the root as data-sky; index.css paints the sky behind the drawing and a soft ambient
// tint over it (static CSS layers, nothing redrawn per frame). ?sky=morning|evening|night forces one.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export const SKIES = ['morning', 'evening', 'night'];
const KEY = 'floorplan.sky';
const valid = (s) => (SKIES.includes(s) ? s : null);
const forced = () => { try { return valid(new URLSearchParams(location.search).get('sky')); } catch { return null; } };
const stored = () => { try { return valid(localStorage.getItem(KEY)); } catch { return null; } };

/** The clock's time of day, in the given theme (used until a time of day is chosen). */
export function skyOf(theme, date = new Date()) {
  if (theme === 'dark') return 'night';
  const h = date.getHours();
  return h >= 16 && h < 20 ? 'evening' : 'morning';
}

/**
 * [sky, choose(sky)]: choosing also switches the theme (night: dark; morning, evening: light). `weather` off
 * (the header's settings) keeps the theme but drops the sky and its light: data-sky is then "none".
 */
export function useSky(theme, setTheme, weather = true) {
  const showing = useRef(weather);
  showing.current = weather;
  const [chosen, setChosen] = useState(() => forced() || stored());
  const [clock, setClock] = useState(() => skyOf(theme));
  useEffect(() => {
    setClock(skyOf(theme));
    const id = setInterval(() => setClock(skyOf(theme)), 60_000);
    return () => clearInterval(id);
  }, [theme]);
  const sky = chosen || clock;
  // a remembered (or forced) choice brings its theme with it
  useEffect(() => {
    const want = sky === 'night' ? 'dark' : 'light';
    if (chosen && theme !== want) setTheme(want);
  }, [chosen]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { document.documentElement.dataset.sky = weather ? sky : 'none'; }, [sky, weather]);
  // the sky and the theme change together, inside the theme's cross-fade
  const choose = useCallback((s) => {
    try { localStorage.setItem(KEY, s); } catch { /* storage blocked */ }
    setTheme(s === 'night' ? 'dark' : 'light', () => {
      document.documentElement.dataset.sky = showing.current ? s : 'none';
      setChosen(s);
    });
  }, [setTheme]);
  return [sky, choose];
}
