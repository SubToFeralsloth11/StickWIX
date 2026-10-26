import { describe, expect, it } from 'vitest';
import type { AudioAdapter } from '@/runtime/audio';
import type { Game } from '@/runtime/game';
import { game, record, stickerEvents, type Spec } from '../../../fixtures/build';

const ROW = '.'.repeat(40);
const FLOOR = [...Array(10).fill(ROW), '#'.repeat(40)];
const GROUND = 288;

function fakeAudio() {
  const played: string[] = [];
  const audio: AudioAdapter = { play: (id) => played.push(id), music() {}, stop() {} };
  return { audio, played };
}

describe('Collectible sticker', () => {
  const spec = (settings: Record<string, unknown> = {}): Spec => ({
    tiles: FLOOR,
    kinds: [
      { id: 'hero', stickers: [{ type: 'platformer' }] },
      { id: 'pet', stickers: [{ type: 'falls' }] },
      { id: 'coin', stickers: [{ type: 'collectible', settings }] },
    ],
    objects: [
      { id: 'h', kind: 'hero', x: 32, y: GROUND },
      { id: 'c', kind: 'coin', x: 160, y: GROUND },
    ],
  });

  it('is collected by the player on touch: event, sound, disappears', () => {
    const { audio, played } = fakeAudio();
    const { game: g } = game(spec(), { audio });
    const seen = record(g);
    g.run(30);
    expect(g.scene.world.get('c')).toBeDefined();
    g.input.keyDown('ArrowRight');
    g.run(60);
    expect(stickerEvents(seen, 'collected')).toEqual(['c']);
    expect(played).toEqual(['builtin:sfx/coin']);
    expect(g.scene.world.get('c')).toBeUndefined();
    expect(seen.some((e) => e.type === 'destroyed' && e.id === 'c')).toBe(true);
  });

  it('stays when disappear is off', () => {
    const { game: g } = game(spec({ disappear: false }));
    const seen = record(g);
    g.input.keyDown('ArrowRight');
    g.run(60);
    expect(stickerEvents(seen, 'collected')).toEqual(['c']);
    expect(g.scene.world.get('c')).toBeDefined();
  });

  it('only the chosen collectedBy Kind picks it up', () => {
    const s = spec({ collectedBy: 'pet' });
    s.objects!.push({ id: 'p', kind: 'pet', x: 160, y: 100 });
    const { game: g } = game(s);
    const seen = record(g);
    g.input.keyDown('ArrowRight');
    g.run(20);
    // The hero walked into it: nothing.
    expect(stickerEvents(seen, 'collected')).toEqual([]);
    g.run(60);
    // The pet fell onto it.
    expect(stickerEvents(seen, 'collected')).toEqual(['c']);
    expect(g.scene.world.get('c')).toBeUndefined();
  });
});

