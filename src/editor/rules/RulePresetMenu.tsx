import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { RuleOwner } from '@/model/references';
import { GENRES, RULE_PRESETS, insertRulePreset, type Genre, type RulePreset } from '@/presets';
import type { PanelProps } from '../panels';
import { editorStore } from '../store';
import { setUI } from '../ui-state';

const GENRE_LABEL: Record<Genre, string> = { platformer: 'Platformer', topdown: 'Top-down', clicker: 'Clicker' };

/** Ready-made rules with highlighted blanks to fill in (FR-026). Listed under every game type they suit. */
export function RulePresetMenu({ owner }: PanelProps & { owner: RuleOwner }) {
  const add = (preset: RulePreset) => {
    let id = '';
    editorStore.getState().edit('Add rule preset', (d) => void (id = insertRulePreset(d, preset, owner)));
    setUI({ focusRuleId: id });
  };
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="btn" data-testid="rule-presets">
          Rule presets
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="pop" sideOffset={6} align="start">
          {GENRES.map((g) => (
            <DropdownMenu.Group key={g}>
              <h6>{GENRE_LABEL[g]}</h6>
              {RULE_PRESETS.filter((p) => p.genres.includes(g)).map((p) => (
                <DropdownMenu.Item key={p.id} className="opt" onSelect={() => add(p)} data-testid={`rule-preset-${g}-${p.id}`}>
                  <span>
                    {p.name}
                    <small>{p.description}</small>
                  </span>
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Group>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
