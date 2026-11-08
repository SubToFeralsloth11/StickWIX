import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { Blob as NodeBlob } from 'node:buffer';
import { strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { Project, type ProjectInput } from '@/model/schema';
import { closeDb, getAsset, getProject, listAssets, listProjects, putAsset, putProject } from '@/storage/db';
import { exportProjectFile, importProjectFile, projectFileName } from '@/storage/project-file';
import { project as build } from '../../fixtures/build';

// jsdom's Blob cannot be structured-cloned into IndexedDB; Node's Blob behaves like the browser's.
vi.stubGlobal('Blob', NodeBlob);

beforeEach(() => {
  closeDb();
  globalThis.indexedDB = new IDBFactory();
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const WAV = new Uint8Array([0x52, 0x49, 0x46, 0x46, 9, 8, 7]);

function sample(): Project {
  const base = build({ kinds: [{ id: 'hero', lookId: 'a-drawn' }], objects: [{ id: 'o1', kind: 'hero', x: 10, y: 20 }] });
  return Project.parse({
    ...base,
    id: 'p-orig',
    name: 'My Cool Game!',
    assets: [
      { id: 'a-drawn', name: 'Hero', kind: 'image', source: 'drawn', frames: { w: 16, h: 16, count: 2, fps: 8 }, mime: 'image/png' },
      { id: 'a-snd', name: 'Boop', kind: 'sound', source: 'imported', duration: 0.5, mime: 'audio/wav' },
      { id: 'builtin:img/hero', name: 'Builtin hero', kind: 'image', source: 'builtin', frames: { w: 32, h: 32, count: 1, fps: 8 } },
    ],
  } satisfies ProjectInput);
}

const blobs: Record<string, Uint8Array> = { 'a-drawn': PNG, 'a-snd': WAV };
const getBlob = async (id: string) => (blobs[id] ? (new NodeBlob([blobs[id]!]) as unknown as Blob) : undefined);

async function bytes(b: Blob | undefined) {
  expect(b).toBeDefined();
  return new Uint8Array(await b!.arrayBuffer());
}

function zip(files: Record<string, string | Uint8Array>): Uint8Array {
  const z: Zippable = {};
  for (const [k, v] of Object.entries(files)) z[k] = typeof v === 'string' ? strToU8(v) : v;
  return zipSync(z);
}

const META = JSON.stringify({ format: 'stickwix', formatVersion: 1, app: '0.1.0', exportedAt: '2026-01-01T00:00:00Z' });

async function expectNothingWritten() {
  expect(await listProjects()).toEqual([]);
}

describe('project file export', () => {
  it('names the file after the project', () => {
    expect(projectFileName('My Cool Game!')).toBe('my-cool-game.stickwix');
    expect(projectFileName('   ')).toBe('my-game.stickwix');
  });

  it('zips project.json, meta.json and every non-builtin asset', async () => {
    const file = await exportProjectFile(sample(), getBlob);
    const entries = unzipSync(await bytes(file));
    expect(Object.keys(entries).sort()).toEqual(['assets/a-drawn.png', 'assets/a-snd.wav', 'meta.json', 'project.json']);
    const meta = JSON.parse(new TextDecoder().decode(entries['meta.json']));
    expect(meta).toMatchObject({ format: 'stickwix', formatVersion: 1, app: expect.any(String) });
    expect(Number.isNaN(Date.parse(meta.exportedAt))).toBe(false);
    expect(entries['assets/a-drawn.png']).toEqual(PNG);
  });

  it('refuses to export when an asset blob cannot be read', async () => {
    await expect(exportProjectFile(sample(), async () => undefined)).rejects.toThrow(/Hero/);
  });
});

describe('project file import (FR-036)', () => {
  it('round trips identically, except for a new project id', async () => {
    const original = sample();
    const file = await exportProjectFile(original, getBlob);
    const imported = await importProjectFile(file);
    expect(imported.id).not.toBe(original.id);
    expect(imported).toEqual({ ...original, id: imported.id });
    expect(await getProject(imported.id)).toEqual(imported);
    expect((await listAssets(imported.id)).sort()).toEqual(['a-drawn', 'a-snd']);
    expect(await bytes(await getAsset(imported.id, 'a-drawn'))).toEqual(PNG);
    const snd = await getAsset(imported.id, 'a-snd');
    expect(await bytes(snd)).toEqual(WAV);
    expect(snd!.type).toBe('audio/wav');
  });

  it('never overwrites: importing the same file twice gives two projects', async () => {
    await putProject(sample());
    await putAsset('p-orig', 'a-drawn', new NodeBlob([new Uint8Array([7])]) as unknown as Blob);
    const file = await exportProjectFile(sample(), getBlob);
    const a = await importProjectFile(file);
    const b = await importProjectFile(await file.arrayBuffer());
    expect(new Set([a.id, b.id, 'p-orig']).size).toBe(3);
    expect(await listProjects()).toHaveLength(3);
    expect(await bytes(await getAsset('p-orig', 'a-drawn'))).toEqual(new Uint8Array([7]));
  });

  const doc = JSON.stringify(sample());
  const assets = { 'assets/a-drawn.png': PNG, 'assets/a-snd.wav': WAV };
  const bad: [string, () => Uint8Array, RegExp][] = [
    ['a file that is not a zip', () => strToU8('hello, not a zip at all'), /isn't a StickWIX project/],
    ['a zip without meta.json', () => zip({ 'project.json': doc, ...assets }), /isn't a StickWIX project/],
    ['a zip of another format', () => zip({ 'meta.json': JSON.stringify({ format: 'other', formatVersion: 1 }), 'project.json': doc, ...assets }), /isn't a StickWIX project/],
    ['unreadable meta.json', () => zip({ 'meta.json': '{oops', 'project.json': doc, ...assets }), /isn't a StickWIX project/],
    ['a newer format version', () => zip({ 'meta.json': JSON.stringify({ format: 'stickwix', formatVersion: 2 }), 'project.json': doc, ...assets }), /newer StickWIX/],
    ['a newer schema version', () => zip({ 'meta.json': META, 'project.json': JSON.stringify({ ...sample(), schemaVersion: 99 }), ...assets }), /newer StickWIX/],
    ['a missing project.json', () => zip({ 'meta.json': META, ...assets }), /damaged/],
    ['a project that fails the schema', () => zip({ 'meta.json': META, 'project.json': JSON.stringify({ ...sample(), startSceneId: 'nope' }), ...assets }), /damaged/],
    ['project.json that is not JSON', () => zip({ 'meta.json': META, 'project.json': '{"id":', ...assets }), /damaged/],
    ['a missing asset file', () => zip({ 'meta.json': META, 'project.json': doc, 'assets/a-drawn.png': PNG }), /missing.*Boop/],
  ];

  for (const [what, make, message] of bad)
    it(`rejects ${what} and writes nothing`, async () => {
      await expect(importProjectFile(make().buffer as ArrayBuffer)).rejects.toThrow(message);
      await expectNothingWritten();
    });

  it('accepts a Blob', async () => {
    const p = await importProjectFile(new NodeBlob([zip({ 'meta.json': META, 'project.json': doc, ...assets })]) as unknown as Blob);
    expect(p.name).toBe('My Cool Game!');
  });
});
