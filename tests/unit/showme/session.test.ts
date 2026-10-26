import { describe, expect, it } from 'vitest';
import { ShowMeSession } from '@/showme/session';
import { game } from '../../fixtures/build';

const spec = {
  kinds: [{ id: 'hero', stickers: [{ type: 'platformer' }] }, { id: 'coin' }],
  objects: [
    { id: 'h', kind: 'hero', x: 0, y: 0 },
    { id: 'c', kind: 'coin', x: 300, y: 0 },
  ],
  values: [{ id: 'score', name: 'Score', start: 0 }],
};

describe('ShowMeSession', () => {
  it('freezes the game: frames stop advancing until closed', () => {
    const { game: g } = game(spec);
    g.run(5);
    const s = new ShowMeSession(g);
    const t = g.totalTime;
    g.frame(0.5);
    expect(g.totalTime).toBe(t);
    s.close();
    g.frame(1 / 60);
    expect(g.totalTime).toBeGreaterThan(t);
  });

  it('lists events from the last 2 seconds, newest first, deduplicated (FR-028)', () => {
    const { game: g } = game(spec);
    g.input.keyDown('KeyX');
    g.run(1);
    g.input.keyUp('KeyX');
    g.run(150); // 2.5 s: the key press is now too old
    g.input.keyDown('Space');
    g.run(1);
    g.input.keyUp('Space');
    g.run(1);
    g.input.keyDown('Space');
    g.run(1);
    const s = new ShowMeSession(g);
    const keys = s.events.map((e) => e.event).filter((e) => e.type === 'key');
    expect(keys).toEqual([
      { type: 'key', key: 'Space', mode: 'pressed' },
      { type: 'key', key: 'Space', mode: 'released' },
    ]);
  });

  it('has nothing to offer when nothing happened recently', () => {
    const { game: g } = game({ kinds: [{ id: 'coin' }], objects: [{ id: 'c', kind: 'coin', x: 300, y: 0 }] });
    g.run(200);
    expect(new ShowMeSession(g).events).toEqual([]);
  });

  it('keeps acted-out changes in the order performed and reports unsupported ones without logging them', () => {
    const { game: g } = game(spec);
    const s = new ShowMeSession(g);
    s.log({ type: 'destroy', instId: 'c' });
    s.log({ what: 'Tiles cannot be changed by a rule' });
    s.log({ type: 'value', valueId: 'score', op: 'add', amount: 1 });
    s.log({ type: 'sound', assetId: 'builtin:sfx/coin' });
    expect(s.intents.map((i) => i.type)).toEqual(['destroy', 'value', 'sound']);
    expect(s.unsupported).toEqual([{ what: 'Tiles cannot be changed by a rule' }]);
  });

  it('merges back-to-back presses on the same value into one change', () => {
    const { game: g } = game(spec);
    const s = new ShowMeSession(g);
    s.log({ type: 'value', valueId: 'score', op: 'add', amount: 1 });
    s.log({ type: 'value', valueId: 'score', op: 'add', amount: 1 });
    s.log({ type: 'value', valueId: 'score', op: 'subtract', amount: 5 });
    expect(s.intents).toEqual([{ type: 'value', valueId: 'score', op: 'subtract', amount: 3 }]);
  });

  it('cancel resumes play and leaves the document unchanged (FR-031)', () => {
    const { game: g, project } = game(spec);
    const before = structuredClone(project);
    const s = new ShowMeSession(g);
    s.log({ type: 'destroy', instId: 'c' });
    s.close();
    expect(g.frozen).toBe(false);
    expect(project).toEqual(before);
  });
});
