/**
 * Regenerates public/assets/builtin/ (images, tilesets, sounds, manifest.json, LICENSE.txt)
 * from CC0 source packs. Run with `pnpm assets`.
 *
 * - Source zips are downloaded once into node_modules/.cache/stickwix-assets and verified by SHA-256.
 * - Pixel art is sliced and upscaled nearest-neighbour so characters/items/tiles are 32x32.
 *   Kenney Pixel Platformer uses 18px cells: two redundant interior lines per axis are dropped
 *   (18 -> 16) before the 2x upscale so pixels stay crisp; 24px characters are resampled to 32.
 * - Audio is transcoded to mono MP3 with ffmpeg when available (Safari-safe); without ffmpeg the
 *   original Ogg Vorbis files are copied.
 * - A few sprites (bullet, fireball, star, cookie, rock) are original pixel art drawn below.
 *
 * Flags: `--contact <file.png>` also writes a contact sheet of every image and tileset.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { PNG } from 'pngjs';
import {
  parseBuiltinManifest,
  type AssetTheme,
  type BuiltinImage,
  type BuiltinManifest,
  type BuiltinSound,
  type BuiltinTileset,
  type ImageCategory,
} from '../src/assets/manifest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/assets/builtin');
const CACHE = path.join(ROOT, 'node_modules/.cache/stickwix-assets');

// ---------------------------------------------------------------------------------------------
// Sources (all CC0 1.0)
// ---------------------------------------------------------------------------------------------

interface Source {
  title: string;
  author: string;
  page: string;
  url: string;
  sha256: string;
}

const KENNEY = 'Kenney (www.kenney.nl)';
const kenney = (slug: string, stamp: string, title: string, sha256: string): Source => ({
  title,
  author: KENNEY,
  page: `https://kenney.nl/assets/${slug}`,
  url: `https://kenney.nl/media/pages/assets/${slug}/${stamp}/kenney_${slug}.zip`,
  sha256,
});

const SOURCES = {
  platformer: kenney(
    'pixel-platformer',
    '33bb4921eb-1696667883',
    'Pixel Platformer',
    'd01a196dbe3cc964e00d83ba3b987df62f332dc9260c9f941b4fbcc9047130f4',
  ),
  food: kenney(
    'pixel-platformer-food-expansion',
    '76330de2bf-1696596511',
    'Pixel Platformer Food Expansion',
    'c80c6b26dadd3c57974e466545a88bf29461085bb47abe5c28ee92dbe824ffa4',
  ),
  dungeon: kenney(
    'tiny-dungeon',
    'f8422efb44-1674742415',
    'Tiny Dungeon',
    'c109438ab06f65fd80f9b2686a4cf9c7c11dc64444b47333ec71d602f8bb5fc7',
  ),
  town: kenney(
    'tiny-town',
    'a415fbeb49-1735736916',
    'Tiny Town',
    '9768692dccff1d706408a5aedd6ca4f6cd1409506cbc84cb2f862919764be977',
  ),
  ui: kenney(
    'ui-pack-pixel-adventure',
    '405ba5278a-1729196257',
    'UI Pack (Pixel Adventure)',
    '0b0ed4802ebcfff5e44e370f394baa1d751862a5a4a7612ac4ce84e85faa0627',
  ),
  interface: kenney(
    'interface-sounds',
    'fa43c1dd4d-1677589452',
    'Interface Sounds',
    'f2193d072726d6758a5f7871b2dcc54dcce0d5c35c6f0a62f92549b327c81232',
  ),
  impact: kenney(
    'impact-sounds',
    '87b4ddecda-1677589768',
    'Impact Sounds',
    '029d734af1582474edf3a694d1b0cebc97c1c152f2f39fa34d4c2bafc5de77f8',
  ),
  digital: kenney(
    'digital-audio',
    '216eac4753-1677590265',
    'Digital Audio',
    '24e6ce28b76a6d8c89cff4d331e0965ff5c3de8a73c612028e9d363cc64e4f06',
  ),
  jingles: kenney(
    'music-jingles',
    'f37e530b9e-1677590399',
    'Music Jingles',
    'b729ba57959bd58793d2c5cafa348aaf2655d354f3da35ec4729e03ec77197b8',
  ),
  chiptunes: {
    title: 'Chiptune Adventures (4 tracks)',
    author: 'Juhani Junkala',
    page: 'https://opengameart.org/content/4-chiptunes-adventure',
    url: 'https://opengameart.org/sites/default/files/Juhani%20Junkala%20%5BChiptune%20Adventures%5D%20OGG.zip',
    sha256: '9c9547e184a6daef0cddf9eff5b8c42b357a9a0d2c8f2b5a01aa95154b85edef',
  },
} satisfies Record<string, Source>;

type SourceId = keyof typeof SOURCES;

/** Keys produced from each source, for LICENSE.txt. */
const usedBy = new Map<SourceId | 'original', string[]>();
const credit = (src: SourceId | 'original', key: string): void => {
  const list = usedBy.get(src) ?? [];
  if (!list.includes(key)) list.push(key);
  usedBy.set(src, list);
};