describe('Hurts + Health stickers', () => {
  const spec = (heroStickers: Spec['kinds'] = [], hurts: Record<string, unknown> = {}): Spec => ({
    tiles: FLOOR,
    kinds: [
      { id: 'hero', stickers: [{ type: 'platformer' }, ...((heroStickers as never[]) ?? [])] },
      { id: 'spike', stickers: [{ type: 'hurts', settings: hurts }] },
    ],
    objects: [
      { id: 'h', kind: 'hero', x: 32, y: GROUND },
      { id: 's1', kind: 'spike', x: 160, y: GROUND },
      { id: 's2', kind: 'spike', x: 600, y: GROUND },
      { id: 's3', kind: 'spike', x: 900, y: GROUND },
    ],
  });
  const hp = (g: Game) =>
    g.scene.world.get('h')!.stickers.find((s) => s.type === 'health')!.state.hp;
  const touch = (g: Game, id: string) => {
    const h = g.scene.world.get('h')!;
    const s = g.scene.world.get(id)!;
    h.x = s.x - 20;
    h.y = s.y;
    h.vx = 0;
    g.run(1);
  };

  it('damages a Health target and knocks it away from the hazard', () => {
    const { game: g } = game(spec([{ type: 'health', settings: { max: 3 } }] as never, { damage: 1, knockback: 300 }));
    const seen = record(g);
    g.input.keyDown('ArrowRight');
    let guard = 0;
    while (!stickerEvents(seen, 'hurt').length && guard++ < 120) g.run(1);
    expect(stickerEvents(seen, 'hurt')).toEqual(['h']);
    expect(hp(g)).toBe(2);
    const h = g.scene.world.get('h')!;
    // Hero came from the left: pushed left and up even while holding Right.
    expect(h.vx).toBe(-300);
    expect(h.vy).toBeLessThan(0);
    const x = h.x;
    g.run(5);
    expect(g.scene.world.get('h')!.x).toBeLessThan(x);
    // Approaching from the right pushes right.
    g.input.keyUp('ArrowRight');
    g.run(90);
    const hh = g.scene.world.get('h')!;
    hh.x = 600 + 20;
    hh.y = GROUND;
    hh.vx = 0;
    g.run(1);
    expect(hp(g)).toBe(1);
    expect(g.scene.world.get('h')!.vx).toBe(300);
  });

  it('cannot hurt again during the Health safe time', () => {
    const { game: g } = game(spec([{ type: 'health', settings: { max: 5, invincibleMs: 1000 } }] as never));
    touch(g, 's1');
    expect(hp(g)).toBe(4);
    g.run(20);
    touch(g, 's2');
    expect(hp(g)).toBe(4);
    g.run(60);
    touch(g, 's3');
    expect(hp(g)).toBe(3);
  });

  it('runs out of health: `outOfHealth` then destroyed', () => {
    const { game: g } = game(spec([{ type: 'health', settings: { max: 2, invincibleMs: 0 } }] as never));
    const seen = record(g);
    touch(g, 's1');
    expect(stickerEvents(seen, 'outOfHealth')).toEqual([]);
    touch(g, 's2');
    expect(stickerEvents(seen, 'hurt')).toEqual(['h', 'h']);
    expect(stickerEvents(seen, 'outOfHealth')).toEqual(['h']);
    expect(g.scene.world.get('h')).toBeUndefined();
  });

  it('destroys a target without Health on the first touch', () => {
    const { game: g } = game(spec());
    const seen = record(g);
    touch(g, 's1');
    expect(g.scene.world.get('h')).toBeUndefined();
    expect(seen.some((e) => e.type === 'destroyed' && e.id === 'h')).toBe(true);
  });

  it('leaves other Kinds alone unless chosen as target', () => {
    const s = spec([], { target: 'rock' });
    s.kinds!.push({ id: 'rock', stickers: [{ type: 'falls' }] });
    s.objects!.push({ id: 'r', kind: 'rock', x: 900, y: 100 });
    const { game: g } = game(s);
    touch(g, 's1');
    expect(g.scene.world.get('h')).toBeDefined();
    g.run(60);
    expect(g.scene.world.get('r')).toBeUndefined();
  });
});

