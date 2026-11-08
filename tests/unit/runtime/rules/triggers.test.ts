import { describe, expect, it } from 'vitest';
import type { Game } from '@/runtime/game';
import { any, game, lit, obj, ref, rule, self, type Spec } from '../../../fixtures/build';

const SCORE = [{ id: 'score', name: 'Score', start: 0 }];
const bump = (by = 1, valueId = 'score') => ({ type: 'changeValue', value: { valueId }, op: 'add', amount: lit(by) });
const score = (g: Game) => g.values.get('score');

function withRules(rules: unknown[], spec: Spec = {}) {
  const { game: g } = game({ ...spec, values: [...SCORE, ...(spec.values ?? [])], rules });
  return g;
}

describe('triggers (FR-016)', () => {
  it('scene starts: once, when the scene starts', () => {
    const g = withRules([rule('r', { type: 'sceneStart' }, [bump()])]);
    expect(score(g)).toBe(1);
    g.run(120);
    expect(score(g)).toBe(1);
  });

  it('every N seconds, with a literal or a value amount', () => {
    const lits = withRules([rule('r', { type: 'every', seconds: lit(0.5) }, [bump()])]);
    lits.run(29);
    expect(score(lits)).toBe(0);
    lits.run(1);
    expect(score(lits)).toBe(1);
    lits.run(90);
    expect(score(lits)).toBe(4);

    const refs = withRules([rule('r', { type: 'every', seconds: ref('gap') }, [bump()])], { values: [{ id: 'gap', name: 'Gap', start: 0.25 }] });
    refs.run(60);
    expect(score(refs)).toBe(4);
  });

  it('after N seconds: once', () => {
    const g = withRules([rule('r', { type: 'after', seconds: lit(1) }, [bump()])]);
    g.run(59);
    expect(score(g)).toBe(0);
    g.run(1);
    expect(score(g)).toBe(1);
    g.run(300);
    expect(score(g)).toBe(1);
  });

  it('key pressed / held / released', () => {
    const g = withRules(
      [
        rule('p', { type: 'key', key: 'Space', mode: 'pressed' }, [bump(1)]),
        rule('h', { type: 'key', key: 'Space', mode: 'held' }, [bump(100)]),
        rule('r', { type: 'key', key: 'Space', mode: 'released' }, [bump(10000)]),
      ],
    );
    g.input.keyDown('Space');
    g.run(10);
    expect(score(g)).toBe(1 + 10 * 100);
    g.input.keyUp('Space');
    g.run(10);
    expect(score(g)).toBe(1 + 10 * 100 + 10000);
    g.input.keyDown('KeyX');
    g.run(5);
    expect(score(g)).toBe(1 + 10 * 100 + 10000);
  });

  describe('clicked', () => {
    const spec: Spec = {
      kinds: [{ id: 'coin' }, { id: 'rock' }],
      objects: [
        { id: 'c1', kind: 'coin', x: 100, y: 100 },
        { id: 'c2', kind: 'coin', x: 200, y: 100 },
        { id: 'r', kind: 'rock', x: 300, y: 100 },
      ],
      ui: [{ id: 'btn', name: 'Go', type: 'button', x: 0, y: 0, anchor: 'br', text: 'Go' }],
    };
    const click = (g: Game, x: number, y: number) => {
      g.input.mouseDown(x, y);
      g.run(1);
      g.input.mouseUp(x, y);
      g.run(1);
    };

    it('one object, any of a Kind', () => {
      const g = withRules(
        [rule('one', { type: 'clicked', target: obj('c2') }, [bump(1)]), rule('any', { type: 'clicked', target: any('coin') }, [bump(10)])],
        spec,
      );
      click(g, 110, 110);
      expect(score(g)).toBe(10);
      click(g, 210, 110);
      expect(score(g)).toBe(21);
      click(g, 310, 110);
      click(g, 500, 300);
      expect(score(g)).toBe(21);
    });

    it('a UI button (and not the object under it)', () => {
      const s: Spec = { ...spec, objects: [{ id: 'c1', kind: 'coin', x: 600, y: 320 }] };
      const g = withRules(
        [rule('ui', { type: 'clicked', target: { t: 'ui', id: 'btn' } }, [bump(1)]), rule('obj', { type: 'clicked', target: any('coin') }, [bump(10)])],
        s,
      );
      click(g, 630, 350);
      expect(score(g)).toBe(1);
      click(g, 10, 10);
      expect(score(g)).toBe(1);
    });
  });

  describe('touches', () => {
    const spec: Spec = {
      kinds: [{ id: 'hero', stickers: [{ type: 'topdown', settings: { speed: 120 } }] }, { id: 'coin' }],
      objects: [
        { id: 'h', kind: 'hero', x: 100, y: 100 },
        { id: 'c', kind: 'coin', x: 160, y: 100 },
      ],
    };

    it('fires on contact start only, again after separating', () => {
      const g = withRules([rule('r', { type: 'touches', a: any('hero'), b: any('coin') }, [bump()])], spec);
      g.input.keyDown('ArrowRight');
      g.run(20);
      expect(score(g)).toBe(1);
      g.run(10); // still overlapping
      expect(score(g)).toBe(1);
      g.input.keyUp('ArrowRight');
      g.input.keyDown('ArrowLeft');
      g.run(60);
      expect(score(g)).toBe(1);
      g.input.keyUp('ArrowLeft');
      g.input.keyDown('ArrowRight');
      g.run(60);
      expect(score(g)).toBe(2);
    });

    it('matches in either order', () => {
      const g = withRules([rule('r', { type: 'touches', a: any('coin'), b: obj('h') }, [bump()])], spec);
      g.input.keyDown('ArrowRight');
      g.run(20);
      expect(score(g)).toBe(1);
    });
  });

  it('value changes (only when it really changes)', () => {
    const g = withRules(
      [
        rule('set', { type: 'key', key: 'KeyS', mode: 'pressed' }, [{ type: 'changeValue', value: { valueId: 'lives' }, op: 'set', amount: lit(3) }]),
        rule('dec', { type: 'key', key: 'KeyD', mode: 'pressed' }, [{ type: 'changeValue', value: { valueId: 'lives' }, op: 'subtract', amount: lit(1) }]),
        rule('r', { type: 'valueChanges', value: { valueId: 'lives' } }, [bump()]),
      ],
      { values: [{ id: 'lives', name: 'Lives', start: 3 }] },
    );
    const tap = (k: string) => {
      g.input.keyDown(k);
      g.run(1);
      g.input.keyUp(k);
      g.run(1);
    };
    tap('KeyS');
    expect(score(g)).toBe(0);
    tap('KeyD');
    tap('KeyD');
    expect(score(g)).toBe(2);
  });

  it('value reaches: crossing from either side, not while staying past it', () => {
    const g = withRules(
      [
        rule('up', { type: 'key', key: 'ArrowUp', mode: 'pressed' }, [{ type: 'changeValue', value: { valueId: 'gold' }, op: 'add', amount: lit(4) }]),
        rule('down', { type: 'key', key: 'ArrowDown', mode: 'pressed' }, [{ type: 'changeValue', value: { valueId: 'gold' }, op: 'subtract', amount: lit(8) }]),
        rule('r', { type: 'valueReaches', value: { valueId: 'gold' }, amount: lit(10) }, [bump()]),
      ],
      { values: [{ id: 'gold', name: 'Gold', start: 0 }] },
    );
    const tap = (k: string) => {
      g.input.keyDown(k);
      g.run(1);
      g.input.keyUp(k);
      g.run(1);
    };
    tap('ArrowUp'); // 4
    tap('ArrowUp'); // 8
    expect(score(g)).toBe(0);
    tap('ArrowUp'); // 12: crossed upward
    expect(score(g)).toBe(1);
    tap('ArrowUp'); // 16: still above
    expect(score(g)).toBe(1);
    tap('ArrowDown'); // 8: crossed downward
    expect(score(g)).toBe(2);
    tap('ArrowDown'); // 0: still below
    expect(score(g)).toBe(2);
  });

  it('value reaches: landing exactly on the amount counts', () => {
    const g = withRules(
      [
        rule('up', { type: 'key', key: 'ArrowUp', mode: 'pressed' }, [{ type: 'changeValue', value: { valueId: 'gold' }, op: 'add', amount: lit(5) }]),
        rule('r', { type: 'valueReaches', value: { valueId: 'gold' }, amount: ref('goal') }, [bump()]),
      ],
      { values: [{ id: 'gold', name: 'Gold', start: 0 }, { id: 'goal', name: 'Goal', start: 10 }] },
    );
    for (let i = 0; i < 2; i++) {
      g.input.keyDown('ArrowUp');
      g.run(1);
      g.input.keyUp('ArrowUp');
      g.run(1);
    }
    expect(g.values.get('gold')).toBe(10);
    expect(score(g)).toBe(1);
  });

  it('object created (not for objects placed in the scene) and destroyed', () => {
    const g = withRules(
      [
        rule('make', { type: 'key', key: 'KeyC', mode: 'pressed' }, [{ type: 'create', kindId: 'coin', place: { at: { x: lit(50), y: lit(50) } } }]),
        rule('kill', { type: 'key', key: 'KeyK', mode: 'pressed' }, [{ type: 'destroy', target: any('coin') }]),
        rule('c', { type: 'created', target: any('coin') }, [bump(1)]),
        rule('d', { type: 'destroyed', target: any('coin') }, [bump(100)]),
      ],
      { kinds: [{ id: 'coin' }], objects: [{ id: 'c0', kind: 'coin', x: 0, y: 0 }] },
    );
    g.run(5);
    expect(score(g)).toBe(0);
    g.input.keyDown('KeyC');
    g.run(1);
    expect(score(g)).toBe(1);
    g.input.keyDown('KeyK');
    g.run(1);
    expect(score(g)).toBe(1 + 2 * 100);
  });

  it('object leaves the scene', () => {
    const g = withRules([rule('r', { type: 'leavesScene', target: obj('rock') }, [bump()])], {
      kinds: [{ id: 'boulder', stickers: [{ type: 'falls' }] }],
      objects: [{ id: 'rock', kind: 'boulder', x: 100, y: 0 }],
    });
    g.run(30);
    expect(score(g)).toBe(0);
    g.run(240);
    expect(score(g)).toBe(1);
    expect(g.scene.world.get('rock')).toBeUndefined();
  });

  it('sticker events (FR-014), including for "this object" Kind rules', () => {
    const g = withRules([rule('r', { type: 'sticker', target: any('coin'), event: 'collected' }, [bump(1)])], {
      tiles: [...Array(10).fill('.'.repeat(20)), '#'.repeat(20)],
      kinds: [
        { id: 'hero', stickers: [{ type: 'platformer' }] },
        { id: 'coin', stickers: [{ type: 'collectible' }], rules: [rule('k', { type: 'sticker', target: self, event: 'collected' }, [bump(10)])] },
      ],
      objects: [
        { id: 'h', kind: 'hero', x: 32, y: 288 },
        { id: 'c', kind: 'coin', x: 128, y: 288 },
        { id: 'far', kind: 'coin', x: 500, y: 100 },
      ],
    });
    g.input.keyDown('ArrowRight');
    g.run(40);
    expect(score(g)).toBe(11);
  });
});
