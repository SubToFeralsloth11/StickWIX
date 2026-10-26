import { describe, expect, it } from 'vitest';
import { Camera } from '@/runtime/camera';
import { game } from '../../fixtures/build';

// Screen 640×360; scene 2000×1200.
function follow(settings: Record<string, unknown>, at = { x: 1000, y: 600 }) {
  const { game: g } = game({
    width: 2000,
    height: 1200,
    kinds: [{ id: 'hero', stickers: [{ type: 'topdown', settings: { speed: 300 } }, { type: 'cameraFollow', settings }] }],
    objects: [{ id: 'h', kind: 'hero', ...at }],
  });
  return { g, cam: g.scene.camera, h: () => g.scene.world.get('h')! };
}

describe('camera', () => {
  it('starts centred on the follow target', () => {
    const { cam } = follow({});
    expect(cam.x).toBe(1016 - 320);
    expect(cam.y).toBe(616 - 180);
  });

  it('does not scroll while the target stays inside the free zone', () => {
    const { g, cam } = follow({ smoothing: 0, deadzone: 40 });
    const x0 = cam.x;
    g.input.keyDown('ArrowRight');
    g.run(6); // 30 px
    expect(cam.x).toBe(x0);
  });

  it('scrolls to keep the target at the edge of the free zone (no smoothing)', () => {
    const { g, cam, h } = follow({ smoothing: 0, deadzone: 40 });
    g.input.keyDown('ArrowRight');
    g.run(60);
    expect(h().x + 16 - 320 - cam.x).toBeCloseTo(40, 5);
  });

  it('glides toward the target with smoothing and settles', () => {
    const { g, cam, h } = follow({ smoothing: 0.3, deadzone: 0 });
    h().x += 300;
    g.run(1);
    const goal = h().x + 16 - 320;
    const x0 = 1016 - 320;
    expect(cam.x).toBeGreaterThan(x0);
    expect(cam.x).toBeLessThan(x0 + 300 * 0.2);
    g.run(10);
    expect(cam.x).toBeLessThan(goal - 10);
    g.run(180);
    expect(cam.x).toBeCloseTo(goal, 1);
  });

  it('a smoother camera lags further behind', () => {
    const lag = (smoothing: number) => {
      const { g, cam, h } = follow({ smoothing, deadzone: 0 });
      h().x += 300;
      g.run(10);
      return h().x + 16 - 320 - cam.x;
    };
    expect(lag(0.6)).toBeGreaterThan(lag(0.1));
    expect(lag(0)).toBe(0);
  });

  it('stays inside the scene when clampToScene is on', () => {
    const tl = follow({}, { x: 10, y: 10 });
    expect([tl.cam.x, tl.cam.y]).toEqual([0, 0]);
    const br = follow({ smoothing: 0 }, { x: 1950, y: 1150 });
    expect([br.cam.x, br.cam.y]).toEqual([2000 - 640, 1200 - 360]);
    br.g.input.keyDown('ArrowRight');
    br.g.run(60);
    expect(br.cam.x).toBe(2000 - 640);
  });

  it('may show past the edges when clampToScene is off', () => {
    const { cam } = follow({ clampToScene: false }, { x: 10, y: 10 });
    expect(cam.x).toBe(26 - 320);
    expect(cam.y).toBe(26 - 180);
  });

  it('stays at the top-left without a Camera Follow object', () => {
    const { game: g } = game({
      width: 2000,
      height: 1200,
      kinds: [{ id: 'hero', stickers: [{ type: 'topdown' }] }],
      objects: [{ id: 'h', kind: 'hero', x: 1000, y: 600 }],
    });
    g.input.keyDown('ArrowRight');
    g.run(60);
    expect([g.scene.camera.x, g.scene.camera.y]).toEqual([0, 0]);
    expect(g.view().camera).toEqual({ x: 0, y: 0, offset: { x: 0, y: 0 } });
  });

  it('shakes with a decaying offset, then settles without moving the camera', () => {
    const cam = new Camera({ w: 640, h: 360 }, { w: 2000, h: 1200 });
    let seed = 0.123;
    const rng = () => (seed = (seed * 9301 + 0.49297) % 1);
    cam.shake(0.5);
    const offsets: number[] = [];
    for (let i = 0; i < 30; i++) {
      cam.update(null, null, 1 / 60, rng);
      offsets.push(Math.hypot(cam.offset.x, cam.offset.y));
    }
    expect(Math.max(...offsets.slice(0, 5))).toBeGreaterThan(1);
    expect(Math.max(...offsets)).toBeLessThanOrEqual(8 * Math.SQRT2);
    expect(Math.max(...offsets.slice(20))).toBeLessThan(Math.max(...offsets.slice(0, 5)));
    for (let i = 0; i < 3; i++) cam.update(null, null, 1 / 60, rng);
    expect(Math.hypot(cam.offset.x, cam.offset.y)).toBe(0);
    expect([cam.x, cam.y]).toEqual([0, 0]);
  });
});