describe('Patrol sticker', () => {
  it('walks at speed and turns at walls', () => {
    const { game: g } = game({
      tiles: [...Array(10).fill('#..........#'), '#'.repeat(12)],
      kinds: [{ id: 'slime', stickers: [{ type: 'patrol', settings: { distance: 0, speed: 120 } }, { type: 'falls' }] }],
      objects: [{ id: 's', kind: 'slime', x: 160, y: GROUND }],
    });
    const s = () => g.scene.world.get('s')!;
    g.run(30);
    expect(s().x).toBeCloseTo(220, 0);
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < 600; i++) {
      g.run(1);
      minX = Math.min(minX, s().x);
      maxX = Math.max(maxX, s().x);
    }
    expect(maxX).toBeCloseTo(352 - 32, 5);
    expect(minX).toBeCloseTo(32, 5);
  });

  it('turns at ledges when turnAtEdges is on, walks off when off', () => {
    const tiles = [...Array(10).fill(ROW), '...######' + '.'.repeat(31)];
    const run = (turnAtEdges: boolean) => {
      const { game: g } = game({
        tiles,
        height: 2000,
        kinds: [{ id: 'slime', stickers: [{ type: 'patrol', settings: { distance: 0, turnAtEdges } }, { type: 'falls' }] }],
        objects: [{ id: 's', kind: 'slime', x: 160, y: GROUND }],
      });
      let minX = Infinity;
      let maxX = -Infinity;
      for (let i = 0; i < 600; i++) {
        g.run(1);
        const s = g.scene.world.get('s');
        if (!s) break;
        minX = Math.min(minX, s.x);
        maxX = Math.max(maxX, s.x);
      }
      return { s: g.scene.world.get('s'), minX, maxX };
    };
    const on = run(true);
    expect(on.s!.y).toBeCloseTo(GROUND, 5);
    expect(on.minX).toBeGreaterThanOrEqual(96 - 1);
    expect(on.maxX).toBeLessThanOrEqual(288 - 32 + 1);
    expect(on.maxX - on.minX).toBeGreaterThan(120);
    const off = run(false);
    expect(off.s === undefined || off.s.y > GROUND + 100).toBe(true);
  });

  it('turns back after `distance`', () => {
    const { game: g } = game({
      tiles: FLOOR,
      kinds: [{ id: 'slime', stickers: [{ type: 'patrol', settings: { distance: 64, speed: 60 } }, { type: 'falls' }] }],
      objects: [{ id: 's', kind: 'slime', x: 320, y: GROUND }],
    });
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < 600; i++) {
      g.run(1);
      minX = Math.min(minX, g.scene.world.get('s')!.x);
      maxX = Math.max(maxX, g.scene.world.get('s')!.x);
    }
    expect(maxX).toBeGreaterThanOrEqual(384);
    expect(maxX).toBeLessThan(384 + 2);
    expect(minX).toBeGreaterThan(320 - 2);
  });

  it('patrols up and down on axis y', () => {
    const { game: g } = game({
      kinds: [{ id: 'bat', stickers: [{ type: 'patrol', settings: { axis: 'y', distance: 64, speed: 60 } }] }],
      objects: [{ id: 'b', kind: 'bat', x: 100, y: 100 }],
    });
    const ys: number[] = [];
    for (let i = 0; i < 300; i++) {
      g.run(1);
      ys.push(g.scene.world.get('b')!.y);
    }
    expect(Math.max(...ys)).toBeGreaterThanOrEqual(164);
    expect(Math.min(...ys.slice(100))).toBeLessThan(110);
    expect(g.scene.world.get('b')!.x).toBe(100);
  });
});

describe('Chase sticker', () => {
  const spec = (ghostX: number): Spec => ({
    kinds: [
      { id: 'hero', stickers: [{ type: 'topdown' }] },
      { id: 'ghost', stickers: [{ type: 'chase', settings: { range: 200, speed: 90 } }] },
    ],
    objects: [
      { id: 'h', kind: 'hero', x: 100, y: 100 },
      { id: 'g', kind: 'ghost', x: ghostX, y: 100 },
    ],
  });

  it('chases the player when within range', () => {
    const { game: g } = game(spec(250));
    g.run(30);
    const gh = g.scene.world.get('g')!;
    expect(gh.x).toBeCloseTo(250 - 45, 5);
    expect(gh.y).toBeCloseTo(100, 5);
  });

  it('ignores the player out of range', () => {
    const { game: g } = game(spec(400));
    g.run(60);
    expect(g.scene.world.get('g')!.x).toBe(400);
  });

  it('keeps chasing as the player moves away within range', () => {
    const { game: g } = game(spec(250));
    g.input.keyDown('ArrowDown');
    g.run(60);
    const gh = g.scene.world.get('g')!;
    expect(gh.x).toBeLessThan(250);
    expect(gh.y).toBeGreaterThan(100);
  });
});

