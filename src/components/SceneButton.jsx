// Round frosted scene button (the building view's left column, and the floor view's tools): an icon in a
// small frosted circle; hovering or focusing it shows a frosted label + hint beside it at once. `red` marks
// an undo-style action, `active` a toggle that is on, `below` puts the hint under the button (for a row of
// buttons, as in the header) instead of beside it.

/** A 16 × 16 stroked icon in the current colour. */
export const icon = (d) => <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;

export default function SceneButton({ label, tip, onClick, red = false, active, below = false, children }) {
  const tone = red ? 'text-[#e5484d] hover:text-[#c9363b]' : active ? 'text-accent ring-1 ring-accent' : 'text-ink-hi hover:text-accent';
  return (
    <button type="button" onClick={onClick} aria-label={label} aria-pressed={active}
      className={`group relative frost-panel frost-edge grid size-9 place-items-center rounded-full ${tone}`}>
      {children}
      <span role="tooltip" className={`pointer-events-none absolute z-30 whitespace-nowrap rounded-lg frost-panel frost-edge px-2.5 py-1.5 text-left text-[11px] leading-snug opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 ${below ? 'left-1/2 top-full mt-2 -translate-x-1/2' : 'left-full top-1/2 ml-2 -translate-y-1/2'}`}>
        <span className={`block font-semibold ${red ? 'text-[#e5484d]' : 'text-ink-hi'}`}>{label}</span>
        <span className="block text-ink">{tip}</span>
      </span>
    </button>
  );
}
