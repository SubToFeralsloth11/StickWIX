import { describe, expect, it } from 'vitest';
import { Rule } from '@/model/schema';
import { ruleSegments, sentenceText } from '@/model/sentence';
import { any, lit, obj, project, ref, rule, self, that } from '../../fixtures/build';

const p = project({
  kinds: [{ id: 'hero', name: 'Hero' }, { id: 'coin', name: 'Coin' }, { id: 'enemy', name: 'Enemy', values: [{ id: 'hp', name: 'Health', start: 3 }] }],
  objects: [{ id: 'h', kind: 'hero', x: 0, y: 0 }],
  values: [{ id: 'score', name: 'Score', start: 0 }, { id: 'pc', name: 'Per Click', start: 1 }],
  ui: [{ id: 'up', name: 'Upgrade', type: 'button', x: 0, y: 0, text: 'Upgrade' }],
  extraScenes: [{ id: 's2', name: 'Level 2' }],
});
const say = (r: unknown) => sentenceText(Rule.parse(r), p);
const t = { type: 'sceneStart' };
const a = (action: unknown) => say(rule('r', t, [action])).replace('When the scene starts → ', '');

describe('sentence rendering (contracts/rule-grammar.md)', () => {
  it('renders the contract example as one readable sentence', () => {
    expect(
      say(rule('r', { type: 'touches', a: obj('h'), b: any('coin') }, [
        { type: 'destroy', target: that('coin') },
        { type: 'changeValue', value: { valueId: 'score' }, op: 'add', amount: lit(1) },
        { type: 'playSound', assetId: 'builtin:sfx/coin' },
      ])),
    ).toBe('When Hero touches any Coin → that Coin disappears, Score goes up by 1, and play sound Coin.');
  });

  it('renders every trigger', () => {
    const tr = (trigger: unknown) => say(rule('r', trigger, [{ type: 'restartScene' }])).replace(' → restart this scene.', '');
    expect(tr({ type: 'sceneStart' })).toBe('When the scene starts');
    expect(tr({ type: 'every', seconds: lit(2) })).toBe('When every 2 seconds pass');
    expect(tr({ type: 'after', seconds: lit(1) })).toBe('When 1 second has passed');
    expect(tr({ type: 'after', seconds: lit(3) })).toBe('When 3 seconds have passed');
    expect(tr({ type: 'key', key: 'Space', mode: 'pressed' })).toBe('When Space is pressed');
    expect(tr({ type: 'key', key: 'KeyA', mode: 'held' })).toBe('When A is held');
    expect(tr({ type: 'clicked', target: { t: 'ui', id: 'up' } })).toBe('When Upgrade is clicked');
    expect(tr({ type: 'valueChanges', value: { valueId: 'score' } })).toBe('When Score changes');
    expect(tr({ type: 'valueReaches', value: { valueId: 'score' }, amount: lit(10) })).toBe('When Score reaches 10');
    expect(tr({ type: 'created', target: any('coin') })).toBe('When any Coin is created');
    expect(tr({ type: 'destroyed', target: self })).toBe('When this object is destroyed');
    expect(tr({ type: 'leavesScene', target: any('enemy') })).toBe('When any Enemy leaves the scene');
    expect(tr({ type: 'sticker', target: any('coin'), event: 'collected' })).toBe('When any Coin is collected');
    expect(tr({ type: 'sticker', target: obj('h'), event: 'outOfHealth' })).toBe('When Hero runs out of health');
  });

  it('renders conditions joined with and / or', () => {
    const conds = [
      { type: 'compare', value: { valueId: 'score' }, op: 'ge', to: lit(10) },
      { type: 'count', kindId: 'coin', op: 'eq', amount: lit(0) },
      { type: 'keyHeld', key: 'ShiftLeft' },
      { type: 'touching', a: obj('h'), b: any('enemy') },
      { type: 'chance', percent: lit(25) },
    ];
    expect(say(rule('r', { type: 'clicked', target: { t: 'ui', id: 'up' } }, [{ type: 'restartScene' }], conds))).toBe(
      'When Upgrade is clicked, only if Score is at least 10 and there are exactly 0 Coin left and Shift is held and Hero is touching any Enemy and a 25% chance hits → restart this scene.',
    );
    expect(say(rule('r', t, [{ type: 'restartScene' }], conds.slice(0, 2), 'any'))).toContain('Score is at least 10 or there are');
  });

  it('renders every action', () => {
    expect(a({ type: 'moveTo', target: obj('h'), to: { at: { x: lit(10), y: lit(20) } } })).toBe('Hero moves to 10, 20.');
    expect(a({ type: 'moveTo', target: obj('h'), to: { atTarget: any('coin') } })).toBe("Hero moves to any Coin's position.");
    expect(a({ type: 'moveBy', target: obj('h'), by: { x: lit(5), y: lit(0) } })).toBe('Hero moves by 5, 0.');
    expect(a({ type: 'setSpeed', target: obj('h'), speed: { x: lit(0), y: lit(-100) } })).toBe("Hero's speed becomes 0, -100.");
    expect(a({ type: 'push', target: obj('h'), direction: 'up', strength: lit(5) })).toBe('Hero is pushed up with strength 5.');
    expect(a({ type: 'create', kindId: 'coin', place: { at: { x: lit(1), y: lit(2) } } })).toBe('create a Coin at 1, 2.');
    expect(a({ type: 'show', target: obj('h') })).toBe('Hero appears.');
    expect(a({ type: 'hide', target: obj('h') })).toBe('Hero hides.');
    expect(a({ type: 'changeLook', target: obj('h'), assetId: 'builtin:img/hero_jump' })).toBe('Hero looks like Hero jump.');
    expect(a({ type: 'animate', target: obj('h'), assetId: 'builtin:img/hero_walk', fps: lit(8), loop: true })).toBe(
      'Hero plays animation Hero walk at 8 fps looping.',
    );
    expect(a({ type: 'changeValue', value: { valueId: 'score' }, op: 'set', amount: lit(0) })).toBe('Score becomes 0.');
    expect(a({ type: 'changeValue', value: { valueId: 'hp', of: that('enemy') }, op: 'subtract', amount: lit(1) })).toBe(
      "that Enemy's Health goes down by 1.",
    );
    expect(a({ type: 'changeValue', value: { valueId: 'score' }, op: 'add', amount: ref('pc') })).toBe('Score goes up by Per Click.');
    expect(a({ type: 'showText', text: 'You win!', seconds: lit(2) })).toBe('show "You win!" for 2 seconds.');
    expect(a({ type: 'wait', seconds: lit(1) })).toBe('wait 1 second.');
    expect(a({ type: 'changeScene', sceneId: 's2' })).toBe('go to scene Level 2.');
    expect(a({ type: 'shakeCamera', seconds: lit(0.5) })).toBe('shake the screen for 0.5 seconds.');
  });

  it('marks unset blanks as highlighted placeholders and deleted things as broken', () => {
    const segs = ruleSegments(
      Rule.parse(rule('r', { type: 'touches', a: { t: 'unset' }, b: any('ghost') }, [{ type: 'changeValue', value: { unset: true }, op: 'add', amount: lit(1) }])),
      p,
    );
    const blanks = segs.filter((s) => 'blank' in s);
    expect(blanks.map((b) => [b.text, 'status' in b && b.status])).toEqual([
      ['something', 'unset'],
      ['any (deleted)', 'broken'],
      ['a value', 'unset'],
      ['goes up by', 'ok'],
      ['1', 'ok'],
    ]);
  });
});
