// Display language: English (the default), Khmer or Korean, chosen in the dock's ⋯ menu and remembered per
// viewer (localStorage). The English text in the code is the key: t('Floor {n}', { n: 4 }) looks it up in the
// chosen language's table (lib/strings) and falls back to the English itself, so a missing entry still reads.
// The choice is written on the root as lang="…", which index.css reads for the Khmer font.
import { useCallback, useSyncExternalStore } from 'react';
import STRINGS from './strings.js';

export const LANGS = [
  { code: 'en', name: 'English' },
  { code: 'km', name: 'ខ្មែរ' },
  { code: 'ko', name: '한국어' },
];
const KEY = 'floorplan.lang';

const read = () => { try { const l = localStorage.getItem(KEY); return LANGS.some((x) => x.code === l) ? l : 'en'; } catch { return 'en'; } };
let lang = typeof window === 'undefined' ? 'en' : read();
const subs = new Set();
const mark = () => { if (typeof document !== 'undefined') document.documentElement.lang = lang; };
mark();

export const getLang = () => lang;
export function setLang(next) {
  if (next === lang || !LANGS.some((x) => x.code === next)) return;
  lang = next;
  try { localStorage.setItem(KEY, next); } catch { /* storage blocked */ }
  mark();
  subs.forEach((f) => f());
}
const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };

/**
 * Text in the current language. `s` is the English, or [english, vars] (e.g. a message kept in state); a var
 * that is itself [english, vars] is translated too.
 */
export function t(s, vars) {
  if (Array.isArray(s)) [s, vars] = s;
  if (!s) return s;
  const out = (lang !== 'en' && STRINGS[lang]?.[s]) || s;
  return vars ? out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? (Array.isArray(vars[k]) ? t(vars[k]) : vars[k]) : m)) : out;
}

/** A placement check's reason (iso/grid validate, in English) as a message part t() translates. */
export const why = (r) => (r?.startsWith('collides with ') ? ['collides with {x}', { x: r.slice(14) }] : [r]);

/** [lang, setLang]: a component that shows text re-renders when the language changes. */
export function useLang() {
  return [useSyncExternalStore(subscribe, getLang, () => 'en'), setLang];
}

/** t, re-bound on every language change (use it in components). */
export function useT() {
  const [l] = useLang();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback((s, vars) => t(s, vars), [l]);
}
