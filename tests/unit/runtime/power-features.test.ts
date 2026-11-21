import { describe, expect, it } from 'vitest';
import { any, game, lit, obj, project, record, rule, that } from '../../fixtures/build';

const mouse = { atMouse: { snap: lit(0) } };

describe('mouse holding and breaking', () => {
  it('Breakable breaks after the mouse is held on it long enough and drops its item', () => {
    const { game: g } = game({
      kinds: [
        { id: 'block', stickers: [{ type: 'breakable', settings: { seconds: 0.5, drop: 'item' } }] },
        { id: 'item', w: 8, h: 8 },
      ],
      objects: [{ id: 'b', kind: 'block', x: 100, y: 100 }],
    });
    const seen = record(g);
    g.input.mouseDown(110, 110);
    g.run(15);
    expect(g.scene.world.get('b')?.crack).toBeGreaterThan(0.4);
    g.input.mouseUp(110, 110);
    g.run(1);
    expect(g.scene.world.get('b')?.crack).toBe(0); // letting go resets the progress
    g.input.mouseDown(110, 110);
    g.run(32);
    expect(g.scene.world.get('b')).toBeUndefined();
    expect(g.scene.world.byKind('item')).toHaveLength(1);
    expect(seen.some((e) => e.type === 'sticker' && e.event === 'broken')).toBe(true);
  });

  it('"held down for" fires once per hold and binds the held object', () => {
    const { game: g } = game({
      kinds: [{ id: 'block' }],
      objects: [
        { id: 'a', kind: 'block', x: 0, y: 0 },
        { id: 'b', kind: 'block', x: 100, y: 0 },
      ],
      rules: [rule('r', { type: 'holdOn', target: any('block'), seconds: lit(0.25) }, [{ type: 'destroy', target: that('block') }])],
    });
    g.input.mouseDown(110, 10);
    g.run(10);
    expect(g.scene.world.get('b')).toBeDefined();
    g.run(10);
    expect(g.scene.world.get('b')).toBeUndefined();
    expect(g.scene.world.get('a')).toBeDefined();
  });

  it('right-clicks only reach "is right-clicked" rules', () => {
    const { game: g } = game({
      kinds: [{ id: 'chest' }],
      objects: [{ id: 'c', kind: 'chest', x: 0, y: 0 }],
      values: [
        { id: 'l', name: 'Left', start: 0 },
        { id: 'r', name: 'Right', start: 0 },
      ],
      rules: [
        rule('a', { type: 'clicked', target: obj('c') }, [{ type: 'changeValue', value: { valueId: 'l' }, op: 'add', amount: lit(1) }]),
        rule('b', { type: 'clicked', target: obj('c'), button: 'right' }, [{ type: 'changeValue', value: { valueId: 'r' }, op: 'add', amount: lit(1) }]),
      ],
    });
    g.input.mouseDown(5, 5, 'right');
    g.run(1);
    expect([g.values.game.get('l'), g.values.game.get('r')]).toEqual([0, 1]);
  });
});

describe('building', () => {
  it('creates objects at the mouse snapped to a grid', () => {
    const { game: g } = game({
      kinds: [{ id: 'block' }],
      rules: [rule('r', { type: 'mouse', button: 'right', mode: 'pressed' }, [{ type: 'create', kindId: 'block', place: { atMouse: { snap: lit(32) } } }])],
    });
    g.input.mouseDown(75, 40, 'right');
    g.run(1);
    const [b] = g.scene.world.byKind('block');
    expect([b?.x, b?.y]).toEqual([64, 32]);
  });

  it('removes and places tiles, and solidity follows', () => {
    const { game: g } = game({
      tiles: ['.....', '#####'],
      rules: [rule('r', { type: 'key', key: 'KeyX', mode: 'pressed' }, [{ type: 'setTile', place: mouse, tile: lit(-1) }])],
    });
    g.input.mouseMove(40, 40);
    expect(g.scene.world.solidAt(40, 40)).toBe(true);
    g.input.keyDown('KeyX');
    g.run(1);
    expect(g.scene.world.tileAtPoint(40, 40)).toBe(-1);
    expect(g.scene.world.solidAt(40, 40)).toBe(false);
    expect(g.view().tiles?.version).toBe(1);
  });
});

