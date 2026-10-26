import { describe, expect, it } from 'vitest';
import type { AudioAdapter } from '@/runtime/audio';
import type { GameOptions } from '@/runtime/game';
import { any, game, lit, obj, ref, rule, that, type Spec } from '../../../fixtures/build';

const VALUES: NonNullable<Spec['values']> = [
  { id: 'score', name: 'Score', start: 0 },
  { id: 'dx', name: 'Dx', start: 30 },
  { id: 'two', name: 'Two', start: 2 },
];

const KINDS: NonNullable<Spec['kinds']> = [
  { id: 'box' },
  { id: 'coin', w: 16, h: 16, values: [{ id: 'worth', name: 'Worth', start: 1 }] },
  { id: 'hero', stickers: [{ type: 'platformer' }] },
];

const OBJECTS: NonNullable<Spec['objects']> = [
  { id: 'b', kind: 'box', x: 100, y: 100 },
  { id: 'b2', kind: 'box', x: 300, y: 300 },
  { id: 'c1', kind: 'coin', x: 400, y: 100 },
  { id: 'c2', kind: 'coin', x: 500, y: 100 },
];

/** Runs `actions` on "scene starts" (before any step). */
function start(actions: unknown[], spec: Spec = {}, opts: GameOptions = {}) {
  const { game: g } = game(
    { kinds: KINDS, objects: OBJECTS, values: VALUES, ...spec, rules: [...(actions.length ? [rule('r', { type: 'sceneStart' }, actions)] : []), ...(spec.rules ?? [])] },
    opts,
  );
  return { g, get: (id: string) => g.scene.world.get(id) };
}

const xy = (x: unknown, y: unknown) => ({ x, y });

