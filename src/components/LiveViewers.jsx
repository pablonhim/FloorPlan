// Live viewers, beside the credit line: an eye and how many people have the app open right now. Each tab posts a heartbeat to
// /api/presence every 20 s (and a goodbye when it closes); the answer is the number of tabs heard from in
// the last 45 s. Where the presence store is not reachable (local dev, or not set up on Vercel) the pill
// says so instead of showing a number.
import { useEffect, useState } from 'react';

const BEAT = 20_000;
const newId = () => (crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

export function useLiveViewers() {
  const [count, setCount] = useState(null);   // null: not known yet / offline
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const id = newId();
    let stop = false, timer = 0, fails = 0;
    const beat = async () => {
      if (document.visibilityState === 'hidden') { timer = setTimeout(beat, BEAT); return; }
      try {
        const r = await fetch('/api/presence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
        if (!r.ok) throw new Error(String(r.status));
        const { count: n } = await r.json();
        if (!stop) { setCount(n); setOffline(false); fails = 0; }
      } catch {
        fails++;
        if (!stop) setOffline(true);
      }
      // back off while the store is unreachable (no store in local dev: try again only now and then)
      if (!stop) timer = setTimeout(beat, fails ? Math.min(5 * 60_000, BEAT * 2 ** fails) : BEAT);
    };
    const leave = () => { try { navigator.sendBeacon?.('/api/presence', JSON.stringify({ id, leave: true })); } catch { /* best effort */ } };
    const onVis = () => { if (document.visibilityState === 'visible') { clearTimeout(timer); beat(); } };
    beat();
    window.addEventListener('pagehide', leave);
    document.addEventListener('visibilitychange', onVis);
    return () => { stop = true; clearTimeout(timer); leave(); window.removeEventListener('pagehide', leave); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  return { count, offline };
}

export default function LiveViewers() {
  const { count, offline } = useLiveViewers();
  // an eye and how many people are looking now; 0 when nobody is, or the count cannot be reached
  const n = !offline && count != null ? count : 0;
  return (
    <span role="status" aria-live="polite" aria-label={`${n} ${n === 1 ? 'person' : 'people'} viewing now`}
      title={offline ? 'Viewers: the live count is not reachable right now' : `${n} ${n === 1 ? 'person is' : 'people are'} viewing now (you included)`}
      className="pointer-events-auto inline-flex items-center gap-1 tabular-nums">
      <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
        className={n > 0 ? 'text-accent' : ''}>
        {/* it blinks now and then, like a real eye (CSS eye-blink) */}
        <g className="eye-blink"><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" /><circle cx="8" cy="8" r="2" /></g>
      </svg>
      {n}
    </span>
  );
}
