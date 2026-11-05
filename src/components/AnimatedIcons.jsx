// Small animated icons (the shapes of lucide's animated set): each moves when the button around it is hovered
// or keyboard-focused — the bin's lid lifts, the download arrow drops, the crop frame's lines spread. Drawn as
// plain SVG and animated in CSS (index.css, .ai-*), so no animation library is needed.

const svg = (size, cls, children) => (
  <svg className={`ai ${cls}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

/** A bin whose lid lifts (delete / discard). Shown in red wherever it is used (see .ai-delete). */
export const DeleteIcon = ({ size = 18 }) => svg(size, 'ai-delete', <>
  <g className="ai-lid"><path d="M3 6h18" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></g>
  <path className="ai-bin" d="M19 8v12c0 1-1 2-2 2H7c-1 0-2-1-2-2V8" />
  <line className="ai-slot" x1="10" x2="10" y1="11" y2="17" />
  <line className="ai-slot" x1="14" x2="14" y1="11" y2="17" />
</>);

/** A tray with an arrow that drops into it (download). */
export const DownloadIcon = ({ size = 18 }) => svg(size, 'ai-download', <>
  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
  <g className="ai-arrow"><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></g>
</>);

/** A frame of four crossing lines that spread apart (crop). */
export const FrameIcon = ({ size = 18 }) => svg(size, 'ai-frame', <>
  <line className="ai-top" x1="22" x2="2" y1="6" y2="6" />
  <line className="ai-bottom" x1="22" x2="2" y1="18" y2="18" />
  <line className="ai-left" x1="6" x2="6" y1="2" y2="22" />
  <line className="ai-right" x1="18" x2="18" y1="2" y2="22" />
</>);

// the grip's dots, in the order the wave runs through them (from the top right corner)
const GRIP = [[19, 5], [19, 12], [12, 5], [19, 19], [12, 12], [5, 5], [12, 19], [5, 12], [5, 19]];

/** A 3 × 3 grip of dots that dim one after another in a wave (the objects button). */
export const GripIcon = ({ size = 18 }) => svg(size, 'ai-grip', GRIP.map(([cx, cy], i) => (
  <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1" style={{ '--i': i }} />
)));
