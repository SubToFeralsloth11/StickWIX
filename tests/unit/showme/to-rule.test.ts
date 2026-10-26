import { describe, expect, it } from 'vitest';
import { generalise, type WorldFacts } from '@/showme/generalise';
import { intentToAction, toRule } from '@/showme/to-rule';
import type { Intent } from '@/showme/session';

const facts: WorldFacts = {
  instance: (id) => ({ h: { kindId: 'hero', objectId: 'h' }, c1: { kindId: 'coin', objectId: 'c1' }, e: { kindId: 'enemy', objectId: 'e' } })[id],
  countOfKind: (k) => (k === 'coin' ? 4 : 1),
};
const g = generalise({ type: 'touch', a: 'h', b: 'c1' }, facts, false);

describe('intent → action (FR-029): exactly one action per change', () => {
  const cases: [Intent, unknown][] = [
    [{ type: 'destroy', instId: 'c1' }, { type: 'destroy', target: { t: 'that', kindId: 'coin' } }],
    [{ type: 'move', instId: 'e', x: 10.4, y: 20.6 }, { type: 'moveTo', target: { t: 'object', id: 'e' }, to: { at: { x: { lit: 10 }, y: { lit: 21 } } } }],
    [{ type: 'create', kindId: 'coin', x: 5, y: 6 }, { type: 'create', kindId: 'coin', place: { at: { x: { lit: 5 }, y: { lit: 6 } } } }],
    [{ type: 'value', valueId: 'score', op: 'add', amount: 1 }, { type: 'changeValue', value: { valueId: 'score' }, op: 'add', amount: { lit: 1 } }],
    [{ type: 'value', valueId: 'hp', objectId: 'c1', op: 'set', amount: 0 }, { type: 'changeValue', value: { valueId: 'hp', of: { t: 'that', kindId: 'coin' } }, op: 'set', amount: { lit: 0 } }],
    [{ type: 'sound', assetId: 'builtin:sfx/coin' }, { type: 'playSound', assetId: 'builtin:sfx/coin' }],
    [{ type: 'scene', sceneId: 's2' }, { type: 'changeScene', sceneId: 's2' }],
    [{ type: 'visibility', instId: 'h', hidden: true }, { type: 'hide', target: { t: 'object', id: 'h' } }],
    [{ type: 'visibility', instId: 'h', hidden: false }, { type: 'show', target: { t: 'object', id: 'h' } }],
    [{ type: 'look', instId: 'h', assetId: 'builtin:img/hero_jump' }, { type: 'changeLook', target: { t: 'object', id: 'h' }, assetId: 'builtin:img/hero_jump' }],
  ];
  it.each(cases)('%j', (intent, action) => {
    expect(intentToAction(intent, g, facts)).toEqual(action);
  });

  it('keeps the performed order and makes no rule without changes', () => {
    const intents: Intent[] = [{ type: 'sound', assetId: 'a' }, { type: 'destroy', instId: 'c1' }];
    expect(toRule('r', g.trigger, g, intents, facts)!.actions.map((a) => a.type)).toEqual(['playSound', 'destroy']);
    expect(toRule('r', g.trigger, g, [], facts)).toBeNull();
  });
});
