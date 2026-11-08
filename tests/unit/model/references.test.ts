import { describe, expect, it } from 'vitest';
import type { Project } from '@/model/schema';
import { allRules, ruleStates, rulesBrokenByDeleting, rulesReferencing } from '@/model/references';
import { any, lit, obj, project, rule, that } from '../../fixtures/build';

const add = (valueId: string) => ({ type: 'changeValue', value: { valueId }, op: 'add', amount: lit(1) });

function base(): Project {
  return project({
    values: [{ id: 'score', name: 'Score', start: 0 }],
    kinds: [{ id: 'coin' }, { id: 'hero' }],
    objects: [{ id: 'h', kind: 'hero', x: 0, y: 0 }],
    ui: [{ id: 'btn', name: 'Go', type: 'button', x: 0, y: 0, text: 'Go' }],
    extraScenes: [{ id: 's2', name: 'Level 2' }],
    rules: [
      rule('collect', { type: 'touches', a: obj('h'), b: any('coin') }, [add('score'), { type: 'destroy', target: that('coin') }]),
      rule('click', { type: 'clicked', target: { t: 'ui', id: 'btn' } }, [{ type: 'changeScene', sceneId: 's2' }]),
      rule('spawn', { type: 'every', seconds: lit(1) }, [{ type: 'create', kindId: 'coin', place: { atTarget: obj('h') } }]),
      rule('plain', { type: 'sceneStart' }, [{ type: 'shakeCamera', seconds: lit(1) }]),
    ],
  });
}

const states = (p: Project) => Object.fromEntries([...ruleStates(p)].map(([id, s]) => [id, s.state]));
const referencing = (p: Project, kind: Parameters<typeof rulesReferencing>[1]['kind'], id: string) =>
  rulesReferencing(p, { kind, id }).map((r) => r.rule.id);