async function download(id: SourceId): Promise<Uint8Array> {
  const src = SOURCES[id];
  const file = path.join(CACHE, `${id}.zip`);
  const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');
  if (existsSync(file)) {
    const cached = new Uint8Array(readFileSync(file));
    if (sha(cached) === src.sha256) return cached;
  }
  console.log(`  downloading ${src.url}`);
  const res = await fetch(src.url, { headers: { 'user-agent': 'stickwix-asset-fetch' } });
  if (!res.ok) throw new Error(`${id}: HTTP ${res.status} for ${src.url}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const got = sha(bytes);
  if (got !== src.sha256) throw new Error(`${id}: SHA-256 mismatch (expected ${src.sha256}, got ${got})`);
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(file, bytes);
  return bytes;
}

class Pack {
  constructor(
    readonly id: SourceId,
    private readonly files: Record<string, Uint8Array>,
  ) {}
  get(name: string): Uint8Array {
    const hit = this.files[name] ?? Object.entries(this.files).find(([k]) => k.endsWith(`/${name}`))?.[1];
    if (!hit) throw new Error(`${this.id}: missing ${name} in archive`);
    return hit;
  }
}

async function openPack(id: SourceId, wanted: (name: string) => boolean): Promise<Pack> {
  const zip = await download(id);
  return new Pack(id, unzipSync(zip, { filter: (f) => wanted(f.name) }));
}

// ---------------------------------------------------------------------------------------------
// Image helpers
// ---------------------------------------------------------------------------------------------

interface Img {
  w: number;
  h: number;
  d: Uint8Array;
}
type RGBA = readonly [number, number, number, number];

const blank = (w: number, h: number): Img => ({ w, h, d: new Uint8Array(w * h * 4) });

function decodePng(bytes: Uint8Array): Img {
  const png = PNG.sync.read(Buffer.from(bytes));
  return { w: png.width, h: png.height, d: new Uint8Array(png.data) };
}

function encodePng(img: Img): Buffer {
  const png = new PNG({ width: img.w, height: img.h });
  png.data.set(img.d);
  return PNG.sync.write(png, { colorType: 6, deflateLevel: 9 });
}

const getPx = (img: Img, x: number, y: number): RGBA => {
  const i = (y * img.w + x) * 4;
  return [img.d[i] ?? 0, img.d[i + 1] ?? 0, img.d[i + 2] ?? 0, img.d[i + 3] ?? 0];
};
const setPx = (img: Img, x: number, y: number, c: RGBA): void => {
  if (x < 0 || y < 0 || x >= img.w || y >= img.h) return;
  img.d.set(c, (y * img.w + x) * 4);
};
const alphaAt = (img: Img, x: number, y: number): number =>
  x < 0 || y < 0 || x >= img.w || y >= img.h ? 0 : (img.d[(y * img.w + x) * 4 + 3] ?? 0);

function mapPixels(w: number, h: number, f: (x: number, y: number) => RGBA): Img {
  const out = blank(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) setPx(out, x, y, f(x, y));
  return out;
}

const crop = (img: Img, x0: number, y0: number, w: number, h: number): Img =>
  mapPixels(w, h, (x, y) => getPx(img, x0 + x, y0 + y));

/** Nearest-neighbour resample to an exact size. */
const resize = (img: Img, w: number, h: number): Img =>
  mapPixels(w, h, (x, y) => getPx(img, Math.floor((x * img.w) / w), Math.floor((y * img.h) / h)));

const scale = (img: Img, k: number): Img => resize(img, img.w * k, img.h * k);

/** Copies non-transparent source pixels onto dst. */
function blit(dst: Img, src: Img, dx: number, dy: number): void {
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const c = getPx(src, x, y);
      if (c[3] > 0) setPx(dst, dx + x, dy + y, c);
    }
}

function hcat(parts: Img[]): Img {
  const h = Math.max(...parts.map((p) => p.h));
  const out = blank(
    parts.reduce((s, p) => s + p.w, 0),
    h,
  );
  let x = 0;
  for (const p of parts) {
    blit(out, p, x, 0);
    x += p.w;
  }
  return out;
}

function vcat(parts: Img[]): Img {
  const out = blank(
    Math.max(...parts.map((p) => p.w)),
    parts.reduce((s, p) => s + p.h, 0),
  );
  let y = 0;
  for (const p of parts) {
    blit(out, p, 0, y);
    y += p.h;
  }
  return out;
}

function bbox(img: Img): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = img.w,
    y0 = img.h,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++)
      if (alphaAt(img, x, y) > 0) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** Removes whole columns/rows (by index) from an image. */
function dropLines(img: Img, cols: readonly number[], rows: readonly number[]): Img {
  const keepX = [...Array(img.w).keys()].filter((x) => !cols.includes(x));
  const keepY = [...Array(img.h).keys()].filter((y) => !rows.includes(y));
  return mapPixels(keepX.length, keepY.length, (x, y) => getPx(img, keepX[x] ?? 0, keepY[y] ?? 0));
}

/** Moves every pixel by (dx, dy) inside the same canvas (pixels leaving the canvas are lost). */
function shift(img: Img, dx: number, dy: number): Img {
  return mapPixels(img.w, img.h, (x, y) => {
    const sx = x - dx,
      sy = y - dy;
    return sx < 0 || sy < 0 || sx >= img.w || sy >= img.h ? [0, 0, 0, 0] : getPx(img, sx, sy);
  });
}

/** Nine-slice: keeps `border` px corners/edges and tiles the middle to fill w x h. */
function nineSlice(src: Img, border: number, w: number, h: number): Img {
  const map = (v: number, out: number, size: number): number => {
    if (v < border) return v;
    if (v >= out - border) return size - (out - v);
    return border + ((v - border) % (size - 2 * border));
  };
  return mapPixels(w, h, (x, y) => getPx(src, map(x, w, src.w), map(y, h, src.h)));
}

const hex = (s: string): RGBA => [
  parseInt(s.slice(1, 3), 16),
  parseInt(s.slice(3, 5), 16),
  parseInt(s.slice(5, 7), 16),
  255,
];
const CLEAR: RGBA = [0, 0, 0, 0];

/** Adds a 1px outline around opaque pixels (4-neighbourhood). */
function outline(img: Img, color: RGBA): Img {
  return mapPixels(img.w, img.h, (x, y) => {
    if (alphaAt(img, x, y) > 0) return getPx(img, x, y);
    const near =
      alphaAt(img, x - 1, y) + alphaAt(img, x + 1, y) + alphaAt(img, x, y - 1) + alphaAt(img, x, y + 1);
    return near > 0 ? color : CLEAR;
  });
}

/** Pixel map from strings; each char is a palette key ('.' = transparent). */
function fromMap(rows: readonly string[], palette: Record<string, string>): Img {
  return mapPixels(rows[0]?.length ?? 0, rows.length, (x, y) => {
    const ch = rows[y]?.[x] ?? '.';
    const c = palette[ch];
    return c ? hex(c) : CLEAR;
  });
}

/** Regular grid of cells in a sprite sheet. */
class Sheet {
  readonly img: Img;
  readonly cols: number;
  constructor(
    bytes: Uint8Array,
    readonly size: number,
    readonly spacing = 0,
  ) {
    this.img = decodePng(bytes);
    this.cols = Math.floor((this.img.w + spacing) / (size + spacing));
  }
  get count(): number {
    return this.cols * Math.floor((this.img.h + this.spacing) / (this.size + this.spacing));
  }
  cell(index: number): Img {
    const step = this.size + this.spacing;
    return crop(
      this.img,
      (index % this.cols) * step,
      Math.floor(index / this.cols) * step,
      this.size,
      this.size,
    );
  }
}

/**
 * Converts an 18px Pixel Platformer sheet to 16px cells. The two interior columns/rows that differ
 * least from their neighbour across the whole sheet are dropped, so tiles keep their outlines and
 * still join seamlessly. Sprites with transparent margins are cropped instead (no detail lost).
 */
class Sheet18 {
  private readonly dropCols: number[];
  private readonly dropRows: number[];
  constructor(readonly sheet: Sheet) {
    this.dropCols = this.pickRedundant('x');
    this.dropRows = this.pickRedundant('y');
  }
  private pickRedundant(axis: 'x' | 'y'): number[] {
    const n = this.sheet.size;
    const score = new Array<number>(n).fill(0);
    for (let i = 0; i < this.sheet.count; i++) {
      const cell = this.sheet.cell(i);
      for (let line = 2; line < n - 2; line++)
        for (let t = 0; t < n; t++) {
          const a = axis === 'x' ? getPx(cell, line, t) : getPx(cell, t, line);
          const b = axis === 'x' ? getPx(cell, line - 1, t) : getPx(cell, t, line - 1);
          score[line] = (score[line] ?? 0) + a.reduce((s, v, k) => s + Math.abs(v - (b[k] ?? 0)), 0);
        }
    }
    const order = [...score.keys()]
      .filter((i) => i >= 2 && i < n - 2)
      .sort((a, b) => (score[a] ?? 0) - (score[b] ?? 0));
    const first = order[0] ?? 4;
    const second = order.find((i) => Math.abs(i - first) > 2) ?? 13;
    return [first, second].sort((a, b) => a - b);
  }
  /** 16px version of a tile (always line-dropped, for seamless tilesets). */
  tile16(index: number): Img {
    return dropLines(this.sheet.cell(index), this.dropCols, this.dropRows);
  }
  /** 16px version of a sprite: cropped around its pixels when they fit, else line-dropped. */
  sprite16(index: number): Img {
    const cell = this.sheet.cell(index);
    const b = bbox(cell);
    if (!b || b.x1 - b.x0 >= 16 || b.y1 - b.y0 >= 16) return this.tile16(index);
    const fit = (lo: number, hi: number): number => Math.min(Math.max(1, hi - 15), lo, 2);
    return crop(cell, fit(b.x0, b.x1), fit(b.y0, b.y1), 16, 16);
  }
}

// ---------------------------------------------------------------------------------------------
// Original pixel art (CC0, part of StickWIX)
// ---------------------------------------------------------------------------------------------

const ORIGINAL_STAR = fromMap(
  [
    '................',
    '.......kk.......',
    '......kwyk......',
    '......kwyk......',
    '.....kwwyyk.....',
    '.kkkkkwyyyykkkk.',
    'kwwwwwwyyyyyyyok',
    '.kwwyyyyyyyyyok.',
    '..kwyyyyyyyyok..',
    '...kyyyyyyyook..',
    '...kyyyyyyyyok..',
    '..kyyyyyyyyyyok.',
    '..kyyyykkyyyyok.',
    '.kyyyok..kyyyok.',
    '.kyyok....kyook.',
    '.kkkk......kkkk.',
  ],
  { k: '#4b2d1f', w: '#fff3a8', y: '#ffd23e', o: '#f29a1f' },
);

const ORIGINAL_BULLET = fromMap(
  ['..kkkk..', '.kwwyyk.', 'kwwyyyok', 'kwyyyyok', 'kyyyyook', 'kyyyoook', '.kyoook.', '..kkkk..'],
  { k: '#3a2a35', w: '#ffffff', y: '#ffe14d', o: '#f2a023' },
);

/** Shaded sphere-ish blob with a light from the top-left, quantised to a palette. */
function shadedBlob(
  size: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  ramp: readonly [number, string][],
  edge: string,
): Img {
  const body = mapPixels(size, size, (x, y) => {
    const nx = (x + 0.5 - cx) / rx,
      ny = (y + 0.5 - cy) / ry;
    const r2 = nx * nx + ny * ny;
    if (r2 > 1) return CLEAR;
    const nz = Math.sqrt(1 - r2);
    const light = -0.55 * nx - 0.6 * ny + 0.58 * nz;
    const hit = ramp.find(([t]) => light >= t) ?? ramp[ramp.length - 1];
    return hex(hit?.[1] ?? edge);
  });
  return outline(body, hex(edge));
}

function originalCookie(): Img {
  const cookie = shadedBlob(
    16,
    8,
    8,
    6.45,
    6.45,
    [
      [0.75, '#f6cf8c'],
      [0.35, '#e0a85f'],
      [-1, '#c4843f'],
    ],
    '#4a2c1a',
  );
  const chips: [number, number][] = [
    [5, 5],
    [6, 5],
    [9, 4],
    [11, 7],
    [11, 8],
    [6, 9],
    [9, 11],
    [8, 11],
    [4, 8],
    [9, 8],
  ];
  for (const [x, y] of chips) setPx(cookie, x, y, hex('#5b3420'));
  setPx(cookie, 5, 4, hex('#7a4a2c'));
  setPx(cookie, 9, 3, hex('#7a4a2c'));
  return cookie;
}

function originalRock(): Img {
  const rock = shadedBlob(
    16,
    8,
    9.5,
    6.6,
    5.3,
    [
      [0.8, '#d2d5de'],
      [0.5, '#a3a8b6'],
      [0.15, '#7d8292'],
      [-1, '#5d6170'],
    ],
    '#2e2a35',
  );
  for (const [x, y] of [
    [9, 8],
    [10, 9],
    [10, 10],
    [5, 11],
    [6, 12],
  ] as const)
    setPx(rock, x, y, hex('#4a4d5a'));
  return rock;
}

/** Fireball travelling right; `phase` 0/1 flickers the flame tail. */
function originalFireball(phase: number): Img {
  const cx = 10.5,
    cy = 8,
    r = 4.4;
  const body = mapPixels(16, 16, (x, y) => {
    const px = x + 0.5,
      py = y + 0.5;
    let heat = 1 - Math.hypot(px - cx, py - cy) / r;
    const u = (cx - px) / 9.2;
    if (u > 0 && u < 1) {
      const wobble = 0.6 * Math.sin(u * 7 + phase * Math.PI);
      const half = r * (1 - u) * 0.95 + 0.7 * Math.sin(u * 11 + phase * Math.PI + (py < cy ? 0 : 1.7));
      const dy = Math.abs(py - cy - wobble);
      if (half > 0 && dy < half) heat = Math.max(heat, (1 - dy / half) * (1 - u) * 0.85);
    }
    if (heat <= 0) return CLEAR;
    return hex(heat > 0.6 ? '#fff6c8' : heat > 0.38 ? '#ffd34a' : heat > 0.18 ? '#ff8a2a' : '#d8402a');
  });
  return outline(body, hex('#5a1e1e'));
}

// ---------------------------------------------------------------------------------------------
// Audio helpers
// ---------------------------------------------------------------------------------------------

/** Duration of an Ogg Vorbis file in seconds (last granule position / sample rate). */
function oggDuration(bytes: Uint8Array): number {
  const buf = Buffer.from(bytes);
  const ident = buf.indexOf('\x01vorbis', 0, 'latin1');
  if (ident < 0) throw new Error('not an Ogg Vorbis file');
  const rate = buf.readUInt32LE(ident + 12);
  const last = buf.lastIndexOf('OggS', buf.length - 1, 'latin1');
  const granule = Number(buf.readBigUInt64LE(last + 6));
  return Math.round((granule / rate) * 1000) / 1000;
}

const HAS_FFMPEG = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;

/** Mono MP3 via ffmpeg (Safari-safe); falls back to the original Ogg without ffmpeg. */
function encodeAudio(ogg: Uint8Array, bitrate: string): { bytes: Uint8Array; ext: 'mp3' | 'ogg' } {
  if (!HAS_FFMPEG) return { bytes: ogg, ext: 'ogg' };
  const args = ['-v', 'error', '-i', 'pipe:0', '-map_metadata', '-1', '-ac', '1', '-ar', '44100'];
  args.push('-b:a', bitrate, '-fflags', '+bitexact', '-flags:a', '+bitexact', '-f', 'mp3', 'pipe:1');
  const run = spawnSync('ffmpeg', args, { input: ogg, maxBuffer: 64 * 1024 * 1024 });
  if (run.status !== 0 || run.stdout.length === 0) {
    throw new Error(`ffmpeg failed: ${run.stderr.toString()}`);
  }
  return { bytes: new Uint8Array(run.stdout), ext: 'mp3' };
}

// ---------------------------------------------------------------------------------------------
// Manifest building
// ---------------------------------------------------------------------------------------------

const manifest: BuiltinManifest = { version: 1, images: {}, tilesets: {}, sounds: {} };
const writeOut = (rel: string, bytes: Uint8Array): void => {
  const file = path.join(OUT, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, bytes);
};
const stem = (key: string): string => key.slice(key.indexOf('/') + 1);

interface ImageMeta {
  category: ImageCategory;
  theme: AssetTheme;
  name: string;
  fps?: number;
}

function addImage(src: SourceId | 'original', key: string, frames: Img[], meta: ImageMeta): void {
  const first = frames[0];
  if (!first) throw new Error(`${key}: no frames`);
  if (frames.some((f) => f.w !== first.w || f.h !== first.h)) throw new Error(`${key}: frame sizes differ`);
  const file = `img/${stem(key)}.png`;
  writeOut(file, encodePng(hcat(frames)));
  const entry: BuiltinImage = {
    file,
    w: first.w,
    h: first.h,
    frames: frames.length,
    fps: meta.fps ?? 8,
    category: meta.category,
    theme: meta.theme,
    name: meta.name,
  };
  manifest.images[key] = entry;
  credit(src, key);
}

/** Tile spec: "<index><flag>" where flag is s (solid), o (one-way) or - (passable). */
function addTileset(
  src: SourceId,
  key: string,
  spec: string,
  tile: (index: number) => Img,
  meta: { theme: AssetTheme; name: string },
): void {
  const tiles = spec
    .trim()
    .split(/\s+/)
    .map((t) => {
      const m = /^(\d+)([so-])$/.exec(t);
      if (!m) throw new Error(`${key}: bad tile spec "${t}"`);
      return { index: Number(m[1]), flag: m[2] };
    });
  const columns = 8;
  const size = 32;
  const sheet = blank(columns * size, Math.ceil(tiles.length / columns) * size);
  tiles.forEach((t, i) => {
    const img = tile(t.index);
    if (img.w !== size || img.h !== size) throw new Error(`${key}: tile ${t.index} is ${img.w}x${img.h}`);
    blit(sheet, img, (i % columns) * size, Math.floor(i / columns) * size);
  });
  const file = `tiles/${stem(key)}.png`;
  writeOut(file, encodePng(sheet));
  const entry: BuiltinTileset = {
    file,
    tileSize: size,
    columns,
    count: tiles.length,
    solid: tiles.map((t) => t.flag === 's'),
    oneWay: tiles.map((t) => t.flag === 'o'),
    theme: meta.theme,
    name: meta.name,
  };
  manifest.tilesets[key] = entry;
  credit(src, key);
}

function addSound(
  src: SourceId,
  key: string,
  ogg: Uint8Array,
  meta: { category: BuiltinSound['category']; name: string },
): void {
  const { bytes, ext } = encodeAudio(ogg, meta.category === 'music' ? '64k' : '96k');
  const file = `sfx/${key.startsWith('builtin:music/') ? 'music_' : ''}${stem(key)}.${ext}`;
  writeOut(file, bytes);
  manifest.sounds[key] = { file, duration: oggDuration(ogg), category: meta.category, name: meta.name };
  credit(src, key);
}

// ---------------------------------------------------------------------------------------------
// Asset selection
// ---------------------------------------------------------------------------------------------

async function buildImages(): Promise<void> {
  const pngs = (n: string): boolean => n.endsWith('.png');
  const platformer = await openPack('platformer', pngs);
  const food = await openPack('food', pngs);
  const dungeon = await openPack('dungeon', pngs);
  const town = await openPack('town', pngs);
  const ui = await openPack('ui', pngs);

  const pp = new Sheet18(new Sheet(platformer.get('Tilemap/tilemap_packed.png'), 18));
  const ppChars = new Sheet(platformer.get('Tilemap/tilemap-characters_packed.png'), 24);
  const ppBg = new Sheet(platformer.get('Tilemap/tilemap-backgrounds_packed.png'), 24);
  const fd = new Sheet18(new Sheet(food.get('Tilemap/tilemap_packed.png'), 18));
  const td = new Sheet(dungeon.get('Tilemap/tilemap_packed.png'), 16);
  const tt = new Sheet(town.get('Tilemap/tilemap_packed.png'), 16);
  const uiSheet = new Sheet(ui.get('Tilesheets/Large tiles/Thick outline/tilemap_packed.png'), 32);

  const ppS = (i: number): Img => scale(pp.sprite16(i), 2);
  const ppT = (i: number): Img => scale(pp.tile16(i), 2);
  const chr = (i: number): Img => resize(ppChars.cell(i), 32, 32);
  const tdS = (i: number): Img => scale(td.cell(i), 2);
  const ttS = (i: number): Img => scale(tt.cell(i), 2);
  /** Two-frame idle/walk bob for single-frame top-down sprites (1 source pixel up). */
  const bob = (cell: Img): Img[] => [scale(cell, 2), scale(shift(cell, 0, -1), 2)];

  /** [key, frames, meta, source (defaults to the group's pack)] */
  type Def = [key: string, frames: () => Img[], meta: ImageMeta, src?: SourceId | 'original'];
  const P = 'platformer',
    T = 'topdown',
    C = 'clicker',
    A = 'any';

  const platformerDefs: Def[] = [
    ['builtin:img/hero', () => [chr(0)], { category: 'character', theme: P, name: 'Hero (green alien)' }],
    [
      'builtin:img/hero_walk',
      () => [chr(0), chr(1)],
      { category: 'character', theme: P, name: 'Hero walk', fps: 6 },
    ],
    ['builtin:img/hero_jump', () => [chr(1)], { category: 'character', theme: P, name: 'Hero jump' }],
    [
      'builtin:img/alien_blue',
      () => [chr(2), chr(3)],
      { category: 'character', theme: P, name: 'Blue alien', fps: 6 },
    ],
    [
      'builtin:img/alien_pink',
      () => [chr(4), chr(5)],
      { category: 'character', theme: P, name: 'Pink alien', fps: 6 },
    ],
    [
      'builtin:img/alien_yellow',
      () => [chr(6), chr(7)],
      { category: 'character', theme: P, name: 'Yellow alien', fps: 6 },
    ],
    ['builtin:img/slime', () => [chr(18), chr(19)], { category: 'enemy', theme: P, name: 'Slime', fps: 4 }],
    [
      'builtin:img/bee',
      () => [chr(24), chr(25), chr(26)],
      { category: 'enemy', theme: P, name: 'Bee', fps: 10 },
    ],
    [
      'builtin:img/spiky',
      () => [chr(15), chr(16)],
      { category: 'enemy', theme: P, name: 'Spiky bot', fps: 4 },
    ],
    [
      'builtin:img/block_monster',
      () => [chr(11), chr(12)],
      { category: 'enemy', theme: P, name: 'Angry block', fps: 2 },
    ],
    ['builtin:img/coin', () => [ppS(151), ppS(152)], { category: 'item', theme: P, name: 'Coin', fps: 4 }],
    ['builtin:img/gem', () => [ppS(67)], { category: 'item', theme: P, name: 'Gem' }],
    ['builtin:img/heart', () => [ppS(44)], { category: 'item', theme: P, name: 'Heart' }],
    ['builtin:img/heart_half', () => [ppS(45)], { category: 'ui', theme: P, name: 'Half heart' }],
    ['builtin:img/heart_empty', () => [ppS(46)], { category: 'ui', theme: P, name: 'Empty heart' }],
    ['builtin:img/key', () => [ppS(27)], { category: 'item', theme: P, name: 'Key' }],
    [
      'builtin:img/flag',
      () => [ppS(111), ppS(112)],
      { category: 'prop', theme: P, name: 'Goal flag', fps: 3 },
    ],
    ['builtin:img/spikes', () => [ppS(68)], { category: 'prop', theme: P, name: 'Spikes' }],
    ['builtin:img/crate', () => [ppT(26)], { category: 'prop', theme: P, name: 'Crate' }],
    ['builtin:img/spring', () => [ppS(107)], { category: 'prop', theme: P, name: 'Spring' }],
    ['builtin:img/door', () => [vcat([ppT(130), ppT(150)])], { category: 'prop', theme: P, name: 'Door' }],
    [
      'builtin:img/platform',
      () => [hcat([ppT(48), ppT(49), ppT(50)])],
      { category: 'prop', theme: P, name: 'Platform' },
    ],
    ['builtin:img/sign', () => [ppS(86)], { category: 'prop', theme: P, name: 'Sign' }],
    ['builtin:img/mushroom', () => [ppS(128)], { category: 'item', theme: P, name: 'Mushroom' }],
    ['builtin:img/lever', () => [ppS(64), ppS(66)], { category: 'prop', theme: P, name: 'Lever', fps: 2 }],
  ];

  const bgStrip = (a: number, b: number): Img =>
    scale(
      vcat([0, 1, 2].map((row) => hcat([0, 1, 2, 3, 4, 5].map((i) => ppBg.cell(row * 8 + (i % 2 ? b : a)))))),
      8,
    );
  const scatter = (pick: readonly number[], sheet: Sheet, w: number, h: number): Img => {
    let seed = 1234567;
    const rand = (): number => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const out = blank(w, h);
    for (let y = 0; y < h; y += 32)
      for (let x = 0; x < w; x += 32)
        blit(out, scale(sheet.cell(pick[Math.floor(rand() * pick.length)] ?? 0), 2), x, y);
    return out;
  };
  const backgroundDefs: Def[] = [
    ['builtin:img/bg_sky', () => [bgStrip(0, 2)], { category: 'background', theme: P, name: 'Sky' }],
    [
      'builtin:img/bg_hills',
      () => [bgStrip(6, 7)],
      { category: 'background', theme: P, name: 'Green hills' },
    ],
    ['builtin:img/bg_desert', () => [bgStrip(4, 5)], { category: 'background', theme: P, name: 'Desert' }],
    [
      'builtin:img/bg_forest',
      () => [bgStrip(1, 3)],
      { category: 'background', theme: P, name: 'Pale forest' },
    ],
    [
      'builtin:img/bg_dungeon',
      () => [scatter([40], td, 960, 544)],
      { category: 'background', theme: T, name: 'Dungeon wall' },
      'dungeon',
    ],
    [
      'builtin:img/bg_grass',
      () => [scatter([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2], tt, 960, 544)],
      { category: 'background', theme: T, name: 'Meadow' },
      'town',
    ],
  ];

  const topdownDefs: Def[] = [
    ['builtin:img/knight', () => [tdS(96)], { category: 'character', theme: T, name: 'Knight' }],
    [
      'builtin:img/knight_walk',
      () => bob(td.cell(96)),
      { category: 'character', theme: T, name: 'Knight walk', fps: 6 },
    ],
    [
      'builtin:img/wizard',
      () => bob(td.cell(84)),
      { category: 'character', theme: T, name: 'Wizard', fps: 4 },
    ],
    [
      'builtin:img/ranger',
      () => bob(td.cell(112)),
      { category: 'character', theme: T, name: 'Ranger', fps: 4 },
    ],
    [
      'builtin:img/princess',
      () => bob(td.cell(99)),
      { category: 'character', theme: T, name: 'Princess', fps: 4 },
    ],
    ['builtin:img/ghost', () => bob(td.cell(121)), { category: 'enemy', theme: T, name: 'Ghost', fps: 3 }],
    ['builtin:img/bat', () => bob(td.cell(120)), { category: 'enemy', theme: T, name: 'Bat', fps: 6 }],
    ['builtin:img/spider', () => bob(td.cell(122)), { category: 'enemy', theme: T, name: 'Spider', fps: 6 }],
    ['builtin:img/crab', () => bob(td.cell(110)), { category: 'enemy', theme: T, name: 'Crab', fps: 4 }],
    [
      'builtin:img/cyclops',
      () => bob(td.cell(109)),
      { category: 'enemy', theme: T, name: 'Cyclops', fps: 3 },
    ],
    ['builtin:img/goo', () => bob(td.cell(108)), { category: 'enemy', theme: T, name: 'Green goo', fps: 3 }],
    ['builtin:img/chest', () => [tdS(89)], { category: 'item', theme: T, name: 'Chest' }],
    ['builtin:img/chest_open', () => [tdS(91)], { category: 'item', theme: T, name: 'Open chest' }],
    ['builtin:img/potion', () => [tdS(115)], { category: 'item', theme: T, name: 'Red potion' }],
    ['builtin:img/potion_blue', () => [tdS(116)], { category: 'item', theme: T, name: 'Blue potion' }],
    ['builtin:img/sword', () => [tdS(104)], { category: 'item', theme: T, name: 'Sword' }],
    ['builtin:img/shield', () => [tdS(102)], { category: 'item', theme: T, name: 'Shield' }],
    ['builtin:img/axe', () => [tdS(118)], { category: 'item', theme: T, name: 'Axe' }],
    ['builtin:img/tree', () => [ttS(16)], { category: 'prop', theme: T, name: 'Tree' }, 'town'],
    ['builtin:img/pine', () => [ttS(4)], { category: 'prop', theme: T, name: 'Pine tree' }, 'town'],
    ['builtin:img/bush', () => [ttS(5)], { category: 'prop', theme: T, name: 'Bush' }, 'town'],
    ['builtin:img/barrel', () => [tdS(82)], { category: 'prop', theme: T, name: 'Barrel' }],
    ['builtin:img/bomb', () => [ttS(105)], { category: 'item', theme: T, name: 'Bomb' }, 'town'],
    ['builtin:img/arrow', () => [ttS(119)], { category: 'projectile', theme: T, name: 'Arrow' }, 'town'],
  ];

  const uiCell = (i: number): Img => uiSheet.cell(i);
  const button = (i: number): Img => nineSlice(uiCell(i), 8, 96, 32);
  const anyDefs: Def[] = [
    ['builtin:img/button', () => [button(33)], { category: 'ui', theme: A, name: 'Red button' }],
    ['builtin:img/button_green', () => [button(34)], { category: 'ui', theme: A, name: 'Green button' }],
    ['builtin:img/button_blue', () => [button(35)], { category: 'ui', theme: A, name: 'Blue button' }],
    [
      'builtin:img/banner',
      () => [hcat([uiCell(43), uiCell(44), uiCell(45)])],
      { category: 'ui', theme: A, name: 'Ribbon banner' },
    ],
    [
      'builtin:img/panel',
      () => [nineSlice(uiCell(0), 10, 128, 96)],
      { category: 'ui', theme: A, name: 'Panel' },
    ],
    [
      'builtin:img/panel_dark',
      () => [nineSlice(uiCell(3), 10, 128, 96)],
      { category: 'ui', theme: A, name: 'Dark panel' },
    ],
    ['builtin:img/slot', () => [uiCell(1)], { category: 'ui', theme: A, name: 'Item slot' }],
    [
      'builtin:img/star',
      () => [scale(ORIGINAL_STAR, 2)],
      { category: 'item', theme: A, name: 'Star' },
      'original',
    ],
    [
      'builtin:img/bullet',
      () => [scale(ORIGINAL_BULLET, 2)],
      { category: 'projectile', theme: A, name: 'Bullet' },
      'original',
    ],
    [
      'builtin:img/fireball',
      () => [scale(originalFireball(0), 2), scale(originalFireball(1), 2)],
      { category: 'projectile', theme: A, name: 'Fireball', fps: 10 },
      'original',
    ],
    [
      'builtin:img/rock',
      () => [scale(originalRock(), 2)],
      { category: 'prop', theme: A, name: 'Rock' },
      'original',
    ],
  ];

  const clickerDefs: Def[] = [
    [
      'builtin:img/cookie',
      () => [scale(originalCookie(), 8)],
      { category: 'item', theme: C, name: 'Big cookie' },
      'original',
    ],
    [
      'builtin:img/coin_big',
      () => [scale(pp.sprite16(151), 4)],
      { category: 'item', theme: C, name: 'Big coin' },
      'platformer',
    ],
    [
      'builtin:img/donut',
      () => [scale(fd.sprite16(14), 8)],
      { category: 'item', theme: C, name: 'Big donut' },
    ],
    [
      'builtin:img/cream',
      () => [scale(fd.sprite16(108), 2)],
      { category: 'item', theme: C, name: 'Whipped cream' },
    ],
  ];

  const groups: [SourceId, Def[]][] = [
    ['platformer', platformerDefs],
    ['platformer', backgroundDefs],
    ['dungeon', topdownDefs],
    ['ui', anyDefs],
    ['food', clickerDefs],
  ];
  for (const [pack, defs] of groups)
    for (const [key, frames, meta, src] of defs) addImage(src ?? pack, key, frames(), meta);

  // Tilesets ------------------------------------------------------------------------------------
  addTileset(
    'platformer',
    'builtin:tiles/grass',
    `0s 1s 2s 3s 20s 21s 22s 23s 4s 5s 24s 25s 120s 121s 122s 123s 140s 141s 142s 143s
     40s 41s 42s 43s 60s 61s 62s 63s 80s 81s 82s 83s 100s 101s 102s 103s 104s
     6s 26s 47s 9s 10s 11s 28s 29s 30s 31s
     48o 49o 50o 146o 147o 153o 154o 155o 156o 90o 91o 92o 12o 13o 14o 15o 32- 52- 72-
     93s 94s 113s 114s 95s 115s 135s 132s 133s 134s
     33- 34- 35- 53- 54- 55- 73- 74- 75-
     16- 36- 56- 76- 17- 18- 19- 37- 38- 39- 57- 58- 59- 77- 78- 79-
     96- 97- 98- 99- 116- 117- 118- 119- 136- 137- 138- 139-
     51- 71- 89- 109- 69- 70- 105- 106- 84- 85- 86- 87- 88- 64- 65- 66-
     124- 125- 126- 127- 128- 129- 144- 145- 148- 149- 110- 130- 150- 7- 8- 68-`,
    ppT,
    { theme: 'platformer', name: 'Grassland' },
  );
  addTileset(
    'food',
    'builtin:tiles/candy',
    `0s 1s 2s 3s 16s 17s 18s 19s 32s 33s 34s 35s 48s 49s 50s 51s 64s 65s 66s 67s
     4s 5s 6s 7s 20s 21s 22s 23s 36s 37s 38s 39s 52s 53s 54s 55s 68s 69s 70s 71s
     72o 73o 74o 26s 27s 28s 10s 11s 12s 58s 59s 60s 75s 76s 61s 62s 63s 77s 78s 79s
     29o 30o 31o 45o 46o 47o 24- 40- 56- 41- 57- 25- 80- 81- 96- 97-`,
    (i) => scale(fd.tile16(i), 2),
    { theme: 'platformer', name: 'Candy land' },
  );
  addTileset(
    'dungeon',
    'builtin:tiles/dungeon',
    `0- 1- 3- 12- 13- 15- 24- 25- 27- 48- 49- 50- 51- 52- 53- 30- 42- 36- 37- 38- 39- 41-
     2s 14s 26s 4s 5s 16s 17s 6s 18s 7s 8s 19s 20s 28s 29s 40s 57s 58s 59s
     9s 10s 11s 21s 22- 23s 33s 34s 35s 45s 46s 47s 31s 32s 43s 44s 54s 55s 56s
     63s 75s 64s 65s 66s 72s 73- 74s 76s 77s 78s 82s 67- 68- 79- 80- 69- 70- 71- 81- 83- 93- 94- 95-`,
    tdS,
    { theme: 'topdown', name: 'Dungeon' },
  );
  addTileset(
    'town',
    'builtin:tiles/town',
    `0- 1- 2- 12- 13- 14- 24- 25- 26- 36- 37- 38- 39- 40- 41- 42- 43- 17- 29-
     3s 4s 5s 15s 16s 27s 28s 6s 7s 8s 18s 19s 20s 30s 31s 32s 9s 10s 11s 21s 22s 23s 33s 34s 35s
     44s 45s 46s 47s 56s 57s 58s 59s 68s 69s 70s 71s 80s 81s 82s 83s
     48s 49s 50s 51s 52s 53s 54s 55s 60s 61s 62s 63s 64s 65s 66s 67s
     72s 73s 74- 75s 76s 77s 78- 79s 84s 85- 86- 87- 88s 89- 90- 91- 92s
     96- 97- 98- 108- 109- 110- 120- 121- 122- 99s 100s 101s 102s 103- 111s 112s 113- 114- 123s 124- 125- 126s`,
    ttS,
    { theme: 'topdown', name: 'Town' },
  );
}

async function buildSounds(): Promise<void> {
  const oggs = (n: string): boolean => n.endsWith('.ogg');
  const iface = await openPack('interface', oggs);
  const impact = await openPack('impact', oggs);
  const digital = await openPack('digital', oggs);
  const jingles = await openPack('jingles', oggs);
  const music = await openPack('chiptunes', oggs);

  const sfx: [Pack, string, string, string][] = [
    [digital, 'Audio/phaseJump1.ogg', 'builtin:sfx/jump', 'Jump'],
    [digital, 'Audio/pepSound3.ogg', 'builtin:sfx/coin', 'Coin'],
    [impact, 'Audio/impactPunch_medium_000.ogg', 'builtin:sfx/hit', 'Hit'],
    [iface, 'Audio/click_001.ogg', 'builtin:sfx/click', 'Click'],
    [jingles, 'Audio/8-Bit jingles/jingles_NES03.ogg', 'builtin:sfx/win', 'Win jingle'],
    [jingles, 'Audio/8-Bit jingles/jingles_NES00.ogg', 'builtin:sfx/lose', 'Lose jingle'],
    [digital, 'Audio/laser6.ogg', 'builtin:sfx/shoot', 'Shoot'],
    [digital, 'Audio/powerUp1.ogg', 'builtin:sfx/powerup', 'Power-up'],
    [digital, 'Audio/phaseJump3.ogg', 'builtin:sfx/bounce', 'Bounce'],
    [impact, 'Audio/impactPlank_medium_000.ogg', 'builtin:sfx/break', 'Break'],
    [impact, 'Audio/footstep_grass_000.ogg', 'builtin:sfx/step', 'Footstep'],
    [impact, 'Audio/impactSoft_medium_000.ogg', 'builtin:sfx/bump', 'Bump'],
    [iface, 'Audio/confirmation_001.ogg', 'builtin:sfx/select', 'Select'],
    [iface, 'Audio/error_001.ogg', 'builtin:sfx/error', 'Error'],
    [iface, 'Audio/drop_001.ogg', 'builtin:sfx/drop', 'Drop'],
    [digital, 'Audio/lowDown.ogg', 'builtin:sfx/hurt', 'Hurt'],
  ];
  for (const [pack, file, key, name] of sfx)
    addSound(pack.id, key, pack.get(file), { category: 'sfx', name });

  const tracks: [string, string, string][] = [
    ['Juhani Junkala [Chiptune Adventures] 1. Stage 1.ogg', 'builtin:music/adventure', 'Adventure (loop)'],
    ['Juhani Junkala [Chiptune Adventures] 4. Stage Select.ogg', 'builtin:music/chill', 'Chill (loop)'],
    ['Juhani Junkala [Chiptune Adventures] 2. Stage 2.ogg', 'builtin:music/action', 'Action (loop)'],
  ];
  for (const [file, key, name] of tracks)
    addSound('chiptunes', key, music.get(file), { category: 'music', name });
}

function licenseText(): string {
  const lines = [
    'StickWIX built-in assets',
    '========================',
    '',
    'Everything in this directory is public domain (CC0 1.0 Universal,',
    'https://creativecommons.org/publicdomain/zero/1.0/) and may be shipped inside exported games',
    'without attribution. Generated by scripts/fetch-builtin-assets.ts (`pnpm assets`).',
    'Sprites were sliced, upscaled nearest-neighbour, nine-sliced (buttons, panels) or given a 1px',
    'bob frame (top-down walk/idle animations); audio was transcoded to MP3.',
    '',
  ];
  for (const [id, src] of Object.entries(SOURCES) as [SourceId, Source][]) {
    const keys = usedBy.get(id);
    if (!keys?.length) continue;
    lines.push(`${src.title} by ${src.author}`);
    lines.push(`  Page:     ${src.page}`);
    lines.push(`  Download: ${src.url}`);
    lines.push('  Licence:  CC0 1.0 Universal (stated on the page and in the pack licence file)');
    lines.push(`  Used for: ${keys.join(', ')}`);
    lines.push('');
  }
  const own = usedBy.get('original') ?? [];
  lines.push('Original StickWIX pixel art (drawn in scripts/fetch-builtin-assets.ts)');
  lines.push('  Licence:  CC0 1.0 Universal');
  lines.push(`  Used for: ${own.join(', ')}`);
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------
// Contact sheet (review aid)
// ---------------------------------------------------------------------------------------------

const DIGITS = [
  '111101101101111',
  '010110010010111',
  '111001111100111',
  '111001111001111',
  '101101111001001',
].concat(['111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111']);

function drawNumber(img: Img, n: number, x: number, y: number): void {
  [...String(n)].forEach((ch, i) => {
    const glyph = DIGITS[Number(ch)] ?? '';
    for (let gy = 0; gy < 5; gy++)
      for (let gx = 0; gx < 3; gx++)
        if (glyph[gy * 3 + gx] === '1')
          for (let q = 0; q < 4; q++)
            setPx(img, x + i * 8 + gx * 2 + (q & 1), y + gy * 2 + (q >> 1), [255, 230, 0, 255]);
  });
}

function writeContactSheet(file: string): void {
  const items = [
    ...Object.entries(manifest.images).map(([key, e]) => ({ key, file: e.file, w: e.w })),
    ...Object.entries(manifest.tilesets).map(([key, e]) => ({ key, file: e.file, w: e.tileSize })),
  ];
  const W = 1600;
  const placed: { img: Img; x: number; y: number; n: number }[] = [];
  let x = 8,
    y = 8,
    rowH = 0;
  items.forEach((item, n) => {
    const raw = decodePng(readFileSync(path.join(OUT, item.file)));
    // Zoom small sprites so they are reviewable; shrink full-screen backgrounds.
    const img = raw.w >= 512 ? resize(raw, raw.w / 4, raw.h / 4) : scale(raw, 2);
    if (x + img.w + 8 > W) {
      x = 8;
      y += rowH + 22;
      rowH = 0;
    }
    placed.push({ img, x, y, n });
    console.log(`  #${n} ${item.key}`);
    x += img.w + 12;
    rowH = Math.max(rowH, img.h);
  });
  const sheet = mapPixels(W, y + rowH + 24, (px, py) => {
    const v = ((px >> 3) + (py >> 3)) % 2 ? 70 : 92;
    return [v, v, v + 14, 255];
  });
  for (const p of placed) {
    blit(sheet, p.img, p.x, p.y);
    drawNumber(sheet, p.n, p.x, p.y + p.img.h + 4);
  }
  writeFileSync(file, encodePng(sheet));
  console.log(`contact sheet: ${file}`);
}

// ---------------------------------------------------------------------------------------------

function dirSize(dir: string): number {
  return readdirSync(dir).reduce((sum, name) => {
    const p = path.join(dir, name);
    const st = statSync(p);
    return sum + (st.isDirectory() ? dirSize(p) : st.size);
  }, 0);
}

async function main(): Promise<void> {
  const contactIdx = process.argv.indexOf('--contact');
  const contact = contactIdx >= 0 ? process.argv[contactIdx + 1] : undefined;
  if (!HAS_FFMPEG) console.warn('ffmpeg not found: copying Ogg Vorbis audio without transcoding to MP3');

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  console.log('images + tilesets');
  await buildImages();
  console.log('sounds');
  await buildSounds();

  parseBuiltinManifest(manifest);
  writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(path.join(OUT, 'LICENSE.txt'), licenseText());

  const counts = `${Object.keys(manifest.images).length} images, ${Object.keys(manifest.tilesets).length} tilesets, ${Object.keys(manifest.sounds).length} sounds`;
  console.log(`wrote ${counts} (${(dirSize(OUT) / 1024).toFixed(0)} KiB) to ${path.relative(ROOT, OUT)}`);
  if (contact) writeContactSheet(path.resolve(contact));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
