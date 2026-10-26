import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { Project } from '@/model/schema';
import * as ops from '@/editor/store/world-ops';
import { any, obj, project, rule } from '../../fixtures/build';

const base = () =>
  project({
    kinds: [{ id: 'hero', name: 'Hero', stickers: [{ type: 'platformer' }] }, { id: 'coin', name: 'Coin', w: 16, h: 16 }],
    objects: [
      { id: 'h', kind: 'hero', x: 0, y: 0 },
      { id: 'c1', kind: 'coin', x: 100, y: 0 },
      { id: 'c2', kind: 'coin', x: 200, y: 0 },
    ],
    sceneRules: [rule('r1', { type: 'touches', a: obj('h'), b: any('coin') }, [{ type: 'destroy', target: { t: 'that', kindId: 'coin' } }])],
  });
const valid = (p: Project) => expect(Project.safeParse(p).success).toBe(true);

describe('scene operations (FR-006)', () => {
  it('adds, renames (unique), reorders, duplicates, deletes and sets the start scene', () => {
    let p = produce(base(), (d) => void ops.addScene(d, 'Level'));
    expect(p.scenes.map((s) => s.name)).toEqual(['Level 1', 'Level']);
    p = produce(p, (d) => ops.renameScene(d, d.scenes[1]!.id, 'level 1'));
    expect(p.scenes[1]!.name).toBe('level 1 2');
    const second = p.scenes[1]!.id;
    p = produce(p, (d) => ops.moveScene(d, second, 0));
    expect(p.scenes[0]!.id).toBe(second);
    p = produce(p, (d) => ops.setStartScene(d, second));
    expect(p.startSceneId).toBe(second);
    p = produce(p, (d) => void ops.duplicateScene(d, 's1'));
    const copy = p.scenes.find((s) => s.name === 'Level 1 copy')!;
    expect(copy.objects).toHaveLength(3);
    expect(copy.objects.map((o) => o.id)).not.toContain('h');
    // The copied rule points at the copied hero, not the original.
    const r = copy.rules[0]!;
    expect(r.trigger.type === 'touches' && r.trigger.a.t === 'object' && r.trigger.a.id).toBe(copy.objects[0]!.id);
    p = produce(p, (d) => void ops.deleteScene(d, second));
    expect(p.startSceneId).toBe(p.scenes[0]!.id);
    valid(p);
  });

  it('refuses to delete the last scene', () => {
    const p = produce(base(), (d) => {
      expect(ops.deleteScene(d, 's1')).toBe(false);
    });
    expect(p.scenes).toHaveLength(1);
  });
});

describe('object operations (FR-008)', () => {
  it('places with snap, moves, rotates, resizes, duplicates and deletes', () => {
    let id = '';
    let p = produce(base(), (d) => void (id = ops.placeObject(d, 's1', 'coin', 37, 70, 32)));
    expect(p.scenes[0]!.objects.find((o) => o.id === id)).toMatchObject({ x: 32, y: 64 });
    p = produce(p, (d) => ops.moveObjects(d, 's1', [id, 'c1'], 10, 5));
    expect(p.scenes[0]!.objects.find((o) => o.id === 'c1')).toMatchObject({ x: 110, y: 5 });
    p = produce(p, (d) => ops.setObjectTransform(d, 's1', 'c1', { rotation: -90, scaleX: 2, scaleY: 0 }));
    expect(p.scenes[0]!.objects.find((o) => o.id === 'c1')).toMatchObject({ rotation: 270, scaleX: 2, scaleY: 0.05 });
    let copies: string[] = [];
    p = produce(p, (d) => void (copies = ops.duplicateObjects(d, 's1', ['c1', 'c2'])));
    expect(copies).toHaveLength(2);
    expect(p.scenes[0]!.objects).toHaveLength(6);
    p = produce(p, (d) => ops.deleteObjects(d, 's1', copies));
    expect(p.scenes[0]!.objects).toHaveLength(4);
    valid(p);
  });

  it('brings to front and sends to back', () => {
    let p = produce(base(), (d) => ops.layerObjects(d, 's1', ['h'], 'front'));
    const layer = (q: Project, id: string) => q.scenes[0]!.objects.find((o) => o.id === id)!.layer;
    expect(layer(p, 'h')).toBeGreaterThan(Math.max(layer(p, 'c1'), layer(p, 'c2')));
    p = produce(p, (d) => ops.layerObjects(d, 's1', ['c2'], 'back'));
    expect(layer(p, 'c2')).toBeLessThan(Math.min(layer(p, 'h'), layer(p, 'c1')));
  });

  it('multi-selects with a marquee', () => {
    expect(ops.objectsInRect(base(), 's1', { x: 90, y: -5, w: 200, h: 20 }).sort()).toEqual(['c1', 'c2']);
  });
});

