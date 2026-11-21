import * as Dialog from '@radix-ui/react-dialog';
import { useMemo, useRef, useState } from 'react';
import { SECTIONS, type PanelProps } from '../panels';
import { editorStore } from '../store';
import { setUI, useUI } from '../ui-state';
import { openProject } from '../App';
import { Icon } from './icons';
import { addScene, MOD, openSection, selectKind, startNewRule, toggleDrawer, toggleInspector } from './actions';

interface Command {
  id: string;
  group: 'Sections' | 'Actions' | 'Scenes' | 'Things';
  label: string;
  hint?: string;
  icon: string;
  keys?: string;
  run: () => void;
}

/**
 * Fuzzy score: every query letter must appear in order. Matches at word starts and runs of
 * consecutive letters score higher; -1 means no match.
 */
function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase().replace(/\s+/g, '');
  if (!q) return 0;
  const t = text.toLowerCase();
  let score = 0;
  let ti = 0;
  let prev = -2;
  for (const ch of q) {
    const at = t.indexOf(ch, ti);
    if (at < 0) return -1;
    score += 1;
    if (at === prev + 1) score += 3;
    if (at === 0 || /[\s\-_]/.test(t[at - 1]!)) score += 4;
    prev = at;
    ti = at + 1;
  }
  return score - t.length * 0.02 + (t.startsWith(q) ? 6 : 0);
}

function useCommands({ project }: PanelProps): Command[] {
  return useMemo(() => {
    const { undo, redo, setScene } = editorStore.getState();
    const list: Command[] = SECTIONS.map((s, i) => ({
      id: `section:${s.id}`,
      group: 'Sections',
      label: s.label,
      hint: s.hint,
      icon: s.id,
      keys: i < 9 ? String(i + 1) : undefined,
      run: () => openSection(s.id),
    }));
    list.push(
      { id: 'act:play', group: 'Actions', label: 'Play the game', icon: 'play', run: () => setUI({ playing: true }) },
      { id: 'act:new-rule', group: 'Actions', label: 'New rule', hint: 'Opens Rules and starts a new sentence', icon: 'rules', run: startNewRule },
      { id: 'act:undo', group: 'Actions', label: 'Undo', icon: 'undo', keys: `${MOD} Z`, run: undo },
      { id: 'act:redo', group: 'Actions', label: 'Redo', icon: 'redo', keys: `Shift ${MOD} Z`, run: redo },
      { id: 'act:add-scene', group: 'Actions', label: 'Add a scene', icon: 'plus', run: addScene },
      { id: 'act:inspector', group: 'Actions', label: 'Show or hide the inspector', icon: 'inspect', keys: ']', run: toggleInspector },
      { id: 'act:drawer', group: 'Actions', label: 'Show or hide the side panel', icon: 'section', keys: '[', run: toggleDrawer },
      { id: 'act:assistant', group: 'Actions', label: 'How do I…? (step-by-step help)', hint: 'Type what you want to make', icon: 'search', keys: 'F1', run: () => setUI({ overlay: 'assistant' }) },
      { id: 'act:keys', group: 'Actions', label: 'Keyboard shortcuts', icon: 'keyboard', keys: '?', run: () => setUI({ overlay: 'shortcuts' }) },
      { id: 'act:home', group: 'Actions', label: 'Back to my games', icon: 'chevronLeft', run: () => openProject(null) },
    );
    for (const s of project.scenes)
      list.push({
        id: `scene:${s.id}`,
        group: 'Scenes',
        label: s.name,
        hint: s.id === project.startSceneId ? 'Start scene' : 'Scene',
        icon: s.id === project.startSceneId ? 'flag' : 'scenes',
        run: () => setScene(s.id),
      });
    for (const k of project.kinds) list.push({ id: `kind:${k.id}`, group: 'Things', label: k.name, hint: 'Select every one of these', icon: 'kind', run: () => selectKind(k.id) });
    return list;
  }, [project.scenes, project.kinds, project.startSceneId]);
}

const GROUP_ORDER: Command['group'][] = ['Sections', 'Actions', 'Scenes', 'Things'];

/** Ctrl/⌘ K: find and jump to any section, thing, scene or action. */
export function CommandPalette(props: PanelProps) {
  const open = useUI((s) => s.overlay === 'palette');
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && setUI({ overlay: null })}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-bg palette-bg" />
        {open && <PaletteBody {...props} />}
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PaletteBody(props: PanelProps) {
  const commands = useCommands(props);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    if (!query.trim()) return GROUP_ORDER.flatMap((g) => commands.filter((c) => c.group === g)).slice(0, 80);
    return commands
      .map((c) => ({ c, s: Math.max(fuzzyScore(query, c.label), fuzzyScore(query, `${c.group} ${c.label}`) - 3) }))
      .filter((r) => r.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 40)
      .map((r) => r.c);
  }, [commands, query]);

  const pick = (c: Command | undefined) => {
    if (!c) return;
    setUI({ overlay: null });
    c.run();
  };
  const move = (d: number) => {
    if (!results.length) return;
    const n = (active + d + results.length) % results.length;
    setActive(n);
    listRef.current?.querySelector(`[data-index="${n}"]`)?.scrollIntoView({ block: 'nearest' });
  };

  let lastGroup = '';
  return (
    <Dialog.Content className="palette" aria-describedby={undefined} data-testid="command-palette" onCloseAutoFocus={(e) => e.preventDefault()}>
      <Dialog.Title className="sr-only">Find anything</Dialog.Title>
      <div className="palette-input">
        <Icon name="search" size={18} />
        <input
          autoFocus
          value={query}
          placeholder="Jump to a section, scene, thing or action…"
          aria-label="Search"
          role="combobox"
          aria-expanded
          aria-controls="palette-list"
          aria-activedescendant={results[active] ? `palette-${results[active].id}` : undefined}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            listRef.current?.scrollTo({ top: 0 });
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') move(1);
            else if (e.key === 'ArrowUp') move(-1);
            else if (e.key === 'Enter') pick(results[active]);
            else return;
            e.preventDefault();
          }}
        />
        <span className="kbd">Esc</span>
      </div>
      <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
        {results.length === 0 && <div className="palette-empty">Nothing matches "{query}"</div>}
        {results.map((c, i) => {
          const head = !query.trim() && c.group !== lastGroup ? c.group : null;
          lastGroup = c.group;
          return (
            <div key={c.id}>
              {head && <div className="palette-group">{head}</div>}
              <div
                id={`palette-${c.id}`}
                role="option"
                aria-selected={i === active}
                data-index={i}
                className={`palette-item ${i === active ? 'on' : ''}`}
                onMouseMove={() => i !== active && setActive(i)}
                onClick={() => pick(c)}
              >
                <span className="palette-icon">
                  <Icon name={c.icon} size={16} />
                </span>
                <span className="grow">
                  {c.label}
                  {c.hint && <small>{c.hint}</small>}
                </span>
                {query.trim() && <span className="palette-tag">{c.group}</span>}
                {c.keys && <span className="kbd">{c.keys}</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="palette-foot">
        <span>
          <span className="kbd">↑</span> <span className="kbd">↓</span> move
        </span>
        <span>
          <span className="kbd">Enter</span> open
        </span>
        <span>
          <span className="kbd">{MOD} K</span> toggle
        </span>
      </div>
    </Dialog.Content>
  );
}
