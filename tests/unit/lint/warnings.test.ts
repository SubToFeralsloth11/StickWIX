import { describe, expect, it } from 'vitest';
import { analyse } from '@/lint/warnings';
import { any, lit, project, rule } from '../../fixtures/build';

const FLOOR = ['.........', '.........', '.........', '#########'];
const keys = (w: ReturnType<typeof analyse>) => w.map((x) => x.key.split(':')[0]);

describe('warnings (FR-039)', () => {
  it('flags a platformer hero with nothing solid below, and stops once there is a floor', () => {
    const spec = { kinds: [{ id: 'hero', name: 'Hero', stickers: [{ type: 'platformer' }] }], objects: [{ id: 'h', kind: 'hero', x: 32, y: 0 }], width: 640, height: 360 };
    const w = analyse(project(spec));
    expect(w).toContainEqual(expect.objectContaining({ key: 'nofloor:h', target: { kind: 'object', sceneId: 's1', id: 'h' } }));
    expect(w.find((x) => x.key === 'nofloor:h')!.message).toContain('Hero has nothing solid to stand on');
    expect(keys(analyse(project({ ...spec, tiles: FLOOR })))).not.toContain('nofloor');
  });

  it('counts Solid objects below the hero as a floor', () => {
    const w = analyse(
      project({
        kinds: [{ id: 'hero', stickers: [{ type: 'platformer' }] }, { id: 'ground', w: 200, h: 32, stickers: [{ type: 'solid' }] }],
        objects: [{ id: 'h', kind: 'hero', x: 32, y: 0 }, { id: 'g', kind: 'ground', x: 0, y: 300 }],
        width: 640, height: 360,
      }),
    );
    expect(keys(w)).not.toContain('nofloor');
  });

  it('flags rules with an empty blank and rules using deleted things, each pointing at the rule', () => {
    const w = analyse(
      project({
        kinds: [{ id: 'coin' }],
        rules: [
          rule('r1', { type: 'clicked', target: { t: 'unset' } }, [{ type: 'restartScene' }]),
          rule('r2', { type: 'clicked', target: any('ghost') }, [{ type: 'restartScene' }]),
        ],
      }),
    );
    expect(w).toContainEqual(expect.objectContaining({ key: 'blank:r1', severity: 'warn', target: { kind: 'rule', id: 'r1' } }));
    expect(w).toContainEqual(expect.objectContaining({ key: 'broken:r2', severity: 'error', target: { kind: 'rule', id: 'r2' } }));
  });

  it('flags a value shown on screen that no rule changes', () => {
    const spec = {
      values: [{ id: 'score', name: 'Score', start: 0 }],
      ui: [{ id: 'u1', name: 'Label', type: 'text', x: 0, y: 0, text: 'Score: {Score}' }],
    };
    expect(analyse(project(spec))).toContainEqual(expect.objectContaining({ key: 'static:u1:score', target: { kind: 'ui', sceneId: 's1', id: 'u1' } }));
    const changed = { ...spec, rules: [rule('r', { type: 'sceneStart' }, [{ type: 'changeValue', value: { valueId: 'score' }, op: 'add', amount: lit(1) }])] };
    expect(keys(analyse(project(changed)))).not.toContain('static');
  });

  it('flags a Collectible that no rule counts', () => {
    const spec = { kinds: [{ id: 'coin', name: 'Coin', stickers: [{ type: 'collectible' }] }], objects: [{ id: 'c', kind: 'coin', x: 0, y: 0 }] };
    expect(analyse(project(spec))).toContainEqual(expect.objectContaining({ key: 'uncounted:coin', target: { kind: 'kind', id: 'coin' } }));
    const counted = { ...spec, values: [{ id: 's', name: 'Score', start: 0 }], rules: [rule('r', { type: 'sticker', target: any('coin'), event: 'collected' }, [{ type: 'changeValue', value: { valueId: 's' }, op: 'add', amount: lit(1) }])] };
    expect(keys(analyse(project(counted)))).not.toContain('uncounted');
  });

  it('flags a scene larger than the screen without Camera Follow', () => {
    const spec = { kinds: [{ id: 'hero' }], objects: [{ id: 'h', kind: 'hero', x: 0, y: 0 }], width: 2000 };
    expect(analyse(project(spec))).toContainEqual(expect.objectContaining({ key: 'nocam:s1', target: { kind: 'scene', id: 's1' } }));
    const follow = { ...spec, kinds: [{ id: 'hero', stickers: [{ type: 'cameraFollow' }] }] };
    expect(keys(analyse(project(follow)))).not.toContain('nocam');
  });

  it('reports runaway rules and the object cap from the last Play', () => {
    const p = project({ kinds: [{ id: 'dot', name: 'Dot' }], rules: [rule('loop', { type: 'sceneStart' }, [{ type: 'restartScene' }])] });
    const w = analyse(p, [{ type: 'runaway', ruleId: 'loop' }, { type: 'objectCap', sceneId: 's1', kindId: 'dot' }]);
    expect(w).toContainEqual(expect.objectContaining({ key: 'runaway:loop', target: { kind: 'rule', id: 'loop' } }));
    expect(w).toContainEqual(expect.objectContaining({ key: 'cap:dot', target: { kind: 'kind', id: 'dot' } }));
  });

  it('is quiet for a tidy project', () => {
    expect(analyse(project({ width: 640, height: 360 }))).toEqual([]);
  });
});
