// Glow filters from iso-glow. In the light theme there is no glow: #glow/#soft pass the
// drawing through and #bloom draws nothing.
export default function IsoDefs({ light }) {
  const U = { filterUnits: 'userSpaceOnUse', x: -2000, y: -2000, width: 6000, height: 6000 };
  const pass = <feMerge><feMergeNode in="SourceGraphic" /></feMerge>;
  return (
    <defs>
      <filter id="glow" {...U}>
        {light ? pass : (<><feGaussianBlur stdDeviation="4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></>)}
      </filter>
      <filter id="soft" {...U}>
        {light ? pass : (<><feGaussianBlur stdDeviation="2.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></>)}
      </filter>
      <filter id="ao" {...U}><feGaussianBlur stdDeviation="2.4" /></filter>
      <filter id="penumbra" {...U}><feGaussianBlur stdDeviation="1.6" /></filter>
      {/* contents seen through frosted glass */}
      <filter id="frost-blur" {...U}><feGaussianBlur stdDeviation="2.2" /></filter>
      {/* what moves behind a frosted (see-through) building: softened, not smeared */}
      <filter id="frost-soft" {...U}><feGaussianBlur stdDeviation="1.1" /></filter>
      {/* WC wall lights (catalog wc): a beam bright under the lamp, gone by the floor */}
      <linearGradient id="wall-beam" x1="0" y1="0" x2="0" y2="1">
        <stop className="wall-beam-stop" offset="0" stopOpacity=".75" />
        <stop className="wall-beam-stop" offset=".6" stopOpacity=".22" />
        <stop className="wall-beam-stop" offset="1" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="wall-beam-x" x1="1" y1="0" x2="0" y2="0">
        <stop className="wall-beam-stop" offset="0" stopOpacity=".7" />
        <stop className="wall-beam-stop" offset=".6" stopOpacity=".2" />
        <stop className="wall-beam-stop" offset="1" stopOpacity="0" />
      </linearGradient>
      {/* monitor rays (catalog desk): the beam fades from the screen toward the chair, per desk rotation */}
      {[[0, 0, 0, 0, 1], [90, 1, 0, 0, 0], [180, 0, 1, 0, 0], [270, 0, 0, 1, 0]].map(([r, x1, y1, x2, y2]) => (
        <linearGradient key={r} id={`ray-${r}`} x1={x1} y1={y1} x2={x2} y2={y2}>
          <stop className="ray-stop" offset="0" stopOpacity=".6" />
          <stop className="ray-stop" offset=".55" stopOpacity=".2" />
          <stop className="ray-stop" offset="1" stopOpacity="0" />
        </linearGradient>
      ))}
      <filter id="bloom" {...U}>
        {light ? <feFlood floodOpacity="0" /> : <feGaussianBlur stdDeviation="9" />}
      </filter>
    </defs>
  );
}
