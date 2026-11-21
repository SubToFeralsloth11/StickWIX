import { useEffect } from 'react';
import { setUI, useUI } from '../ui-state';
import { isTyping, openSection, sectionByNumber, toggleDrawer, toggleInspector } from './actions';

/** Navigation keys: Ctrl/⌘ K palette, F1 assistant, `?` shortcut sheet, 1-9 sections, `[` drawer, `]` inspector. */
export function useShellKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = useUI.getState();
      if (ui.playing || e.defaultPrevented) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        // Another dialog (pixel editor, confirm...) is open: don't stack the palette on it.
        if (!ui.overlay && document.querySelector('[role="dialog"][data-state="open"]')) return;
        setUI({ overlay: ui.overlay === 'palette' ? null : 'palette' });
        return;
      }
      if (e.key === 'F1') {
        e.preventDefault();
        setUI({ overlay: ui.overlay === 'assistant' ? null : 'assistant' });
        return;
      }
      if (mod || e.altKey || ui.overlay || isTyping(e)) return;
      // Leave keys alone inside open menus and dialogs (their own typeahead / controls).
      if (e.target instanceof Element && e.target.closest('[role="menu"], [role="dialog"], [role="listbox"]')) return;
      if (e.key === '?') {
        e.preventDefault();
        setUI({ overlay: 'shortcuts' });
      } else if (e.key === '[') {
        e.preventDefault();
        toggleDrawer();
      } else if (e.key === ']') {
        e.preventDefault();
        toggleInspector();
      } else if (/^[1-9]$/.test(e.key)) {
        const id = sectionByNumber(Number(e.key));
        if (!id) return;
        e.preventDefault();
        openSection(id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
