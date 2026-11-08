import { describe, expect, it } from 'vitest';
import { Project, Kind, Value, Rule } from '@/model/schema';
import { newProject, newKind } from '@/model/defaults';

const base = () => newProject('Test');

describe('Project schema', () => {
  it('accepts a fresh project and fills defaults', () => {
    const p = Project.parse(base());
    expect(p.settings).toMatchObject({ screenWidth: 960, screenHeight: 540, showMeKey: 'F2' });
    expect(p.scenes).toHaveLength(1);
  });

  it('rejects empty and over-long names', () => {
    expect(Project.safeParse({ ...base(), name: '  ' }).success).toBe(false);
    expect(Project.safeParse({ ...base(), name: 'x'.repeat(61) }).success).toBe(false);
  });

  it('rejects a startSceneId that does not exist', () => {
    const r = Project.safeParse({ ...base(), startSceneId: 'nope' });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0]!.path).toEqual(['startSceneId']);
  });

  it('rejects scenes smaller than the screen and screen sizes out of range', () => {
    const p = base();
    expect(Project.safeParse({ ...p, scenes: [{ ...p.scenes[0]!, width: 100 }] }).success).toBe(false);
    expect(Project.safeParse({ ...p, settings: { ...p.settings, screenWidth: 100 } }).success).toBe(false);
  });

  it('rejects duplicate Kind names case-insensitively', () => {
    const p = { ...base(), kinds: [newKind('Coin'), newKind('coin')] };
    expect(Project.safeParse(p).success).toBe(false);
  });

  it('rejects objects whose Kind does not exist', () => {
    const p = base();
    p.scenes[0]!.objects.push({ id: 'o1', kindId: 'ghost', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, layer: 0, overrides: {} });
    expect(Project.safeParse(p).success).toBe(false);
  });
});

describe('Sticker settings', () => {
  it('fills every missing setting from defaults', () => {
    const k = Kind.parse({ ...newKind('Hero'), stickers: [{ id: 's1', type: 'platformer', settings: {} }] });
    expect(k.stickers[0]!.settings).toMatchObject({ speed: 180, jumpHeight: 72, gravity: 1400, coyoteMs: 100 });
  });

  it('rejects out-of-range settings', () => {
    const r = Kind.safeParse({ ...newKind('Hero'), stickers: [{ id: 's1', type: 'platformer', settings: { speed: -5 } }] });
    expect(r.success).toBe(false);
  });

  it('allows at most one controller sticker per Kind', () => {
    const stickers = [
      { id: 'a', type: 'platformer', settings: {} },
      { id: 'b', type: 'topdown', settings: {} },
    ];
    expect(Kind.safeParse({ ...newKind('Hero'), stickers }).success).toBe(false);
    expect(Kind.safeParse({ ...newKind('Hero'), stickers: [stickers[0], { id: 'c', type: 'solid', settings: {} }] }).success).toBe(true);
  });

  it('allows at most one controller between a Kind and an object override', () => {
    const p = base();
    const hero = Kind.parse({ ...newKind('Hero'), stickers: [{ id: 'a', type: 'platformer', settings: {} }] });
    p.kinds.push(hero);
    p.scenes[0]!.objects.push({
      id: 'o1', kindId: hero.id, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, layer: 0,
      overrides: { addStickers: [{ id: 'b', type: 'topdown', settings: {} }] },
    });
    expect(Project.safeParse(p).success).toBe(false);
  });
});

describe('Value schema', () => {
  it('requires start to match the type', () => {
    expect(Value.safeParse({ id: 'v', name: 'Score', scope: 'game', type: 'number', start: 'ten' }).success).toBe(false);
    expect(Value.safeParse({ id: 'v', name: 'Score', scope: 'game', type: 'number', start: 0 }).success).toBe(true);
  });
  it('only lets game values be remembered', () => {
    expect(Value.safeParse({ id: 'v', name: 'HP', scope: 'object', type: 'number', start: 3, remember: true }).success).toBe(false);
  });
});

describe('Rule schema', () => {
  it('accepts unset blanks and requires at least one action', () => {
    const rule = {
      id: 'r', trigger: { type: 'touches', a: { t: 'unset' }, b: { t: 'any', kindId: 'k' } },
      actions: [{ type: 'changeValue', value: { unset: true }, op: 'add', amount: { lit: 1 } }],
    };
    expect(Rule.parse(rule).enabled).toBe(true);
    expect(Rule.safeParse({ ...rule, actions: [] }).success).toBe(false);
  });
});