describe('animations', () => {
  it('stays on its first frame without auto-play, then plays a named animation once and reports the end', () => {
    const p = project({ kinds: [{ id: 'hero', lookId: 'look' }], objects: [{ id: 'h', kind: 'hero', x: 0, y: 0 }] });
    p.kinds[0]!.autoPlay = false;
    p.kinds[0]!.animations = [{ id: 'a1', name: 'Mine', lookId: 'swing', fps: 10, loop: false }];
    p.rules = [rule('r', { type: 'key', key: 'KeyM', mode: 'pressed' }, [{ type: 'playAnim', target: obj('h'), anim: 'mine' }]) as never];
    const { game: g } = game(p, { assetInfo: () => ({ w: 32, h: 32, frames: 4, fps: 8 }) });
    const seen = record(g);
    const h = () => g.scene.world.get('h')!;
    expect(h().still).toBe(0);
    g.input.keyDown('KeyM');
    g.run(1);
    expect(h().anim?.name).toBe('Mine');
    expect(h().anim?.assetId).toBe('swing');
    g.run(30);
    expect(h().anim?.frame).toBe(3);
    expect(seen.filter((e) => e.type === 'animEnd')).toHaveLength(1);
  });
});

describe('logic', () => {
  it('messages start every rule waiting for them, by name in any case', () => {
    const { game: g } = game({
      values: [{ id: 'v', name: 'Hits', start: 0 }],
      rules: [
        rule('send', { type: 'sceneStart' }, [{ type: 'sendMessage', name: 'Game Over' }]),
        rule('get', { type: 'message', name: 'game over' }, [{ type: 'changeValue', value: { valueId: 'v' }, op: 'add', amount: lit(1) }]),
      ],
    });
    g.run(1);
    expect(g.values.game.get('v')).toBe(1);
  });

  it('"becomes true" fires once when a check turns true; "while true" every frame; NOT flips a check', () => {
    const { game: g } = game({
      values: [
        { id: 'x', name: 'X', start: 0 },
        { id: 'once', name: 'Once', start: 0 },
        { id: 'each', name: 'Each', start: 0 },
        { id: 'not', name: 'Not', start: 0 },
      ],
      rules: [
        rule('tick', { type: 'everyFrame' }, [{ type: 'changeValue', value: { valueId: 'x' }, op: 'add', amount: lit(1) }]),
        rule('b', { type: 'becomes', cond: { type: 'compare', value: { valueId: 'x' }, op: 'ge', to: lit(5) } }, [{ type: 'changeValue', value: { valueId: 'once' }, op: 'add', amount: lit(1) }]),
        rule('w', { type: 'whileTrue', cond: { type: 'compare', value: { valueId: 'x' }, op: 'ge', to: lit(5) } }, [{ type: 'changeValue', value: { valueId: 'each' }, op: 'add', amount: lit(1) }]),
        rule('n', { type: 'everyFrame' }, [{ type: 'changeValue', value: { valueId: 'not' }, op: 'add', amount: lit(1) }], [{ type: 'compare', value: { valueId: 'x' }, op: 'ge', to: lit(5), not: true }]),
      ],
    });
    g.run(10);
    expect(g.values.game.get('once')).toBe(1);
    expect(g.values.game.get('each')).toBe(6);
    expect(g.values.game.get('not')).toBe(4);
  });

  it('number blanks can use maths, object properties and the mouse', () => {
    const { game: g } = game({
      kinds: [{ id: 'hero', w: 20, h: 20 }],
      objects: [{ id: 'h', kind: 'hero', x: 100, y: 50 }],
      rules: [
        rule('r', { type: 'key', key: 'KeyS', mode: 'pressed' }, [
          { type: 'setProp', target: obj('h'), p: 'size', op: 'set', amount: { math: { op: 'mul', a: lit(100), b: lit(2) } } },
          { type: 'moveTo', target: obj('h'), to: { at: { x: { game: 'mouseX' }, y: { prop: { of: obj('h'), p: 'y' } } } } },
        ]),
      ],
    });
    g.input.mouseMove(300, 0);
    g.input.keyDown('KeyS');
    g.run(1);
    const h = g.scene.world.get('h')!;
    expect([h.w, h.h]).toEqual([40, 40]);
    expect(h.x).toBe(300);
  });

  it('zoom changes where the mouse is in the scene', () => {
    const { game: g } = game({ rules: [rule('z', { type: 'sceneStart' }, [{ type: 'zoomCamera', percent: lit(200) }])] });
    g.run(1);
    g.input.mouseMove(200, 100);
    expect(g.scene.mouseWorld()).toEqual({ x: 100, y: 50 });
  });
});
