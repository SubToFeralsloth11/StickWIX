import { describe, expect, it } from 'vitest';
import type { AudioAdapter } from '@/runtime/audio';
import type { AssetInfo } from '@/runtime/render/renderer';
import { game, record, stickerEvents } from '../../../fixtures/build';

const sheets: AssetInfo = (id) => (id === 'builtin:img/coin' ? { w: 16, h: 16, frames: 4, fps: 8 } : undefined);

describe('Clickable sticker', () => {
  function setup() {
    const played: string[] = [];
    const audio: AudioAdapter = { play: (id) => played.push(id), music() {}, stop() {} };
    const { game: g } = game(
      {
        kinds: [{ id: 'cookie', w: 64, h: 64, stickers: [{ type: 'clickable' }] }],
        objects: [{ id: 'c', kind: 'cookie', x: 100, y: 100 }],
      },
      { audio },
    );
    return { g, played, seen: record(g) };
  }

  it('fires `clicked` and plays its sound when pressed over it (screen px, camera at 0,0)', () => {
    const { g, played, seen } = setup();
    g.input.mouseDown(130, 130);
    g.run(1);
    expect(seen.filter((e) => e.type === 'clicked')).toEqual([{ type: 'clicked', id: 'c' }]);
    expect(played).toEqual(['builtin:sfx/click']);
    // Holding the button is not another click.
    g.run(10);
    expect(seen.filter((e) => e.type === 'clicked')).toHaveLength(1);
  });

  it('ignores presses outside it', () => {
    const { g, played, seen } = setup();
    g.input.mouseDown(10, 10);
    g.run(1);
    expect(seen.filter((e) => e.type === 'clicked')).toEqual([]);
    expect(played).toEqual([]);
  });

  it('grows under the mouse', () => {
    const { g } = setup();
    g.input.mouseMove(130, 130);
    g.run(30);
    expect(g.scene.world.get('c')!.pop).toBeGreaterThan(1.05);
    g.input.mouseMove(10, 10);
    g.run(30);
    expect(g.scene.world.get('c')!.pop).toBeCloseTo(1, 2);
  });
});

describe('Draggable sticker', () => {
  function setup(snapToGrid = false) {
    const { game: g } = game({
      kinds: [{ id: 'crate', stickers: [{ type: 'draggable', settings: { snapToGrid } }, { type: 'falls' }] }],
      objects: [{ id: 'c', kind: 'crate', x: 100, y: 100 }],
    });
    return { g, c: () => g.scene.world.get('c')!, seen: record(g) };
  }

  it('follows the mouse while held (keeping the grab offset) and emits `dropped` on release', () => {
    const { g, c, seen } = setup();
    g.input.mouseDown(110, 105);
    g.run(1);
    g.input.mouseMove(250, 160);
    g.run(20);
    expect(c().x).toBe(240);
    expect(c().y).toBe(155);
    expect(stickerEvents(seen, 'dropped')).toEqual([]);
    g.input.mouseUp(300, 200);
    g.run(1);
    expect(c().x).toBe(290);
    expect(stickerEvents(seen, 'dropped')).toEqual(['c']);
    // Released: gravity takes over again.
    g.run(30);
    expect(c().y).toBeGreaterThan(200);
  });

  it('snaps to the tile grid when dropped', () => {
    const { g, c } = setup(true);
    g.input.mouseDown(100, 100);
    g.run(1);
    g.input.mouseUp(190, 140);
    g.run(1);
    expect(c().x).toBe(192);
    expect(c().y).toBe(128);
  });

  it('is not picked up by a press elsewhere', () => {
    const { g, c, seen } = setup();
    g.input.mouseDown(400, 400);
    g.run(1);
    g.input.mouseUp(400, 400);
    g.run(1);
    expect(c().x).toBe(100);
    expect(stickerEvents(seen, 'dropped')).toEqual([]);
  });
});

describe('Animate sticker', () => {
  function setup(settings: Record<string, unknown>, extra: { type: string }[] = []) {
    const { game: g } = game(
      {
        tiles: [...Array(10).fill('..........'), '##########'],
        kinds: [{ id: 'coin', stickers: [...extra, { type: 'animate', settings: { lookId: 'builtin:img/coin', ...settings } }] }],
        objects: [{ id: 'c', kind: 'coin', x: 64, y: 288 }],
      },
      { assetInfo: sheets },
    );
    return { g, anim: () => g.scene.world.get('c')!.anim };
  }

  it('advances frames at fps and loops over the look’s frames', () => {
    const { g, anim } = setup({ fps: 8 });
    expect(g.scene.world.get('c')!.lookId).toBe('builtin:img/coin');
    const frames: number[] = [];
    // One frame lasts 7.5 steps at 8 fps; sample near the middle of each.
    let step = 0;
    for (const at of [4, 11, 19, 26, 34, 41]) {
      g.run(at - step);
      step = at;
      frames.push(anim()!.frame);
    }
    expect(frames).toEqual([0, 1, 2, 3, 0, 1]);
  });

  it('stops on the last frame when loop is off', () => {
    const { g, anim } = setup({ fps: 8, loop: false });
    g.run(120);
    expect(anim()!.frame).toBe(3);
  });

  it('keeps playing on an object with a Platformer that has no looks of its own', () => {
    const { g, anim } = setup({ fps: 8 }, [{ type: 'platformer' }]);
    g.run(20);
    expect(g.scene.world.get('c')!.lookId).toBe('builtin:img/coin');
    expect(anim()?.frame).toBe(2);
  });
});
