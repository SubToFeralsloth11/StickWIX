import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBuiltinManifest } from '@/assets/manifest';
import { ruleStates } from '@/model/references';
import { Project } from '@/model/schema';
import { STARTERS, instantiateStarter, type StarterPreset } from '@/presets';
import { createGame } from '@/runtime/game';
import type { Instance } from '@/runtime/types';

const manifest = parseBuiltinManifest(JSON.parse(readFileSync(path.resolve('public/assets/builtin/manifest.json'), 'utf8')));
const assetInfo = (id: string) => {
  const i = manifest.images[id];
  return i ? { w: i.w, h: i.h, frames: i.frames, fps: i.fps } : undefined;
};

const ASSET_KEYS = new Set(['lookId', 'assetId', 'sound', 'idleLook', 'walkLook', 'jumpLook', 'backgroundMusic']);

/** Every asset reference in a document. */
function assetRefs(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) for (const x of node) assetRefs(x, out);
  else if (node && typeof node === 'object')
    for (const [k, v] of Object.entries(node)) {
      if (ASSET_KEYS.has(k) && typeof v === 'string') out.push(v);
      else assetRefs(v, out);
    }
  return out;
}

function starter(genre: StarterPreset['genre']) {
  const s = STARTERS.find((x) => x.genre === genre);
  if (!s) throw new Error(`no ${genre} starter`);
  return instantiateStarter(s.project);
}

function start(p: Project) {
  const game = createGame(p, { seed: 7, assetInfo });
  const kind = (name: string) => p.kinds.find((k) => k.name === name)!.id;
  const sceneName = () => game.scene.scene.name;
  const one = (name: string): Instance | undefined => game.scene.world.byKind(kind(name))[0];
  const value = (name: string) => game.values.get(p.values.find((v) => v.name === name)!.id);
  return { game, kind, sceneName, one, value };
}

const center = (i: Instance) => ({ x: i.x + i.hit.x + i.hit.w / 2, y: i.y + i.hit.y + i.hit.h / 2 });

