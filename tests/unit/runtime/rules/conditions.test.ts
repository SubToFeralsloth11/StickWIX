import { describe, expect, it } from 'vitest';
import type { Game } from '@/runtime/game';
import { any, game, lit, obj, ref, rule, type Spec } from '../../../fixtures/build';

const bump = { type: 'changeValue', value: { valueId: 'fired' }, op: 'add', amount: lit(1) };
const fired = (g: Game) => g.values.get('fired');

const VALUES: NonNullable<Spec['values']> = [
  { id: 'fired', name: 'Fired', start: 0 },
  { id: 'score', name: 'Score', start: 5 },
  { id: 'limit', name: 'Limit', start: 5 },
  { id: 'name', name: 'Name', type: 'text', start: 'Hero' },
  { id: 'won', name: 'Won', type: 'bool', start: true },
];

/** Does a "scene starts" rule with these conditions run? */
function passes(conditions: unknown[], join: 'all' | 'any' = 'all', spec: Spec = {}) {
  const { game: g } = game({ ...spec, values: VALUES, rules: [rule('r', { type: 'sceneStart' }, [bump], conditions, join)] });
  return fired(g) === 1;
}

const cmp = (op: string, to: unknown, valueId = 'score') => ({ type: 'compare', value: { valueId }, op, to });

describe('conditions (FR-017)', () => {
  it.each([
    ['eq', 5, true], ['eq', 4, false],
    ['ne', 4, true], ['ne', 5, false],
    ['lt', 6, true], ['lt', 5, false],
    ['le', 5, true], ['le', 4, false],
    ['gt', 4, true], ['gt', 5, false],
    ['ge', 5, true], ['ge', 6, false],
  ] as const)('compare: Score (5) %s %i → %s', (op, n, want) => {
    expect(passes([cmp(op, lit(n))])).toBe(want);
  });

  it('compare against another value', () => {
    expect(passes([cmp('eq', ref('limit'))])).toBe(true);
    expect(passes([cmp('gt', ref('limit'))])).toBe(false);
  });

  it('compare text (case-insensitive) and true/false', () => {
    expect(passes([cmp('eq', lit('hero'), 'name')])).toBe(true);
    expect(passes([cmp('ne', lit('Villain'), 'name')])).toBe(true);
    expect(passes([cmp('eq', lit(true), 'won')])).toBe(true);
    expect(passes([cmp('eq', lit(false), 'won')])).toBe(false);
  });

  it('compare a per-object value of a specific object', () => {
    const spec: Spec = {
      kinds: [{ id: 'chest', values: [{ id: 'gold', name: 'Gold', start: 3 }] }],
      objects: [{ id: 'c', kind: 'chest', x: 0, y: 0, overrides: { values: { gold: 7 } } }],
    };
    expect(passes([{ type: 'compare', value: { valueId: 'gold', of: obj('c') }, op: 'eq', to: lit(7) }], 'all', spec)).toBe(true);
  });

  it('count of a Kind in the scene', () => {
    const spec: Spec = {
      kinds: [{ id: 'coin' }, { id: 'rock' }],
      objects: [0, 1, 2].map((i) => ({ id: `c${i}`, kind: 'coin', x: i * 40, y: 0 })),
    };
    const count = (kindId: string, op: string, n: number) => ({ type: 'count', kindId, op, amount: lit(n) });
    expect(passes([count('coin', 'eq', 3)], 'all', spec)).toBe(true);
    expect(passes([count('coin', 'lt', 3)], 'all', spec)).toBe(false);
    expect(passes([count('rock', 'eq', 0)], 'all', spec)).toBe(true);
    expect(passes([{ type: 'count', kindId: 'coin', op: 'eq', amount: ref('score') }], 'all', spec)).toBe(false);
  });

  it('count drops as objects are destroyed', () => {
    const { game: g } = game({
      values: VALUES,
      kinds: [{ id: 'coin' }],
      objects: [{ id: 'c0', kind: 'coin', x: 0, y: 0 }, { id: 'c1', kind: 'coin', x: 40, y: 0 }],
      rules: [
        rule('kill', { type: 'key', key: 'KeyK', mode: 'pressed' }, [{ type: 'destroy', target: obj('c0') }]),
        rule('r', { type: 'key', key: 'Space', mode: 'pressed' }, [bump], [{ type: 'count', kindId: 'coin', op: 'eq', amount: lit(1) }]),
      ],
    });
    g.input.keyDown('Space');
    g.run(1);
    expect(fired(g)).toBe(0);
    g.input.keyUp('Space');
    g.input.keyDown('KeyK');
    g.run(2);
    g.input.keyDown('Space');
    g.run(1);
    expect(fired(g)).toBe(1);
  });

  it('key is held', () => {
    const { game: g } = game({
      values: VALUES,
      rules: [rule('r', { type: 'every', seconds: lit(0.1) }, [bump], [{ type: 'keyHeld', key: 'ShiftLeft' }])],
    });
    g.run(30);
    expect(fired(g)).toBe(0);
    g.input.keyDown('ShiftLeft');
    g.run(30);
    expect(fired(g)).toBe(5);
  });

  it('object is touching another', () => {
    const spec = (x: number): Spec => ({
      kinds: [{ id: 'hero' }, { id: 'door' }],
      objects: [{ id: 'h', kind: 'hero', x: 0, y: 0 }, { id: 'd', kind: 'door', x, y: 0 }],
    });
    const touching = { type: 'touching', a: obj('h'), b: any('door') };
    expect(passes([touching], 'all', spec(16))).toBe(true);
    expect(passes([touching], 'all', spec(64))).toBe(false);
  });

  it('random chance: 0% never, 100% always, 50% about half the time', () => {
    const { game: g } = game({
      values: VALUES,
      rules: [
        rule('never', { type: 'key', key: 'Space', mode: 'held' }, [{ type: 'changeValue', value: { valueId: 'score' }, op: 'add', amount: lit(1) }], [{ type: 'chance', percent: lit(0) }]),
        rule('half', { type: 'key', key: 'Space', mode: 'held' }, [bump], [{ type: 'chance', percent: lit(50) }]),
        rule('always', { type: 'key', key: 'Space', mode: 'held' }, [{ type: 'changeValue', value: { valueId: 'limit' }, op: 'add', amount: lit(1) }], [{ type: 'chance', percent: lit(100) }]),
      ],
    });
    g.input.keyDown('Space');
    g.run(400);
    expect(g.values.get('score')).toBe(5);
    expect(g.values.get('limit')).toBe(405);
    expect(fired(g)).toBeGreaterThan(150);
    expect(fired(g)).toBeLessThan(250);
  });

  it('all: every condition must hold; any: one is enough', () => {
    const yes = cmp('eq', lit(5));
    const no = cmp('eq', lit(6));
    expect(passes([yes, yes], 'all')).toBe(true);
    expect(passes([yes, no], 'all')).toBe(false);
    expect(passes([yes, no], 'any')).toBe(true);
    expect(passes([no, no], 'any')).toBe(false);
    expect(passes([], 'any')).toBe(true);
  });
});
