// Round scene button (the bottom docks of the building, floor and unit pages, and the unit page's edit
// buttons): an icon in a small circle, frosted on its own or plain inside a dock; hovering or focusing it
// shows a frosted label + hint at once. `red` marks
// an undo-style action, `active` a toggle that is on; `place` puts the hint beside the button ('side', for a
// column) or above / below it ('above' / 'below', for a row, e.g. the bottom tool row); `compact` is the
// smaller size of the floor and unit views' tool row, `tall` the dock's own height (40 px, for buttons that
// float beside it), `docked` a button inside their shared dock pill; `disabled` greys it out.

const TIP_AT = {
  side: 'left-full top-1/2 ml-2 -translate-y-1/2',
  below: 'left-1/2 top-full mt-2 -translate-x-1/2',
  above: 'left-1/2 bottom-full mb-2 -translate-x-1/2',
  'above-start': 'left-0 bottom-full mb-2',   // above, from the button's left edge (a button near the screen's left edge)
};

/** A 16 × 16 stroked icon in the current colour. */
export const icon = (d) => <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;

export default function SceneButton({ label, tip, onClick, red = false, active, place = 'side', compact = false, tall = false, docked = false, disabled = false, children }) {
  // docked: one of the buttons inside a shared frosted dock (no frost of its own; a soft tint on hover / when on)
  const tone = red ? 'text-[#e5484d] hover:text-[#c9363b]'
    : active ? (docked ? 'bg-accent-dim text-accent' : 'text-accent ring-1 ring-accent')
    : docked ? 'text-ink-hi hover:bg-[color-mix(in_srgb,var(--ink)_12%,transparent)]' : 'text-ink-hi hover:text-accent';
  return (
    <button type="button" onClick={onClick} aria-label={label} aria-description={tip || undefined} aria-pressed={active} disabled={disabled}
      className={`pop-ico group relative ${docked ? 'transition-colors' : 'frost-panel frost-edge frost-thin'} grid ${compact ? 'size-8' : tall ? 'size-10' : 'size-9'} place-items-center rounded-full ${tone} disabled:opacity-40 disabled:hover:text-ink-hi`}>
      <span className="ico">{children}</span>
      {/* the hint: just the button's short name, one line in a frosted pill (the longer `tip` is its
          accessible description) */}
      <span role="tooltip" className={`pointer-events-none absolute z-30 whitespace-nowrap rounded-full frost-panel frost-edge px-2.5 py-1 text-[11px] font-medium leading-none opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 ${red ? 'text-[#e5484d]' : 'text-ink-hi'} ${TIP_AT[place]}`}>
        {label}
      </span>
    </button>
  );
}
