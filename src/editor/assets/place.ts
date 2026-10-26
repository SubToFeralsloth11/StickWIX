import { editorStore } from '../store';
import { DROP_HANDLERS } from '../canvas/drop';
import * as ops from '../store/world-ops';

/**
 * Dropping art makes a new Kind named after it (reusing an existing Kind that
 * already uses this exact look) and places one object centred on the drop point.
 */
DROP_HANDLERS.image = (payload, at, { sceneId, snap }) => {
  if (payload.type !== 'image') return;
  let objectId = '';
  editorStore.getState().edit(`Add ${payload.name}`, (d) => {
    const existing = d.kinds.find((k) => k.lookId === payload.id && k.size.w === payload.w && k.size.h === payload.h);
    const kindId = existing?.id ?? ops.addKind(d, payload.name, payload.id, payload.w, payload.h);
    objectId = ops.placeObject(d, sceneId, kindId, at.x - payload.w / 2, at.y - payload.h / 2, snap);
  });
  return [objectId];
};

DROP_HANDLERS.kind = (payload, at, { project, sceneId, snap }) => {
  if (payload.type !== 'kind') return;
  const k = project.kinds.find((x) => x.id === payload.kindId);
  if (!k) return;
  let objectId = '';
  editorStore.getState().edit(`Add ${k.name}`, (d) => {
    objectId = ops.placeObject(d, sceneId, k.id, at.x - k.size.w / 2, at.y - k.size.h / 2, snap);
  });
  return [objectId];
};
