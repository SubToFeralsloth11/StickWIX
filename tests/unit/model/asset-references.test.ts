import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import type { Project } from '@/model/schema';
import { assetUsers, deleteAssetFromProject } from '@/model/asset-references';
import { ruleStates } from '@/model/references';
import { lit, obj, project, rule } from '../../fixtures/build';

const ART = 'a-hero';
const SFX = 'a-boing';

function base(): Project {
  const p = project({
    kinds: [
      { id: 'hero', name: 'Hero', lookId: ART, stickers: [{ type: 'platformer', settings: { walkLook: ART } }] },
      { id: 'coin', name: 'Coin', lookId: 'builtin:items/coin', stickers: [{ type: 'collectible', id: 'col', settings: { sound: SFX } }] },
      { id: 'rock', name: 'Rock' },
    ],
    objects: [
      { id: 'h', kind: 'hero', x: 0, y: 0 },
      { id: 'r', kind: 'rock', x: 0, y: 0, overrides: { lookId: ART } },
      { id: 'c', kind: 'coin', x: 0, y: 0, overrides: { stickers: { col: { sound: SFX } } } },
    ],
    ui: [{ id: 'logo', name: 'Logo', type: 'image', x: 0, y: 0, lookId: ART }],
    rules: [
      rule('look', { type: 'sceneStart' }, [{ type: 'changeLook', target: obj('h'), assetId: ART }]),
      rule('boing', { type: 'sceneStart' }, [{ type: 'playSound', assetId: SFX }]),
      rule('plain', { type: 'every', seconds: lit(1) }, [{ type: 'shakeCamera', seconds: lit(1) }]),
    ],
  });
  p.assets.push(
    { id: ART, name: 'Hero art', kind: 'image', source: 'drawn', mime: 'image/png', frames: { w: 16, h: 16, count: 2, fps: 8 } },
    { id: SFX, name: 'Boing', kind: 'sound', source: 'imported', mime: 'audio/wav', duration: 0.5 },
  );
  p.scenes[0]!.background = { assetId: ART, mode: 'stretch' };
  p.tileSets.push({ id: 'ts2', name: 'My tiles', assetId: ART, tileSize: 16, columns: 2, count: 2, solid: [true, true], oneWay: [] });
  p.settings.backgroundMusic = SFX;
  return p;
}

const types = (p: Project, id: string) => assetUsers(p, id).map((u) => (u.type === 'rule' ? `rule:${u.rule.rule.id}` : `${u.type}:${u.label}`));

describe('asset references (US6, edge case "An asset used by objects is deleted")', () => {
  it('lists every user of a picture', () => {
    expect(types(base(), ART)).toEqual([
      'kind:Hero',
      'sticker:Hero: platformer sticker (walk look)',
      'object:Rock in Level 1',
      'ui:Screen item "Logo" in Level 1',
      'background:Background of Level 1',
      'tileSet:Tile set "My tiles"',
      'rule:look',
    ]);
  });

  it('lists every user of a sound', () => {
    expect(types(base(), SFX)).toEqual([
      'sticker:Coin: collectible sticker (sound)',
      'object:Coin in Level 1',
      'music:Background music',
      'rule:boing',
    ]);
  });

  it('an unused asset has no users', () => {
    const p = base();
    p.assets.push({ id: 'spare', name: 'Spare', kind: 'image', source: 'imported', mime: 'image/png', frames: { w: 8, h: 8, count: 1, fps: 8 } });
    expect(assetUsers(p, 'spare')).toEqual([]);
  });

  it('deleting removes only the asset: looks keep the dangling id (placeholder) and rules turn broken', () => {
    const p = base();
    expect(ruleStates(p).get('look')!.state).toBe('ok');
    const next = produce(p, (d) => deleteAssetFromProject(d, ART));
    expect(next.assets.map((a) => a.id)).toEqual([SFX]);
    expect(next.kinds[0]!.lookId).toBe(ART);
    expect(next.scenes[0]!.objects[1]!.overrides.lookId).toBe(ART);
    expect(next.scenes[0]!.background).toEqual({ assetId: ART, mode: 'stretch' });
    const states = ruleStates(next);
    expect(states.get('look')!.state).toBe('broken');
    expect(states.get('look')!.blanks).toEqual([{ path: ['actions', 0, 'assetId'], problem: 'missing', ref: { kind: 'asset', id: ART } }]);
    expect(states.get('boing')!.state).toBe('ok');
    expect(states.get('plain')!.state).toBe('ok');
    // Users are still reported so the editor can point at them.
    expect(assetUsers(next, ART).length).toBe(7);
  });

  it('deleting a built-in or unknown id changes nothing', () => {
    const p = base();
    expect(produce(p, (d) => deleteAssetFromProject(d, 'builtin:items/coin'))).toBe(p);
  });
});
