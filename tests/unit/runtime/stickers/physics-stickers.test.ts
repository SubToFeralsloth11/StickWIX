import { describe, expect, it } from 'vitest';
import { game, record, stickerEvents } from '../../../fixtures/build';

const ROW = '.'.repeat(40);
const FLOOR = [...Array(10).fill(ROW), '#'.repeat(40)];

describe('Solid sticker', () => {
  it('holds up a falling object', () => {
    const { game: g } = game({
      kinds: [
        { id: 'box', stickers: [{ type: 'falls' }] },
        { id: 'block', w: 96, stickers: [{ type: 'solid' }] },
      ],
      objects: [
        { id: 'b', kind: 'box', x: 100, y: 0 },
        { id: 'floor', kind: 'block', x: 80, y: 200 },
      ],
    });
    g.run(120);
    const b = g.scene.world.get('b')!;
    expect(b.y).toBeCloseTo(200 - 32, 5);
    expect(b.grounded).toBe(true);
  });

  it('stops a walker at its side', () => {
    const { game: g } = game({
      tiles: FLOOR,
      kinds: [
        { id: 'hero', stickers: [{ type: 'platformer' }] },
        { id: 'crate', stickers: [{ type: 'solid' }] },
      ],
      objects: [
        { id: 'h', kind: 'hero', x: 64, y: 288 },
        { id: 'c', kind: 'crate', x: 200, y: 288 },
      ],
    });
    g.input.keyDown('ArrowRight');
    g.run(120);
    expect(g.scene.world.get('h')!.x).toBeCloseTo(200 - 32, 5);
  });

  it('one-way: passes from below, stands on top', () => {
    const { game: g } = game({
      tiles: FLOOR,
      kinds: [
        { id: 'hero', stickers: [{ type: 'platformer', settings: { jumpHeight: 120 } }] },
        { id: 'cloud', w: 128, h: 16, stickers: [{ type: 'solid', settings: { oneWay: true } }] },
      ],
      objects: [
        { id: 'h', kind: 'hero', x: 64, y: 288 },
        { id: 'p', kind: 'cloud', x: 32, y: 230 },
      ],
    });
    g.run(5);
    g.input.keyDown('Space');
    g.run(120);
    const h = g.scene.world.get('h')!;
    expect(h.y).toBeCloseTo(230 - 32, 5);
    expect(h.grounded).toBe(true);
  });

  it('a solid (not one-way) blocks a jump from below', () => {
    const { game: g } = game({
      tiles: FLOOR,
      kinds: [
        { id: 'hero', stickers: [{ type: 'platformer', settings: { jumpHeight: 120 } }] },
        { id: 'ceiling', w: 128, h: 16, stickers: [{ type: 'solid' }] },
      ],
      objects: [
        { id: 'h', kind: 'hero', x: 64, y: 288 },
        { id: 'c', kind: 'ceiling', x: 32, y: 230 },
      ],
    });
    g.run(5);
    g.input.keyDown('Space');
    let top = 288;
    for (let i = 0; i < 120; i++) {
      g.run(1);
      top = Math.min(top, g.scene.world.get('h')!.y);
    }
    expect(top).toBeGreaterThanOrEqual(246 - 1e-6);
    expect(g.scene.world.get('h')!.y).toBeCloseTo(288, 5);
  });
});

describe('Falls sticker', () => {
  it('accelerates by gravity and caps at maxFall', () => {
    const { game: g } = game({
      height: 20000,
      kinds: [{ id: 'rock', stickers: [{ type: 'falls', settings: { gravity: 600, maxFall: 300 } }] }],
      objects: [{ id: 'r', kind: 'rock', x: 0, y: 0 }],
    });
    g.run(15);
    expect(g.scene.world.get('r')!.vy).toBeCloseTo(150, 5);
    g.run(60);
    expect(g.scene.world.get('r')!.vy).toBe(300);
    const y = g.scene.world.get('r')!.y;
    g.run(60);
    expect(g.scene.world.get('r')!.y - y).toBeCloseTo(300, 5);
  });

  it('emits `lands` once when it lands on solid tiles', () => {
    const { game: g } = game({
      tiles: FLOOR,
      kinds: [{ id: 'rock', stickers: [{ type: 'falls' }] }],
      objects: [{ id: 'r', kind: 'rock', x: 64, y: 0 }],
    });
    const seen = record(g);
    g.run(180);
    expect(stickerEvents(seen, 'lands')).toEqual(['r']);
    expect(g.scene.world.get('r')!.y).toBeCloseTo(288, 5);
  });

  it('does not emit `lands` while resting', () => {
    const { game: g } = game({
      tiles: FLOOR,
      kinds: [{ id: 'rock', stickers: [{ type: 'falls' }] }],
      objects: [{ id: 'r', kind: 'rock', x: 64, y: 288 }],
    });
    const seen = record(g);
    g.run(120);
    expect(stickerEvents(seen, 'lands')).toEqual([]);
  });
});

describe('Bouncy sticker', () => {
  function drop(bounce: number) {
    const { game: g } = game({
      tiles: FLOOR,
      kinds: [{ id: 'ball', stickers: [{ type: 'falls' }, { type: 'bouncy', settings: { bounce } }] }],
      objects: [{ id: 'b', kind: 'ball', x: 64, y: 88 }],
    });
    const b = () => g.scene.world.get('b')!;
    let guard = 0;
    while (!b().blocked.down && guard++ < 300) g.run(1);
    const after = { vy: b().vy };
    let top = Infinity;
    for (let i = 0; i < 90; i++) {
      g.run(1);
      top = Math.min(top, b().y);
    }
    return { vy: after.vy, rebound: 288 - top };
  }

  it('bounces back up off the floor, lower each time', () => {
    const r = drop(0.8);
    expect(r.vy).toBeLessThan(0);
    // Dropped from 200 px above: rebound ≈ 0.8² · 200.
    expect(r.rebound).toBeGreaterThan(100);
    expect(r.rebound).toBeLessThan(200);
  });

  it('bounce 0 stops dead', () => {
    const r = drop(0);
    expect(r.vy).toBe(0);
    expect(r.rebound).toBeLessThan(1);
  });

  it('bounces off walls sideways', () => {
    const { game: g } = game({
      tiles: Array(10).fill('..........#'),
      kinds: [{ id: 'ball', stickers: [{ type: 'bouncy', settings: { bounce: 1 } }] }],
      objects: [{ id: 'b', kind: 'ball', x: 100, y: 100 }],
      rules: [{ id: 'r', enabled: true, trigger: { type: 'sceneStart' }, conditions: { join: 'all', items: [] }, actions: [{ type: 'setSpeed', target: { t: 'object', id: 'b' }, speed: { x: { lit: 300 }, y: { lit: 0 } } }] }],
    });
    g.run(90);
    const b = g.scene.world.get('b')!;
    expect(b.vx).toBeCloseTo(-300, 5);
    expect(b.x).toBeLessThan(320 - 32);
  });
});
