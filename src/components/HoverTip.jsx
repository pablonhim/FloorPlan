// Hover card for the floor and unit views: the item under the pointer (any group carrying data-tip, even
// under an overlay such as a unit's click area) gets a small frosted card beside the pointer, in the same
// frosted-glass style as the tower's floor card. Replaces the browser's plain title tooltips.
import { useCallback, useRef, useState } from 'react';

/**
 * [tip, onMove, hide] — call onMove from the svg's pointer move (pass `off` while dragging / placing). The
 * hovered object itself is lit up too (class `tip-hot`, set straight on its group).
 */
export function useHoverTip(stageRef) {
  const [tip, setTip] = useState(null);
  const hot = useRef(null);
  const light = (el) => {
    if (hot.current === el) return;
    hot.current?.classList.remove('tip-hot');
    el?.classList.add('tip-hot');
    hot.current = el;
  };
  const onMove = useCallback((e, off = false) => {
    const stage = stageRef.current;
    if (off || !stage) { light(null); setTip(null); return; }
    const hit = document.elementsFromPoint(e.clientX, e.clientY).map((el) => el.closest?.('[data-tip]')).find(Boolean);
    light(hit || null);
    if (!hit) { setTip(null); return; }
    const r = stage.getBoundingClientRect();
    setTip({ title: hit.dataset.tip, sub: hit.dataset.tipSub, x: e.clientX - r.left, y: e.clientY - r.top, w: r.width });
  }, [stageRef]);
  const hide = useCallback(() => { light(null); setTip(null); }, []);
  return [tip, onMove, hide];
}

export function HoverTip({ tip }) {
  if (!tip) return null;
  // beside the pointer, flipped to its left near the stage's right edge
  const left = tip.x + 16 + 220 > tip.w ? tip.x - 16 : tip.x + 16;
  return (
    <div role="tooltip" className="frost pointer-events-none absolute z-20 max-w-[220px] rounded-xl px-3 py-2"
      style={{ left, top: tip.y + 14, transform: left < tip.x ? 'translateX(-100%)' : undefined }}>
      <div className="text-[12.5px] font-medium leading-tight text-ink-hi">{tip.title}</div>
      {tip.sub ? <div className="mt-0.5 text-[11px] leading-snug text-ink">{tip.sub}</div> : null}
    </div>
  );
}