describe('stickers (FR-012, FR-009)', () => {
  it('refuses a second controller with the conflict, then replaces it when asked', () => {
    produce(base(), (d) => {
      const r = ops.addSticker(d, 'hero', 'topdown');
      expect(r.ok).toBe(false);
      expect(!r.ok && r.conflict.type).toBe('platformer');
      const r2 = ops.addSticker(d, 'hero', 'topdown', { replace: true });
      expect(r2.ok).toBe(true);
      expect(d.kinds[0]!.stickers.map((s) => s.type)).toEqual(['topdown']);
    });
  });

  it('sets Kind settings or per-object overrides, and clearing an override restores the default', () => {
    const p0 = base();
    const st = p0.kinds[0]!.stickers[0]!.id;
    let p = produce(p0, (d) => ops.setStickerSetting(d, 'hero', st, 'speed', 300));
    expect(p.kinds[0]!.stickers[0]!.settings.speed).toBe(300);
    p = produce(p, (d) => ops.setStickerSetting(d, 'hero', st, 'jumpHeight', 150, { sceneId: 's1', objectId: 'h' }));
    expect(p.scenes[0]!.objects[0]!.overrides.stickers).toEqual({ [st]: { jumpHeight: 150 } });
    expect(p.kinds[0]!.stickers[0]!.settings.jumpHeight).toBe(72);
    p = produce(p, (d) => ops.clearOverride(d, 's1', 'h', st, 'jumpHeight'));
    expect(p.scenes[0]!.objects[0]!.overrides.stickers).toBeUndefined();
    valid(p);
  });
});

describe('tiles (FR-007)', () => {
  it('brush, rectangle fill, erase and per-tile solid flags', () => {
    let p = produce(base(), (d) => ops.paintTiles(d, 's1', ops.lineCells({ x: 0, y: 0 }, { x: 3, y: 0 }), 0));
    expect(Object.keys(p.scenes[0]!.tileLayer.cells)).toHaveLength(4);
    p = produce(p, (d) => ops.paintTiles(d, 's1', ops.rectCells({ x: 2, y: 3 }, { x: 0, y: 5 }), 1));
    expect(Object.keys(p.scenes[0]!.tileLayer.cells)).toHaveLength(13);
    p = produce(p, (d) => ops.eraseTiles(d, 's1', [{ x: 0, y: 0 }, { x: 9, y: 9 }]));
    expect(p.scenes[0]!.tileLayer.cells['0,0']).toBeUndefined();
    expect(Object.keys(p.scenes[0]!.tileLayer.cells)).toHaveLength(12);
    p = produce(p, (d) => ops.setTileSolid(d, 'ts', 1, true, true));
    expect(p.tileSets[0]).toMatchObject({ solid: [true, true], oneWay: [false, true] });
    valid(p);
  });
});

describe('UI elements (FR-010)', () => {
  it('adds uniquely named text and buttons', () => {
    const p = produce(base(), (d) => {
      ops.addUIElement(d, 's1', 'button');
      ops.addUIElement(d, 's1', 'button');
      ops.addUIElement(d, 's1', 'text', { text: 'Coins: {Coins}' });
    });
    expect(p.scenes[0]!.ui.map((u) => u.name)).toEqual(['Button', 'Button 2', 'Text']);
    valid(p);
  });
});