describe('rule references (FR-023)', () => {
  it('a complete project has every rule ok', () => {
    expect(states(base())).toEqual({ collect: 'ok', click: 'ok', spawn: 'ok', plain: 'ok' });
  });

  it('deleting a Kind warns about rules naming one of its objects, not just the Kind itself', () => {
    const p = base();
    expect(referencing(p, 'kind', 'hero')).toEqual([]);
    expect(rulesBrokenByDeleting(p, { kind: 'kind', id: 'hero' }).map((r) => r.rule.id)).toEqual(['collect', 'spawn']);
  });

  it('deleting a scene warns about rules naming its objects and screen items, but not its own rules', () => {
    const p = base();
    p.scenes[0]!.rules.push(rule('own', { type: 'clicked', target: { t: 'ui', id: 'btn' } }, [{ type: 'restartScene' }]) as never);
    expect(rulesBrokenByDeleting(p, { kind: 'scene', id: 's1' }).map((r) => r.rule.id)).toEqual(['collect', 'click', 'spawn']);
  });

  it('deleting a Kind: lists the rules using it and marks them broken', () => {
    const p = base();
    expect(referencing(p, 'kind', 'coin')).toEqual(['collect', 'spawn']);
    p.kinds = p.kinds.filter((k) => k.id !== 'coin');
    expect(states(p)).toEqual({ collect: 'broken', click: 'ok', spawn: 'broken', plain: 'ok' });
    const blanks = ruleStates(p).get('spawn')!.blanks;
    expect(blanks).toEqual([{ path: ['actions', 0, 'kindId'], problem: 'missing', ref: { kind: 'kind', id: 'coin' } }]);
  });

  it('deleting a placed object breaks rules naming it', () => {
    const p = base();
    expect(referencing(p, 'object', 'h')).toEqual(['collect', 'spawn']);
    p.scenes[0]!.objects = [];
    expect(states(p).collect).toBe('broken');
    expect(states(p).spawn).toBe('broken');
  });

  it('deleting a Value', () => {
    const p = base();
    expect(referencing(p, 'value', 'score')).toEqual(['collect']);
    p.values = [];
    expect(states(p).collect).toBe('broken');
    expect(ruleStates(p).get('collect')!.blanks[0]!.path).toEqual(['actions', 0, 'value', 'valueId']);
  });

  it('deleting a Scene', () => {
    const p = base();
    expect(referencing(p, 'scene', 's2')).toEqual(['click']);
    p.scenes = p.scenes.filter((s) => s.id !== 's2');
    expect(states(p).click).toBe('broken');
  });

  it('deleting a UI element', () => {
    const p = base();
    expect(referencing(p, 'ui', 'btn')).toEqual(['click']);
    p.scenes[0]!.ui = [];
    expect(states(p).click).toBe('broken');
    expect(ruleStates(p).get('click')!.blanks[0]!.path).toEqual(['trigger', 'target']);
  });

  it('deleting an imported asset breaks rules using it; built-ins never break', () => {
    const p = base();
    p.assets = [{ id: 'a1', name: 'Boom', kind: 'sound', source: 'imported', duration: 1, mime: 'audio/wav' }];
    p.rules.push(
      rule('boom', { type: 'sceneStart' }, [{ type: 'playSound', assetId: 'a1' }]) as never,
      rule('coin', { type: 'sceneStart' }, [{ type: 'playSound', assetId: 'builtin:sfx/coin' }]) as never,
    );
    expect(states(p).boom).toBe('ok');
    expect(referencing(p, 'asset', 'a1')).toEqual(['boom']);
    p.assets = [];
    expect(states(p).boom).toBe('broken');
    expect(states(p).coin).toBe('ok');
  });

  it('refilling the broken blank restores ok', () => {
    const p = base();
    p.kinds = p.kinds.filter((k) => k.id !== 'coin');
    p.kinds.push({ ...p.kinds[0]!, id: 'gem', name: 'Gem' });
    expect(states(p).spawn).toBe('broken');
    const create = p.rules.find((r) => r.id === 'spawn')!.actions[0]!;
    if (create.type !== 'create') throw new Error('expected a create action');
    create.kindId = 'gem';
    expect(states(p).spawn).toBe('ok');
  });

  it('unset blanks make a rule incomplete (not broken); missing beats unset', () => {
    const p = base();
    p.rules.push(
      rule('blank', { type: 'key', key: { unset: true }, mode: 'pressed' }, [{ type: 'destroy', target: { t: 'unset' } }]) as never,
      rule('both', { type: 'sceneStart' }, [{ type: 'changeScene', sceneId: 'gone' }, { type: 'wait', seconds: { unset: true } }]) as never,
    );
    expect(states(p).blank).toBe('incomplete');
    expect(ruleStates(p).get('blank')!.blanks.map((b) => [b.path, b.problem])).toEqual([
      [['trigger', 'key'], 'unset'],
      [['actions', 0, 'target'], 'unset'],
    ]);
    expect(states(p).both).toBe('broken');
    const blank = p.rules.find((r) => r.id === 'blank')!;
    const destroy = blank.actions[0]!;
    if (blank.trigger.type !== 'key' || destroy.type !== 'destroy') throw new Error('unexpected rule shape');
    blank.trigger.key = 'Space';
    destroy.target = { t: 'object', id: 'h' };
    expect(states(p).blank).toBe('ok');
  });

  it('"that [Kind]" needs a trigger that binds that Kind', () => {
    const p = base();
    p.rules.push(
      rule('nobind', { type: 'sceneStart' }, [{ type: 'destroy', target: that('coin') }]) as never,
      rule('cond', { type: 'clicked', target: any('hero') }, [add('score')], [{ type: 'touching', a: that('coin'), b: that('hero') }]) as never,
      rule('bound', { type: 'created', target: any('coin') }, [{ type: 'hide', target: that('coin') }]) as never,
    );
    expect(states(p).nobind).toBe('broken');
    // "that Hero" is bound by the click; "that Coin" is not.
    expect(ruleStates(p).get('cond')!.blanks).toEqual([{ path: ['conditions', 'items', 0, 'a'], problem: 'missing', ref: { kind: 'kind', id: 'coin' } }]);
    expect(states(p).bound).toBe('ok');
  });

  it('lists rules of every owner, in dispatch order', () => {
    const p = base();
    p.scenes[0]!.rules.push(rule('scene', { type: 'sceneStart' }, [{ type: 'create', kindId: 'coin', place: { atTarget: obj('h') } }]) as never);
    p.kinds[1]!.rules.push(rule('kind', { type: 'sceneStart' }, [{ type: 'create', kindId: 'coin', place: { atTarget: obj('h') } }]) as never);
    expect(rulesReferencing(p, { kind: 'kind', id: 'coin' }).map((r) => [r.rule.id, r.owner.type, r.index])).toEqual([
      ['collect', 'game', 0],
      ['spawn', 'game', 2],
      ['scene', 'scene', 0],
      ['kind', 'kind', 0],
    ]);
    expect(allRules(p).map((r) => r.rule.id)).toEqual(['collect', 'click', 'spawn', 'plain', 'scene', 'kind']);
  });
});