describe('Shooter sticker', () => {
  const spec = (settings: Record<string, unknown> = {}): Spec => ({
    tiles: Array(12).fill('...................#'),
    kinds: [
      { id: 'hero', stickers: [{ type: 'topdown' }, { type: 'shooter', settings: { projectile: 'ball', ...settings } }] },
      { id: 'ball', w: 8, h: 8 },
    ],
    objects: [{ id: 'h', kind: 'hero', x: 100, y: 100 }],
  });
  const tap = (g: Game, key = 'KeyX') => {
    g.input.keyDown(key);
    g.run(1);
    g.input.keyUp(key);
  };

  it('fires a projectile from its centre with speed and direction, emitting `shoots`', () => {
    const { game: g } = game(spec({ speed: 500 }));
    const seen = record(g);
    tap(g);
    const balls = g.scene.world.byKind('ball');
    expect(balls).toHaveLength(1);
    expect(balls[0]!.vx).toBe(500);
    expect(balls[0]!.vy).toBe(0);
    expect(stickerEvents(seen, 'shoots')).toEqual(['h']);
    expect(seen.some((e) => e.type === 'created' && e.id === balls[0]!.id)).toBe(true);
    // Fires the way it last walked.
    g.input.keyDown('ArrowUp');
    g.run(30);
    tap(g);
    const up = g.scene.world.byKind('ball').find((b) => b.vy !== 0)!;
    expect(up.vx).toBeCloseTo(0, 5);
    expect(up.vy).toBe(-500);
  });

  it('respects the cooldown between shots', () => {
    const { game: g } = game(spec({ cooldownMs: 500 }));
    const seen = record(g);
    tap(g);
    g.run(5);
    tap(g);
    expect(stickerEvents(seen, 'shoots')).toHaveLength(1);
    g.run(30);
    tap(g);
    expect(stickerEvents(seen, 'shoots')).toHaveLength(2);
  });

  it('removes a projectile that hits a wall', () => {
    const { game: g } = game(spec({ speed: 600 }));
    const seen = record(g);
    tap(g);
    const id = g.scene.world.byKind('ball')[0]!.id;
    g.run(60);
    expect(g.scene.world.get(id)).toBeUndefined();
    expect(seen.some((e) => e.type === 'destroyed' && e.id === id)).toBe(true);
  });

  it('aims at the mouse and fires on click', () => {
    const { game: g } = game(spec({ fireWith: 'click', aim: 'mouse' }));
    // Hero centre (116, 116); mouse straight below it.
    g.input.mouseDown(116, 316);
    g.run(1);
    const b = g.scene.world.byKind('ball')[0]!;
    expect(b.vx).toBeCloseTo(0, 5);
    expect(b.vy).toBeCloseTo(400, 5);
  });

  it('does nothing without a projectile Kind', () => {
    const { game: g } = game(spec({ projectile: null }));
    const seen = record(g);
    tap(g);
    expect(stickerEvents(seen, 'shoots')).toEqual([]);
  });

  it('a Hurts projectile damages what it hits and vanishes, but never its own shooter', () => {
    const s = spec();
    s.kinds = [
      s.kinds![0]!,
      { id: 'ball', w: 8, h: 8, stickers: [{ type: 'hurts' }] },
      // A second player-controlled Kind standing in the line of fire.
      { id: 'buddy', stickers: [{ type: 'topdown', settings: { keys: 'wasd' } }, { type: 'health', settings: { max: 1 } }] },
    ];
    s.kinds[0]!.stickers![0]!.settings = { keys: 'arrows' };
    s.objects!.push({ id: 'b', kind: 'buddy', x: 300, y: 100 });
    const { game: g } = game(s);
    tap(g);
    g.run(1);
    expect(g.scene.world.get('h')).toBeDefined();
    g.run(30);
    expect(g.scene.world.get('h')).toBeDefined();
    expect(g.scene.world.get('b')).toBeUndefined();
    expect(g.scene.world.byKind('ball')).toEqual([]);
  });
});

describe('Hurts on a fired projectile with no chosen target', () => {
  const spec: Spec = {
    kinds: [
      { id: 'hero', stickers: [{ type: 'topdown' }, { type: 'shooter', settings: { projectile: 'ball', key: 'Space' } }, { type: 'health' }] },
      { id: 'ball', w: 8, h: 8, stickers: [{ type: 'hurts', settings: { knockback: 0 } }] },
      { id: 'ghost', stickers: [{ type: 'health', settings: { max: 1 } }] },
      { id: 'coin' },
    ],
    objects: [
      { id: 'h', kind: 'hero', x: 0, y: 100 },
      { id: 'c', kind: 'coin', x: 80, y: 100 },
      { id: 'g', kind: 'ghost', x: 200, y: 100 },
    ],
  };

  it('hits things with Health but not plain objects or the shooter', () => {
    const { game: g } = game(spec);
    g.input.keyDown('ArrowRight');
    g.run(1);
    g.input.keyUp('ArrowRight');
    g.input.keyDown('Space');
    g.run(1);
    g.input.keyUp('Space');
    g.run(60);
    expect(g.scene.world.get('c')).toBeDefined();
    expect(g.scene.world.get('g')).toBeUndefined();
    expect(g.scene.world.get('h')).toBeDefined();
  });
});
