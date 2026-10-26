import { describe, expect, it } from 'vitest';
import { newProject } from '@/model/defaults';
import { ruleStates } from '@/model/references';
import { Project, Rule, type Action, type Trigger } from '@/model/schema';
import { GENRES, RULE_PRESETS, insertRulePreset } from '@/presets';
import { createGame } from '@/runtime/game';
import { project } from '../../fixtures/build';

const preset = (name: string) => {
  const p = RULE_PRESETS.find((x) => x.name === name);
  if (!p) throw new Error(`no rule preset ${name}`);
  return p;
};

describe('rule presets (FR-026)', () => {
  it('ships at least 12, covering all three genres, with unique ids and names', () => {
    expect(RULE_PRESETS.length).toBeGreaterThanOrEqual(12);
    for (const g of GENRES) expect(RULE_PRESETS.filter((p) => p.genres.includes(g)).length, g).toBeGreaterThanOrEqual(3);
    expect(new Set(RULE_PRESETS.map((p) => p.id)).size).toBe(RULE_PRESETS.length);
    expect(new Set(RULE_PRESETS.map((p) => p.name)).size).toBe(RULE_PRESETS.length);
  });

  for (const rp of RULE_PRESETS)
    it(`${rp.name}: valid and incomplete once inserted`, () => {
      expect(rp.description.length).toBeGreaterThan(10);
      expect(Rule.safeParse(rp.rule).success).toBe(true);
      const p = newProject();
      const id = insertRulePreset(p, rp, { type: 'game' });
      expect(Project.safeParse(p).success).toBe(true);
      const st = ruleStates(p).get(id)!;
      expect(st.state).toBe('incomplete');
      expect(st.blanks.every((b) => b.problem === 'unset')).toBe(true);
    });

  it('Collect for points runs once its blanks are filled', () => {
    const p = project({
      tiles: ['..........', '..........', '##########'],
      kinds: [
        { id: 'hero', stickers: [{ type: 'platformer' }] },
        { id: 'coin', stickers: [{ type: 'collectible' }] },
      ],
      objects: [
        { id: 'h', kind: 'hero', x: 0, y: 32 },
        { id: 'c', kind: 'coin', x: 96, y: 32 },
      ],
      values: [{ id: 'score', name: 'Score', start: 0 }],
    });
    const id = insertRulePreset(p, preset('Collect for points'), { type: 'game' });
    const game0 = createGame(Project.parse(p));
    game0.input.keyDown('ArrowRight');
    game0.run(60);
    expect(game0.values.get('score')).toBe(0);

    const r = p.rules.find((x) => x.id === id)!;
    expect(r.trigger).toMatchObject({ type: 'sticker', event: 'collected', target: { t: 'unset' } });
    (r.trigger as Extract<Trigger, { type: 'sticker' }>).target = { t: 'any', kindId: 'coin' };
    (r.actions[0] as Extract<Action, { type: 'changeValue' }>).value = { valueId: 'score' };
    expect(ruleStates(p).get(id)!.state).toBe('ok');
    const game = createGame(Project.parse(p));
    game.input.keyDown('ArrowRight');
    game.run(60);
    expect(game.values.get('score')).toBe(1);
  });

  it('Spawn every N seconds runs once its blanks are filled', () => {
    const p = project({ kinds: [{ id: 'star' }], values: [] });
    const id = insertRulePreset(p, preset('Spawn every few seconds'), { type: 'scene', id: p.scenes[0]!.id });
    const r = p.scenes[0]!.rules.find((x) => x.id === id)!;
    expect(r.trigger).toMatchObject({ type: 'every', seconds: { unset: true } });
    expect(r.actions[0]).toMatchObject({ type: 'create', kindId: { unset: true } });
    r.trigger = { type: 'every', seconds: { lit: 2 } };
    r.actions[0] = { type: 'create', kindId: 'star', place: { at: { x: { lit: 100 }, y: { lit: 100 } } } };
    expect(ruleStates(p).get(id)!.state).toBe('ok');
    const game = createGame(Project.parse(p));
    game.run(60 * 7);
    expect(game.scene.world.byKind('star').length).toBeGreaterThanOrEqual(3);
  });

  it('Click to score runs once its blanks are filled', () => {
    const p = project({
      kinds: [{ id: 'cookie', w: 64, h: 64 }],
      objects: [{ id: 'ck', kind: 'cookie', x: 100, y: 100 }],
      values: [{ id: 'coins', name: 'Coins', start: 0 }],
    });
    const id = insertRulePreset(p, preset('Click to score'), { type: 'game' });
    const r = p.rules.find((x) => x.id === id)!;
    (r.trigger as Extract<Trigger, { type: 'clicked' }>).target = { t: 'any', kindId: 'cookie' };
    (r.actions[0] as Extract<Action, { type: 'changeValue' }>).value = { valueId: 'coins' };
    expect(ruleStates(p).get(id)!.state).toBe('ok');
    const game = createGame(Project.parse(p));
    for (let i = 0; i < 3; i++) {
      game.input.mouseDown(130, 130);
      game.step();
      game.input.mouseUp(130, 130);
      game.step();
    }
    expect(game.values.get('coins')).toBe(3);
  });
});
