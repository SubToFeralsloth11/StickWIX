import { describe, expect, it } from 'vitest';
import type { RuntimeEvent } from '@/runtime/types';
import { localStorageRemember, Values, type RememberAdapter, type Scalar } from '@/runtime/values';
import { game, project, type Spec } from '../../fixtures/build';

const SPEC: Spec = {
  values: [
    { id: 'score', name: 'Score', start: 0 },
    { id: 'hp', name: 'HP', start: 5, min: 0, max: 10 },
    { id: 'title', name: 'Title', type: 'text', start: 'Hi' },
    { id: 'won', name: 'Won', type: 'bool', start: false },
    { id: 'best', name: 'Best', start: 0, remember: true },
  ],
  kinds: [{ id: 'chest', values: [{ id: 'gold', name: 'Gold', start: 3 }] }],
  objects: [
    { id: 'a', kind: 'chest', x: 0, y: 0 },
    { id: 'b', kind: 'chest', x: 50, y: 0, overrides: { values: { gold: 9 } } },
  ],
};

function memory(initial: Record<string, Scalar> = {}) {
  const store = new Map(Object.entries(initial));
  const loads: string[] = [];
  const adapter: RememberAdapter = {
    load: (name) => {
      loads.push(name);
      return store.get(name);
    },
    save: (name, v) => store.set(name, v),
  };
  return { adapter, store, loads };
}

describe('values (FR-020)', () => {
  it('starts every game value at its starting amount', () => {
    const { game: g } = game(SPEC);
    expect(['score', 'hp', 'title', 'won', 'best'].map((id) => g.values.get(id))).toEqual([0, 5, 'Hi', false, 0]);
  });

  it('keeps per-object values on each object, with overrides', () => {
    const { game: g } = game(SPEC);
    const a = g.scene.world.get('a')!;
    const b = g.scene.world.get('b')!;
    expect(g.values.get('gold', a)).toBe(3);
    expect(g.values.get('gold', b)).toBe(9);
    g.values.set('gold', 4, a);
    expect(g.values.get('gold', a)).toBe(4);
    expect(g.values.get('gold', b)).toBe(9);
    // A per-object value without an object: nothing to set.
    g.values.set('gold', 100);
    expect(g.values.get('gold', b)).toBe(9);
    expect(g.values.isObjectValue('gold')).toBe(true);
    expect(g.values.isObjectValue('score')).toBe(false);
  });

  it('spawned objects get the Kind starting values', () => {
    const { game: g } = game(SPEC);
    const c = g.scene.world.spawn('chest', 0, 0)!;
    expect(g.values.get('gold', c)).toBe(3);
  });

  it('coerces to the value type', () => {
    const { game: g } = game(SPEC);
    g.values.set('score', '7');
    expect(g.values.get('score')).toBe(7);
    g.values.set('score', 'lots');
    expect(g.values.get('score')).toBe(0);
    g.values.set('title', 3.14159);
    expect(g.values.get('title')).toBe('3.142');
    g.values.set('won', 'true');
    expect(g.values.get('won')).toBe(true);
    g.values.set('won', 0);
    expect(g.values.get('won')).toBe(false);
  });

  it('clamps numbers to min/max', () => {
    const { game: g } = game(SPEC);
    g.values.set('hp', 15);
    expect(g.values.get('hp')).toBe(10);
    g.values.set('hp', -3);
    expect(g.values.get('hp')).toBe(0);
  });

  it('fires valueChanged only on a real change, with from/to and the object', () => {
    const seen: RuntimeEvent[] = [];
    const values = new Values(project(SPEC), (e) => seen.push(e), null);
    values.set('hp', 5);
    values.set('hp', 12);
    values.set('hp', 20); // still clamped at 10
    expect(seen).toEqual([{ type: 'valueChanged', valueId: 'hp', objectId: undefined, from: 5, to: 10 }]);
    const { game: g } = game(SPEC);
    const events: RuntimeEvent[] = [];
    g.onEvent((e) => events.push(e));
    g.values.set('gold', 1, g.scene.world.get('b')!);
    expect(events).toEqual([{ type: 'valueChanged', valueId: 'gold', objectId: 'b', from: 9, to: 1 }]);
  });

  it('formats {Value Name} placeholders, case-insensitively, leaving unknown names', () => {
    const { game: g } = game(SPEC);
    g.values.set('score', 12.3456);
    expect(g.values.format('{Score} | {score} | {Title} | {Won} | {Nope}')).toBe('12.35 | 12.35 | Hi | false | {Nope}');
  });

  describe('remember between plays', () => {
    it('restores remembered values by name and saves every change', () => {
      const mem = memory({ Best: 42, Score: 99 });
      const { game: g } = game(SPEC, { remember: mem.adapter });
      expect(g.values.get('best')).toBe(42);
      // Not remembered: never read, never written.
      expect(g.values.get('score')).toBe(0);
      expect(mem.loads).toEqual(['Best']);
      g.values.set('best', 50);
      g.values.set('score', 5);
      expect(mem.store.get('Best')).toBe(50);
      expect(mem.store.get('Score')).toBe(99);
      // Next play.
      const { game: again } = game(SPEC, { remember: mem.adapter });
      expect(again.values.get('best')).toBe(50);
    });

    it('ignores saved names that no longer exist and coerces stale types', () => {
      const mem = memory({ Gone: 7, Best: 'twelve' });
      const { game: g } = game(SPEC, { remember: mem.adapter });
      expect(mem.loads).not.toContain('Gone');
      expect(g.values.get('best')).toBe(0);
    });

    it('without an adapter (editor Play) every play starts fresh', () => {
      const { game: g } = game(SPEC, { remember: null });
      g.values.set('best', 5);
      expect(game(SPEC).game.values.get('best')).toBe(0);
    });

    it('localStorage adapter round-trips by project and name', () => {
      localStorage.clear();
      const a = localStorageRemember('p1');
      a.save('Best', 3);
      expect(localStorage.getItem('stickwix:p1:Best')).toBe('3');
      expect(a.load('Best')).toBe(3);
      expect(localStorageRemember('p2').load('Best')).toBeUndefined();
      localStorage.setItem('stickwix:p1:Bad', '{not json');
      expect(a.load('Bad')).toBeUndefined();
    });
  });
});
