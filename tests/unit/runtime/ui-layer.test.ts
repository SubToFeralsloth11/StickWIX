import { describe, expect, it } from 'vitest';
import { UIElement, type Anchor } from '@/model/schema';
import { estimateTextWidth, layoutUI } from '@/runtime/ui-layer';
import { game, lit, rule, type Spec } from '../../fixtures/build';

const el = (anchor: Anchor, x: number, y: number, extra: Partial<UIElement> = {}) =>
  UIElement.parse({ id: 'e', name: 'E', type: 'image', x, y, anchor, lookId: 'img', ...extra });
const img = () => ({ w: 40, h: 20 });

describe('UI layer (FR-010)', () => {
  it.each([
    [{ w: 640, h: 360 }],
    [{ w: 1920, h: 1080 }],
    [{ w: 320, h: 240 }],
  ])('anchors stay put relative to their corner/edge at %o', (screen) => {
    const box = (a: Anchor, x = 0, y = 0) => {
      const b = layoutUI(el(a, x, y), '', screen, img);
      return [b.x, b.y];
    };
    const { w, h } = screen;
    expect(box('tl', 16, 8)).toEqual([16, 8]);
    expect(box('t')).toEqual([w / 2 - 20, 0]);
    expect(box('tr', -16, 8)).toEqual([w - 16 - 40, 8]);
    expect(box('l')).toEqual([0, h / 2 - 10]);
    expect(box('c')).toEqual([w / 2 - 20, h / 2 - 10]);
    expect(box('r')).toEqual([w - 40, h / 2 - 10]);
    expect(box('bl', 4, -4)).toEqual([4, h - 20 - 4]);
    expect(box('b')).toEqual([w / 2 - 20, h - 20]);
    expect(box('br', -16, -16)).toEqual([w - 56, h - 36]);
  });

  it('sizes text and buttons from their text and style', () => {
    const text = layoutUI(UIElement.parse({ id: 't', name: 'T', type: 'text', x: 0, y: 0, text: 'Hello', style: { size: 20 } }), 'Hello', { w: 640, h: 360 }, img);
    expect(text.w).toBeCloseTo(estimateTextWidth('Hello', 20), 5);
    expect(text.h).toBe(25);
    const btn = layoutUI(UIElement.parse({ id: 'b', name: 'B', type: 'button', x: 0, y: 0, text: 'Go' }), 'Go', { w: 640, h: 360 }, () => undefined);
    expect(btn.w).toBeGreaterThan(estimateTextWidth('Go', 24));
    expect(btn.h).toBe(44);
  });

  const SPEC: Spec = {
    values: [{ id: 'score', name: 'Score', start: 0 }, { id: 'lives', name: 'Lives', start: 3 }],
    kinds: [{ id: 'box', w: 200, h: 200 }],
    objects: [{ id: 'under', kind: 'box', x: 220, y: 80 }],
    ui: [
      { id: 'hud', name: 'HUD', type: 'text', x: 8, y: 8, text: 'Score: {Score}  Lives: {Lives}' },
      { id: 'go', name: 'Go', type: 'button', x: 0, y: 0, anchor: 'c', text: 'Go' },
      { id: 'secret', name: 'Secret', type: 'button', x: 0, y: 0, anchor: 'tl', text: 'Secret', hidden: true },
    ],
    rules: [
      rule('tick', { type: 'every', seconds: lit(0.5) }, [{ type: 'changeValue', value: { valueId: 'score' }, op: 'add', amount: lit(10) }]),
      rule('btn', { type: 'clicked', target: { t: 'ui', id: 'go' } }, [{ type: 'changeValue', value: { valueId: 'lives' }, op: 'add', amount: lit(1) }]),
      rule('box', { type: 'clicked', target: { t: 'object', id: 'under' } }, [{ type: 'changeValue', value: { valueId: 'lives' }, op: 'set', amount: lit(0) }]),
      rule('hidden', { type: 'clicked', target: { t: 'ui', id: 'secret' } }, [{ type: 'changeValue', value: { valueId: 'lives' }, op: 'set', amount: lit(99) }]),
    ],
  };

  it('{Value} placeholders update live', () => {
    const { game: g } = game(SPEC);
    const hud = () => g.view().ui.find((u) => u.el.id === 'hud')!.box.text;
    expect(hud()).toBe('Score: 0  Lives: 3');
    g.run(30);
    expect(hud()).toBe('Score: 10  Lives: 3');
    g.run(30);
    expect(hud()).toBe('Score: 20  Lives: 3');
  });

  it('a button click fires `clicked` for the button, not the object under it', () => {
    const { game: g } = game(SPEC);
    const events: unknown[] = [];
    g.onEvent((e) => e.type === 'clicked' && events.push(e));
    g.input.mouseDown(320, 180);
    g.run(1);
    expect(events).toEqual([{ type: 'clicked', id: 'go', ui: true }]);
    expect(g.values.get('lives')).toBe(4);
  });

  it('hidden buttons cannot be clicked; the click falls through', () => {
    const { game: g } = game({ ...SPEC, objects: [{ id: 'under', kind: 'box', x: 0, y: 0 }] });
    g.input.mouseDown(10, 10);
    g.run(1);
    expect(g.values.get('lives')).toBe(0);
    expect(g.view().ui.map((u) => u.el.id)).toEqual(['hud', 'go']);
  });

  it('clicks hit buttons at their anchored place, wherever the camera is', () => {
    const { game: g } = game({
      ...SPEC,
      width: 3000,
      kinds: [{ id: 'box', stickers: [{ type: 'cameraFollow', settings: { smoothing: 0 } }] }],
      objects: [{ id: 'under', kind: 'box', x: 2000, y: 100 }],
    });
    expect(g.scene.camera.x).toBeGreaterThan(1000);
    g.input.mouseDown(320, 180);
    g.run(1);
    expect(g.values.get('lives')).toBe(4);
  });
});
