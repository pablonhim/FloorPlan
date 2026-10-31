// A desk and its floating name card answer each other on hover: over the card, its desk lights up (.desk-hot);
// over the desk, its card lifts (.lift, the same transition as hovering the card) — and either way the card
// comes to the front of any it overlaps (SVG draws in document order, no z-index: the card is moved to the end
// of its group). Listens on the view's svg (`ref`), so drawings rebuilt by a redraw work too.
import { useEffect } from 'react';

export function useRaiseOnHover(ref) {
  useEffect(() => {
    const svg = ref.current;
    if (!svg) return undefined;
    let cur = null;
    const esc = (id) => (window.CSS?.escape ? CSS.escape(id) : id);
    const parts = (id) => ({
      card: svg.querySelector(`.desk-callout[data-for="${esc(id)}"]`),
      desk: svg.querySelector(`g[data-id="${esc(id)}"], g[data-item="${esc(id)}"]`),
    });
    const set = (id) => {
      if (id === cur) return;
      if (cur) { const p = parts(cur); p.card?.classList.remove('lift'); p.desk?.classList.remove('desk-hot'); }
      cur = id;
      if (!id) return;
      const { card, desk } = parts(id);
      if (card) { card.classList.add('lift'); if (card !== card.parentNode.lastElementChild) card.parentNode.appendChild(card); }
      desk?.classList.add('desk-hot');
    };
    const over = (e) => {
      const card = e.target.closest?.('.desk-callout');
      if (card) { set(card.dataset.for); return; }
      const g = e.target.closest?.('g[data-item], g[data-id]');
      set(g && svg.querySelector(`.desk-callout[data-for="${esc(g.dataset.item || g.dataset.id)}"]`) ? (g.dataset.item || g.dataset.id) : null);
    };
    const leave = () => set(null);
    svg.addEventListener('pointerover', over);
    svg.addEventListener('pointerleave', leave);
    return () => { svg.removeEventListener('pointerover', over); svg.removeEventListener('pointerleave', leave); };
  }, [ref]);
}
