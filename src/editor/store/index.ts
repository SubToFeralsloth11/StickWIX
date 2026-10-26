import { applyPatches, enablePatches, produceWithPatches, type Draft } from 'immer';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Project } from '@/model/schema';
import { createHistory } from './undo';

export { UNDO_LIMIT } from './undo';

enablePatches();

export type SelectionKind = 'object' | 'kind' | 'ui' | 'rule' | 'scene';
export interface SelectionItem {
  kind: SelectionKind;
  id: string;
}

export interface EditorState {
  project: Project | null;
  readOnly: boolean;
  selection: SelectionItem[];
  sceneId: string | null;

  /** Open a project: resets history and selection, shows its start scene. */
  load(project: Project, options?: { readOnly?: boolean }): void;
  setReadOnly(readOnly: boolean): void;
  /** The only way to change the document: one undoable step named `label`. Ignored when read-only. */
  edit(label: string, recipe: (draft: Draft<Project>) => void): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  undoLabel(): string | undefined;
  redoLabel(): string | undefined;
  select(selection: SelectionItem[]): void;
  setScene(sceneId: string): void;
  /** Called with the new document after every edit/undo/redo (not on load) - autosave hooks in here. */
  subscribeProject(cb: (project: Project) => void): () => void;
}

export type EditorStore = StoreApi<EditorState>;

export function createEditorStore(): EditorStore {
  const history = createHistory();
  const projectListeners = new Set<(p: Project) => void>();

  return createStore<EditorState>()((set, get) => {
    const commit = (project: Project) => {
      set({ project });
      for (const cb of projectListeners) cb(project);
    };

    return {
      project: null,
      readOnly: false,
      selection: [],
      sceneId: null,

      load(project, options = {}) {
        history.clear();
        set({ project, readOnly: options.readOnly ?? false, selection: [], sceneId: project.startSceneId });
      },
      setReadOnly: (readOnly) => set({ readOnly }),
      edit(label, recipe) {
        const { project, readOnly } = get();
        if (!project || readOnly) return;
        const [next, patches, inversePatches] = produceWithPatches(project, recipe);
        if (patches.length === 0) return;
        history.push({ label, patches, inversePatches });
        commit(next);
      },
      undo() {
        const { project, readOnly } = get();
        if (!project || readOnly) return;
        const entry = history.undo();
        if (entry) commit(applyPatches(project, entry.inversePatches));
      },
      redo() {
        const { project, readOnly } = get();
        if (!project || readOnly) return;
        const entry = history.redo();
        if (entry) commit(applyPatches(project, entry.patches));
      },
      canUndo: () => history.canUndo(),
      canRedo: () => history.canRedo(),
      undoLabel: () => history.peekUndo()?.label,
      redoLabel: () => history.peekRedo()?.label,
      select: (selection) => set({ selection }),
      setScene: (sceneId) => set({ sceneId }),
      subscribeProject(cb) {
        projectListeners.add(cb);
        return () => projectListeners.delete(cb);
      },
    };
  });
}

/** The editor's single store instance. */
export const editorStore = createEditorStore();

export function useEditor<T>(selector: (state: EditorState) => T): T {
  return useStore(editorStore, selector);
}
