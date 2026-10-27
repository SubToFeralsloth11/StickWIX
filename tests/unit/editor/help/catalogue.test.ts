import { describe, expect, it } from 'vitest';
import { helpCatalogue } from '@/editor/help/catalogue';
import { STICKER_TYPES } from '@/model/sticker-settings';
import { STICKERS } from '@/runtime/stickers';

describe('help catalogue (FR-038)', () => {
  const entries = helpCatalogue();
  const ids = new Set(entries.map((e) => e.id));

  it('covers every sticker and every sticker setting', () => {
    for (const t of STICKER_TYPES) {
      expect(ids).toContain(`sticker:${t}`);
      for (const f of STICKERS[t].fields) expect(ids).toContain(`field:${t}.${f.key}`);
    }
  });

  it('covers every trigger, condition and action type', () => {
    const triggers = ['sceneStart', 'every', 'after', 'key', 'clicked', 'touches', 'valueChanges', 'valueReaches', 'created', 'destroyed', 'leavesScene', 'sticker'];
    const conditions = ['compare', 'count', 'keyHeld', 'touching', 'chance'];
    const actions = ['moveTo', 'moveBy', 'setSpeed', 'push', 'create', 'destroy', 'show', 'hide', 'changeLook', 'animate', 'changeValue', 'showText', 'playSound', 'wait', 'changeScene', 'restartScene', 'shakeCamera', 'share'];
    for (const t of triggers) expect(ids).toContain(`trigger:${t}`);
    for (const c of conditions) expect(ids).toContain(`condition:${c}`);
    for (const a of actions) expect(ids).toContain(`action:${a}`);
  });

  it('keeps every explanation to one short line', () => {
    for (const e of entries) {
      expect(e.text.length, e.id).toBeGreaterThan(10);
      expect(e.text.length, e.id).toBeLessThanOrEqual(120);
      expect(e.text, e.id).not.toMatch(/[\r\n]/);
    }
  });
});
