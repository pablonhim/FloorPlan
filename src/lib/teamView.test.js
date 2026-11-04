import { describe, expect, it } from 'vitest';
import { teamList, teamScope, teamBounds } from './teamView.js';
import { seedAll } from '../model/floors.js';

const plans = seedAll();

describe('team view', () => {
  it("lists a unit's teams with their desks and people", () => {
    const teams = teamList(plans['2C']);
    expect(teams.map((x) => x.label)).toEqual(expect.arrayContaining(['모바일', '비즈플레이', '로컬비즈니스센터', '코사인 클래스']));
    expect(teams.map((x) => x.label)).not.toContain('여유 좌석');
    const mobile = teams.find((x) => x.label === '모바일');
    expect(mobile.desks.map((d) => d.name)).toEqual(expect.arrayContaining(['피터', '엘비스', '스레이닌']));
    expect(mobile.people).toBe(mobile.desks.filter((d) => d.name).length);
  });

  it('keeps the team and what stands in its areas, and nothing of other teams', () => {
    const items = plans['2C'], mobile = teamList(items).find((x) => x.label === '모바일');
    const { ids, zones } = teamScope(items, mobile);
    for (const d of mobile.desks) expect(ids.has(d.id)).toBe(true);
    for (const z of mobile.zones) expect(zones.has(z.id)).toBe(true);
    const others = items.filter((d) => d.type === 'desk' && d.team && d.team !== '모바일');
    expect(others.length).toBeGreaterThan(0);
    for (const d of others) expect(ids.has(d.id)).toBe(false);
  });

  it('frames the team: its areas and desks inside the bounds', () => {
    const t = teamList(plans['2C']).find((x) => x.label === '코사인 클래스');
    const b = teamBounds(t);
    for (const d of t.desks) {
      expect(d.gx).toBeGreaterThanOrEqual(b.gx);
      expect(d.gy).toBeGreaterThanOrEqual(b.gy);
    }
  });
});
