import { OBJECT_PRESETS, insertObjectPreset } from '@/presets';
import { DROP_HANDLERS } from '../canvas/drop';
import { editorStore } from '../store';
import { snapValue } from '../store/world-ops';

/** Dropping an object preset copies its Kinds, values and rules and places its main Kind centred on the drop point (FR-025). */
DROP_HANDLERS.preset = (payload, at, { sceneId, snap }) => {
  if (payload.type !== 'preset') return;
  const preset = OBJECT_PRESETS.find((p) => p.id === payload.presetId);
  const main = preset?.kinds.find((k) => k.id === preset.mainKindId);
  if (!preset || !main) return;
  let objectIds: string[] = [];
  editorStore.getState().edit(`Add ${preset.name}`, (d) => {
    const x = snapValue(at.x - main.size.w / 2, snap);
    const y = snapValue(at.y - main.size.h / 2, snap);
    objectIds = insertObjectPreset(d, preset, { sceneId, x, y }).objectIds;
  });
  return objectIds;
};
