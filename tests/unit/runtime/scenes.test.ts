import { describe, expect, it } from 'vitest';
import type { Game } from '@/runtime/game';
import { game, lit, obj, rule, type Spec } from '../../fixtures/build';

const add = (valueId: string, n = 1) => ({ type: 'changeValue', value: { valueId }, op: 'add', amount: lit(n) });

const SPEC: Spec = {
  values: [
    { id: 'score', name: 'Score', start: 0 },
    { id: 'starts', name: 'Starts', start: 0 },
    { id: 'timer', name: 'Timer', start: 0 },
  ],
  kinds: [{ id: 'hero', stickers: [{ type: 'topdown', settings: { speed: 120 } }] }, { id: 'flag' }],
  objects: [{ id: 'h', kind: 'hero', x: 100, y: 100 }],
  rules: [
    rule('count', { type: 'sceneStart' }, [add('starts')]),
    rule('next', { type: 'key', key: 'KeyN', mode: 'pressed' }, [{ type: 'changeScene', sceneId: 's2' }]),
    rule('again', { type: 'key', key: 'KeyR', mode: 'pressed' }, [{ type: 'restartScene' }]),
    rule('pts', { type: 'key', key: 'KeyP', mode: 'pressed' }, [add('score', 5)]),
  ],
  sceneRules: [rule('late', { type: 'after', seconds: lit(1) }, [add('timer')])],
  extraScenes: [
    { id: 's2', name: 'Level 2', objects: [{ id: 'f', kind: 'flag', x: 10, y: 10 }], rules: [rule('s2', { type: 'sceneStart' }, [add('score', 100)])] },
  ],
};

const tap = (g: Game, key: string) => {
  g.input.keyDown(key);
  g.run(1);
  g.input.keyUp(key);
  g.run(1);
};

describe('scenes at runtime', () => {
  it('change scene: unloads the old objects, loads the new, keeps game values', () => {
    const { game: g } = game(SPEC);
    tap(g, 'KeyP');
    expect(g.values.get('score')).toBe(5);
    tap(g, 'KeyN');
    expect(g.scene.scene.id).toBe('s2');
    expect(g.scene.world.get('h')).toBeUndefined();
    expect(g.scene.world.get('f')).toBeDefined();
    expect([...g.scene.world.all()].map((i) => i.id)).toEqual(['f']);
    // Game values carried over; the new scene's own start rule ran; game rules still run.
    expect(g.values.get('score')).toBe(105);
    expect(g.values.get('starts')).toBe(2);
    tap(g, 'KeyP');
    expect(g.values.get('score')).toBe(110);
  });

  it('only runs the current scene’s scene rules and timers', () => {
    const { game: g } = game(SPEC);
    tap(g, 'KeyN');
    g.run(120);
    expect(g.values.get('timer')).toBe(0);
  });

  it('restart: puts objects back and restarts timers, keeping game values', () => {
    const { game: g } = game(SPEC);
    g.input.keyDown('ArrowRight');
    g.run(30);
    g.input.keyUp('ArrowRight');
    expect(g.scene.world.get('h')!.x).toBeCloseTo(160, 5);
    tap(g, 'KeyP');
    tap(g, 'KeyR');
    expect(g.scene.scene.id).toBe('s1');
    expect(g.scene.world.get('h')!.x).toBe(100);
    expect(g.values.get('score')).toBe(5);
    expect(g.values.get('starts')).toBe(2);
    // The "after 1 s" timer counts from the restart, not the first start.
    g.run(50);
    expect(g.values.get('timer')).toBe(0);
    g.run(10);
    expect(g.values.get('timer')).toBe(1);
  });

  it('removes objects spawned before a restart', () => {
    const { game: g } = game({
      ...SPEC,
      rules: [...SPEC.rules!, rule('spawn', { type: 'key', key: 'KeyC', mode: 'pressed' }, [{ type: 'create', kindId: 'flag', place: { atTarget: obj('h') } }])],
    });
    tap(g, 'KeyC');
    expect(g.scene.world.byKind('flag')).toHaveLength(1);
    tap(g, 'KeyR');
    expect(g.scene.world.byKind('flag')).toEqual([]);
  });

  it('a scene change requested mid-rule stops the rest of that moment', () => {
    const { game: g } = game({
      ...SPEC,
      rules: [rule('go', { type: 'key', key: 'KeyN', mode: 'pressed' }, [{ type: 'changeScene', sceneId: 's2' }, add('score', 1)]), rule('after', { type: 'key', key: 'KeyN', mode: 'pressed' }, [add('score', 1000)])],
    });
    tap(g, 'KeyN');
    expect(g.scene.scene.id).toBe('s2');
    expect(g.values.get('score')).toBe(100);
  });

  it('starts in a chosen scene', () => {
    const { game: g } = game(SPEC, { sceneId: 's2' });
    expect(g.scene.scene.id).toBe('s2');
    expect(g.scene.world.get('f')).toBeDefined();
  });
});
