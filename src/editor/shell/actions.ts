import { editorStore } from '../store';
import * as ops from '../store/world-ops';
import { SECTIONS } from '../panels';
import { setUI, useUI } from '../ui-state';

/** Last section shown in the drawer, so collapsing and reopening returns to it. */
let lastSection = 'art';

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = isMac ? '⌘' : 'Ctrl';

export function openSection(id: string) {
  lastSection = id;
  setUI({ section: id });
}

/** Rail click: open a section, or collapse the drawer if it is already open. */
export function toggleSection(id: string) {
  if (useUI.getState().section === id) setUI({ section: null });
  else openSection(id);
}

export function toggleDrawer() {
  const cur = useUI.getState().section;
  if (cur) {
    lastSection = cur;
    setUI({ section: null });
  } else openSection(lastSection);
}

export function toggleInspector() {
  setUI({ inspectorOpen: !useUI.getState().inspectorOpen });
}

/** Number keys 1-9 follow rail order. */
export function sectionByNumber(n: number): string | undefined {
  return SECTIONS[n - 1]?.id;
}

export function addScene() {
  const { edit, setScene } = editorStore.getState();
  let id = '';
  edit('Add scene', (d) => void (id = ops.addScene(d, 'Level')));
  if (id) setScene(id);
}

/** Selects a Kind ("all Coins") so the inspector shows it. */
export function selectKind(id: string) {
  editorStore.getState().select([{ kind: 'kind', id }]);
  setUI({ tool: 'select', rightTab: 'inspect' });
}

/** Opens Rules and presses its "New rule" button so the menu pops open. */
export function startNewRule() {
  openSection('rules');
  let tries = 0;
  const tick = () => {
    const btn = document.querySelector<HTMLButtonElement>('[data-testid="new-rule"]');
    if (btn) {
      btn.focus();
      btn.click();
    } else if (++tries < 30) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function isTyping(e: KeyboardEvent) {
  const t = e.target;
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t instanceof HTMLElement && t.isContentEditable);
}
