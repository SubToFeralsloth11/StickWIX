import { describe, expect, it } from 'vitest';
import '@/editor/assets/preset-drop';
import { DROP_HANDLERS } from '@/editor/canvas/drop';
import { STARTERS } from '@/editor/home/starters';
import { editorStore } from '@/editor/store';
import { newProject } from '@/model/defaults';
import { Project } from '@/model/schema';
import { OBJECT_PRESETS, STARTERS as PRESETS } from '@/presets';

describe('preset editor hooks', () => {
  it('offers every starter in the New game dialog, each creating a fresh named copy', () => {
    expect(STARTERS.map((s) => s.id)).toEqual(PRESETS.map((s) => s.id));
    for (const s of STARTERS) {
      expect(s.thumb).toMatch(/assets\/builtin\/img\/[a-z_]+\.png$/);
      expect(s.color).toMatch(/^#[0-9a-f]{6}$/);
      const a = s.create('  My game  ');
      const b = s.create('');
      expect(Project.safeParse(a).success).toBe(true);
      expect(a.name).toBe('My game');
      expect(b.name).toBe(s.name);
      expect(a.id).not.toBe(b.id);
    }
  });

  it('dropping an object preset adds it centred on the drop point as one undo step', () => {
    const p = newProject();
    editorStore.getState().load(p);
    const coin = OBJECT_PRESETS.find((x) => x.name === 'Coin')!;
    const ids = DROP_HANDLERS.preset!({ type: 'preset', presetId: coin.id }, { x: 101, y: 99 }, { project: p, sceneId: p.scenes[0]!.id, snap: 32 });
    const doc = editorStore.getState().project!;
    const obj = doc.scenes[0]!.objects.find((o) => o.id === ids![0])!;
    expect({ x: obj.x, y: obj.y }).toEqual({ x: 96, y: 96 });
    expect(doc.kinds.map((k) => k.name)).toEqual(['Coin']);
    expect(editorStore.getState().undoLabel()).toBe('Add Coin');
    editorStore.getState().undo();
    expect(editorStore.getState().project!.kinds).toEqual([]);
  });
});
