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
      <filter id="bloom" {...U}>
        {light ? <feFlood floodOpacity="0" /> : <feGaussianBlur stdDeviation="9" />}
      </filter>
    </defs>
  );
}
