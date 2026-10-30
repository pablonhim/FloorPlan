// Hover tip for the floor and unit views: the item under the pointer (any group carrying data-tip, even
// under an overlay such as a unit's click area) gets a small frosted pill just above the pointer: it pops up
// with a gentle elastic wobble when the pointer reaches a new item, and follows the pointer while it moves over
// that item. Replaces the browser's plain title tooltips.
import { useCallback, useRef, useState } from 'react';
import { tipLang } from '../model/catalog.js';

/**
 * [tip, onMove, hide] — call onMove from the svg's pointer move (pass `off` while dragging / placing). The
 * hovered object itself is lit up too (class `tip-hot`, set straight on its group).
 */
export function useHoverTip(stageRef, { top = false } = {}) {
  const [tip, setTip] = useState(null);
  const hot = useRef(null), n = useRef(0);
  const light = (el) => {
    hot.current?.classList.remove('tip-hot');
    el?.classList.add('tip-hot');
    hot.current = el;
  };
  const onMove = useCallback((e, off = false) => {
    const stage = stageRef.current;
    if (off || !stage) { light(null); setTip(null); return; }
    // top: only the topmost element counts (the building view: nothing behind the building); otherwise any
    // under the pointer, even beneath an overlay
    const els = top ? [document.elementFromPoint(e.clientX, e.clientY)] : document.elementsFromPoint(e.clientX, e.clientY);
    const hit = els.map((el) => el?.closest?.('[data-tip]')).find(Boolean) || null;
    const r = stage.getBoundingClientRect();
    // the same item: the pill follows the pointer (no new pop)
    if (hit && hit === hot.current) { setTip((t) => (t ? { ...t, x: e.clientX - r.left, y: e.clientY - r.top } : t)); return; }
    light(hit);
    if (!hit) { setTip(null); return; }
    // one language: the display language's (render.tipAttrs), English where it has no words of its own
    const L = tipLang(), cap = L[0].toUpperCase() + L.slice(1), d = hit.dataset;
    const title = d[`tip${cap}`] ?? d.tip, sub = d[`tipSub${cap}`] ?? d.tipSub;
    setTip({ id: ++n.current, title, sub, x: e.clientX - r.left, y: e.clientY - r.top, w: r.width });
  }, [stageRef, top]);
  const hide = useCallback(() => { light(null); setTip(null); }, []);
  return [tip, onMove, hide];
}

export function HoverTip({ tip }) {
  if (!tip) return null;
  // centred just above the pointer, kept inside the stage's sides
  const x = Math.max(90, Math.min(tip.w - 90, tip.x));
  return (
    <div key={tip.id} role="tooltip" className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full" style={{ left: x, top: tip.y - 10 }}>
      <div className="tip-pop frost flex max-w-[220px] items-baseline gap-1 whitespace-nowrap rounded-full px-2 py-1"
        style={{ transformOrigin: `calc(50% + ${tip.x - x}px) 100%` }}>
        <span className="truncate text-[11px] font-medium leading-none text-ink-hi">{tip.title}</span>
        {tip.sub ? <span className="truncate text-[10px] leading-none text-ink">{tip.sub}</span> : null}
      </div>
    </div>
  );
}
