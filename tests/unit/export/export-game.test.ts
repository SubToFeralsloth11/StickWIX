import { describe, expect, it, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import type { BuiltinManifest } from '@/assets/manifest';
import { Project, type ProjectInput } from '@/model/schema';
import { exportGame, GAME_PLACEHOLDER, referencedAssetIds } from '@/export/export-game';
import { parsePayload, PAYLOAD_ELEMENT_ID } from '@/player/payload';
import { project as build, rule } from '../../fixtures/build';

const TEMPLATE = `<!doctype html><html><head><script type="module">/*player*/</script></head><body><script id="${PAYLOAD_ELEMENT_ID}" type="application/json">${GAME_PLACEHOLDER}</script></body></html>`;

const EVIL = '</script><script>alert("x")</script> \u2028 \u2029 <!-- $& $1';

function sample(): Project {
  const base = build({
    kinds: [
      { id: 'hero', lookId: 'builtin:img/hero', stickers: [{ type: 'platformer', settings: { walkLook: 'a-walk' } }] },
      { id: 'coin', stickers: [{ type: 'collectible', settings: { sound: 'builtin:sfx/coin' } }] },
    ],
    objects: [{ id: 'o1', kind: 'hero', x: 10, y: 20 }],
    rules: [rule('r1', { type: 'sceneStart' }, [{ type: 'playSound', assetId: 'a-snd' }, { type: 'showText', text: EVIL, seconds: { lit: 1 } }])],
  });
  return Project.parse({
    ...base,
    settings: { ...base.settings, backgroundMusic: 'builtin:music/adventure' },
    scenes: base.scenes.map((s) => ({ ...s, background: { assetId: 'a-bg', mode: 'stretch' as const } })),
    assets: [
      { id: 'a-walk', name: 'Walk', kind: 'image', source: 'drawn', frames: { w: 16, h: 16, count: 4, fps: 8 } },
      { id: 'a-bg', name: 'Sky', kind: 'image', source: 'imported', frames: { w: 640, h: 360, count: 1, fps: 8 } },
      { id: 'a-snd', name: 'Boop', kind: 'sound', source: 'imported', duration: 1, mime: 'audio/wav' },
      { id: 'a-unused', name: 'Unused', kind: 'image', source: 'drawn', frames: { w: 8, h: 8, count: 1, fps: 8 } },
    ],
  } satisfies ProjectInput);
}

const manifest = {
  version: 1,
  images: {
    'builtin:img/hero': { file: 'img/hero.png', w: 32, h: 32, frames: 4, fps: 10, category: 'character', theme: 'platformer', name: 'Hero' },
    'builtin:img/slime': { file: 'img/slime.png', w: 32, h: 32, frames: 2, fps: 6, category: 'enemy', theme: 'platformer', name: 'Slime' },
  },
  tilesets: {},
  sounds: {},
} as unknown as BuiltinManifest;

const BUILTIN_BASE = 'http://localhost:5199/assets/builtin/';
const builtinUrl = (id: string) => `${BUILTIN_BASE}${id.slice('builtin:'.length)}.png`;
const blob = (text: string, type: string) => new NodeBlob([text], { type }) as unknown as Blob;

function setup() {
  const fetched: string[] = [];
  const loaded: string[] = [];
  const fetchFn = vi.fn(async (url: string) => {
    fetched.push(url);
    return new Response(`bytes of ${url}`, { headers: { 'content-type': url.includes('sfx') || url.includes('music') ? 'audio/ogg' : 'image/png' } });
  }) as unknown as typeof fetch;
  const loadAsset = async (id: string) => {
    loaded.push(id);
    return blob(`blob ${id}`, id === 'a-snd' ? 'audio/wav' : 'image/png');
  };
  return { fetched, loaded, opts: { template: TEMPLATE, loadAsset, builtinUrl, manifest, fetch: fetchFn } };
}

function payloadText(html: string) {
  const m = html.match(/<script id="stickwix-game" type="application\/json">([\s\S]*?)<\/script>/);
  expect(m).not.toBeNull();
  return m![1]!;
}

describe('exportGame (FR-035)', () => {
  it('finds only the assets the project references', () => {
    expect([...referencedAssetIds(sample())].sort()).toEqual([
      'a-bg',
      'a-snd',
      'a-walk',
      'builtin:img/hero',
      'builtin:music/adventure',
      'builtin:sfx/coin',
      'builtin:tiles/grass',
    ]);
  });

  it('replaces the placeholder with a payload the player accepts', async () => {
    const { opts } = setup();
    const html = await exportGame(sample(), opts);
    expect(html).not.toContain(GAME_PLACEHOLDER);
    expect(html.startsWith('<!doctype html><html><head><script type="module">/*player*/</script>')).toBe(true);
    const payload = parsePayload(payloadText(html));
    expect(payload.project).toEqual(sample());
    expect(payload.manifest).toEqual({ images: { 'builtin:img/hero': { w: 32, h: 32, frames: 4, fps: 10 } } });
  });

  it('escapes </ and line separators so the payload cannot break out of its script tag', async () => {
    const { opts } = setup();
    const html = await exportGame(sample(), opts);
    const text = payloadText(html);
    expect(text).not.toContain('</');
    expect(text).not.toContain('<!--');
    expect(text).toContain('<\\/script>');
    expect(text).not.toMatch(/[\u2028\u2029]/);
    const payload = parsePayload(text);
    const action = payload.project.rules[0]!.actions[1]!;
    expect(action.type === 'showText' && action.text).toBe(EVIL);
  });

  it('embeds only referenced assets, builtin ones fetched and inlined', async () => {
    const { opts, fetched, loaded } = setup();
    const payload = parsePayload(payloadText(await exportGame(sample(), opts)));
    expect(Object.keys(payload.assets).sort()).toEqual([...referencedAssetIds(sample())].sort());
    expect(loaded.sort()).toEqual(['a-bg', 'a-snd', 'a-walk']);
    expect(fetched).not.toContain(builtinUrl('builtin:img/slime'));
    expect(payload.assets['a-snd']).toBe(`data:audio/wav;base64,${btoa('blob a-snd')}`);
    expect(payload.assets['builtin:img/hero']).toBe(`data:image/png;base64,${btoa(`bytes of ${builtinUrl('builtin:img/hero')}`)}`);
  });

  it('produces one self-contained file without external asset URLs', async () => {
    const { opts } = setup();
    const html = await exportGame(sample(), opts);
    expect(html).not.toContain(BUILTIN_BASE);
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/blob:/);
    expect(html.match(/<\/script/g)).toHaveLength(2);
    for (const url of Object.values(parsePayload(payloadText(html)).assets)) expect(url).toMatch(/^data:[a-z]+\/[a-z0-9.+-]+;base64,/);
  });

  it('fails with a clear message when an asset cannot be read', async () => {
    const { opts } = setup();
    await expect(exportGame(sample(), { ...opts, loadAsset: async () => undefined })).rejects.toThrow(/"Walk"|"Sky"|"Boop"/);
  });

  it('rejects a template without exactly one placeholder', async () => {
    const { opts } = setup();
    await expect(exportGame(sample(), { ...opts, template: '<html></html>' })).rejects.toThrow(/player/i);
    await expect(exportGame(sample(), { ...opts, template: TEMPLATE + GAME_PLACEHOLDER })).rejects.toThrow(/player/i);
  });
});
