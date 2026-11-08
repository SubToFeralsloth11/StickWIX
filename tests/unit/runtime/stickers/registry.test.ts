import { describe, expect, it } from 'vitest';
import { Kind } from '@/model/schema';
import { CONTROLLER_TYPES, StickerSettings, STICKER_TYPES } from '@/model/sticker-settings';
import { STICKERS } from '@/runtime/stickers';
import { game } from '../../../fixtures/build';

/** FR-011, in the spec's order. */
const FR011 = [
  'platformer', 'topdown', 'solid', 'falls', 'bouncy', 'collectible', 'hurts', 'health',
  'patrol', 'chase', 'shooter', 'clickable', 'draggable', 'cameraFollow', 'animate',
] as const;

/** Events each sticker exposes to rules (contracts/sticker-module.md). */
const EVENTS: Record<string, string[]> = {
  platformer: ['jumps', 'lands'],
  falls: ['lands'],
  collectible: ['collected'],
  health: ['hurt', 'outOfHealth'],
  shooter: ['shoots'],
  draggable: ['dropped'],
};

describe('sticker registry', () => {
  it('registers exactly the 15 FR-011 stickers, in order', () => {
    expect(Object.keys(STICKERS)).toEqual([...FR011]);
    expect(STICKER_TYPES).toEqual([...FR011]);
    for (const t of FR011) expect(STICKERS[t].type).toBe(t);
  });

  it.each(FR011)('%s has a label, a one-line help and help on every field', (t) => {
    const m = STICKERS[t];
    expect(m.label.trim().length).toBeGreaterThan(0);
    expect(m.help.trim().length).toBeGreaterThan(0);
    expect(m.help.length).toBeLessThanOrEqual(120);
    expect(m.help).not.toContain('\n');
    const shape = StickerSettings[t].shape as Record<string, unknown>;
    for (const f of m.fields) {
      expect(f.label.trim(), `${t}.${f.key} label`).not.toBe('');
      expect(f.help.trim(), `${t}.${f.key} help`).not.toBe('');
      expect(f.help.length).toBeLessThanOrEqual(120);
      expect(Object.keys(shape), `${t}.${f.key} is a real setting`).toContain(f.key);
    }
    // Every setting is reachable from the inspector.
    expect(m.fields.map((f) => f.key).sort()).toEqual(Object.keys(shape).sort());
  });

  it.each(FR011)('%s works with zero configuration (FR-013)', (t) => {
    expect(StickerSettings[t].safeParse({}).success).toBe(true);
    const { game: g } = game({
      tiles: ['..........', '..........', '..........', '..........', '##########'],
      kinds: [
        { id: 'thing', stickers: [{ type: t }] },
        { id: 'hero', stickers: t === 'platformer' || t === 'topdown' ? [] : [{ type: 'platformer' }] },
      ],
      objects: [
        { id: 'a', kind: 'thing', x: 96, y: 96 },
        { id: 'h', kind: 'hero', x: 32, y: 96 },
      ],
    });
    expect(g.scene.world.get('a')).toBeDefined();
    expect(() => {
      g.input.keyDown('ArrowRight');
      g.input.keyDown('KeyX');
      g.input.mouseDown(100, 100);
      g.run(60);
      g.input.keyUp('ArrowRight');
      g.input.mouseUp(200, 120);
      g.run(60);
    }).not.toThrow();
  });

  it('allows at most one controller sticker per Kind (FR-012)', () => {
    const kind = (types: string[]) => ({
      id: 'k', name: 'K', size: { w: 32, h: 32 },
      stickers: types.map((type, i) => ({ id: `s${i}`, type, settings: {} })),
    });
    expect(CONTROLLER_TYPES).toEqual(['platformer', 'topdown']);
    expect(Kind.safeParse(kind(['platformer', 'falls'])).success).toBe(true);
    expect(Kind.safeParse(kind(['platformer', 'topdown'])).success).toBe(false);
    expect(Kind.safeParse(kind(['topdown', 'topdown'])).success).toBe(false);
    for (const t of CONTROLLER_TYPES) expect(STICKERS[t].category).toBe('controller');
    expect(FR011.filter((t) => STICKERS[t].category === 'controller')).toEqual([...CONTROLLER_TYPES]);
  });

  it.each(FR011)('%s exposes the rule events of the contract (FR-014)', (t) => {
    const events = STICKERS[t].events ?? [];
    expect(events.map((e) => e.id)).toEqual(EVENTS[t] ?? []);
    for (const e of events) expect(e.phrase.trim()).not.toBe('');
  });
});
