import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { builtinAssetUrl, loadManifest, parseBuiltinManifest } from '@/assets/manifest';

// Vitest runs from the repo root (jsdom's URL cannot resolve file: URLs).
const DIR = path.resolve(process.cwd(), 'public/assets/builtin');
const raw: unknown = JSON.parse(readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
const manifest = parseBuiltinManifest(raw);

const REQUIRED_IMAGES = [
  'hero',
  'hero_walk',
  'hero_jump',
  'coin',
  'gem',
  'heart',
  'key',
  'flag',
  'spikes',
  'slime',
  'bee',
  'crate',
  'spring',
  'door',
  'platform',
  'bullet',
  'knight',
  'knight_walk',
  'ghost',
  'chest',
  'potion',
  'tree',
  'rock',
  'cookie',
  'coin_big',
  'button',
  'button_green',
  'panel',
  'star',
  'fireball',
  'bg_sky',
  'bg_hills',
  'bg_dungeon',
].map((n) => `builtin:img/${n}`);
const REQUIRED_TILESETS = ['grass', 'dungeon', 'town'].map((n) => `builtin:tiles/${n}`);
const REQUIRED_SFX = ['jump', 'coin', 'hit', 'click', 'win', 'lose', 'shoot', 'powerup'].map(
  (n) => `builtin:sfx/${n}`,
);
const REQUIRED_MUSIC = ['adventure', 'chill'].map((n) => `builtin:music/${n}`);

/** Width/height from the IHDR chunk of a PNG file. */
function pngSize(file: string): { w: number; h: number } {
  const buf = readFileSync(file);
  expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(buf.subarray(12, 16).toString('latin1')).toBe('IHDR');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

describe('built-in asset manifest (FR-032)', () => {
  it('parses against the schema', () => {
    expect(manifest.version).toBe(1);
  });

  it('includes every required image, tileset and sound key', () => {
    for (const key of REQUIRED_IMAGES) expect(manifest.images, key).toHaveProperty([key]);
    for (const key of REQUIRED_TILESETS) expect(manifest.tilesets, key).toHaveProperty([key]);
    for (const key of [...REQUIRED_SFX, ...REQUIRED_MUSIC])
      expect(manifest.sounds, key).toHaveProperty([key]);
  });

  it('covers characters, enemies, items, UI and backgrounds', () => {
    const categories = new Set(Object.values(manifest.images).map((i) => i.category));
    for (const c of ['character', 'enemy', 'item', 'ui', 'background'] as const)
      expect(categories).toContain(c);
  });

  it('has tiles for at least three themes, platformer and top-down included', () => {
    const tilesets = Object.values(manifest.tilesets);
    expect(tilesets.length).toBeGreaterThanOrEqual(3);
    const themes = new Set(tilesets.map((t) => t.theme));
    expect(themes).toContain('platformer');
    expect(themes).toContain('topdown');
  });

  it('has walk animations and an animated enemy', () => {
    expect(manifest.images['builtin:img/hero_walk']?.frames).toBeGreaterThanOrEqual(2);
    expect(manifest.images['builtin:img/knight_walk']?.frames).toBeGreaterThanOrEqual(2);
    expect(manifest.images['builtin:img/slime']?.frames).toBeGreaterThanOrEqual(2);
  });

  it('has sfx and at least two music loops', () => {
    const sounds = Object.values(manifest.sounds);
    expect(sounds.filter((s) => s.category === 'music').length).toBeGreaterThanOrEqual(2);
    for (const key of REQUIRED_SFX) expect(manifest.sounds[key]?.category).toBe('sfx');
  });

  it('every image file exists and matches w*frames x h', () => {
    for (const [key, img] of Object.entries(manifest.images)) {
      const size = pngSize(path.join(DIR, img.file));
      expect(size, key).toEqual({ w: img.w * img.frames, h: img.h });
    }
  });

  it('characters and items are 32x32 (the clicker cookie is big)', () => {
    for (const [key, img] of Object.entries(manifest.images)) {
      if ((img.category === 'character' || img.category === 'enemy') && img.theme !== 'clicker')
        expect({ w: img.w, h: img.h }, key).toEqual({ w: 32, h: 32 });
    }
    expect(manifest.images['builtin:img/cookie']?.w).toBeGreaterThanOrEqual(96);
  });

  it('every tileset file exists with a full grid and per-tile flags', () => {
    for (const [key, t] of Object.entries(manifest.tilesets)) {
      const size = pngSize(path.join(DIR, t.file));
      expect(size.w, key).toBe(t.columns * t.tileSize);
      expect(size.h, key).toBe(Math.ceil(t.count / t.columns) * t.tileSize);
      expect(t.solid, key).toHaveLength(t.count);
      expect(t.oneWay, key).toHaveLength(t.count);
      expect(t.solid.some(Boolean), `${key} has solid tiles`).toBe(true);
      expect(
        t.solid.some((s) => !s),
        `${key} has passable tiles`,
      ).toBe(true);
      t.oneWay.forEach((o, i) => expect(o && t.solid[i], `${key} tile ${i} solid and one-way`).toBe(false));
    }
  });

  it('every sound file exists and is non-empty', () => {
    for (const [key, s] of Object.entries(manifest.sounds)) {
      const file = path.join(DIR, s.file);
      expect(existsSync(file), key).toBe(true);
      expect(readFileSync(file).length, key).toBeGreaterThan(256);
    }
  });

  it('ships a licence file naming CC0', () => {
    const license = readFileSync(path.join(DIR, 'LICENSE.txt'), 'utf8');
    expect(license).toContain('CC0');
    expect(license).toContain('kenney.nl');
  });
});

describe('manifest loader', () => {
  it('fetches and validates manifest.json from the base URL', async () => {
    const urls: string[] = [];
    const fetchStub = (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response(JSON.stringify(raw), { status: 200 });
    }) as typeof fetch;
    const loaded = await loadManifest({ base: '/app/assets/builtin/', fetch: fetchStub });
    expect(urls).toEqual(['/app/assets/builtin/manifest.json']);
    expect(Object.keys(loaded.images)).toEqual(Object.keys(manifest.images));
  });

  it('rejects HTTP errors and malformed manifests', async () => {
    const notFound = (async () => new Response('', { status: 404 })) as typeof fetch;
    await expect(loadManifest({ base: '/x/', fetch: notFound })).rejects.toThrow(/404/);
    const bad = (async () => new Response(JSON.stringify({ version: 2 }), { status: 200 })) as typeof fetch;
    await expect(loadManifest({ base: '/x/', fetch: bad })).rejects.toThrow();
  });

  it('joins asset URLs with or without a trailing slash', () => {
    expect(builtinAssetUrl('img/hero.png', '/a/')).toBe('/a/img/hero.png');
    expect(builtinAssetUrl('img/hero.png', '/a')).toBe('/a/img/hero.png');
  });
});
