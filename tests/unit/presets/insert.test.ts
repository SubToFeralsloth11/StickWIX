import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { newProject } from '@/model/defaults';
import { ruleStates } from '@/model/references';
import { Project, type ProjectInput } from '@/model/schema';
import { OBJECT_PRESETS, RULE_PRESETS, STARTERS, insertObjectPreset, insertRulePreset, instantiateStarter } from '@/presets';

/** Every string anywhere in a JSON-like tree. */
function strings(node: unknown, out = new Set<string>()): Set<string> {
  if (typeof node === 'string') out.add(node);
  else if (Array.isArray(node)) for (const x of node) strings(x, out);
  else if (node && typeof node === 'object')
    for (const [k, v] of Object.entries(node)) {
      out.add(k);
      strings(v, out);
    }
  return out;
}

/** Every object/array node in a tree, for identity checks. */
function nodes(node: unknown, out = new Set<object>()): Set<object> {
  if (node && typeof node === 'object') {
    out.add(node);
    for (const v of Object.values(node)) nodes(v, out);
  }
  return out;
}

const preset = (name: string) => {
  const p = OBJECT_PRESETS.find((x) => x.name === name);
  if (!p) throw new Error(`no object preset ${name}`);
  return p;
};

/** A small starter that uses every kind of internal reference. */
const linked: ProjectInput = {
  id: 'proj',
  schemaVersion: 1,
  name: 'Linked',
  createdAt: '2020-01-01T00:00:00Z',
  updatedAt: '2020-01-01T00:00:00Z',
  startSceneId: 'sB',
  tileSets: [{ id: 'ts', name: 'Tiles', assetId: 'builtin:tiles/grass', tileSize: 32, columns: 8, count: 2, solid: [true, false] }],
  values: [{ id: 'vScore', name: 'Score', scope: 'game', type: 'number', start: 0 }],
  rules: [
    {
      id: 'rGame',
      trigger: { type: 'clicked', target: { t: 'ui', id: 'uiBtn' } },
      conditions: { join: 'all', items: [{ type: 'compare', value: { valueId: 'vScore' }, op: 'ge', to: { ref: { valueId: 'vHp', of: { t: 'object', id: 'oHero' } } } }] },
      actions: [
        { type: 'changeScene', sceneId: 'sA' },
        { type: 'create', kindId: 'kShot', place: { atTarget: { t: 'object', id: 'oHero' } } },
      ],
    },
  ],
  kinds: [
    {
      id: 'kHero',
      name: 'Hero',
      size: { w: 32, h: 32 },
      stickers: [
        { id: 'stCtl', type: 'platformer', settings: {} },
        { id: 'stGun', type: 'shooter', settings: { projectile: 'kShot' } },
      ],
      values: [{ id: 'vHp', name: 'HP', scope: 'object', type: 'number', start: 3 }],
      rules: [
        {
          id: 'rKind',
          trigger: { type: 'touches', a: { t: 'self' }, b: { t: 'any', kindId: 'kShot' } },
          actions: [{ type: 'changeValue', value: { valueId: 'vHp' }, op: 'subtract', amount: { lit: 1 } }],
        },
      ],
    },
    {
      id: 'kShot',
      name: 'Shot',
      size: { w: 8, h: 8 },
      stickers: [
        { id: 'stHurt', type: 'hurts', settings: { target: 'kHero' } },
        { id: 'stColl', type: 'collectible', settings: { collectedBy: 'kHero' } },
        { id: 'stChase', type: 'chase', settings: { target: 'kHero' } },
      ],
    },
  ],
  scenes: [
    {
      id: 'sA',
      name: 'A',
      width: 960,
      height: 540,
      tileLayer: { tileSetId: 'ts', cellSize: 32, cells: { '0,5': 0 } },
      objects: [
        { id: 'oHero', kindId: 'kHero', x: 0, y: 0, overrides: { stickers: { stCtl: { speed: 300 } }, values: { vHp: 5 } } },
      ],
      ui: [{ id: 'uiBtn', name: 'Go', type: 'button', x: 0, y: 0, text: 'Score {Score}' }],
      rules: [{ id: 'rScene', trigger: { type: 'sceneStart' }, actions: [{ type: 'hide', target: { t: 'ui', id: 'uiBtn' } }] }],
    },
    { id: 'sB', name: 'B', width: 960, height: 540 },
  ],
};
const OLD_IDS = ['proj', 'sA', 'sB', 'ts', 'vScore', 'vHp', 'rGame', 'rKind', 'rScene', 'kHero', 'kShot', 'stCtl', 'stGun', 'stHurt', 'stColl', 'stChase', 'oHero', 'uiBtn'];

