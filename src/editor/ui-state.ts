import { create } from 'zustand';
import type { Diagnostic } from '@/runtime/types';

export type Tool = 'select' | 'brush' | 'rect' | 'box' | 'erase' | 'ui';

/** Sections that used to live in the left sidebar (things you put into the world). */
const BUILD_SECTIONS: Record<string, true> = { art: true, presets: true, tiles: true, scenes: true };

export const INSPECTOR_MIN = 280;
export const INSPECTOR_MAX = 640;
const WIDTH_KEY = 'stickwix.inspectorWidth';
const OPEN_KEY = 'stickwix.inspectorOpen';

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Remembers the inspector layout; silently ignored when storage is blocked. */
function persistLayout(width: number, open: boolean) {
  try {
    localStorage.setItem(WIDTH_KEY, String(Math.round(width)));
    localStorage.setItem(OPEN_KEY, open ? '1' : '0');
  } catch {
    /* private mode: layout just isn't remembered */
  }
}

export const clampInspector = (w: number) => Math.min(INSPECTOR_MAX, Math.max(INSPECTOR_MIN, w));

/** Editor view state that is not part of the document (never saved, never undone). */
export interface UIState {
  tool: Tool;
  /** Tile index chosen in the tile palette. */
  tileIndex: number;
  snap: boolean;
  /** Build section shown in the drawer (art/presets/tiles/scenes), or '' when the drawer shows something else. */
  leftTab: string;
  /** Logic section shown in the drawer (rules/values/screen/warnings/game), or 'inspect' when none is. */
  rightTab: string;
  /** Section open in the drawer beside the rail; null = drawer collapsed. */
  section: string | null;
  /** The contextual inspector on the right. */
  inspectorOpen: boolean;
  inspectorWidth: number;
  /** Command palette / keyboard shortcut sheet / "How do I…?" assistant. */
  overlay: 'palette' | 'shortcuts' | 'assistant' | null;
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
  section: 'art',
  inspectorOpen: stored(OPEN_KEY) !== '0',
  inspectorWidth: clampInspector(Number(stored(WIDTH_KEY)) || 360),
  overlay: null,
  playing: false,
  editScope: 'kind',
  focusRuleId: null,
  lastRun: [],
  uiSelection: null,
}));

useUI.subscribe((s, prev) => {
  if (s.inspectorOpen !== prev.inspectorOpen || s.inspectorWidth !== prev.inspectorWidth) persistLayout(s.inspectorWidth, s.inspectorOpen);
});

/**
 * Updates view state. `leftTab`/`rightTab` (still set all over the editor, e.g. "Show me where")
 * and `section` (the rail) are kept in step: asking for any section opens it in the drawer, and
 * asking for `rightTab: 'inspect'` opens the inspector without closing the drawer.
 */
export const setUI = (patch: Partial<UIState>) => {
  const p = { ...patch };
  if (p.section !== undefined) {
    const s = p.section;
    const build = !!s && !!BUILD_SECTIONS[s];
    p.leftTab ??= build ? s : '';
    p.rightTab ??= s && !build ? s : 'inspect';
  } else if (p.leftTab) {
    p.section = p.leftTab;
    p.rightTab ??= 'inspect';
  } else if (p.rightTab === 'inspect') {
    const cur = useUI.getState().section;
    p.inspectorOpen = true;
    if (cur && !BUILD_SECTIONS[cur]) p.rightTab = cur;
  } else if (p.rightTab) {
    p.section = p.rightTab;
    p.leftTab = '';
  }
  useUI.setState(p);
};
