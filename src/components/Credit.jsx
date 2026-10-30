// The credit line, under the logo in the app header on every page, with how many people are viewing now.
import LiveViewers from './LiveViewers.jsx';

export default function Credit() {
  return (
    <span className="flex items-center gap-2 whitespace-nowrap text-[11px] leading-none text-ink/60">
      Designed by Pablo. Powered by isoglow.
      <LiveViewers />
    </span>
  );
}
