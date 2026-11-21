import * as Dialog from '@radix-ui/react-dialog';
import { SECTIONS } from '../panels';
import { setUI, useUI } from '../ui-state';
import { MOD } from './actions';

const GROUPS: { title: string; keys: [string, string][] }[] = [
  {
    title: 'Get around',
    keys: [
      [` K`, 'Find anything'],
      ['F1', 'How do I…? step-by-step help'],
      ['?', 'This list'],
      ['1 – 9', 'Open a section'],
      ['[', 'Show or hide the side panel'],
      [']', 'Show or hide the inspector'],
    ],
  },
  {
    title: 'Edit',
    keys: [
      [`${MOD} Z`, 'Undo'],
      [`Shift ${MOD} Z`, 'Redo'],
      ['Delete', 'Delete what is selected'],
      [`${MOD} D`, 'Duplicate'],
      ['Arrows', 'Nudge 1 pixel (Shift: 32)'],
    ],
  },
  {
    title: 'Scene',
    keys: [
      ['V B R E', 'Select, Paint, Fill box, Erase'],
      ['Space + drag', 'Move around the scene'],
      [`${MOD} + wheel`, 'Zoom'],
    ],
  },
  {
    title: 'Play',
    keys: [
      ['F2', 'Show-me while playing'],
      ['Esc', 'Stop playing'],
    ],
  },
];

/** `?`: every keyboard shortcut on one sheet. */
export function ShortcutSheet() {
  const open = useUI((s) => s.overlay === 'shortcuts');
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && setUI({ overlay: null })}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-bg" />
        <Dialog.Content className="dialog shortcut-sheet" aria-describedby={undefined} data-testid="shortcut-sheet">
          <Dialog.Title>Keyboard shortcuts</Dialog.Title>
          <div className="sheet-grid">
            {GROUPS.map((g) => (
              <section key={g.title}>
                <h4>{g.title}</h4>
                {g.keys.map(([k, what]) => (
                  <div className="sheet-row" key={k}>
                    <span>{what}</span>
                    <span className="kbd">{k}</span>
                  </div>
                ))}
              </section>
            ))}
            <section>
              <h4>Sections</h4>
              {SECTIONS.slice(0, 9).map((s, i) => (
                <div className="sheet-row" key={s.id}>
                  <span>{s.label}</span>
                  <span className="kbd">{i + 1}</span>
                </div>
              ))}
            </section>
          </div>
          <div className="actions">
            <Dialog.Close asChild>
              <button className="btn primary">Got it</button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
