import { describe, expect, it } from 'vitest';
import { game, project } from '../../fixtures/build';
import { createGame } from '@/runtime/game';

const spec = {
  tiles: ['..........', '..........', '..........', '..........', '##########'],
  kinds: [
    { id: 'hero', stickers: [{ type: 'platformer' }] },
    { id: 'coin', stickers: [{ type: 'collectible' }] },
    { id: 'slime', stickers: [{ type: 'patrol' }, { type: 'falls' }] },
  ],
  objects: [
    { id: 'h', kind: 'hero', x: 0, y: 96 },
    { id: 'c', kind: 'coin', x: 96, y: 96 },
    { id: 's', kind: 'slime', x: 200, y: 96 },
  ],
};

describe('createGame', () => {
  it('plays on a copy: the document is deep-equal after Play + Stop (FR-005)', () => {
    const p = project(spec);
    const before = structuredClone(p);
    const g = createGame(p, { seed: 3 });
    g.input.keyDown('ArrowRight');
    g.run(120);
    expect(g.scene.world.get('c')).toBeUndefined(); // the coin was collected in Play
    g.stop();
    expect(p).toEqual(before);
  });

  it('is deterministic for a seed', () => {
    const trace = () => {
      const { game: g } = game(spec, { seed: 7 });
      g.input.keyDown('ArrowRight');
      g.run(30);
      g.input.keyDown('Space');
      g.run(60);
      return [...g.scene.world.all()].map((i) => [i.id, i.x, i.y]);
    };
    expect(trace()).toEqual(trace());
  });

  it('freezes: frames do not advance the simulation while frozen', () => {
    const { game: g, renderer } = game(spec);
    g.freeze();
    const t = g.totalTime;
    g.frame(1 / 60);
    g.frame(1 / 60);
    expect(g.totalTime).toBe(t);
    expect(renderer.frames).toBe(2);
    g.resume();
    g.frame(1 / 60);
    expect(g.totalTime).toBeGreaterThan(t);
  });
});
