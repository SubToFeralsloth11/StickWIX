import { describe, expect, it } from 'vitest';
import { game, hold } from '../../../fixtures/build';

function walker(settings: Record<string, unknown> = {}, extra: Parameters<typeof game>[0] = {}) {
  const spec = extra as { kinds?: never[]; objects?: never[] };
  const { game: g } = game({
    ...extra,
    kinds: [{ id: 'p', stickers: [{ type: 'topdown', settings }] }, ...(spec.kinds ?? [])],
    objects: [{ id: 'p1', kind: 'p', x: 300, y: 300 }, ...(spec.objects ?? [])],
  });
  return { g, p: () => g.scene.world.get('p1')! };
}

describe('top-down sticker', () => {
  it('walks straight at `speed` px/s with no gravity', () => {
    const { g, p } = walker({ speed: 120 });
    hold(g, ['ArrowUp'], 60);
    expect(p().x).toBe(300);
    expect(p().y).toBeCloseTo(180, 5);
    g.run(30);
    expect(p().y).toBeCloseTo(180, 5);
  });

  it('8 directions: walks diagonally with normalised speed', () => {
    const { g, p } = walker({ speed: 160, directions: 8 });
    hold(g, ['ArrowRight', 'ArrowDown'], 60);
    const dx = p().x - 300;
    const dy = p().y - 300;
    expect(dx).toBeCloseTo(160 / Math.SQRT2, 5);
    expect(dy).toBeCloseTo(160 / Math.SQRT2, 5);
    expect(Math.hypot(dx, dy)).toBeCloseTo(160, 5);
  });

  it('4 directions: never moves diagonally; the latest pressed axis wins', () => {
    const { g, p } = walker({ speed: 160, directions: 4 });
    g.input.keyDown('ArrowRight');
    g.run(30);
    g.input.keyDown('ArrowDown');
    g.run(30);
    expect(p().x - 300).toBeCloseTo(80, 5);
    expect(p().y - 300).toBeCloseTo(80, 5);
    g.input.keyUp('ArrowDown');
    g.run(30);
    expect(p().x - 300).toBeCloseTo(160, 5);
    expect(p().y - 300).toBeCloseTo(80, 5);
  });

  it('faces the way it walks when faceMovement is on', () => {
    const { g, p } = walker();
    hold(g, ['KeyA'], 5);
    expect(p().facing).toBe(-1);
    const off = walker({ faceMovement: false });
    hold(off.g, ['KeyA'], 5);
    expect(off.p().facing).toBe(1);
  });

  it('is blocked by Solid objects', () => {
    const { g, p } = walker({}, {
      kinds: [{ id: 'wall', h: 200, stickers: [{ type: 'solid' }] }] as never,
      objects: [{ id: 'w', kind: 'wall', x: 400, y: 250 }] as never,
    });
    hold(g, ['ArrowRight'], 120);
    expect(p().x).toBeCloseTo(400 - 32, 5);
    // ...but can still slide along it.
    hold(g, ['ArrowRight', 'ArrowDown'], 20);
    expect(p().x).toBeCloseTo(400 - 32, 5);
    expect(p().y).toBeGreaterThan(300);
  });

  it('is blocked by solid tiles', () => {
    // Solid column at x = 448..480.
    const { g, p } = walker({}, { tiles: Array(20).fill('..............#') });
    hold(g, ['ArrowRight'], 120);
    expect(p().x).toBeCloseTo(448 - 32, 5);
  });
});
