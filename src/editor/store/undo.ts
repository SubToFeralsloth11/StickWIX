import type { Patch } from 'immer';

/** Undo steps kept; the oldest is dropped past this (FR-003 needs ≥ 100). */
export const UNDO_LIMIT = 200;

export interface HistoryEntry {
  label: string;
  patches: Patch[];
  inversePatches: Patch[];
}

export interface History {
  /** Record a new edit: drops the oldest step past the limit and clears redo. */
  push(entry: HistoryEntry): void;
  /** Moves the newest step to the redo stack and returns it (apply its `inversePatches`). */
  undo(): HistoryEntry | undefined;
  /** Moves the newest undone step back and returns it (apply its `patches`). */
  redo(): HistoryEntry | undefined;
  peekUndo(): HistoryEntry | undefined;
  peekRedo(): HistoryEntry | undefined;
  canUndo(): boolean;
  canRedo(): boolean;
  undoSize(): number;
  clear(): void;
}

export function createHistory(limit = UNDO_LIMIT): History {
  let past: HistoryEntry[] = [];
  let future: HistoryEntry[] = [];
  return {
    push(entry) {
      past.push(entry);
      if (past.length > limit) past.splice(0, past.length - limit);
      future = [];
    },
    undo() {
      const entry = past.pop();
      if (entry) future.push(entry);
      return entry;
    },
    redo() {
      const entry = future.pop();
      if (entry) past.push(entry);
      return entry;
    },
    peekUndo: () => past.at(-1),
    peekRedo: () => future.at(-1),
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    undoSize: () => past.length,
    clear() {
      past = [];
      future = [];
    },
  };
}