describe('instantiateStarter (FR-024, FR-027)', () => {
  it('gives every id a fresh value and remaps every internal reference', () => {
    const p = instantiateStarter(linked);
    expect(Project.safeParse(p).success).toBe(true);
    const all = strings(p);
    for (const id of OLD_IDS) expect(all.has(id), id).toBe(false);

    const sceneA = p.scenes.find((s) => s.name === 'A')!;
    const sceneB = p.scenes.find((s) => s.name === 'B')!;
    const hero = p.kinds.find((k) => k.name === 'Hero')!;
    const shot = p.kinds.find((k) => k.name === 'Shot')!;
    const obj = sceneA.objects[0]!;
    const ui = sceneA.ui[0]!;
    expect(p.startSceneId).toBe(sceneB.id);
    expect(obj.kindId).toBe(hero.id);
    expect(sceneA.tileLayer.tileSetId).toBe(p.tileSets[0]!.id);
    expect(p.tileSets[0]!.assetId).toBe('builtin:tiles/grass');
    expect(hero.stickers[1]!.settings.projectile).toBe(shot.id);
    expect(shot.stickers.map((s) => Object.values(s.settings).find((v) => v === hero.id))).toEqual([hero.id, hero.id, hero.id]);
    expect(Object.keys(obj.overrides.stickers!)).toEqual([hero.stickers[0]!.id]);
    expect(obj.overrides.values).toEqual({ [hero.values[0]!.id]: 5 });

    const game = p.rules[0]!;
    expect(game.trigger).toEqual({ type: 'clicked', target: { t: 'ui', id: ui.id } });
    expect(game.actions[0]).toEqual({ type: 'changeScene', sceneId: sceneA.id });
    expect(game.actions[1]).toMatchObject({ kindId: shot.id, place: { atTarget: { t: 'object', id: obj.id } } });
    expect(game.conditions.items[0]).toMatchObject({ value: { valueId: p.values[0]!.id }, to: { ref: { valueId: hero.values[0]!.id, of: { t: 'object', id: obj.id } } } });
    expect(hero.rules[0]!.trigger).toMatchObject({ b: { t: 'any', kindId: shot.id } });
    expect(sceneA.rules[0]!.actions[0]).toEqual({ type: 'hide', target: { t: 'ui', id: ui.id } });
    for (const s of ruleStates(p).values()) expect(s.state).toBe('ok');
    // Text that merely looks like a name is left alone.
    expect(ui.text).toBe('Score {Score}');
  });

  it('is a new, unlinked document every time', () => {
    const before = structuredClone(linked);
    const a = instantiateStarter(linked);
    const b = instantiateStarter(linked);
    expect(linked).toEqual(before);
    expect(a.id).not.toBe(b.id);
    expect(a.kinds[0]!.id).not.toBe(b.kinds[0]!.id);
    expect(Date.parse(a.createdAt)).toBeGreaterThan(Date.parse('2025-01-01'));
    expect(a.updatedAt).toBe(a.createdAt);
    const shared = [...nodes(a)].filter((n) => nodes(linked).has(n));
    expect(shared).toEqual([]);
  });

  it('instantiates every shipped starter', () => {
    for (const s of STARTERS) {
      const p = instantiateStarter(s.project);
      expect(p.name).toBe(s.project.name);
      const all = strings(p);
      for (const sc of s.project.scenes) expect(all.has(sc.id)).toBe(false);
    }
  });
});