describe('starter games (FR-024)', () => {
  it('ships platformer, top-down and clicker starters', () => {
    expect(STARTERS.map((s) => s.genre).sort()).toEqual(['clicker', 'platformer', 'topdown']);
    for (const s of STARTERS) {
      expect(s.name).toBeTruthy();
      expect(s.description).toBeTruthy();
      expect(s.controls).toBeTruthy();
      expect(manifest.images[s.icon], s.icon).toBeDefined();
    }
  });

  for (const s of STARTERS)
    describe(s.name, () => {
      it('validates and every rule is complete', () => {
        const parsed = Project.safeParse(s.project);
        expect(parsed.success, JSON.stringify(parsed.error?.issues.slice(0, 3))).toBe(true);
        const p = parsed.data!;
        for (const [id, st] of ruleStates(p)) expect(st.state, `${id} ${JSON.stringify(st.blanks)}`).toBe('ok');
      });

      it('uses only built-in assets', () => {
        const p = Project.parse(s.project);
        expect(p.assets).toEqual([]);
        const refs = assetRefs(p);
        expect(refs.length).toBeGreaterThan(5);
        for (const ref of refs) {
          expect(ref.startsWith('builtin:'), ref).toBe(true);
          expect(manifest.images[ref] ?? manifest.sounds[ref] ?? manifest.tilesets[ref], ref).toBeDefined();
        }
        for (const ts of p.tileSets) {
          const m = manifest.tilesets[ts.assetId]!;
          expect(m, ts.assetId).toBeDefined();
          expect({ columns: ts.columns, count: ts.count, tileSize: ts.tileSize }).toEqual({ columns: m.columns, count: m.count, tileSize: m.tileSize });
          expect(ts.solid).toEqual(m.solid);
          expect(ts.oneWay).toEqual(m.oneWay);
          for (const sc of p.scenes)
            if (sc.tileLayer.tileSetId === ts.id) for (const c of Object.values(sc.tileLayer.cells)) expect(c).toBeLessThan(m.count);
        }
        expect(p.settings.backgroundMusic).toMatch(/^builtin:music\//);
      });

      it('shows game values on screen in its start scene', () => {
        const p = Project.parse(s.project);
        const names = p.values.map((v) => `{${v.name}}`);
        const first = p.scenes.find((sc) => sc.id === p.startSceneId)!;
        expect(first.ui.some((u) => names.some((n) => u.text.includes(n)))).toBe(true);
      });
    });

  it('platformer: holding Right and jumping over trouble reaches Level 2 and then the win scene', () => {
    const p = starter('platformer');
    expect(p.scenes.map((s) => s.name)).toEqual(expect.arrayContaining(['Level 1', 'Level 2', 'You Win']));
    const { game, sceneName, one, value, kind } = start(p);
    expect(game.scene.scene.width).toBeGreaterThan(game.screen.w * 2);
    const danger = [kind('Slime'), kind('Spikes')];
    const visited = new Set<string>([sceneName()]);
    let jumpHeld = 0;
    game.input.keyDown('ArrowRight');
    for (let step = 0; step < 60 * 180 && sceneName() !== 'You Win'; step++) {
      const hero = one('Hero');
      if (hero && hero.grounded && jumpHeld === 0) {
        const c = center(hero);
        const w = game.scene.world;
        const foot = hero.y + hero.hit.y + hero.hit.h;
        const front = hero.x + hero.hit.x + hero.hit.w;
        const gapAhead = !w.solidAt(front + 20, foot + 4) || !w.solidAt(front + 44, foot + 4);
        const wallAhead = w.solidAt(front + 16, foot - 8);
        const enemyAhead = danger.some((k) =>
          w.byKind(k).some((e) => {
            const d = center(e);
            return d.x - c.x > 0 && d.x - c.x < 90 && Math.abs(d.y - c.y) < 48;
          }),
        );
        if (gapAhead || wallAhead || enemyAhead) {
          game.input.keyDown('Space');
          jumpHeld = 20;
        }
      }
      game.step();
      if (jumpHeld > 0 && --jumpHeld === 0) game.input.keyUp('Space');
      visited.add(sceneName());
    }
    expect(visited.has('Level 2')).toBe(true);
    expect(sceneName()).toBe('You Win');
    expect(value('Score')).toBeGreaterThan(0);
    expect(value('Lives')).toBeGreaterThan(0);
  });

  it('platformer: running out of health costs a life and restarts the level', () => {
    const p = starter('platformer');
    const { game, one, value } = start(p);
    const hero = one('Hero')!;
    const lives = value('Lives') as number;
    hero.stickers.find((s) => s.type === 'health')!.state.hp = 1;
    // Drop the hero onto the first slime.
    const slime = one('Slime')!;
    hero.x = slime.x;
    hero.y = slime.y - 40;
    game.run(60);
    expect(value('Lives')).toBe(lives - 1);
    expect(one('Hero')).toBeDefined();
    expect(game.scene.scene.name).toBe('Level 1');
  });

  it('top-down: grabbing the key, all gems and walking through the door wins', () => {
    const p = starter('topdown');
    const { game, sceneName, one, kind, value } = start(p);
    const w = () => game.scene.world;
    const door = one('Door')!;
    const doorPoint = center(door);
    const keys = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' };
    const held = new Set<string>();
    const press = (want: string[]) => {
      for (const k of held)
        if (!want.includes(k)) {
          game.input.keyUp(k);
          held.delete(k);
        }
      for (const k of want)
        if (!held.has(k)) {
          game.input.keyDown(k);
          held.add(k);
        }
    };
    const targetFor = (me: { x: number; y: number }) => {
      const key = w().byKind(kind('Key'))[0];
      if (key) return center(key);
      const gems = w().byKind(kind('Gem')).map(center);
      const sameSide = gems.filter((g) => g.x < doorPoint.x === me.x < doorPoint.x);
      if (sameSide.length) return sameSide.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0]!;
      if (!gems.length) return null;
      // Line up with the doorway first, then walk through it.
      if (Math.abs(me.y - doorPoint.y) > 6) return { x: me.x < doorPoint.x ? doorPoint.x - 48 : doorPoint.x + 48, y: doorPoint.y };
      return { x: gems[0]!.x, y: doorPoint.y };
    };
    let gemsSeen = 0;
    for (let step = 0; step < 60 * 180 && sceneName() !== 'You Win'; step++) {
      const knight = one('Knight');
      if (knight) {
        const me = center(knight);
        const t = targetFor(me);
        const want: string[] = [];
        if (t) {
          if (t.x > me.x + 3) want.push(keys.right);
          if (t.x < me.x - 3) want.push(keys.left);
          if (t.y > me.y + 3) want.push(keys.down);
          if (t.y < me.y - 3) want.push(keys.up);
        }
        if (step % 20 === 0) want.push('Space');
        press(want);
      }
      game.step();
      gemsSeen = Math.max(gemsSeen, value('Gems') as number);
    }
    expect(gemsSeen).toBeGreaterThanOrEqual(5);
    expect(sceneName()).toBe('You Win');
  });

  it('top-down: fireballs hurt ghosts', () => {
    const p = starter('topdown');
    const { game, one, kind } = start(p);
    const knight = one('Knight')!;
    const ghost = one('Ghost')!;
    knight.x = ghost.x - 100;
    knight.y = ghost.y;
    knight.dir = { x: 1, y: 0 };
    const hits: string[] = [];
    game.onEvent((e) => {
      if (e.type === 'sticker' && e.event === 'hurt' && game.scene.world.instances.get(e.id)?.kindId === kind('Ghost')) hits.push(e.id);
    });
    game.input.keyDown('Space');
    game.run(30);
    expect(hits).toContain(ghost.id);
  });

  it('clicker: clicking the cookie earns coins, buys an upgrade and reaches 100 coins to win', () => {
    const p = starter('clicker');
    const { game, sceneName, one, value } = start(p);
    const click = (x: number, y: number) => {
      game.input.mouseDown(x, y);
      game.step();
      game.input.mouseUp(x, y);
      game.step();
    };
    const button = (name: string) => {
      const b = game.scene.ui
        .boxes(game.screen, (t) => game.values.format(t), assetInfo)
        .find((x) => x.el.name === name)!.box;
      return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    };
    const clickCookie = () => {
      const c = center(one('Cookie')!);
      click(c.x - game.scene.camera.x, c.y - game.scene.camera.y);
    };
    clickCookie();
    expect(value('Coins')).toBe(1);
    while ((value('Coins') as number) < (value('Upgrade Cost') as number)) clickCookie();
    const cost = value('Upgrade Cost') as number;
    const coins = value('Coins') as number;
    const up = button('Upgrade');
    click(up.x, up.y);
    expect(value('Per Click')).toBe(2);
    expect(value('Coins')).toBe(coins - cost);
    expect(value('Upgrade Cost') as number).toBeGreaterThan(cost);
    clickCookie();
    expect(value('Coins')).toBe(coins - cost + 2);

    while ((value('Coins') as number) < (value('Helper Cost') as number)) clickCookie();
    const helper = button('Helper');
    click(helper.x, helper.y);
    expect(value('Auto')).toBe(1);
    const before = value('Coins') as number;
    game.run(65);
    expect(value('Coins')).toBe(before + 1);

    for (let i = 0; i < 200 && sceneName() !== 'You Win'; i++) {
      if (sceneName() === 'Bakery' && one('Cookie')) clickCookie();
      else game.run(10);
    }
    expect(value('Coins') as number).toBeGreaterThanOrEqual(100);
    expect(sceneName()).toBe('You Win');
  });

  it('clicker: coins are remembered between plays', () => {
    const p = starter('clicker');
    const coins = p.values.find((v) => v.name === 'Coins')!;
    expect(coins.remember).toBe(true);
  });
});
