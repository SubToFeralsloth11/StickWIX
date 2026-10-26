import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportGame, GAME_PLACEHOLDER } from '@/export/export-game';
import { bootPlayer, DAMAGED_MESSAGE, letterbox, type PlayerDeps } from '@/player/player';
import { PAYLOAD_ELEMENT_ID } from '@/player/payload';
import type { Game } from '@/runtime/game';
import { NullRenderer } from '@/runtime/render/null-renderer';
import { project as build } from '../../fixtures/build';

const TEMPLATE = `<script id="${PAYLOAD_ELEMENT_ID}" type="application/json">${GAME_PLACEHOLDER}</script>`;

function sample() {
  const p = build({
    kinds: [{ id: 'hero' }],
    objects: [{ id: 'o1', kind: 'hero', x: 10, y: 20 }],
    values: [
      { id: 'best', name: 'Best', start: 0, remember: true },
      { id: 'score', name: 'Score', start: 0 },
      { id: 'lives', name: 'Lives', start: 3, remember: true },
    ],
    extraScenes: [{ id: 's2', name: 'Title', objects: [{ id: 'o2', kind: 'hero', x: 1, y: 2 }] }],
  });
  return { ...p, id: 'p-game', startSceneId: 's2' };
}

function page(payloadText: string) {
  document.body.innerHTML = `<script id="${PAYLOAD_ELEMENT_ID}" type="application/json"></script>`;
  document.getElementById(PAYLOAD_ELEMENT_ID)!.textContent = payloadText;
}

async function exported() {
  const html = await exportGame(sample(), { template: TEMPLATE, loadAsset: async () => undefined, builtinUrl: () => undefined, manifest: null });
  return html.slice(TEMPLATE.indexOf(GAME_PLACEHOLDER), html.length - '</script>'.length);
}

function deps() {
  const renderers: (NullRenderer & { canvas: HTMLCanvasElement })[] = [];
  const unlock = vi.fn();
  const started: HTMLElement[] = [];
  const d: PlayerDeps = {
    createRenderer: async (parent) => {
      const r = Object.assign(new NullRenderer(), { canvas: document.createElement('canvas') });
      parent.appendChild(r.canvas);
      renderers.push(r);
      return r;
    },
    createAudio: () => ({ play() {}, music() {}, stop() {}, unlock }),
    storage: localStorage,
    onStart: (stage) => started.push(stage),
  };
  return { d, renderers, unlock, started };
}

let game: Game | null = null;
beforeEach(() => localStorage.clear());
afterEach(() => {
  game?.stop();
  game = null;
});

describe('exported game player', () => {
  it('boots the start scene from the payload behind a "Click to play" overlay', async () => {
    page(await exported());
    const { d, renderers, unlock, started } = deps();
    game = await bootPlayer(document, d);
    expect(game).not.toBeNull();
    expect(game!.scene.scene.id).toBe('s2');
    expect([...game!.scene.world.all()].map((i) => i.id)).toEqual(['o2']);
    expect(document.title).toBe('Test');
    expect(renderers).toHaveLength(1);
    expect(renderers[0]!.frames).toBe(1);
    expect(renderers[0]!.last?.scene.id).toBe('s2');

    const overlay = document.querySelector<HTMLButtonElement>('.player-overlay')!;
    expect(overlay.textContent).toBe('Click to play');
    expect(unlock).not.toHaveBeenCalled();
    overlay.click();
    expect(unlock).toHaveBeenCalledOnce();
    expect(document.querySelector('.player-overlay')).toBeNull();
    expect(started).toEqual([renderers[0]!.canvas.parentElement]);
  });

  it('shows no editor UI', async () => {
    page(await exported());
    game = await bootPlayer(document, deps().d);
    expect(document.querySelectorAll('button')).toHaveLength(1);
    expect(document.body.textContent).not.toMatch(/Show me|Rules|Stop/);
  });

  it('restores remembered values by name and ignores names that no longer exist', async () => {
    localStorage.setItem('stickwix:p-game:Best', '42');
    localStorage.setItem('stickwix:p-game:Score', '99');
    localStorage.setItem('stickwix:p-game:Coins', '7');
    localStorage.setItem('stickwix:other:Lives', '9');
    page(await exported());
    game = await bootPlayer(document, deps().d);
    expect(game!.values.get('best')).toBe(42);
    expect(game!.values.get('score')).toBe(0);
    expect(game!.values.get('lives')).toBe(3);
    expect(game!.values.byName('Coins')).toBeUndefined();

    game!.values.set('lives', 2);
    expect(localStorage.getItem('stickwix:p-game:Lives')).toBe('2');
  });

  for (const [what, text] of [
    ['an unreplaced placeholder', GAME_PLACEHOLDER],
    ['truncated JSON', '{"project":{"id":'],
    ['a payload without a project', '{"assets":{}}'],
    ['a project that fails validation', JSON.stringify({ project: { ...sample(), startSceneId: 'nope' }, assets: {} })],
    ['an asset that is not a data URL', JSON.stringify({ project: sample(), assets: { a: 'https://example.com/a.png' } })],
  ] as const)
    it(`shows the damaged message for ${what}`, async () => {
      page(text);
      const { d, renderers } = deps();
      expect(await bootPlayer(document, d)).toBeNull();
      expect(document.body.textContent).toBe(DAMAGED_MESSAGE);
      expect(renderers).toHaveLength(0);
    });

  it('letterboxes to the largest size with the game aspect', () => {
    expect(letterbox({ w: 1920, h: 1080 }, { w: 640, h: 360 })).toEqual({ w: 1920, h: 1080 });
    expect(letterbox({ w: 1000, h: 1000 }, { w: 640, h: 360 })).toEqual({ w: 1000, h: 562 });
    expect(letterbox({ w: 800, h: 300 }, { w: 640, h: 360 })).toEqual({ w: 533, h: 300 });
  });
});
