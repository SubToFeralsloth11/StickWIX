import { describe, expect, it } from 'vitest';
import { generalise, type WorldFacts } from '@/showme/generalise';

const facts = (kinds: Record<string, string>, counts: Record<string, number>, spawned: string[] = []): WorldFacts => ({
  instance: (id) => (kinds[id] ? { kindId: kinds[id]!, objectId: spawned.includes(id) ? null : id } : undefined),
  countOfKind: (k) => counts[k] ?? 0,
});

describe('generalise (FR-030)', () => {
  const f = facts({ h: 'hero', c1: 'coin' }, { hero: 1, coin: 5 });

  it('uses any/that for a Kind with several objects and the object itself for a lone one', () => {
    const g = generalise({ type: 'touch', a: 'c1', b: 'h' }, f, false);
    expect(g.trigger).toEqual({ type: 'touches', a: { t: 'object', id: 'h' }, b: { t: 'any', kindId: 'coin' } });
    expect(g.bound.get('c1')).toEqual({ t: 'that', kindId: 'coin' });
    expect(g.bound.get('h')).toEqual({ t: 'object', id: 'h' });
    expect(g.canGeneralise).toBe(true);
  });

  it('"only this one" targets the specific object', () => {
    const g = generalise({ type: 'touch', a: 'h', b: 'c1' }, f, true);
    expect(g.trigger).toEqual({ type: 'touches', a: { t: 'object', id: 'h' }, b: { t: 'object', id: 'c1' } });
  });

  it('cannot single out an object spawned during play, so it stays any/that', () => {
    const g = generalise({ type: 'clicked', id: 'x' }, facts({ x: 'coin' }, { coin: 1 }, ['x']), true);
    expect(g.trigger).toEqual({ type: 'clicked', target: { t: 'any', kindId: 'coin' } });
  });

  it('does not offer generalising when every subject is unique', () => {
    expect(generalise({ type: 'clicked', id: 'h' }, f, false).canGeneralise).toBe(false);
  });

  it('turns every kind of event into the matching trigger', () => {
    expect(generalise({ type: 'key', key: 'Space', mode: 'pressed' }, f, false).trigger).toEqual({ type: 'key', key: 'Space', mode: 'pressed' });
    expect(generalise({ type: 'timer', ruleId: 'r', seconds: 5 }, f, false).trigger).toEqual({ type: 'after', seconds: { lit: 5 } });
    expect(generalise({ type: 'sticker', id: 'c1', event: 'collected' }, f, false).trigger).toEqual({ type: 'sticker', target: { t: 'any', kindId: 'coin' }, event: 'collected' });
    expect(generalise({ type: 'valueChanged', valueId: 'score', from: 0, to: 1 }, f, false).trigger).toEqual({ type: 'valueChanges', value: { valueId: 'score' } });
    expect(generalise({ type: 'clicked', id: 'b1', ui: true }, f, false).trigger).toEqual({ type: 'clicked', target: { t: 'ui', id: 'b1' } });
    expect(generalise({ type: 'leavesScene', id: 'h' }, f, false).trigger).toEqual({ type: 'leavesScene', target: { t: 'object', id: 'h' } });
  });
});
