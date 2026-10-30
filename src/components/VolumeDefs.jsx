// Volume gradients for the material styles (the dock's ⋯ menu: Architectural model's wood, Corten &
// terracotta's steel and terracotta): each face is shaded across its own plane (objectBoundingBox on a face
// drawn in its plane's frame). Colours come from the stops' classes (index.css). One hidden <svg>: any svg in
// the page can reference its gradients.
const G = ({ id, top = false, stops }) => (
  <linearGradient id={id} x1="0" y1="0" x2={top ? 1 : 0} y2="1">
    {stops.map(([o, c]) => <stop key={o} offset={o} className={c} />)}
  </linearGradient>
);

export default function VolumeDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
      <defs>
        {/* the architectural model's wood (data-clay): warm muted oak to walnut, along each face */}
        <G id="vol-wood" top stops={[[0, 'vw-a'], [0.6, 'vw-b'], [1, 'vw-c']]} />
        <G id="vol-wood-side" stops={[[0, 'vw-b'], [1, 'vw-d']]} />
        {/* Corten & terracotta (data-corten): weathered steel, burnt sienna to deep rust */}
        <G id="vol-corten" top stops={[[0, 'vc-a'], [0.6, 'vc-b'], [1, 'vc-c']]} />
        <G id="vol-corten-side" stops={[[0, 'vc-b'], [1, 'vc-d']]} />
        <G id="vol-terra" top stops={[[0, 'vt2-a'], [1, 'vt2-b']]} />
        <G id="vol-terra-side" stops={[[0, 'vt2-b'], [1, 'vt2-c']]} />
      </defs>
    </svg>
  );
}
