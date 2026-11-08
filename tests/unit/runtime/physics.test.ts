import { describe, expect, it } from 'vitest';
import { game } from '../../fixtures/build';

const FLOOR = ['........................................', ...Array(9).fill('........................................'), '########################################'];

describe('physics', () => {
  it('lands a falling box on solid tiles and sets grounded', () => {
    const { game: g } = game({ tiles: FLOOR, kinds: [{ id: 'box', stickers: [{ type: 'falls' }] }], objects: [{ id: 'b', kind: 'box', x: 64, y: 0 }] });
    g.run(120);
    const b = g.scene.world.get('b')!;
    expect(b.y).toBeCloseTo(10 * 32 - 32, 5);
    expect(b.grounded).toBe(true);
    expect(b.vy).toBe(0);
  });

  it('does not tunnel through a one-tile floor at maximum speed', () => {
    const { game: g } = game({
      tiles: ['....', '....', '....', '....', '####'],
      kinds: [{ id: 'bullet', w: 4, h: 4, stickers: [{ type: 'falls', settings: { gravity: 5000, maxFall: 3000 } }] }],
      objects: [{ id: 'b', kind: 'bullet', x: 40, y: 0 }],
    });
    g.run(60);
    expect(g.scene.world.get('b')!.y).toBeCloseTo(4 * 32 - 4, 5);
  });

  it('blocks horizontal movement at walls (axis separated)', () => {
    const { game: g } = game({
      tiles: ['....#', '....#', '....#', '#####'],
      kinds: [{ id: 'hero', stickers: [{ type: 'platformer' }] }],
      objects: [{ id: 'h', kind: 'hero', x: 32, y: 64 }],
    });
    g.input.keyDown('ArrowRight');
    g.run(120);
    const h = g.scene.world.get('h')!;
    expect(h.x).toBeCloseTo(4 * 32 - 32, 5);
    expect(h.grounded).toBe(true);
  });

  it('lets bodies jump up through one-way platforms and stand on them', () => {
    const { game: g } = game({
      tiles: ['......', '......', '......', '..==..', '......', '......', '######'],
      kinds: [{ id: 'box', stickers: [{ type: 'falls' }] }],
      objects: [{ id: 'b', kind: 'box', x: 64, y: 160 }],
    });
    g.run(30);
    const b = g.scene.world.get('b')!;
    expect(b.y).toBeCloseTo(6 * 32 - 32, 5); // fell past nothing, sits on the floor
    b.vy = -900; // shoot up through the one-way row
    g.run(90);
    expect(b.y).toBeCloseTo(3 * 32 - 32, 5); // came back down onto the one-way platform
  });

  it('fires contact start once per touch, again only after separating', () => {
    const { game: g } = game({
      kinds: [{ id: 'a' }, { id: 'b' }],
      objects: [{ id: 'A', kind: 'a', x: 0, y: 0 }, { id: 'B', kind: 'b', x: 10, y: 0 }],
    });
    let touches = 0;
    g.onEvent((e) => e.type === 'touch' && touches++);
    g.run(10);
    expect(touches).toBe(1);
    g.scene.world.get('B')!.x = 200;
    g.run(2);
    g.scene.world.get('B')!.x = 10;
    g.run(2);
    expect(touches).toBe(2);
  });

  it('stops against Solid objects as well as tiles', () => {
    const { game: g } = game({
      kinds: [{ id: 'box', stickers: [{ type: 'falls' }] }, { id: 'ground', w: 200, h: 32, stickers: [{ type: 'solid' }] }],
      objects: [{ id: 'b', kind: 'box', x: 20, y: 0 }, { id: 'g', kind: 'ground', x: 0, y: 200 }],
    });
    g.run(90);
    expect(g.scene.world.get('b')!.y).toBeCloseTo(168, 5);
  });
});
