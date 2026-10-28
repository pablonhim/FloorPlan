// Wayfinding on a floor: the meeting rooms, and a walking route from the lift lobby to the main one.
//
// The route is a breadth-first search on the 20 cm cell grid of the whole floor (floorPlan + all units
// in floor coordinates + the core). Cells outside the floor plate, and every cell covered by a wall,
// glass wall, partition, pillar, the plan's outline walls or furniture, are blocked; door swings and
// zones (floor markings) are walkable. All lift doors are sources, so the route starts at the lift pair
// nearest the room; any free cell inside the room ends it. The cell path is then string-pulled (straight
// runs between corners that keep a clear line of sight) so it reads as a walking line, not a staircase.
import { cellRect } from '../iso/grid.js';
import { TILE } from '../iso/units.js';
import { CORE } from './floors.js';

const WALKABLE = new Set(['zone', 'door']);

/** Meeting rooms on the floor (zone items of kind 'meeting', floor coordinates), largest first. */
export function meetingRooms(items) {
  return items.filter((i) => i.type === 'zone' && i.kind === 'meeting').sort((a, b) => b.w * b.d - a.w * a.d);
}

function blockedGrid(plan, items, edges) {
  const { cols, rows } = plan;
  const free = new Uint8Array(cols * rows);
  plan.mask.forEach((row, ty) => [...row].forEach((c, tx) => {
    if (c !== '1') return;
    for (let y = ty * TILE; y < (ty + 1) * TILE && y < rows; y++) for (let x = tx * TILE; x < (tx + 1) * TILE && x < cols; x++) free[y * cols + x] = 1;
  }));
  const paint = (r, v) => {
    for (let y = Math.max(0, r.y0); y < Math.min(rows, r.y1); y++) for (let x = Math.max(0, r.x0); x < Math.min(cols, r.x1); x++) free[y * cols + x] = v;
  };
  for (const it of [...edges, ...items]) if (!WALKABLE.has(it.type)) paint(cellRect(it), 0);
  for (const it of items) if (it.type === 'door') paint(cellRect(it), 1);   // door openings stay passable
  return free;
}

/** True when every cell on the segment a→b (supercover walk) is free. */
function clear(free, cols, a, b) {
  let [x, y] = a;
  const [x1, y1] = b, dx = Math.abs(x1 - x), dy = Math.abs(y1 - y), sx = Math.sign(x1 - x), sy = Math.sign(y1 - y);
  let n = dx + dy, e = dx - dy;
  while (n-- > 0) {
    if (e > 0) { x += sx; e -= 2 * dy; } else if (e < 0) { y += sy; e += 2 * dx; } else { x += sx; y += sy; e += 2 * (dx - dy); n--; }
    if (!free[y * cols + x]) return false;
  }
  return true;
}

/**
 * Walking route from the lifts to the floor's main (largest) meeting room.
 * plan: floorPlan(floor); items: every unit's items in floor coordinates plus the core items; edges:
 * the plan's outline walls as items. Returns { room, path: [[cx, cy] cell centres] } or null.
 */
/**
 * Walking route from lift doors to any free cell inside the rectangle `goal` ({ gx, gy, w, d }, floor
 * cells). lifts: x of the lift shafts to start from (default: both lift pairs, so the nearest wins).
 * Returns [[cx, cy] …] cell path (string-pulled), or null when the goal cannot be reached.
 */
export function routeTo(plan, items, edges, goal, { lifts = [...CORE.liftsW, ...CORE.liftsE] } = {}) {
  const { cols, rows } = plan;
  const free = blockedGrid(plan, items, edges);
  const prev = new Int32Array(cols * rows).fill(-1);
  const queue = [];
  // sources: the corridor cells right in front of every lift door
  const liftFront = CORE.liftY + 9;
  for (const lx of lifts) {
    for (let x = lx + 2; x < lx + 7; x++) {
      const i = liftFront * cols + x;
      if (free[i] && prev[i] < 0) { prev[i] = i; queue.push(i); }
    }
  }
  const ix = Math.min(1, Math.floor((goal.w - 1) / 2)), iy = Math.min(1, Math.floor((goal.d - 1) / 2));
  const inGoal = (x, y) => x >= goal.gx + ix && x < goal.gx + goal.w - ix && y >= goal.gy + iy && y < goal.gy + goal.d - iy;
  let end = -1;
  for (let h = 0; h < queue.length && end < 0; h++) {
    const i = queue[h], x = i % cols, y = (i / cols) | 0;
    if (inGoal(x, y)) { end = i; break; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const j = ny * cols + nx;
      if (free[j] && prev[j] < 0) { prev[j] = i; queue.push(j); }
    }
  }
  if (end < 0) return null;
  const cells = [];
  for (let i = end; ; i = prev[i]) { cells.push([i % cols, (i / cols) | 0]); if (prev[i] === i) break; }
  cells.reverse();
  // string-pull: from each kept point, jump to the farthest point still in clear line of sight
  const path = [cells[0]];
  let k = 0;
  while (k < cells.length - 1) {
    let j = cells.length - 1;
    while (j > k + 1 && !clear(free, cols, cells[k], cells[j])) j--;
    path.push(cells[j]);
    k = j;
  }
  return path;
}

/** Walking route from the lifts to the floor's main (largest) meeting room: { room, path } or null. */
export function routeToMeeting(plan, items, edges) {
  const room = meetingRooms(items)[0];
  return room ? { room, path: routeTo(plan, items, edges, room) } : null;
}

/** KOSIGN's head-office unit on each rented floor: its main entrance is where "Go to KOSIGN" leads. */
export const KOSIGN_UNIT = { 2: 'B', 4: 'C' };

/** Route from the right-hand (east) lifts to KOSIGN's main entrance on the floor: { room, path }. */
export function routeToKosign(plan, items, edges) {
  const u = plan.units.find((x) => x.unit === KOSIGN_UNIT[plan.floor]);
  if (!u) return null;
  const door = items.find((i) => i.type === 'zone' && i.kind === 'entrance' &&
    i.gx >= u.ox && i.gx < u.ox + u.cols && i.gy >= u.oy && i.gy < u.oy + u.rows);
  if (!door) return null;
  return { room: { ...door, label: `KOSIGN · Unit ${u.unit}` }, path: routeTo(plan, items, edges, door, { lifts: CORE.liftsE }) };
}
