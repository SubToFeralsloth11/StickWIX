import type { Project } from '../model/schema';
import type { RecentEvent } from '../runtime/events';
import type { World } from '../runtime/world';
import { keyName, STICKER_EVENT_PHRASE } from '../model/sentence';
import type { WorldFacts } from './generalise';

/** Facts about the frozen scene, for generalisation. */
export function worldFacts(world: World): WorldFacts {
  return {
    instance: (id) => {
      const i = world.instances.get(id);
      return i ? { kindId: i.kindId, objectId: i.objectId } : undefined;
    },
    countOfKind: (kindId) => Math.max(world.byKind(kindId).length, world.scene.objects.filter((o) => o.kindId === kindId).length),
  };
}

/** Plain-English line for the "what just happened" list: "Hero touched Coin", "Space was pressed". */
export function describeEvent(e: RecentEvent['event'], p: Project, world: World): string {
  const kind = (instId: string) => {
    const i = world.instances.get(instId);
    return p.kinds.find((k) => k.id === i?.kindId)?.name ?? 'something';
  };
  const value = (id: string) => [...p.values, ...p.kinds.flatMap((k) => k.values)].find((v) => v.id === id)?.name ?? 'a value';
  switch (e.type) {
    case 'sceneStart': return 'The scene started';
    case 'timer': return `Timer reached ${Math.round(e.seconds * 10) / 10} seconds`;
    case 'key': return `${keyName(e.key)} was ${e.mode}`;
    case 'clicked': return `${e.ui ? (p.scenes.flatMap((s) => s.ui).find((u) => u.id === e.id)?.name ?? 'A button') : kind(e.id)} was clicked`;
    case 'touch': return `${kind(e.a)} touched ${kind(e.b)}`;
    case 'valueChanged': return `${e.objectId ? `${kind(e.objectId)}'s ` : ''}${value(e.valueId)} changed to ${String(e.to)}`;
    case 'created': return `${kind(e.id)} was created`;
    case 'destroyed': return `${kind(e.id)} was destroyed`;
    case 'leavesScene': return `${kind(e.id)} left the scene`;
    case 'sticker': return `${kind(e.id)} ${STICKER_EVENT_PHRASE[e.event]}`;
  }
}
