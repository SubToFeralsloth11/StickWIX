import { z } from 'zod';
import { migrate } from '../model/migrations';
import type { Project } from '../model/schema';
import type { AssetInfo } from '../runtime/render/renderer';

/**
 * The game data an exported HTML file carries (contracts/exported-game.md):
 * the project, every referenced asset as a data URL, and frame info for the
 * built-in images it uses (the player has no manifest to look them up in).
 */
export interface GamePayload {
  project: Project;
  assets: Record<string, string>;
  manifest?: { images: Record<string, FrameInfo> };
}

export type FrameInfo = { w: number; h: number; frames: number; fps: number };

/** Id of the JSON script element in the player template. */
export const PAYLOAD_ELEMENT_ID = 'stickwix-game';

const positive = z.number().positive();
const Envelope = z.object({
  project: z.unknown(),
  assets: z.record(z.string(), z.string().startsWith('data:')),
  manifest: z
    .object({ images: z.record(z.string(), z.object({ w: positive, h: positive, frames: z.number().int().min(1), fps: positive })) })
    .optional(),
});

/** Parses and validates the embedded payload with the same schema and migrations as the editor. Throws on any problem. */
export function parsePayload(text: string): GamePayload {
  const env = Envelope.parse(JSON.parse(text));
  return { project: migrate(env.project), assets: env.assets, manifest: env.manifest };
}

/** Frame info for builtin images (from the payload manifest) and project images (from the document). */
export function payloadAssetInfo(payload: GamePayload): AssetInfo {
  const builtin = payload.manifest?.images ?? {};
  const own = new Map(payload.project.assets.map((a) => [a.id, a]));
  return (id) => {
    const b = builtin[id];
    if (b) return b;
    const a = own.get(id);
    return a?.kind === 'image' ? { w: a.frames.w, h: a.frames.h, frames: a.frames.count, fps: a.frames.fps } : undefined;
  };
}
