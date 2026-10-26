import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { Blob as NodeBlob } from 'node:buffer';
import {
  closeDb,
  deleteAsset,
  deleteProject,
  duplicateProject,
  getAsset,
  getPref,
  getProject,
  listAssets,
  listProjects,
  putAsset,
  putProject,
  renameProject,
  setPref,
} from '@/storage/db';
import { newProject } from '@/model/defaults';

beforeEach(() => {
  closeDb();
  globalThis.indexedDB = new IDBFactory();
});

// jsdom's Blob cannot be structured-cloned or read; browsers store Blobs natively, Node's Blob behaves like them.
const blob = (text: string, type = '') => new NodeBlob([text], { type }) as unknown as Blob;

const at = (p: ReturnType<typeof newProject>, iso: string) => ({ ...p, updatedAt: iso });

async function blobText(b: Blob | undefined): Promise<string> {
  expect(b).toBeDefined();
  return new Response(b).text();
}

describe('projects', () => {
  it('creates and opens a project', async () => {
    const p = newProject('Alpha');
    await putProject(p);
    expect(await getProject(p.id)).toEqual(p);
    expect(await getProject('missing')).toBeUndefined();
  });

  it('lists projects newest first with metadata only', async () => {
    const a = at(newProject('A'), '2026-01-01T00:00:00.000Z');
    const b = at(newProject('B'), '2026-03-01T00:00:00.000Z');
    const c = at(newProject('C'), '2026-02-01T00:00:00.000Z');
    for (const p of [a, b, c]) await putProject(p);
    expect(await listProjects()).toEqual([
      { id: b.id, name: 'B', updatedAt: b.updatedAt },
      { id: c.id, name: 'C', updatedAt: c.updatedAt },
      { id: a.id, name: 'A', updatedAt: a.updatedAt },
    ]);
  });

  it('overwrites on put', async () => {
    const p = newProject('A');
    await putProject(p);
    await putProject({ ...p, name: 'A2' });
    expect((await listProjects()).map((x) => x.name)).toEqual(['A2']);
  });

  it('renames a project in both metadata and document', async () => {
    const p = newProject('Old');
    await putProject(p);
    await renameProject(p.id, 'New');
    expect((await getProject(p.id))?.name).toBe('New');
    expect((await listProjects())[0]?.name).toBe('New');
    await expect(renameProject('missing', 'x')).rejects.toThrow();
  });

  it('duplicates a project with a new id, unique name and copied assets', async () => {
    const p = newProject('Game');
    await putProject(p);
    await putAsset(p.id, 'a1', blob('png-bytes', 'image/png'));
    const copy = await duplicateProject(p.id);
    expect(copy.id).not.toBe(p.id);
    expect(copy.name).toBe('Game copy');
    expect(await getProject(copy.id)).toEqual(copy);
    expect(await blobText(await getAsset(copy.id, 'a1'))).toBe('png-bytes');

    const again = await duplicateProject(p.id);
    expect(again.name).toBe('Game copy 2');
    expect(await listProjects()).toHaveLength(3);
  });

  it('deletes a project and its assets only', async () => {
    const p = newProject('Doomed');
    const q = newProject('Keeper');
    await putProject(p);
    await putProject(q);
    await putAsset(p.id, 'a1', blob('x'));
    await putAsset(q.id, 'a1', blob('y'));
    await deleteProject(p.id);
    expect(await getProject(p.id)).toBeUndefined();
    expect(await listAssets(p.id)).toEqual([]);
    expect(await listAssets(q.id)).toEqual(['a1']);
    expect(await blobText(await getAsset(q.id, 'a1'))).toBe('y');
  });
});

describe('assets', () => {
  it('puts, gets, lists and deletes blobs per project', async () => {
    await putAsset('p1', 'img', blob('one'));
    await putAsset('p1', 'snd', blob('two'));
    await putAsset('p2', 'img', blob('three'));
    expect((await listAssets('p1')).sort()).toEqual(['img', 'snd']);
    expect(await blobText(await getAsset('p1', 'img'))).toBe('one');
    expect(await blobText(await getAsset('p2', 'img'))).toBe('three');
    await deleteAsset('p1', 'img');
    expect(await getAsset('p1', 'img')).toBeUndefined();
    expect(await listAssets('p1')).toEqual(['snd']);
  });
});

describe('prefs', () => {
  it('stores and reads app preferences', async () => {
    expect(await getPref('tourCompleted')).toBeUndefined();
    await setPref('tourCompleted', true);
    expect(await getPref('tourCompleted')).toBe(true);
  });
});
