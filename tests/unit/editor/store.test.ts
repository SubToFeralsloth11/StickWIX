import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEditorStore, UNDO_LIMIT, type EditorStore } from '@/editor/store';
import { newKind, newProject } from '@/model/defaults';

let store: EditorStore;
beforeEach(() => {
  store = createEditorStore();
  store.getState().load(newProject('Game'));
});

const project = () => {
  const p = store.getState().project;
  if (!p) throw new Error('no project');
  return p;
};

describe('editor store', () => {
  it('loads a project, selects its start scene and starts with empty history', () => {
    const s = store.getState();
    expect(s.sceneId).toBe(project().startSceneId);
    expect(s.canUndo()).toBe(false);
    expect(s.canRedo()).toBe(false);
    expect(s.selection).toEqual([]);
  });

  it('undoes and redoes any edit', () => {
    const before = project();
    store.getState().edit('Rename', (d) => {
      d.name = 'Renamed';
    });
    store.getState().edit('Add kind', (d) => {
      d.kinds.push(newKind('Hero'));
    });
    const after = project();
    expect(after.kinds).toHaveLength(1);
    expect(store.getState().canUndo()).toBe(true);

    store.getState().undo();
    expect(project().kinds).toHaveLength(0);
    expect(project().name).toBe('Renamed');
    store.getState().undo();
    expect(project()).toEqual(before);
    expect(store.getState().canUndo()).toBe(false);

    store.getState().redo();
    store.getState().redo();
    expect(project()).toEqual(after);
    expect(store.getState().canRedo()).toBe(false);
  });

  it('exposes labels for the next undo/redo step', () => {
    store.getState().edit('Rename', (d) => {
      d.name = 'X';
    });
    expect(store.getState().undoLabel()).toBe('Rename');
    store.getState().undo();
    expect(store.getState().redoLabel()).toBe('Rename');
  });

  it('retains at least 100 steps and caps history at 200', () => {
    for (let i = 1; i <= 250; i++)
      store.getState().edit(`step ${i}`, (d) => {
        d.name = `n${i}`;
      });
    expect(UNDO_LIMIT).toBe(200);
    let undone = 0;
    while (store.getState().canUndo()) {
      store.getState().undo();
      undone++;
    }
    expect(undone).toBe(200);
    expect(undone).toBeGreaterThanOrEqual(100);
    // oldest 50 steps were dropped
    expect(project().name).toBe('n50');
  });

  it('a new edit clears the redo stack', () => {
    store.getState().edit('a', (d) => {
      d.name = 'A';
    });
    store.getState().undo();
    expect(store.getState().canRedo()).toBe(true);
    store.getState().edit('b', (d) => {
      d.name = 'B';
    });
    expect(store.getState().canRedo()).toBe(false);
  });

  it('no-op recipes do not create history', () => {
    store.getState().edit('nothing', () => {});
    expect(store.getState().canUndo()).toBe(false);
  });

  it('does not bump updatedAt on edit', () => {
    const t = project().updatedAt;
    store.getState().edit('a', (d) => {
      d.name = 'A';
    });
    expect(project().updatedAt).toBe(t);
  });

  it('ignores edits when read-only', () => {
    store.getState().load(newProject('RO'), { readOnly: true });
    store.getState().edit('a', (d) => {
      d.name = 'A';
    });
    expect(project().name).toBe('RO');
    expect(store.getState().canUndo()).toBe(false);
  });

  it('load resets history', () => {
    store.getState().edit('a', (d) => {
      d.name = 'A';
    });
    store.getState().load(newProject('Other'));
    expect(store.getState().canUndo()).toBe(false);
    expect(store.getState().readOnly).toBe(false);
  });

  it('subscribeProject fires on edit/undo/redo with the new document only when it changes', () => {
    const cb = vi.fn();
    const off = store.getState().subscribeProject(cb);
    store.getState().select([{ kind: 'scene', id: project().startSceneId }]);
    expect(cb).not.toHaveBeenCalled();
    store.getState().edit('a', (d) => {
      d.name = 'A';
    });
    store.getState().undo();
    store.getState().redo();
    expect(cb).toHaveBeenCalledTimes(3);
    expect(cb.mock.calls[2]?.[0]).toMatchObject({ name: 'A' });
    off();
    store.getState().undo();
    expect(cb).toHaveBeenCalledTimes(3);
  });

  it('keeps selection and scene id settable', () => {
    store.getState().select([{ kind: 'kind', id: 'k1' }]);
    expect(store.getState().selection).toEqual([{ kind: 'kind', id: 'k1' }]);
    store.getState().setScene('s2');
    expect(store.getState().sceneId).toBe('s2');
  });
});
