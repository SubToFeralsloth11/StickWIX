import { describe, expect, it } from 'vitest';
import { createHistory } from '@/editor/store/undo';

const entry = (label: string) => ({ label, patches: [], inversePatches: [] });

describe('undo history', () => {
  it('drops the oldest entry past the limit', () => {
    const h = createHistory(3);
    for (const label of ['a', 'b', 'c', 'd']) h.push(entry(label));
    expect(h.undoSize()).toBe(3);
    expect(h.undo()?.label).toBe('d');
    expect(h.undo()?.label).toBe('c');
    expect(h.undo()?.label).toBe('b');
    expect(h.undo()).toBeUndefined();
  });

  it('moves entries between undo and redo; push clears redo', () => {
    const h = createHistory(10);
    h.push(entry('a'));
    h.push(entry('b'));
    expect(h.undo()?.label).toBe('b');
    expect(h.peekRedo()?.label).toBe('b');
    expect(h.redo()?.label).toBe('b');
    expect(h.peekUndo()?.label).toBe('b');
    h.undo();
    h.push(entry('c'));
    expect(h.canRedo()).toBe(false);
    h.clear();
    expect(h.canUndo()).toBe(false);
  });
});
