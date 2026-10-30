import { describe, expect, it } from 'vitest';
import { buildIndex, search } from './search.js';
import { reducer, seedAll } from './floors.js';

const plans = seedAll();
const index = buildIndex(plans);

describe('search', () => {
  it('finds an employee by name and opens their unit focused on the desk', () => {
    const [hit] = search(index, '스레이닌');
    expect(hit.kind).toBe('person');
    expect(hit.view).toMatchObject({ kind: 'unit', floor: 2, unit: 'C', focus: { id: '2C-desk-053' } });
  });

  it('finds units, rooms and storage', () => {
    expect(search(index, 'unit 2c')[0]).toMatchObject({ kind: 'unit', view: { floor: 2, unit: 'C' } });
    expect(search(index, 'seoul')[0]).toMatchObject({ kind: 'room', title: 'Seoul meeting room' });
    const storage = search(index, 'storage');
    expect(storage.some((r) => r.view.kind === 'floor' && r.view.focus)).toBe(true);   // the corridor storage rooms
    expect(storage.some((r) => r.title === 'GA storage')).toBe(true);
  });

  it('finds a desk by its team in English', () => {
    expect(search(index, 'bplay pay').some((r) => r.kind === 'person')).toBe(true);
  });

  it('needs every word and returns nothing for an empty query', () => {
    expect(search(index, '')).toEqual([]);
    expect(search(index, 'seoul zzzz')).toEqual([]);
  });
});

describe('change log', () => {
  const s0 = { plans, past: [], log: [] };
  const desk = plans['2C'].find((i) => i.type === 'desk' && i.name);

  it('logs a seat assignment in words', () => {
    const s1 = reducer(s0, { type: 'patch', plan: '2C', id: desk.id, patch: { name: 'Dara' } });
    expect(s1.log).toHaveLength(1);
    expect(s1.log[0]).toMatchObject({ plan: '2C', action: 'patch', id: desk.id });
    expect(s1.log[0].text).toContain('Dara');
  });

  it('folds quick repeated edits of one item into one entry, and logs undo', () => {
    let s = reducer(s0, { type: 'patch', plan: '2C', id: desk.id, patch: { note: 'a' } });
    s = reducer(s, { type: 'patch', plan: '2C', id: desk.id, patch: { note: 'ab' } });
    expect(s.log).toHaveLength(1);
    s = reducer(s, { type: 'undo' });
    expect(s.log.at(-1)).toMatchObject({ action: 'undo', plan: '2C' });
    expect(reducer(s, { type: 'clearLog' }).log).toEqual([]);
  });
});
