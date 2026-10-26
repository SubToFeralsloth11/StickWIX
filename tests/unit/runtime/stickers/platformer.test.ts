import { describe, expect, it } from 'vitest';
import { game, record, stickerEvents } from '../../../fixtures/build';

const ROW = '.'.repeat(40);
/** Floor along row 10 (top at y = 320). */
const FLOOR = [...Array(10).fill(ROW), '#'.repeat(40)];
const GROUND_Y = 320 - 32;

function hero(settings: Record<string, unknown> = {}, at = { x: 64, y: GROUND_Y }, tiles = FLOOR) {
  const { game: g } = game({
    tiles,
    kinds: [{ id: 'hero', stickers: [{ type: 'platformer', settings }] }],
    objects: [{ id: 'h', kind: 'hero', ...at }],
  });
  return { g, h: () => g.scene.world.get('h')! };
}

/** Highest point (smallest y) reached while holding Space from standing. */
function apex(settings: Record<string, unknown>) {
  const { g, h } = hero(settings);
  g.run(5);
  const y0 = h().y;
  g.input.keyDown('Space');
  let top = y0;
  for (let i = 0; i < 120; i++) {
    g.run(1);
    top = Math.min(top, h().y);
  }
  return y0 - top;
}

describe('platformer sticker', () => {
  it('stands on solid tiles', () => {
    const { g, h } = hero({}, { x: 64, y: 100 });
    g.run(90);
    expect(h().y).toBeCloseTo(GROUND_Y, 5);
    expect(h().grounded).toBe(true);
  });

  it('walks at `speed` px/s on flat ground, both ways', () => {
    const { g, h } = hero({ speed: 240 }, { x: 400, y: GROUND_Y });
    g.run(5);
    let x0 = h().x;
    g.input.keyDown('ArrowRight');
    g.run(60);
    expect(h().x - x0).toBeCloseTo(240, 5);
    expect(h().facing).toBe(1);
    g.input.keyUp('ArrowRight');
    g.run(1);
    x0 = h().x;
    g.input.keyDown('KeyA');
    g.run(30);
    expect(h().x - x0).toBeCloseTo(-120, 5);
    expect(h().facing).toBe(-1);
  });

  it('ignores the other scheme when keys = arrows', () => {
    const { g, h } = hero({ keys: 'arrows' });
    g.run(5);
    const x0 = h().x;
    g.input.keyDown('KeyD');
    g.run(30);
    expect(h().x).toBe(x0);
  });

  it.each([72, 144, 30])('reaches a jump apex of about jumpHeight = %i px while Space is held', (jumpHeight) => {
    expect(apex({ jumpHeight })).toBeGreaterThan(jumpHeight - 3);
    expect(apex({ jumpHeight })).toBeLessThan(jumpHeight + 3);
  });

  it('jumps lower when Space is let go early', () => {
    const { g, h } = hero({ jumpHeight: 144 });
    g.run(5);
    const y0 = h().y;
    g.input.keyDown('Space');
    g.run(3);
    g.input.keyUp('Space');
    let top = y0;
    for (let i = 0; i < 90; i++) {
      g.run(1);
      top = Math.min(top, h().y);
    }
    expect(y0 - top).toBeLessThan(100);
  });

  it('emits `jumps` on take-off and `lands` on touchdown', () => {
    const { g, h } = hero();
    g.run(5);
    const seen = record(g);
    g.input.keyDown('Space');
    g.run(1);
    expect(stickerEvents(seen, 'jumps')).toEqual(['h']);
    expect(stickerEvents(seen, 'lands')).toEqual([]);
    g.input.keyUp('Space');
    g.run(90);
    expect(stickerEvents(seen, 'jumps')).toEqual(['h']);
    expect(stickerEvents(seen, 'lands')).toEqual(['h']);
    expect(h().y).toBeCloseTo(GROUND_Y, 5);
  });

  it('does not jump again while Space stays held', () => {
    const { g } = hero();
    g.run(5);
    const seen = record(g);
    g.input.keyDown('Space');
    g.run(180);
    expect(stickerEvents(seen, 'jumps')).toHaveLength(1);
  });

  describe('coyote time', () => {
    // Ledge: floor only under columns 0..4 (x < 160).
    const LEDGE = [...Array(10).fill(ROW), '#####' + '.'.repeat(35)];

    function walkOff(settings: Record<string, unknown>, lateSteps: number) {
      const { g, h } = hero(settings, { x: 64, y: GROUND_Y }, LEDGE);
      g.run(5);
      g.input.keyDown('ArrowRight');
      let guard = 0;
      while (h().grounded && guard++ < 200) g.run(1);
      expect(h().grounded).toBe(false);
      g.run(lateSteps);
      const seen = record(g);
      g.input.keyDown('Space');
      g.run(1);
      return { jumped: stickerEvents(seen, 'jumps').length === 1, vy: h().vy };
    }

    it('still jumps when Space is pressed just after running off a ledge', () => {
      const r = walkOff({ coyoteMs: 100 }, 3);
      expect(r.jumped).toBe(true);
      expect(r.vy).toBeLessThan(0);
    });

    it('does not jump once coyoteMs has passed', () => {
      const r = walkOff({ coyoteMs: 100 }, 9);
      expect(r.jumped).toBe(false);
      expect(r.vy).toBeGreaterThan(0);
    });

    it('has no grace at coyoteMs = 0', () => {
      expect(walkOff({ coyoteMs: 0 }, 1).jumped).toBe(false);
    });
  });

  describe('jump buffer', () => {
    /** Steps from the drop until the hero first stands on the floor. */
    function landingStep() {
      const { g, h } = hero({}, { x: 64, y: 100 });
      for (let i = 1; i < 200; i++) {
        g.run(1);
        if (h().grounded) return i;
      }
      throw new Error('never landed');
    }

    function pressBeforeLanding(early: number, jumpBufferMs = 100) {
      const n = landingStep();
      const { g, h } = hero({ jumpBufferMs }, { x: 64, y: 100 });
      g.run(n - early);
      const seen = record(g);
      g.input.keyDown('Space');
      g.run(early + 3);
      return { jumped: stickerEvents(seen, 'jumps').length > 0, rising: h().vy < 0 };
    }

    it('jumps on landing when Space was pressed shortly before', () => {
      expect(pressBeforeLanding(3)).toEqual({ jumped: true, rising: true });
    });

    it('forgets a press made longer than jumpBufferMs before landing', () => {
      expect(pressBeforeLanding(12).jumped).toBe(false);
    });
  });
});