describe('actions (FR-018)', () => {
  it('move to a point (literal or value) and to another object (centred on it)', () => {
    const { get } = start([
      { type: 'moveTo', target: obj('b'), to: { at: xy(lit(10), ref('dx')) } },
      { type: 'moveTo', target: obj('c1'), to: { atTarget: obj('b2') } },
    ]);
    expect([get('b')!.x, get('b')!.y]).toEqual([10, 30]);
    // 16×16 coin centred on the 32×32 box at (300, 300).
    expect([get('c1')!.x, get('c1')!.y]).toEqual([308, 308]);
  });

  it('move by, with literal and value numbers, for every object of a Kind', () => {
    const { get } = start([{ type: 'moveBy', target: any('box'), by: xy(ref('dx'), lit(-5)) }]);
    expect([get('b')!.x, get('b')!.y]).toEqual([130, 95]);
    expect([get('b2')!.x, get('b2')!.y]).toEqual([330, 295]);
  });

  it('set speed: it keeps moving at that speed', () => {
    const { g, get } = start([{ type: 'setSpeed', target: obj('b'), speed: xy(lit(60), ref('dx')) }]);
    g.run(60);
    expect(get('b')!.x).toBeCloseTo(160, 5);
    expect(get('b')!.y).toBeCloseTo(130, 5);
  });

  it('push in a direction with a strength', () => {
    const { get } = start([
      { type: 'push', target: obj('b'), direction: 'right', strength: lit(2) },
      { type: 'push', target: obj('b2'), direction: 'up', strength: ref('two') },
    ]);
    expect(get('b')!.vx).toBe(200);
    expect(get('b2')!.vy).toBe(-200);
    const { get: get2 } = start([
      { type: 'push', target: obj('b'), direction: 'left', strength: lit(1) },
      { type: 'push', target: obj('b2'), direction: 'down', strength: lit(1) },
    ]);
    expect(get2('b')!.vx).toBe(-100);
    expect(get2('b2')!.vy).toBe(100);
  });

  it('create at a point and at another object', () => {
    const { g } = start([
      { type: 'create', kindId: 'coin', place: { at: xy(lit(50), ref('dx')) } },
      { type: 'create', kindId: 'coin', place: { atTarget: obj('b') } },
    ]);
    const made = g.scene.world.byKind('coin').filter((c) => c.objectId === null);
    expect(made.map((c) => [c.x, c.y])).toEqual([[50, 30], [108, 108]]);
  });

  it('destroy objects and remove UI elements', () => {
    const { g, get } = start([{ type: 'destroy', target: any('coin') }, { type: 'destroy', target: { t: 'ui', id: 'label' } }], {
      ui: [{ id: 'label', name: 'Label', type: 'text', x: 0, y: 0, text: 'hi' }],
    });
    g.run(1);
    expect(get('c1')).toBeUndefined();
    expect(get('c2')).toBeUndefined();
    expect(get('b')).toBeDefined();
    expect(g.view().ui).toEqual([]);
  });

  it('show and hide objects and UI elements', () => {
    const ui = [{ id: 'label', name: 'Label', type: 'text', x: 0, y: 0, text: 'hi' }];
    const { g, get } = start([{ type: 'hide', target: obj('b') }, { type: 'hide', target: { t: 'ui', id: 'label' } }], { ui });
    expect(get('b')!.hidden).toBe(true);
    expect(g.view().ui).toEqual([]);
    const shown = start([{ type: 'show', target: obj('b') }, { type: 'show', target: { t: 'ui', id: 'label' } }], {
      objects: [{ id: 'b', kind: 'box', x: 0, y: 0, overrides: { hidden: true } }],
      ui: [{ ...ui[0], hidden: true }],
    });
    expect(shown.get('b')!.hidden).toBe(false);
    expect(shown.g.view().ui.map((u) => u.el.id)).toEqual(['label']);
  });

  it('change look of an object and of a UI image', () => {
    const { g, get } = start([
      { type: 'changeLook', target: obj('b'), assetId: 'builtin:img/crate' },
      { type: 'changeLook', target: { t: 'ui', id: 'pic' }, assetId: 'builtin:img/heart' },
    ], { ui: [{ id: 'pic', name: 'Pic', type: 'image', x: 0, y: 0 }] });
    expect(get('b')!.lookId).toBe('builtin:img/crate');
    expect(g.view().ui[0]!.lookId).toBe('builtin:img/heart');
  });

  it('a changed look sticks on a Platformer object without motion looks', () => {
    const { g, get } = start([{ type: 'changeLook', target: obj('h'), assetId: 'builtin:img/knight' }], {
      objects: [{ id: 'h', kind: 'hero', x: 0, y: 0 }],
    });
    g.input.keyDown('ArrowRight');
    g.run(30);
    expect(get('h')!.lookId).toBe('builtin:img/knight');
  });

  it('play an animation at fps (literal or value)', () => {
    const { g, get } = start([{ type: 'animate', target: obj('b'), assetId: 'builtin:img/coin', fps: ref('two'), loop: false }], {}, {
      assetInfo: () => ({ w: 16, h: 16, frames: 4, fps: 8 }),
    });
    expect(get('b')!.lookId).toBe('builtin:img/coin');
    g.run(60);
    expect(get('b')!.anim).toMatchObject({ fps: 2, loop: false, frame: 2 });
    g.run(120);
    expect(get('b')!.anim!.frame).toBe(3);
  });

  it('change value: set, add, subtract; literal or value amount', () => {
    const { g } = start([
      { type: 'changeValue', value: { valueId: 'score' }, op: 'set', amount: lit(10) },
      { type: 'changeValue', value: { valueId: 'score' }, op: 'add', amount: ref('dx') },
      { type: 'changeValue', value: { valueId: 'score' }, op: 'subtract', amount: lit(5) },
    ]);
    expect(g.values.get('score')).toBe(35);
  });

  it('change a per-object value of "that" object only', () => {
    const { g, get } = start([], {
      rules: [rule('click', { type: 'clicked', target: any('coin') }, [
        { type: 'changeValue', value: { valueId: 'worth', of: that('coin') }, op: 'add', amount: lit(4) },
        { type: 'changeValue', value: { valueId: 'score' }, op: 'add', amount: ref('worth', that('coin')) },
      ])],
    });
    g.input.mouseDown(505, 105);
    g.run(1);
    expect(g.values.get('worth', get('c2'))).toBe(5);
    expect(g.values.get('worth', get('c1'))).toBe(1);
    expect(g.values.get('score')).toBe(5);
  });

  it('show text for N seconds with {Value} placeholders', () => {
    const { g } = start([
      { type: 'changeValue', value: { valueId: 'score' }, op: 'set', amount: lit(7) },
      { type: 'showText', text: 'Score: {Score} / {Missing}', seconds: lit(1) },
    ]);
    expect(g.view().texts.map((t) => t.text)).toEqual(['Score: 7 / {Missing}']);
    g.run(59);
    expect(g.view().texts).toHaveLength(1);
    g.run(2);
    expect(g.view().texts).toEqual([]);
  });

  it('play a sound', () => {
    const played: string[] = [];
    const audio: AudioAdapter = { play: (id) => played.push(id), music() {}, stop() {} };
    start([{ type: 'playSound', assetId: 'builtin:sfx/jump' }], {}, { audio });
    expect(played).toEqual(['builtin:sfx/jump']);
  });

  it('wait N seconds before the remaining actions', () => {
    const { g } = start([
      { type: 'changeValue', value: { valueId: 'score' }, op: 'add', amount: lit(1) },
      { type: 'wait', seconds: ref('two') },
      { type: 'changeValue', value: { valueId: 'score' }, op: 'add', amount: lit(10) },
    ]);
    expect(g.values.get('score')).toBe(1);
    g.run(119);
    expect(g.values.get('score')).toBe(1);
    g.run(1);
    expect(g.values.get('score')).toBe(11);
  });

  it('change scene (stops the remaining actions)', () => {
    const { g } = start(
      [
        { type: 'changeScene', sceneId: 's2' },
        { type: 'changeValue', value: { valueId: 'score' }, op: 'add', amount: lit(1) },
      ],
      { extraScenes: [{ id: 's2', name: 'Level 2', objects: [{ id: 'z', kind: 'box', x: 5, y: 5 }] }] },
    );
    g.run(1);
    expect(g.scene.scene.id).toBe('s2');
    expect(g.scene.world.get('z')).toBeDefined();
    expect(g.values.get('score')).toBe(0);
  });

  it('restart scene', () => {
    const { g, get } = start([], {
      rules: [
        rule('move', { type: 'key', key: 'KeyM', mode: 'pressed' }, [{ type: 'moveBy', target: obj('b'), by: xy(lit(50), lit(0)) }]),
        rule('again', { type: 'key', key: 'KeyR', mode: 'pressed' }, [{ type: 'restartScene' }]),
      ],
    });
    g.input.keyDown('KeyM');
    g.run(1);
    expect(get('b')!.x).toBe(150);
    g.input.keyDown('KeyR');
    g.run(1);
    expect(g.scene.world.get('b')!.x).toBe(100);
  });

  it('shake the camera for N seconds', () => {
    const { g } = start([{ type: 'shakeCamera', seconds: lit(0.5) }]);
    g.run(1);
    expect(Math.hypot(g.scene.camera.offset.x, g.scene.camera.offset.y)).toBeGreaterThan(0);
    g.run(40);
    expect(Math.hypot(g.scene.camera.offset.x, g.scene.camera.offset.y)).toBe(0);
  });
});
