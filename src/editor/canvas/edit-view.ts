import type { Kind, Project, Scene } from '@/model/schema';
import { Input } from '@/runtime/input';
import { STEP } from '@/runtime/loop';
import type { AssetInfo } from '@/runtime/render/renderer';
import { World } from '@/runtime/world';

const noop = () => {};

/**
 * The scene's placed objects as runtime instances, for drawing the edit view
 * with the same renderer as Play. Nothing is simulated; only sticker setup runs
 * (so Solid/Animate etc. show as they will at the first frame).
 */
export function buildEditWorld(project: Project, scene: Scene, info: AssetInfo): World {
  const world = new World({
    project,
    scene,
    screen: { w: project.settings.screenWidth, h: project.settings.screenHeight },
    emit: noop,
    diagnostic: noop,
    playSound: noop,
    frameCount: (id) => info(id)?.frames ?? 1,
    mouseWorld: () => ({ x: 0, y: 0 }),
  });
  world.load({ dt: STEP, input: new Input().state, world, emit: noop, rng: () => 0.5 });
  return world;
}

/** Box of a placed object in scene pixels. */
export function objectBox(o: { x: number; y: number; scaleX: number; scaleY: number }, kind: Kind | undefined) {
  return { x: o.x, y: o.y, w: (kind?.size.w ?? 32) * o.scaleX, h: (kind?.size.h ?? 32) * o.scaleY };
}

/** Topmost placed object under a scene point (highest layer, then latest placed). */
export function objectAt(project: Project, scene: Scene, x: number, y: number): string | null {
  const kinds = new Map(project.kinds.map((k) => [k.id, k]));
  let best: { id: string; layer: number } | null = null;
  for (const o of scene.objects) {
    const k = kinds.get(o.kindId);
    const b = objectBox(o, k);
    if (x < b.x || y < b.y || x >= b.x + b.w || y >= b.y + b.h) continue;
    const layer = o.layer + (k?.layer ?? 0);
    if (!best || layer >= best.layer) best = { id: o.id, layer };
  }
  return best?.id ?? null;
}
