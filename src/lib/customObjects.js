// "My objects": items saved from the editor (Save to Object Panel) as reusable presets — the selected item's
// exact configuration (type, size, rotation, name / team / note, room kind, switches, layer …), without its
// place or identity — remembered per viewer (localStorage) and offered at the top of the Objects panel and
// in the Replace picker.
import { useCallback, useEffect, useState } from 'react';
import { SIZES } from '../model/catalog.js';

const KEY = 'floorplan.customObjects';
const KEEP = ['type', 'rot', 'w', 'd', 'name', 'team', 'note', 'kind', 'label', 'en', 'on', 'flip', 'gender', 'doorSide', 'layer'];

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((o) => o && o.key && o.preset && SIZES[o.preset.type]) : [];
  } catch { return []; }
}

/** A preset from an item: its configuration only (no id, position or lock). */
export function presetOf(item) {
  return Object.fromEntries(KEEP.filter((k) => item[k] !== undefined && item[k] !== '').map((k) => [k, item[k]]));
}

/** What a saved object is called in the panel: its kind, and what sets it apart. */
export function nameOf(preset) {
  const s = SIZES[preset.type], bits = [preset.name, preset.type === 'zone' ? preset.label : null, preset.team].filter(Boolean);
  return `${s.label}${bits.length ? ` · ${bits.join(' · ')}` : ''}`;
}

/** [objects, save(item), remove(key)] — the saved objects, kept in step across the views. */
export function useCustomObjects() {
  const [list, setList] = useState(read);
  useEffect(() => {
    const on = (e) => { if (e.key === KEY || e.type === 'custom-objects') setList(read()); };
    window.addEventListener('storage', on);
    window.addEventListener('custom-objects', on);
    return () => { window.removeEventListener('storage', on); window.removeEventListener('custom-objects', on); };
  }, []);
  const write = useCallback((next) => {
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked: kept for this session */ }
    setList(next);
    window.dispatchEvent(new Event('custom-objects'));
  }, []);
  const save = useCallback((item) => {
    const preset = presetOf(item), same = (o) => JSON.stringify(o.preset) === JSON.stringify(preset);
    const cur = read();
    if (cur.some(same)) return null;   // already there
    const obj = { key: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, label: nameOf(preset), preset };
    write([obj, ...cur]);
    return obj;
  }, [write]);
  const remove = useCallback((key) => write(read().filter((o) => o.key !== key)), [write]);
  return [list, save, remove];
}