describe('insertObjectPreset (FR-025, FR-027)', () => {
  it('copies Kinds, values and rules with fresh ids and places the main Kind', () => {
    const p = newProject();
    const coin = preset('Coin');
    const scene = p.scenes[0]!;
    const { kindIds, objectIds } = insertObjectPreset(p, coin, { sceneId: scene.id, x: 100, y: 200 });
    expect(kindIds).toHaveLength(coin.kinds.length);
    expect(objectIds).toHaveLength(1);
    const obj = scene.objects.find((o) => o.id === objectIds[0])!;
    expect(obj).toMatchObject({ x: 100, y: 200 });
    const kind = p.kinds.find((k) => k.id === obj.kindId)!;
    expect(kind.name).toBe('Coin');
    expect(kindIds).toContain(kind.id);
    for (const k of coin.kinds) expect(p.kinds.some((x) => x.id === k.id)).toBe(false);
    const score = p.values.find((v) => v.name === 'Score')!;
    expect(score).toBeDefined();
    expect(coin.values.some((v) => v.id === score.id)).toBe(false);
    // The copied rule points at the copied value, not the preset's.
    expect(JSON.stringify(kind.rules)).toContain(score.id);
    for (const s of ruleStates(p).values()) expect(s.state).toBe('ok');
    expect(Project.safeParse(p).success).toBe(true);
  });

  it('keeps no link to the preset: no shared objects, preset unchanged by edits', () => {
    const p = newProject();
    const enemy = preset('Patrolling Enemy');
    const before = structuredClone(enemy);
    insertObjectPreset(p, enemy, { sceneId: p.scenes[0]!.id, x: 0, y: 0 });
    const presetNodes = nodes(enemy);
    expect([...nodes(p)].filter((n) => presetNodes.has(n))).toEqual([]);
    p.kinds[0]!.name = 'Changed';
    p.kinds[0]!.stickers[0]!.settings.speed = 1;
    expect(enemy).toEqual(before);
  });

  it('copies Kinds again with a suffix but shares a game value of the same name and type', () => {
    const p = newProject();
    const sceneId = p.scenes[0]!.id;
    const a = insertObjectPreset(p, preset('Coin'), { sceneId, x: 0, y: 0 });
    const b = insertObjectPreset(p, preset('Coin'), { sceneId, x: 50, y: 0 });
    expect(p.kinds.map((k) => k.name)).toEqual(['Coin', 'Coin 2']);
    expect(p.values.map((v) => v.name)).toEqual(['Score']);
    expect(a.kindIds[0]).not.toBe(b.kindIds[0]);
    const [first, second] = [a, b].map((r) => p.kinds.find((k) => k.id === r.kindIds[0])!);
    expect(first!.rules[0]!.id).not.toBe(second!.rules[0]!.id);
    for (const k of [first!, second!]) expect(JSON.stringify(k.rules)).toContain(p.values[0]!.id);
    expect(Project.safeParse(p).success).toBe(true);
  });

  it('copies a game value whose name clashes with a different type, and fixes text placeholders', () => {
    const p = newProject();
    const sceneId = p.scenes[0]!.id;
    p.values.push({ id: 'mine', name: 'upgrade cost', scope: 'game', type: 'text', start: 'x', remember: false });
    const { kindIds } = insertObjectPreset(p, preset('Upgrade Button'), { sceneId, x: 0, y: 0 });
    expect(p.values.map((v) => v.name)).toEqual(['upgrade cost', 'Coins', 'Per Click', 'Upgrade Cost 2']);
    const copy = p.values.find((v) => v.name === 'Upgrade Cost 2')!;
    const rules = JSON.stringify(p.kinds.find((x) => x.id === kindIds[0])!.rules);
    expect(rules).toContain('{Upgrade Cost 2}');
    expect(rules).toContain(copy.id);
    expect(rules).not.toContain('"mine"');
    expect(Project.safeParse(p).success).toBe(true);
  });

  it('remaps references between the preset’s own Kinds (Turret → its projectile)', () => {
    const p = newProject();
    const turret = preset('Turret');
    const { kindIds } = insertObjectPreset(p, turret, { sceneId: p.scenes[0]!.id, x: 0, y: 0 });
    const text = JSON.stringify(p);
    for (const k of turret.kinds) expect(text).not.toContain(`"${k.id}"`);
    expect(kindIds.length).toBeGreaterThan(1);
    for (const s of ruleStates(p).values()) expect(s.state).toBe('ok');
  });

  it('works inside an Immer recipe', () => {
    const p = newProject();
    let ids: string[] = [];
    const next = produce(p, (d) => {
      ids = insertObjectPreset(d, preset('Spikes'), { sceneId: d.scenes[0]!.id, x: 64, y: 64 }).objectIds;
    });
    expect(p.kinds).toHaveLength(0);
    expect(next.scenes[0]!.objects.map((o) => o.id)).toEqual(ids);
  });

  it('rejects an unknown scene', () => {
    expect(() => insertObjectPreset(newProject(), preset('Coin'), { sceneId: 'nope', x: 0, y: 0 })).toThrow();
  });
});

describe('insertRulePreset (FR-026, FR-027)', () => {
  it('appends a fresh copy that stays incomplete until its blanks are filled', () => {
    const p = newProject();
    const rp = RULE_PRESETS[0]!;
    const before = structuredClone(rp);
    const id = insertRulePreset(p, rp, { type: 'game' });
    expect(id).not.toBe(rp.rule.id);
    expect(p.rules.map((r) => r.id)).toEqual([id]);
    expect(ruleStates(p).get(id)!.state).toBe('incomplete');
    p.rules[0]!.enabled = false;
    expect(rp).toEqual(before);
    expect([...nodes(p.rules[0])].filter((n) => nodes(rp).has(n))).toEqual([]);
  });

  it('appends to a scene or a Kind', () => {
    const p = newProject();
    insertObjectPreset(p, preset('Coin'), { sceneId: p.scenes[0]!.id, x: 0, y: 0 });
    const kind = p.kinds[0]!;
    const n = kind.rules.length;
    const a = insertRulePreset(p, RULE_PRESETS[1]!, { type: 'kind', id: kind.id });
    const b = insertRulePreset(p, RULE_PRESETS[2]!, { type: 'scene', id: p.scenes[0]!.id });
    expect(kind.rules[n]!.id).toBe(a);
    expect(p.scenes[0]!.rules.at(-1)!.id).toBe(b);
    expect(() => insertRulePreset(p, RULE_PRESETS[0]!, { type: 'kind', id: 'missing' })).toThrow();
  });
});
