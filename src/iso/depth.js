// Painter's-order sort for axis-aligned boxes in isometric view.
//
// A node is { x0, y0, x1, y1, z0, z1 } in world units. With +x down-right and +y down-left,
// a box must be painted before another when it lies entirely at smaller x or smaller y, or
// when the footprints overlap and it sits entirely below. Boxes separated along x one way and
// along y the other way never overlap on screen, so either order is correct for them.

export function behind(a, b) {
  if (a.x1 <= b.x0 || a.y1 <= b.y0) return true;
  const disjoint = b.x1 <= a.x0 || b.y1 <= a.y0;
  return !disjoint && a.z1 <= b.z0;
}

const key = (n) => n.x0 + n.y0 + n.z0 * 1e-3;

/** Returns nodes in back-to-front order (topological sort, stable fallback for ties/cycles). */
export function depthSort(nodes) {
  const n = nodes.length;
  if (n < 2) return nodes.slice();
  const indeg = new Array(n).fill(0);
  const out = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j && behind(nodes[i], nodes[j]) && !behind(nodes[j], nodes[i])) {
        out[i].push(j);
        indeg[j]++;
      }
    }
  }
  const done = new Array(n).fill(false);
  const order = [];
  for (let k = 0; k < n; k++) {
    let pick = -1;
    for (let i = 0; i < n; i++) {
      if (done[i] || indeg[i] > 0) continue;
      if (pick < 0 || key(nodes[i]) < key(nodes[pick])) pick = i;
    }
    if (pick < 0) { // cycle (only possible with overlapping ghosts): fall back to key order
      for (let i = 0; i < n; i++) if (!done[i] && (pick < 0 || key(nodes[i]) < key(nodes[pick]))) pick = i;
    }
    done[pick] = true;
    order.push(nodes[pick]);
    for (const j of out[pick]) indeg[j]--;
  }
  return order;
}
