import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { newId, uniqueName } from '@/model/ids';
import { migrate } from '@/model/migrations';
import type { Project } from '@/model/schema';

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: string;
}

interface ProjectRecord extends ProjectMeta {
  doc: Project;
}

interface AssetRecord {
  projectId: string;
  assetId: string;
  blob: Blob;
}

interface StickwixDB extends DBSchema {
  projects: { key: string; value: ProjectRecord; indexes: { updatedAt: string } };
  assets: { key: [string, string]; value: AssetRecord; indexes: { projectId: string } };
  prefs: { key: string; value: unknown };
}

const DB_NAME = 'stickwix';
const DB_VERSION = 1;
const PROJECT_NAME_MAX = 60;

let dbPromise: Promise<IDBPDatabase<StickwixDB>> | null = null;

function db(): Promise<IDBPDatabase<StickwixDB>> {
  dbPromise ??= openDB<StickwixDB>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      const projects = database.createObjectStore('projects', { keyPath: 'id' });
      projects.createIndex('updatedAt', 'updatedAt');
      const assets = database.createObjectStore('assets', { keyPath: ['projectId', 'assetId'] });
      assets.createIndex('projectId', 'projectId');
      database.createObjectStore('prefs');
    },
  });
  return dbPromise;
}

/** Closes the cached connection; the next call reopens it (used on version change and in tests). */
export function closeDb(): void {
  const pending = dbPromise;
  dbPromise = null;
  void pending?.then((d) => d.close()).catch(() => {});
}

const record = (doc: Project): ProjectRecord => ({ id: doc.id, name: doc.name, updatedAt: doc.updatedAt, doc });

/** All projects, newest `updatedAt` first, without their documents. */
export async function listProjects(): Promise<ProjectMeta[]> {
  const all = await (await db()).getAllFromIndex('projects', 'updatedAt');
  return all.reverse().map(({ id, name, updatedAt }) => ({ id, name, updatedAt }));
}

/** The stored document, migrated to the current schema. Throws `NewerVersionError` for newer files. */
export async function getProject(id: string): Promise<Project | undefined> {
  const rec = await (await db()).get('projects', id);
  return rec ? migrate(rec.doc) : undefined;
}

export async function putProject(doc: Project): Promise<void> {
  await (await db()).put('projects', record(doc));
}

export async function renameProject(id: string, name: string): Promise<void> {
  const tx = (await db()).transaction('projects', 'readwrite');
  const rec = await tx.store.get(id);
  if (!rec) throw new Error(`Project ${id} not found`);
  await tx.store.put(record({ ...rec.doc, name }));
  await tx.done;
}

/** Copies a project (new id, name "<name> copy", unique among projects) together with its asset blobs. */
export async function duplicateProject(id: string): Promise<Project> {
  const tx = (await db()).transaction(['projects', 'assets'], 'readwrite');
  const projects = tx.objectStore('projects');
  const assets = tx.objectStore('assets');
  const rec = await projects.get(id);
  if (!rec) throw new Error(`Project ${id} not found`);
  const taken = (await projects.getAll()).map((r) => r.name);
  const now = new Date().toISOString();
  const copy: Project = {
    ...structuredClone(rec.doc),
    id: newId('p'),
    name: uniqueName(`${rec.doc.name} copy`, taken, PROJECT_NAME_MAX),
    createdAt: now,
    updatedAt: now,
  };
  await projects.put(record(copy));
  for (const a of await assets.index('projectId').getAll(id)) await assets.put({ ...a, projectId: copy.id });
  await tx.done;
  return copy;
}

export async function deleteProject(id: string): Promise<void> {
  const tx = (await db()).transaction(['projects', 'assets'], 'readwrite');
  await tx.objectStore('projects').delete(id);
  const index = tx.objectStore('assets').index('projectId');
  for (let cursor = await index.openCursor(id); cursor; cursor = await cursor.continue()) await cursor.delete();
  await tx.done;
}

export async function putAsset(projectId: string, assetId: string, blob: Blob): Promise<void> {
  await (await db()).put('assets', { projectId, assetId, blob });
}

export async function getAsset(projectId: string, assetId: string): Promise<Blob | undefined> {
  return (await (await db()).get('assets', [projectId, assetId]))?.blob;
}

export async function deleteAsset(projectId: string, assetId: string): Promise<void> {
  await (await db()).delete('assets', [projectId, assetId]);
}

/** Asset ids that have a stored blob for the project. */
export async function listAssets(projectId: string): Promise<string[]> {
  const keys = await (await db()).getAllKeysFromIndex('assets', 'projectId', projectId);
  return keys.map(([, assetId]) => assetId);
}

/** App-wide preferences (e.g. `tourCompleted`), not tied to a project. */
export async function getPref<T = unknown>(key: string): Promise<T | undefined> {
  return (await (await db()).get('prefs', key)) as T | undefined;
}

export async function setPref(key: string, value: unknown): Promise<void> {
  await (await db()).put('prefs', value, key);
}
