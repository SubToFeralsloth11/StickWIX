import { create } from 'zustand';
import type { Diagnostic } from '@/runtime/types';

export type Tool = 'select' | 'brush' | 'rect' | 'erase' | 'ui';

/** Editor view state that is not part of the document (never saved, never undone). */
export interface UIState {
  tool: Tool;
  /** Tile index chosen in the tile palette. */
  tileIndex: number;
  snap: boolean;
  leftTab: string;
  rightTab: string;
  playing: boolean;
  /** Inspector edits the whole Kind ("all Coins") or only the selected object. */
  editScope: 'kind' | 'object';
  /** Rule to scroll to and flash (warnings "Show me where", Show-me result). */
  focusRuleId: string | null;
  /** Diagnostics from the last Play (runaway rules, object cap), shown in Warnings after Stop. */
  lastRun: Diagnostic[];
  /** UI element selected on the screen layer. */
  uiSelection: string | null;
}

export const useUI = create<UIState>(() => ({
  tool: 'select',
  tileIndex: 0,
  snap: true,
  leftTab: 'art',
  rightTab: 'inspect',
  playing: false,
  editScope: 'kind',
  focusRuleId: null,
  lastRun: [],
  uiSelection: null,
}));

export const setUI = (patch: Partial<UIState>) => useUI.setState(patch);
