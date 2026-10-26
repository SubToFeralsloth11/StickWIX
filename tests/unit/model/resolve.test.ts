import { describe, expect, it } from 'vitest';
import { Kind } from '@/model/schema';
import { newKind } from '@/model/defaults';
import { resolveObject } from '@/model/resolve';

const coin = () =>
  Kind.parse({
    ...newKind('Coin', 'builtin:img/coin'),
    stickers: [{ id: 's1', type: 'patrol', settings: { speed: 50 } }],
    values: [{ id: 'v1', name: 'Worth', scope: 'object', type: 'number', start: 1 }],
  });

describe('resolveObject', () => {
  it('uses Kind defaults when there are no overrides, so Kind edits reach every object', () => {
    const k = coin();
    expect(resolveObject(k, { overrides: {} })).toMatchObject({ lookId: 'builtin:img/coin', values: { v1: 1 }, hidden: false });
    k.stickers[0]!.settings.speed = 80;
    expect(resolveObject(k, { overrides: {} }).stickers[0]!.settings.speed).toBe(80);
  });

  it('lets per-object overrides win', () => {
    const r = resolveObject(coin(), {
      overrides: { stickers: { s1: { speed: 200 } }, values: { v1: 5 }, lookId: 'builtin:img/gem', hidden: true },
    });
    expect(r.stickers[0]!.settings).toMatchObject({ speed: 200, distance: 96 });
    expect(r).toMatchObject({ values: { v1: 5 }, lookId: 'builtin:img/gem', hidden: true });
  });

  it('restores the Kind default once an override is removed', () => {
    const k = coin();
    const obj = { overrides: { stickers: { s1: { speed: 200 } } as Record<string, Record<string, unknown>> } };
    delete obj.overrides.stickers.s1;
    expect(resolveObject(k, obj).stickers[0]!.settings.speed).toBe(50);
  });

  it('adds object-only stickers after the Kind stickers', () => {
    const r = resolveObject(coin(), { overrides: { addStickers: [{ id: 'x', type: 'solid', settings: { oneWay: false } }] } });
    expect(r.stickers.map((s) => s.type)).toEqual(['patrol', 'solid']);
  });
});
