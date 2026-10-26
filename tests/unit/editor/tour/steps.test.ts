import { beforeEach, describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { advance, TOUR_STEPS, type TourContext } from '@/editor/tour/steps';
import { endTour, loadTour, startTour, useTour } from '@/editor/tour/tour-state';
import { closeDb } from '@/storage/db';
import { project } from '../../../fixtures/build';

const ctx = (over: Partial<TourContext> = {}): TourContext => ({ project: project({ width: 640, height: 360 }), playing: false, showMeRules: 0, rightTab: 'inspect', leftTab: 'art', ...over });

describe('tour steps (FR-037)', () => {
  it('covers a preset, a sticker, a sentence rule and Show-me', () => {
    expect(new Set(TOUR_STEPS.map((s) => s.teaches).filter(Boolean))).toEqual(new Set(['preset', 'sticker', 'rule', 'showme']));
  });

  it('advances only when the current step is actually done', () => {
    expect(advance(TOUR_STEPS, 0, ctx())).toBe(0);
    const ground = project({ width: 640, height: 360, tiles: ['..........', '..........', '######....'] });
    expect(advance(TOUR_STEPS, 0, ctx({ project: ground }))).toBe(1);
    // Playing does not skip the unfinished hero step.
    expect(advance(TOUR_STEPS, 1, ctx({ project: ground, playing: true }))).toBe(1);
  });

  it('walks through the whole build as the user does each part', () => {
    let p = project({ width: 640, height: 360, tiles: ['..........', '..........', '######....'], values: [{ id: 'score', name: 'Score', start: 0 }] });
    let i = advance(TOUR_STEPS, 0, ctx({ project: p }));
    p = project({
      width: 640, height: 360, tiles: ['..........', '..........', '######....'],
      values: [{ id: 'score', name: 'Score', start: 0 }],
      kinds: [{ id: 'hero', stickers: [{ type: 'platformer' }] }, { id: 'coin', lookId: 'builtin:img/coin' }],
      objects: [{ id: 'h', kind: 'hero', x: 0, y: 0 }, { id: 'c', kind: 'coin', x: 100, y: 0 }],
    });
    i = advance(TOUR_STEPS, i, ctx({ project: p }));
    expect(TOUR_STEPS[i]!.id).toBe('sticker');
    p = produce(p, (d) => {
      d.kinds[1]!.stickers.push({ id: 'st', type: 'collectible', settings: { collectedBy: null, sound: null, disappear: true } });
      d.scenes[0]!.rules.push({ id: 'r', enabled: true, trigger: { type: 'sticker', target: { t: 'any', kindId: 'coin' }, event: 'collected' }, conditions: { join: 'all', items: [] }, actions: [{ type: 'changeValue', value: { valueId: 'score' }, op: 'add', amount: { lit: 1 } }] });
    });
    i = advance(TOUR_STEPS, i, ctx({ project: p }));
    expect(TOUR_STEPS[i]!.id).toBe('play');
    i = advance(TOUR_STEPS, i, ctx({ project: p, playing: true }));
    expect(TOUR_STEPS[i]!.id).toBe('showme');
    i = advance(TOUR_STEPS, i, ctx({ project: p, playing: true, showMeRules: 1 }));
    expect(TOUR_STEPS[i]!.id).toBe('finish');
    expect(advance(TOUR_STEPS, i, ctx({ project: p, showMeRules: 1 }))).toBe(TOUR_STEPS.length);
  });
});

describe('tour state', () => {
  beforeEach(async () => {
    closeDb();
    indexedDB.deleteDatabase('stickwix');
    await loadTour();
  });

  it('remembers a skip across reloads', async () => {
    expect(useTour.getState().seen).toBe(false);
    await endTour();
    useTour.setState({ seen: false, loaded: false });
    await loadTour();
    expect(useTour.getState()).toMatchObject({ seen: true, projectId: null });
  });

  it('restarting from Help starts again at the first step', () => {
    void startTour('p1');
    useTour.setState({ step: 5, showMeRules: 2 });
    void startTour('p2');
    expect(useTour.getState()).toMatchObject({ projectId: 'p2', step: 0, showMeRules: 0 });
  });
});
