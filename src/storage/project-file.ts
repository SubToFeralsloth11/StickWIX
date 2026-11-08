import { strFromU8, strToU8, unzipSync, zipSync, type Unzipped, type Zippable } from 'fflate';
import { z } from 'zod';
import { version as APP_VERSION } from '../../package.json';
import { newId } from '@/model/ids';
import { migrate, NewerVersionError } from '@/model/migrations';
import type { Asset, Project } from '@/model/schema';
import { putProjectWithAssets } from './db';

/** `.stickwix` project file (contracts/project-file.md): a zip of project.json, meta.json and assets/. */

export const PROJECT_FILE_FORMAT = 'stickwix';
export const PROJECT_FILE_VERSION = 1;

const NOT_STICKWIX = "This file isn't a StickWIX project.";
const NEWER = 'This project was made with a newer StickWIX. Update StickWIX to open it.';
const DAMAGED = "This project file is damaged and can't be opened.";

const Meta = z.object({ format: z.literal(PROJECT_FILE_FORMAT), formatVersion: z.number().int().min(1) });

const EXT: Record<string, string> = {
  'image/png': 'png',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/ogg': 'ogg',
};

function extension(asset: Asset): string {
  return EXT[asset.mime] ?? (asset.mime.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'bin');
}

/** Lower-case dash slug of a project name; falls back to `my-game`. */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return slug || 'my-game';
}

export function projectFileName(name: string): string {
  return `${slugify(name)}.stickwix`;
}

/** Zips the project document with every drawn/imported asset. Builtin assets travel by key only. */
export async function exportProjectFile(project: Project, getBlob: (assetId: string) => Promise<Blob | undefined>): Promise<Blob> {
  const files: Zippable = {
    'project.json': strToU8(JSON.stringify(project)),
    'meta.json': strToU8(
      JSON.stringify({ format: PROJECT_FILE_FORMAT, formatVersion: PROJECT_FILE_VERSION, app: APP_VERSION, exportedAt: new Date().toISOString() }),
    ),
  };
  for (const asset of project.assets) {
    if (asset.source === 'builtin') continue;
    const blob = await getBlob(asset.id);
    if (!blob) throw new Error(`The ${asset.kind} "${asset.name}" could not be read, so the project file was not made.`);
    // PNG/MP3/OGG are already compressed; storing them avoids wasted work.
    files[`assets/${asset.id}.${extension(asset)}`] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }];
  }
  return new Blob([zipSync(files)], { type: 'application/zip' });
}

function readJson(entries: Unzipped, name: string): unknown {
  const raw = entries[name];
  if (!raw) return undefined;
  return JSON.parse(strFromU8(raw));
}

/** Checks the file completely, then stores it as a new project. Throws a plain-English Error and writes nothing on any problem. */
export async function importProjectFile(file: Blob | ArrayBuffer): Promise<Project> {
  const bytes = new Uint8Array('arrayBuffer' in file ? await file.arrayBuffer() : file);

  let entries: Unzipped;
  let meta: unknown;
  try {
    entries = unzipSync(bytes);
    meta = readJson(entries, 'meta.json');
  } catch {
    throw new Error(NOT_STICKWIX);
  }
  const parsedMeta = Meta.safeParse(meta);
  if (!parsedMeta.success) throw new Error(NOT_STICKWIX);
  if (parsedMeta.data.formatVersion > PROJECT_FILE_VERSION) throw new Error(NEWER);

  let doc: Project;
  try {
    doc = migrate(readJson(entries, 'project.json'));
  } catch (e) {
    throw new Error(e instanceof NewerVersionError ? NEWER : DAMAGED);
  }

  const files = new Map<string, Uint8Array>();
  for (const [path, data] of Object.entries(entries)) {
    if (!path.startsWith('assets/')) continue;
    const name = path.slice('assets/'.length);
    const dot = name.lastIndexOf('.');
    files.set(dot > 0 ? name.slice(0, dot) : name, data);
  }
  const blobs: [string, Blob][] = [];
  for (const asset of doc.assets) {
    if (asset.source === 'builtin') continue;
    const data = files.get(asset.id);
    if (!data) throw new Error(`This project file is missing the ${asset.kind} "${asset.name}".`);
    blobs.push([asset.id, new Blob([data as Uint8Array<ArrayBuffer>], { type: asset.mime })]);
  }

  const project: Project = { ...doc, id: newId('p') };
  await putProjectWithAssets(project, blobs);
  return project;
}
