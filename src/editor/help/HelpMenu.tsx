import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useState } from 'react';
import { putProject } from '@/storage/db';
import type { PanelProps } from '../panels';
import { openProject } from '../App';
import { blankProject } from '../home/new-project';
import { currentManifest } from '../assets/library';
import { startTour } from '../tour/tour-state';
import { ConfirmDialog } from '../ConfirmDialog';
import { toast } from '../toast';

const SHORTCUTS: [string, string][] = [
  ['Ctrl/⌘ Z', 'Undo'],
  ['Shift Ctrl/⌘ Z', 'Redo'],
  ['Delete', 'Delete what is selected'],
  ['Ctrl/⌘ D', 'Duplicate'],
  ['Arrows (Shift)', 'Nudge by 1 (32) pixels'],
  ['V / B / R / E', 'Select / Paint / Fill box / Erase'],
  ['Space + drag', 'Move around the scene'],
  ['Ctrl/⌘ + wheel', 'Zoom'],
  ['F2', 'Show-me while playing'],
  ['Esc', 'Stop playing'],
];

/** Help: restart the guided tour (FR-037) and list keyboard shortcuts. */
export function HelpMenu(_props: PanelProps) {
  const [keys, setKeys] = useState(false);
  const restart = async () => {
    const p = blankProject('My First Game', currentManifest());
    try {
      await putProject(p);
      await startTour(p.id);
      openProject(p.id);
    } catch {
      toast("Couldn't start the tour: this browser won't store games.", { error: true });
    }
  };
  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="btn ghost" data-testid="help-menu">
            Help ▾
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="pop" sideOffset={6} align="end">
            <DropdownMenu.Item className="opt" onSelect={() => void restart()} data-testid="restart-tour">
              <span>
                Guided tour
                <small>Build a tiny platformer step by step (in a new game).</small>
              </span>
            </DropdownMenu.Item>
            <DropdownMenu.Item className="opt" onSelect={() => setKeys(true)}>
              <span>Keyboard shortcuts</span>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {keys && (
        <ConfirmDialog
          title="Keyboard shortcuts"
          body={
            <table style={{ width: '100%', borderSpacing: '0 4px' }}>
              <tbody>
                {SHORTCUTS.map(([k, v]) => (
                  <tr key={k}>
                    <td>
                      <span className="kbd">{k}</span>
                    </td>
                    <td>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
          confirm="Got it"
          onCancel={() => setKeys(false)}
          onConfirm={() => setKeys(false)}
        />
      )}
    </>
  );
}
