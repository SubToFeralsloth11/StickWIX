import { describe, expect, it } from 'vitest';
import { any, game, lit, rule } from '../../fixtures/build';

describe('World', () => {
  it('spawns and destroys objects, firing created/destroyed', () => {
    const { game: g } = game({ kinds: [{ id: 'coin' }] });
    const seen: string[] = [];
    g.onEvent((e) => seen.push(e.type));
    const c = g.scene.world.spawn('coin', 10, 20)!;
    expect(g.scene.world.get(c.id)).toBe(c);
    g.scene.world.destroy(c);
    expect(g.scene.world.get(c.id)).toBeUndefined();
    expect(seen).toEqual(['created', 'destroyed']);
  });

  it('stops spawning at 1,000 live objects and records an objectCap diagnostic (FR-041)', () => {
    const { game: g } = game({ kinds: [{ id: 'dot' }] });
    for (let i = 0; i < 1200; i++) g.scene.world.spawn('dot', (i % 30) * 40, 0);
    expect(g.scene.world.liveCount()).toBe(1000);
    expect(g.diagnostics).toEqual([{ type: 'objectCap', sceneId: 's1', kindId: 'dot' }]);
  });

  it('a runaway spawner rule is stopped by the cap while the game keeps running', () => {
    const { game: g } = game({
      kinds: [{ id: 'dot' }],
      rules: [rule('r1', { type: 'every', seconds: lit(0.0166) }, [{ type: 'create', kindId: 'dot', place: { at: { x: lit(0), y: lit(0) } } }])],
    });
    for (let i = 0; i < 1100; i++) g.scene.world.spawn('dot', 0, 0);
    g.run(10);
    expect(g.scene.world.liveCount()).toBe(1000);
  });

  it('removes objects more than one screen outside the scene and fires leavesScene, not destroyed (FR-042)', () => {
    const { game: g } = game({
      kinds: [{ id: 'rock', stickers: [{ type: 'falls', settings: { maxFall: 3000 } }] }],
      objects: [{ id: 'r', kind: 'rock', x: 100, y: 0 }],
      height: 360,
    });
    const seen: string[] = [];
    g.onEvent((e) => (e.type === 'leavesScene' || e.type === 'destroyed') && seen.push(e.type));
    g.run(30);
    expect(g.scene.world.get('r')).toBeDefined(); // still within one screen below
    g.run(120);
    expect(g.scene.world.get('r')).toBeUndefined();
    expect(seen).toEqual(['leavesScene']);
  });

  it('feeds leavesScene into rules', () => {
    const { game: g } = game({
      kinds: [{ id: 'rock', stickers: [{ type: 'falls', settings: { maxFall: 3000 } }] }],
      objects: [{ id: 'r', kind: 'rock', x: 100, y: 0 }],
      values: [{ id: 'lost', name: 'Lost', start: 0 }],
      rules: [rule('r1', { type: 'leavesScene', target: any('rock') }, [{ type: 'changeValue', value: { valueId: 'lost' }, op: 'add', amount: lit(1) }])],
      height: 360,
    });
    g.run(200);
    expect(g.values.get('lost')).toBe(1);
  });
});
