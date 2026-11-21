import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { putProject } from '@/storage/db';
import type { PanelProps } from '../panels';
import { openProject } from '../App';
import { blankProject } from '../home/new-project';
import { currentManifest } from '../assets/library';
import { startTour } from '../tour/tour-state';
import { toast } from '../toast';
import { setUI } from '../ui-state';


/** Help: restart the guided tour (FR-037) and list keyboard shortcuts. */
export function HelpMenu(_props: PanelProps) {
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
            <DropdownMenu.Item className="opt" onSelect={() => setUI({ overlay: 'assistant' })}>
              <span>
                How do I…?
                <small>Type what you want to make and get step-by-step pictures.</small>
              </span>
            </DropdownMenu.Item>
            <DropdownMenu.Item className="opt" onSelect={() => setUI({ overlay: 'shortcuts' })}>
              <span>Keyboard shortcuts</span>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </>
  );
}
