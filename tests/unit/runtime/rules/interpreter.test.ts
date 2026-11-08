import { describe, expect, it } from 'vitest';
import { MAX_DEPTH } from '@/runtime/rules/interpreter';
import { any, game, lit, obj, rule, self, that, type Spec } from '../../../fixtures/build';

const say = (text: string) => ({ type: 'showText', text, seconds: lit(10) });
const add = (valueId: string, n = 1) => ({ type: 'changeValue', value: { valueId }, op: 'add', amount: lit(n) });
const VALUES: NonNullable<Spec['values']> = [
  { id: 'score', name: 'Score', start: 0 },
  { id: 'lives', name: 'Lives', start: 0 },
];

describe('rule interpreter', () => {
  describe('any / that / self binding (FR-019)', () => {
    const spec = (rules: unknown[], kindRules: unknown[] = []): Spec => ({
      values: VALUES,
      kinds: [
        { id: 'hero', stickers: [{ type: 'topdown' }] },
        { id: 'coin', rules: kindRules },
      ],
      objects: [
        { id: 'h', kind: 'hero', x: 100, y: 100 },
        { id: 'near', kind: 'coin', x: 150, y: 100 },
        { id: 'far', kind: 'coin', x: 400, y: 400 },
      ],
      rules,
    });

    it('"that Coin" is the coin that was touched', () => {
      const { game: g } = game(spec([rule('r', { type: 'touches', a: any('hero'), b: any('coin') }, [{ type: 'hide', target: that('coin') }])]));
      g.input.keyDown('ArrowRight');
      g.run(20);
      expect(g.scene.world.get('near')!.hidden).toBe(true);
      expect(g.scene.world.get('far')!.hidden).toBe(false);
    });

    it('"this object" in a Kind rule is the object involved', () => {
      const { game: g } = game(spec([], [rule('k', { type: 'clicked', target: self }, [{ type: 'hide', target: self }])]));
      g.input.mouseDown(410, 410);
      g.run(1);
      expect(g.scene.world.get('far')!.hidden).toBe(true);
      expect(g.scene.world.get('near')!.hidden).toBe(false);
    });

    it('a Kind rule without a subject runs once per object, each as "this object"', () => {
      const { game: g } = game(spec([], [rule('k', { type: 'sceneStart' }, [{ type: 'moveBy', target: self, by: { x: lit(5), y: lit(0) } }, add('score')])]));
      expect(g.scene.world.get('near')!.x).toBe(155);
      expect(g.scene.world.get('far')!.x).toBe(405);
      expect(g.values.get('score')).toBe(2);
    });

    it('a Kind rule about "any" object of its own Kind runs once, for the object involved', () => {
      const { game: g } = game(spec([], [rule('k', { type: 'clicked', target: any('coin') }, [{ type: 'hide', target: self }, add('score')])]));
      g.input.mouseDown(410, 410);
      g.run(1);
      expect(g.values.get('score')).toBe(1);
      expect(g.scene.world.get('far')!.hidden).toBe(true);
      expect(g.scene.world.get('near')!.hidden).toBe(false);
    });

    it('a touch owned by the touched Kind binds "this object" to the touched one', () => {
      const { game: g } = game(spec([], [rule('k', { type: 'touches', a: any('hero'), b: any('coin') }, [{ type: 'hide', target: self }, add('score')])]));
      g.input.keyDown('ArrowRight');
      g.run(20);
      expect(g.values.get('score')).toBe(1);
      expect(g.scene.world.get('near')!.hidden).toBe(true);
      expect(g.scene.world.get('far')!.hidden).toBe(false);
    });

    it('a Kind rule whose trigger is about another Kind still runs for each of its own objects', () => {
      const { game: g } = game(spec([], [rule('k', { type: 'clicked', target: obj('h') }, [add('score')])]));
      g.input.mouseDown(110, 110);
      g.run(1);
      expect(g.values.get('score')).toBe(2);
    });
  });

  it('runs game → scene → Kind rules, each in list order (FR-021)', () => {
    const { game: g } = game({
      kinds: [{ id: 'k', rules: [rule('k2', { type: 'sceneStart' }, [say('kind 1')]), rule('k1', { type: 'sceneStart' }, [say('kind 2')])] }],
      objects: [{ id: 'o', kind: 'k', x: 0, y: 0 }],
      sceneRules: [rule('s2', { type: 'sceneStart' }, [say('scene 1')]), rule('s1', { type: 'sceneStart' }, [say('scene 2')])],
      rules: [rule('g2', { type: 'sceneStart' }, [say('game 1')]), rule('g1', { type: 'sceneStart' }, [say('game 2')])],
    });
    expect(g.scene.texts.map((t) => t.text)).toEqual(['game 1', 'game 2', 'scene 1', 'scene 2', 'kind 1', 'kind 2']);
  });

  it('keeps list order between "changes" and "reaches" rules fired by the same change', () => {
    const { game: g } = game({
      values: VALUES,
      rules: [
        rule('go', { type: 'key', key: 'Space', mode: 'pressed' }, [add('score', 5)]),
        rule('reach', { type: 'valueReaches', value: { valueId: 'score' }, amount: lit(5) }, [say('reaches')]),
        rule('change', { type: 'valueChanges', value: { valueId: 'score' } }, [say('changes')]),
      ],
      kinds: [{ id: 'k', rules: [rule('kreach', { type: 'valueReaches', value: { valueId: 'score' }, amount: lit(5) }, [say('kind reaches')])] }],
      objects: [{ id: 'o', kind: 'k', x: 0, y: 0 }],
      sceneRules: [rule('schange', { type: 'valueChanges', value: { valueId: 'score' } }, [say('scene changes')])],
    });
    g.input.keyDown('Space');
    g.run(1);
    expect(g.scene.texts.map((t) => t.text)).toEqual(['reaches', 'changes', 'scene changes', 'kind reaches']);
  });

  it('keeps list order between timer rules due at the same moment', () => {
    const { game: g } = game({
      rules: [
        rule('fast', { type: 'every', seconds: lit(0.5) }, [say('fast')]),
        rule('slow', { type: 'every', seconds: lit(1) }, [say('slow')]),
        rule('once', { type: 'after', seconds: lit(1) }, [say('once')]),
      ],
    });
    g.run(60);
    expect(g.scene.texts.map((t) => t.text)).toEqual(['fast', 'fast', 'slow', 'once']);
  });

  it('skips disabled, incomplete and broken rules (FR-023)', () => {
    const { game: g } = game({
      values: VALUES,
      kinds: [{ id: 'coin' }],
      rules: [
        { ...rule('off', { type: 'sceneStart' }, [add('score', 1)]), enabled: false },
        rule('blank', { type: 'sceneStart' }, [add('score', 10), { type: 'changeValue', value: { valueId: 'score' }, op: 'add', amount: { unset: true } }]),
        rule('gone', { type: 'sceneStart' }, [add('score', 100), { type: 'create', kindId: 'ghost', place: { at: { x: lit(0), y: lit(0) } } }]),
        rule('gone2', { type: 'sceneStart' }, [add('score', 1000), { type: 'destroy', target: obj('nobody') }]),
        rule('ok', { type: 'sceneStart' }, [add('lives')]),
      ],
    });
    expect(g.values.get('score')).toBe(0);
    expect(g.values.get('lives')).toBe(1);
  });

  describe('wait', () => {
    const spec = (): Spec => ({
      values: VALUES,
      kinds: [{ id: 'coin' }],
      objects: [{ id: 'c', kind: 'coin', x: 100, y: 100 }],
      rules: [
        rule('r', { type: 'clicked', target: any('coin') }, [add('lives'), { type: 'wait', seconds: lit(0.5) }, add('score'), { type: 'hide', target: that('coin') }]),
        rule('kill', { type: 'key', key: 'KeyK', mode: 'pressed' }, [{ type: 'destroy', target: any('coin') }]),
      ],
    });

    it('suspends the rest of the rule while the game keeps running', () => {
      const { game: g } = game(spec());
      g.input.mouseDown(110, 110);
      g.run(1);
      expect(g.values.get('lives')).toBe(1);
      expect(g.values.get('score')).toBe(0);
      g.run(29);
      expect(g.values.get('score')).toBe(0);
      g.run(2);
      expect(g.values.get('score')).toBe(1);
      expect(g.scene.world.get('c')!.hidden).toBe(true);
    });

    it('drops the rest when the bound object is gone', () => {
      const { game: g } = game(spec());
      g.input.mouseDown(110, 110);
      g.run(1);
      g.input.keyDown('KeyK');
      g.run(60);
      expect(g.values.get('score')).toBe(0);
    });

    it('is cancelled by a scene change', () => {
      const s = spec();
      s.rules!.push(rule('next', { type: 'key', key: 'KeyN', mode: 'pressed' }, [{ type: 'restartScene' }]));
      const { game: g } = game(s);
      g.input.mouseDown(110, 110);
      g.run(1);
      g.input.keyDown('KeyN');
      g.run(60);
      expect(g.values.get('score')).toBe(0);
    });
  });

  it(`cuts a runaway chain at depth ${MAX_DEPTH}, flags the rule and keeps the game running (FR-022)`, () => {
    expect(MAX_DEPTH).toBe(64);
    const { game: g } = game({
      values: VALUES,
      rules: [
        rule('kick', { type: 'sceneStart' }, [add('score')]),
        rule('loop', { type: 'valueChanges', value: { valueId: 'score' } }, [add('score')]),
        rule('tick', { type: 'every', seconds: lit(0.5) }, [add('lives')]),
      ],
    });
    const after = g.values.get('score') as number;
    expect(after).toBeGreaterThan(MAX_DEPTH - 5);
    expect(after).toBeLessThanOrEqual(MAX_DEPTH + 1);
    expect(g.diagnostics).toEqual([{ type: 'runaway', ruleId: 'loop' }]);
    expect(() => g.run(60)).not.toThrow();
    expect(g.values.get('lives')).toBe(2);
    expect(g.totalTime).toBeCloseTo(1, 5);
  });

  it('a chain under the limit is not flagged', () => {
    const { game: g } = game({
      values: VALUES,
      rules: [
        rule('kick', { type: 'sceneStart' }, [add('score')]),
        rule('loop', { type: 'valueChanges', value: { valueId: 'score' } }, [add('score')], [{ type: 'compare', value: { valueId: 'score' }, op: 'lt', to: lit(20) }]),
      ],
    });
    expect(g.values.get('score')).toBe(20);
    expect(g.diagnostics).toEqual([]);
  });
});
