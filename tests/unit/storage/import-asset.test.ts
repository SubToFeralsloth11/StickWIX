import { Blob as NodeBlob } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { checkImport, importAsset, ImportRejected, LIMITS } from '@/storage/import-asset';
import { getAsset } from '@/storage/db';
import { Asset } from '@/model/schema';

const MB = 1024 * 1024;

// jsdom's Blob cannot be structured-cloned into IndexedDB; Node's Blob behaves like a browser's.
function file(name: string, type: string, bytes = 16): File {
  return Object.assign(new NodeBlob([new Uint8Array(bytes)], { type }), { name }) as unknown as File;
}

const size = (width: number, height: number) => async () => ({ width, height });

describe('checkImport (FR-034)', () => {
  it('limits match the spec', () => {
    expect(LIMITS).toEqual({ imageBytes: 5 * MB, imageSide: 2048, soundBytes: 10 * MB });
  });

  it('accepts PNG pictures up to 5 MB and 2048×2048', () => {
    expect(checkImport({ name: 'a.png', type: 'image/png', size: 5 * MB }, { width: 2048, height: 2048 })).toEqual({ ok: true, kind: 'image' });
    expect(checkImport({ name: 'a.PNG', type: '', size: 10 })).toEqual({ ok: true, kind: 'image' });
  });

  it('rejects too-big pictures with the reason and the limit', () => {
    expect(checkImport({ name: 'a.png', type: 'image/png', size: 6.2 * MB })).toEqual({ ok: false, reason: 'That file is 6.2 MB. Pictures can be at most 5 MB.' });
    expect(checkImport({ name: 'a.png', type: 'image/png', size: 100 }, { width: 3000, height: 1200 })).toEqual({
      ok: false,
      reason: 'That picture is 3000×1200. Pictures can be at most 2048×2048.',
    });
    expect(checkImport({ name: 'a.png', type: 'image/png', size: 100 }, { width: 100, height: 2049 }).ok).toBe(false);
  });

  it('accepts WAV and MP3 sounds up to 10 MB', () => {
    for (const [name, type] of <[string, string][]>[['a.wav', 'audio/wav'], ['a.wav', 'audio/x-wav'], ['a.mp3', 'audio/mpeg'], ['b.MP3', ''], ['c.wav', 'application/octet-stream']])
      expect(checkImport({ name, type, size: 10 * MB })).toEqual({ ok: true, kind: 'sound' });
    expect(checkImport({ name: 'a.mp3', type: 'audio/mpeg', size: 12.5 * MB })).toEqual({ ok: false, reason: 'That file is 12.5 MB. Sounds can be at most 10 MB.' });
  });

  it('rejects other file types', () => {
    const reason = 'StickWIX can use PNG pictures and WAV or MP3 sounds.';
    for (const [name, type] of <[string, string][]>[['a.jpg', 'image/jpeg'], ['a.gif', 'image/gif'], ['a.ogg', 'audio/ogg'], ['notes.txt', 'text/plain'], ['noext', '']])
      expect(checkImport({ name, type, size: 10 })).toEqual({ ok: false, reason });
  });

  it('a spritesheet frame width must divide the picture width', () => {
    expect(checkImport({ name: 'a.png', type: 'image/png', size: 10 }, { width: 128, height: 32 }, 32)).toEqual({ ok: true, kind: 'image' });
    expect(checkImport({ name: 'a.png', type: 'image/png', size: 10 }, { width: 100, height: 32 }, 32)).toEqual({
      ok: false,
      reason: 'That picture is 100 pixels wide, which does not split evenly into frames 32 pixels wide.',
    });
  });
});

describe('importAsset', () => {
  it('imports a PNG as a one-frame image asset and stores the file', async () => {
    const asset = await importAsset('p1', file('Gold Coin.png', 'image/png'), { decodeImage: size(40, 30) });
    expect(Asset.parse(asset)).toEqual(asset);
    expect(asset).toMatchObject({ name: 'Gold Coin', kind: 'image', source: 'imported', mime: 'image/png', frames: { w: 40, h: 30, count: 1, fps: 8 } });
    expect(asset.id).toBeTruthy();
    expect((await getAsset('p1', asset.id))?.size).toBe(16);
  });

  it('splits a spritesheet into frames by frame width', async () => {
    const asset = await importAsset('p1', file('walk.png', 'image/png'), { decodeImage: size(128, 32), frameWidth: 32 });
    expect(asset.kind === 'image' && asset.frames).toEqual({ w: 32, h: 32, count: 4, fps: 8 });
    await expect(importAsset('p1', file('walk.png', 'image/png'), { decodeImage: size(100, 32), frameWidth: 32 })).rejects.toThrow(/does not split evenly/);
  });

  it('never resizes: an oversized picture is rejected and nothing is stored', async () => {
    const err = await importAsset('p1', file('big.png', 'image/png'), { decodeImage: size(3000, 1200) }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ImportRejected);
    expect((err as Error).message).toBe('That picture is 3000×1200. Pictures can be at most 2048×2048.');
    await expect(importAsset('p1', file('huge.png', 'image/png', 6.2 * MB), { decodeImage: size(10, 10) })).rejects.toThrow('That file is 6.2 MB. Pictures can be at most 5 MB.');
  });

  it('rejects a picture that cannot be opened', async () => {
    const decodeImage = () => Promise.reject(new Error('bad'));
    await expect(importAsset('p1', file('x.png', 'image/png'), { decodeImage })).rejects.toThrow(ImportRejected);
  });

  it('imports WAV/MP3 sounds with their duration and a unique name', async () => {
    const asset = await importAsset('p1', file('jump.mp3', 'audio/mpeg'), { decodeDuration: async () => 1.25, takenNames: ['jump'] });
    expect(Asset.parse(asset)).toEqual(asset);
    expect(asset).toMatchObject({ name: 'jump 2', kind: 'sound', source: 'imported', mime: 'audio/mpeg', duration: 1.25 });
    const wav = await importAsset('p1', file('boom.wav', ''), { decodeDuration: async () => 0 });
    expect(wav).toMatchObject({ kind: 'sound', mime: 'audio/wav', duration: 0 });
    expect(await getAsset('p1', wav.id)).toBeTruthy();
  });

  it('rejects other types before reading them', async () => {
    await expect(importAsset('p1', file('pic.jpg', 'image/jpeg'))).rejects.toThrow('StickWIX can use PNG pictures and WAV or MP3 sounds.');
  });
});
