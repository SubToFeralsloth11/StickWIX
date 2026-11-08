import { describe, expect, it } from 'vitest';
import { newProject } from '@/model/defaults';
import { ruleStates } from '@/model/references';
import { Kind, Project, Rule, Value } from '@/model/schema';
import { GENRES, OBJECT_PRESETS, insertObjectPreset } from '@/presets';
import { createGame } from '@/runtime/game';
import { project, record, stickerEvents } from '../../fixtures/build';

describe('object presets (FR-025)', () => {
  it('ships at least 20, covering all three genres, with unique ids and names', () => {
    expect(OBJECT_PRESETS.length).toBeGreaterThanOrEqual(20);
    for (const g of GENRES) expect(OBJECT_PRESETS.filter((p) => p.genres.includes(g)).length, g).toBeGreaterThanOrEqual(3);
    expect(new Set(OBJECT_PRESETS.map((p) => p.id)).size).toBe(OBJECT_PRESETS.length);
    expect(new Set(OBJECT_PRESETS.map((p) => p.name)).size).toBe(OBJECT_PRESETS.length);
  });

  for (const preset of OBJECT_PRESETS)
    it(`${preset.name}: valid, inserts into a blank project and runs`, () => {
      expect(preset.description.length).toBeGreaterThan(10);
      expect(preset.icon.startsWith('builtin:img/')).toBe(true);
      expect(preset.kinds.some((k) => k.id === preset.mainKindId)).toBe(true);
      for (const k of preset.kinds) expect(Kind.safeParse(k).success, k.name).toBe(true);
      for (const v of preset.values) expect(Value.safeParse(v).success && v.scope === 'game', v.name).toBe(true);
      for (const r of preset.rules) expect(Rule.safeParse(r).success).toBe(true);

      const p = newProject();
      const { objectIds } = insertObjectPreset(p, preset, { sceneId: p.scenes[0]!.id, x: 400, y: 200 });
      const parsed = Project.safeParse(p);
      expect(parsed.success, JSON.stringify(parsed.error?.issues.slice(0, 3))).toBe(true);
      for (const [id, s] of ruleStates(p)) expect(s.state, id).toBe('ok');
      const game = createGame(p, { seed: 3 });
      expect(game.scene.world.get(objectIds[0]!)).toBeDefined();
      game.run(120);
      expect(game.diagnostics.filter((d) => d.type !== 'objectCap')).toEqual([]);
    });

  it('Patrolling Enemy patrols and hurts the player', () => {
    const p = project({
      tiles: ['....................', '....................', '....................', '....................', '####################'],
      kinds: [{ id: 'hero', stickers: [{ type: 'platformer' }, { type: 'health', settings: { max: 5, invincibleMs: 0 } }] }],
      objects: [{ id: 'h', kind: 'hero', x: 32, y: 96 }],
      width: 640,
      height: 360,
    });
    const enemy = OBJECT_PRESETS.find((x) => x.name === 'Patrolling Enemy')!;
    const { objectIds } = insertObjectPreset(p, enemy, { sceneId: p.scenes[0]!.id, x: 320, y: 96 });
    const game = createGame(Project.parse(p), { seed: 1 });
    const seen = record(game);
    const e = game.scene.world.get(objectIds[0]!)!;
    const xs: number[] = [];
    for (let i = 0; i < 360; i++) {
      game.step();
      xs.push(e.x);
    }
    const moves = xs.slice(1).map((x, i) => Math.sign(x - xs[i]!)).filter((d) => d !== 0);
    expect(moves).toContain(1);
    expect(moves).toContain(-1);
    // Walk the hero into it.
    game.input.keyDown('ArrowRight');
    game.run(240);
    expect(stickerEvents(seen, 'hurt')).toContain('h');
  });
});
