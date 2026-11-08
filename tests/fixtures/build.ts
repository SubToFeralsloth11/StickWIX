import { Project, type ProjectInput } from '@/model/schema';
import { createGame, type Game, type GameOptions } from '@/runtime/game';
import { NullRenderer } from '@/runtime/render/null-renderer';
import type { RuntimeEvent } from '@/runtime/types';

type KindSpec = {
  id: string;
  name?: string;
  w?: number;
  h?: number;
  stickers?: { type: string; settings?: Record<string, unknown>; id?: string }[];
  values?: { id: string; name: string; type?: 'number' | 'text' | 'bool'; start: number | string | boolean }[];
  rules?: unknown[];
  lookId?: string | null;
};

export interface Spec {
  kinds?: KindSpec[];
  objects?: { id: string; kind: string; x: number; y: number; overrides?: Record<string, unknown> }[];
  /** Rows of tile chars: '#' solid tile 0, '=' one-way tile 1, '.' empty. Cell size 32. */
  tiles?: string[];
  values?: { id: string; name: string; type?: 'number' | 'text' | 'bool'; start: number | string | boolean; remember?: boolean; min?: number; max?: number }[];
  rules?: unknown[];
  sceneRules?: unknown[];
  ui?: unknown[];
  extraScenes?: { id: string; name: string; objects?: Spec['objects']; rules?: unknown[] }[];
  width?: number;
  height?: number;
}

/** Builds a valid one-scene project from a compact description. */
export function project(spec: Spec = {}): Project {
  const cells: Record<string, number> = {};
  (spec.tiles ?? []).forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c === '#') cells[`${x},${y}`] = 0;
      if (c === '=') cells[`${x},${y}`] = 1;
    }),
  );
  const objects = (list: Spec['objects'] = []) =>
    list.map((o) => ({ id: o.id, kindId: o.kind, x: o.x, y: o.y, overrides: o.overrides ?? {} }));
  const input: ProjectInput = {
    id: 'p1',
    schemaVersion: 1,
    name: 'Test',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    startSceneId: 's1',
    settings: { screenWidth: 640, screenHeight: 360 },
    scenes: [
      {
        id: 's1',
        name: 'Level 1',
        width: spec.width ?? 1280,
        height: spec.height ?? 720,
        tileLayer: { tileSetId: 'ts', cellSize: 32, cells },
        objects: objects(spec.objects),
        rules: spec.sceneRules ?? [],
        ui: spec.ui ?? [],
      } as never,
      ...(spec.extraScenes ?? []).map((s) => ({ id: s.id, name: s.name, width: 640, height: 360, objects: objects(s.objects), rules: s.rules ?? [] }) as never),
    ],
    tileSets: [{ id: 'ts', name: 'Tiles', assetId: 'builtin:tiles/grass', tileSize: 32, columns: 2, count: 2, solid: [true, false], oneWay: [false, true] }],
    kinds: (spec.kinds ?? []).map((k) => ({
      id: k.id,
      name: k.name ?? k.id,
      lookId: k.lookId ?? null,
      size: { w: k.w ?? 32, h: k.h ?? 32 },
      stickers: (k.stickers ?? []).map((s, i) => ({ id: s.id ?? `${k.id}-st${i}`, type: s.type, settings: s.settings ?? {} })),
      values: (k.values ?? []).map((v) => ({ ...v, type: v.type ?? 'number', scope: 'object' })),
      rules: k.rules ?? [],
    })) as never,
    values: (spec.values ?? []).map((v) => ({ ...v, type: v.type ?? 'number', scope: 'game' })) as never,
    rules: (spec.rules ?? []) as never,
  };
  return Project.parse(input);
}

export function game(spec: Spec | Project, opts: GameOptions = {}) {
  const p = 'schemaVersion' in spec ? spec : project(spec);
  const renderer = new NullRenderer();
  return { game: createGame(p, { seed: 1, renderer, ...opts }), project: p, renderer };
}

/** Holds keys for `steps` steps. */
export function hold(g: Game, keys: string[], steps: number) {
  for (const k of keys) g.input.keyDown(k);
  g.run(steps);
  for (const k of keys) g.input.keyUp(k);
}

/** A rule literal with defaults filled. */
export function rule(id: string, trigger: unknown, actions: unknown[], conditions: unknown[] = [], join: 'all' | 'any' = 'all') {
  return { id, enabled: true, trigger, conditions: { join, items: conditions }, actions };
}

export const lit = (n: number | string | boolean) => ({ lit: n });
export const ref = (valueId: string, of?: unknown) => ({ ref: of ? { valueId, of } : { valueId } });
export const obj = (id: string) => ({ t: 'object', id });
export const any = (kindId: string) => ({ t: 'any', kindId });
export const that = (kindId: string) => ({ t: 'that', kindId });
export const self = { t: 'self' };

/** Collects every rule-triggerable event the game emits from now on. */
export function record(g: Game) {
  const seen: RuntimeEvent[] = [];
  g.onEvent((e) => seen.push(e));
  return seen;
}

/** Ids of the instances that emitted a sticker event. */
export function stickerEvents(seen: RuntimeEvent[], event: string) {
  return seen.flatMap((e) => (e.type === 'sticker' && e.event === event ? [e.id] : []));
}
