import { newId, uniqueName } from '@/model/ids';
import type { Asset } from '@/model/schema';
import { putAsset } from './db';

/**
 * Importing the user's own pictures and sounds (FR-034). Files over a limit
 * are rejected with the reason and the limit — never silently resized.
 */

const MB = 1024 * 1024;
export const LIMITS = { imageBytes: 5 * MB, imageSide: 2048, soundBytes: 10 * MB };

const WRONG_TYPE = 'StickWIX can use PNG pictures and WAV or MP3 sounds.';

export interface FileInfo {
  name: string;
  type: string;
  size: number;
}

export type ImportCheck = { ok: true; kind: 'image' | 'sound' } | { ok: false; reason: string };

/** A file StickWIX refuses to import; `message` is shown to the user. */
export class ImportRejected extends Error {
  override name = 'ImportRejected';
}

type Format = { kind: 'image' | 'sound'; mime: string };

function formatOf(file: FileInfo): Format | null {
  const ext = /\.([^.]+)$/.exec(file.name)?.[1]?.toLowerCase();
  if (file.type === 'image/png' || ext === 'png') return { kind: 'image', mime: 'image/png' };
  if (file.type === 'audio/mpeg' || file.type === 'audio/mp3' || ext === 'mp3') return { kind: 'sound', mime: 'audio/mpeg' };
  if (file.type === 'audio/wav' || file.type === 'audio/x-wav' || file.type === 'audio/wave' || ext === 'wav') return { kind: 'sound', mime: 'audio/wav' };
  return null;
}

/** Megabytes with one decimal, rounded up so an over-limit size never prints as the limit. */
function mb(bytes: number): string {
  return (Math.ceil((bytes / MB) * 10 - 1e-9) / 10).toFixed(1).replace(/\.0$/, '');
}

/**
 * Checks type and size, and (for pictures, once decoded) dimensions and an
 * optional spritesheet frame width.
 */
export function checkImport(file: FileInfo, dims?: { width: number; height: number }, frameWidth?: number): ImportCheck {
  const format = formatOf(file);
  if (!format) return { ok: false, reason: WRONG_TYPE };
  if (format.kind === 'sound') {
    if (file.size > LIMITS.soundBytes) return { ok: false, reason: `That file is ${mb(file.size)} MB. Sounds can be at most ${LIMITS.soundBytes / MB} MB.` };
    return { ok: true, kind: 'sound' };
  }
  if (file.size > LIMITS.imageBytes) return { ok: false, reason: `That file is ${mb(file.size)} MB. Pictures can be at most ${LIMITS.imageBytes / MB} MB.` };
  if (dims) {
    const max = LIMITS.imageSide;
    if (dims.width > max || dims.height > max)
      return { ok: false, reason: `That picture is ${dims.width}×${dims.height}. Pictures can be at most ${max}×${max}.` };
    if (frameWidth && (!Number.isInteger(frameWidth) || frameWidth <= 0 || dims.width % frameWidth !== 0))
      return { ok: false, reason: `That picture is ${dims.width} pixels wide, which does not split evenly into frames ${frameWidth} pixels wide.` };
  }
  return { ok: true, kind: 'image' };
}

async function browserImageSize(blob: Blob): Promise<{ width: number; height: number }> {
  const bmp = await createImageBitmap(blob);
  const out = { width: bmp.width, height: bmp.height };
  bmp.close();
  return out;
}

async function browserDuration(blob: Blob): Promise<number> {
  const Ctx = globalThis.OfflineAudioContext as typeof OfflineAudioContext | undefined;
  if (!Ctx) return 0;
  const ctx = new Ctx(1, 1, 44100);
  const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
  return buf.duration;
}

export interface ImportOptions {
  /** Split a picture into frames of this width (a horizontal spritesheet). */
  frameWidth?: number;
  /** Asset names already in the project, so the new one gets a unique name. */
  takenNames?: Iterable<string>;
  /** Reads a picture's size (createImageBitmap in the browser). */
  decodeImage?: (blob: Blob) => Promise<{ width: number; height: number }>;
  /** Reads a sound's length in seconds (decodeAudioData when available, else 0). */
  decodeDuration?: (blob: Blob) => Promise<number>;
}

/**
 * Validates a picture or sound, stores the file in IndexedDB and returns the
 * Asset to add to the project. Throws ImportRejected with a readable reason.
 */
export async function importAsset(projectId: string, file: File, opts: ImportOptions = {}): Promise<Asset> {
  const first = checkImport(file);
  if (!first.ok) throw new ImportRejected(first.reason);
  const format = formatOf(file)!;
  const base = file.name.replace(/\.[^.]+$/, '').trim().slice(0, 60) || (format.kind === 'image' ? 'Picture' : 'Sound');
  const name = uniqueName(base, opts.takenNames ?? [], 60);
  const id = newId('a');
  let asset: Asset;
  if (format.kind === 'image') {
    let dims: { width: number; height: number };
    try {
      dims = await (opts.decodeImage ?? browserImageSize)(file);
    } catch {
      throw new ImportRejected(`"${file.name}" could not be opened as a picture. It may be damaged.`);
    }
    const check = checkImport(file, dims, opts.frameWidth);
    if (!check.ok) throw new ImportRejected(check.reason);
    const w = opts.frameWidth ?? dims.width;
    asset = { id, name, kind: 'image', source: 'imported', mime: 'image/png', frames: { w, h: dims.height, count: dims.width / w, fps: 8 } };
  } else {
    let duration: number;
    try {
      duration = await (opts.decodeDuration ?? browserDuration)(file);
    } catch {
      throw new ImportRejected(`"${file.name}" could not be played as a sound. It may be damaged.`);
    }
    asset = { id, name, kind: 'sound', source: 'imported', mime: format.mime, duration };
  }
  await putAsset(projectId, id, file);
  return asset;
}
