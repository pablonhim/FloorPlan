import { describe, it, expect } from 'vitest';
import { floorPlan, toFloor, coreItems, seedAll, RENTED } from './floors.js';
import { edgeItems } from '../iso/render.js';
import { routeToMeeting, meetingRooms, routeToKosign } from './wayfinding.js';
import { CORE } from './floors.js';

describe('wayfinding', () => {
  const plans = seedAll();
  for (const floor of RENTED) {
    it(`finds a walking route from the lifts to the main meeting room on floor ${floor}`, () => {
      const plan = floorPlan(floor);
      const items = [...plan.units.flatMap((u) => toFloor(plans[u.id], u.ox, u.oy)), ...coreItems()];
      const r = routeToMeeting(plan, items, edgeItems(plan));
      expect(meetingRooms(items).length).toBeGreaterThan(0);
      expect(r.path).toBeTruthy();
      const [, sy] = r.path[0], [ex, ey] = r.path.at(-1);
      expect(sy).toBe(96);                                           // starts in front of a lift door
      expect(ex >= r.room.gx && ex < r.room.gx + r.room.w && ey >= r.room.gy && ey < r.room.gy + r.room.d).toBe(true);
    });
  }
  for (const floor of RENTED) {
    it(`guides from the east lifts to KOSIGN's entrance on floor ${floor}`, () => {
      const plan = floorPlan(floor);
      const items = [...plan.units.flatMap((u) => toFloor(plans[u.id], u.ox, u.oy)), ...coreItems()];
      const r = routeToKosign(plan, items, edgeItems(plan));
      expect(r?.path).toBeTruthy();
      const [sx, sy] = r.path[0];
      expect(sy).toBe(96);
      expect(sx).toBeGreaterThanOrEqual(CORE.liftsE[0]);              // starts at the right-hand (east) lifts
    });
  }
});
