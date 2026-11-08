import type { Project } from '@/model/schema';

export const DRAG_MIME = 'application/x-stickwix';

/** What can be dragged onto the scene canvas. */
export type DropPayload =
  | { type: 'image'; id: string; name: string; w: number; h: number }
  | { type: 'kind'; kindId: string }
  | { type: 'preset'; presetId: string };

export type DropHandler = (payload: DropPayload, at: { x: number; y: number }, ctx: { project: Project; sceneId: string; snap: number | null }) => string[] | void;

/** Handlers by payload type; slices (e.g. object presets) register theirs. Returns ids to select. */
export const DROP_HANDLERS: Partial<Record<DropPayload['type'], DropHandler>> = {};

export function setDragPayload(e: React.DragEvent, payload: DropPayload) {
  e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = 'copy';
}

export function readDragPayload(e: React.DragEvent): DropPayload | null {
  const raw = e.dataTransfer.getData(DRAG_MIME);
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    return v && typeof v === 'object' && 'type' in v ? (v as DropPayload) : null;
  } catch {
    return null;
  }
}
