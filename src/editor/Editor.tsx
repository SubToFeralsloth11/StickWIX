import { useEffect, useState } from 'react';
import type { Autosave } from '@/storage/autosave';
import { useEditor, editorStore } from './store';
import { setUI, useUI } from './ui-state';
import { useLibrary } from './assets/library';
import type { PanelProps } from './panels';
import { SceneCanvas } from './canvas/SceneCanvas';
import { PlayView } from './play/PlayView';
import { SaveStatus } from './SaveStatus';
import { Logo } from './Logo';
import { openProject } from './App';
import { deleteObjects, duplicateObjects, moveObjects } from './store/world-ops';
import { toast } from './toast';
import { EXPORT_ACTIONS, TOP_BAR_EXTRAS, BACKUP_ACTION } from './topbar';
import { DeleteConfirm } from './DeleteConfirm';
import { TourOverlay } from './tour/TourOverlay';
import { Drawer, Rail } from './shell/Rail';
import { InspectorPane } from './shell/InspectorPane';
import { SceneTabs } from './shell/SceneTabs';
import { CommandPalette } from './shell/CommandPalette';
import { Assistant } from './help/assistant/Assistant';
import { ShortcutSheet } from './shell/ShortcutSheet';
import { useShellKeys } from './shell/useShellKeys';
import { Icon } from './shell/icons';
import { isTyping, MOD } from './shell/actions';

/** Keyboard shortcuts: undo/redo, delete, duplicate, nudge (editing only, never while typing or playing). */
function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || useUI.getState().playing || useUI.getState().overlay) return;
      const st = editorStore.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        st.redo();
        return;
      }
      const objs = st.selection.filter((s) => s.kind === 'object').map((s) => s.id);
      const sceneId = st.sceneId;
      if (!objs.length || !sceneId) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        st.edit(objs.length > 1 ? `Delete ${objs.length} objects` : 'Delete object', (d) => deleteObjects(d, sceneId, objs));
        st.select([]);
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        let ids: string[] = [];
        st.edit('Duplicate', (d) => void (ids = duplicateObjects(d, sceneId, objs)));
        st.select(ids.map((id) => ({ kind: 'object', id })));
      } else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 32 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        st.edit('Nudge', (d) => moveObjects(d, sceneId, objs, dx, dy));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function GameName({ name, readOnly }: { name: string; readOnly: boolean }) {
  const [naming, setNaming] = useState(false);
  if (naming && !readOnly)
    return (
      <input
        className="field title-field"
        autoFocus
        defaultValue={name}
        maxLength={60}
        aria-label="Game name"
        onBlur={(e) => {
          const v = e.currentTarget.value.trim();
          if (v && v !== name) editorStore.getState().edit('Rename game', (d) => void (d.name = v));
          setNaming(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setNaming(false);
        }}
      />
    );
  return (
    <button className="btn ghost title" onClick={() => setNaming(true)} title="Rename">
      {name}
    </button>
  );
}

export function Editor({ autosave }: { autosave: Autosave }) {
  const project = useEditor((s) => s.project)!;
  const readOnly = useEditor((s) => s.readOnly);
  const canUndo = useEditor((s) => s.canUndo());
  const canRedo = useEditor((s) => s.canRedo());
  const undoLabel = useEditor((s) => s.undoLabel());
  const redoLabel = useEditor((s) => s.redoLabel());
  const playing = useUI((s) => s.playing);
  const lib = useLibrary(project);
  useShortcuts();
  useShellKeys();
  useEffect(() => {
    if (lib.error) toast(lib.error, { error: true });
  }, [lib.error]);
  // Overlays never stay open into Play (the game owns the keyboard there).
  useEffect(() => {
    if (playing) setUI({ overlay: null });
  }, [playing]);

  const props: PanelProps = { project, lib };
  return (
    <div className={`editor ${playing ? 'playing' : ''}`} data-testid="editor">
      <header className="topbar">
        <div className="tb-side">
          <button className="btn ghost icon logo-btn" onClick={() => openProject(null)} aria-label="Back to my games" title="My games">
            <Logo size={30} />
          </button>
          <GameName name={project.name} readOnly={readOnly} />
          <span className="sep" />
          <button className="btn ghost icon" disabled={!canUndo || playing} onClick={() => editorStore.getState().undo()} title={undoLabel ? `Undo ${undoLabel} (${MOD} Z)` : 'Undo'} aria-label="Undo">
            <Icon name="undo" size={18} />
          </button>
          <button className="btn ghost icon" disabled={!canRedo || playing} onClick={() => editorStore.getState().redo()} title={redoLabel ? `Redo ${redoLabel} (Shift ${MOD} Z)` : 'Redo'} aria-label="Redo">
            <Icon name="redo" size={18} />
          </button>
        </div>
        <div className="tb-center">
          {playing ? (
            <button className="btn danger solid play-btn" onClick={() => setUI({ playing: false })} data-testid="stop" data-tour="stop">
              <Icon name="stop" size={16} /> Stop
            </button>
          ) : (
            <button className="btn go play-btn" onClick={() => setUI({ playing: true })} data-testid="play" data-tour="play">
              <Icon name="play" size={16} /> Play
            </button>
          )}
        </div>
        <div className="tb-side end">
          {!playing && (
            <button className="search-btn" onClick={() => setUI({ overlay: 'palette' })} data-testid="open-palette" title={`Find anything (${MOD} K)`}>
              <Icon name="search" size={15} />
              <span>Find</span>
              <span className="kbd">{MOD} K</span>
            </button>
          )}
          {!playing && (
            <button className="btn ghost ask-btn" onClick={() => setUI({ overlay: 'assistant' })} data-testid="open-assistant" title="Type what you want to make and get step-by-step help (F1)">
              <Icon name="search" size={15} /> How do I…?
            </button>
          )}
          {TOP_BAR_EXTRAS.map((X, i) => (
            <X key={i} project={project} lib={lib} />
          ))}
          {EXPORT_ACTIONS.map((X, i) => (
            <X key={i} project={project} lib={lib} />
          ))}
          <SaveStatus autosave={autosave} onBackup={() => BACKUP_ACTION.run?.(project)} />
        </div>
      </header>
      <DeleteConfirm />
      <TourOverlay />
      <CommandPalette {...props} />
      <ShortcutSheet />
      <Assistant />
      {readOnly && (
        <div className="banner" role="alert">
          This game is open in another tab, so it's read-only here. Close the other tab and reload to edit.
        </div>
      )}
      <div className="work">
        <Rail {...props} />
        <Drawer {...props} />
        <main className="stage">
          <SceneTabs {...props} />
          <SceneCanvas project={project} lib={lib} />
          {playing && <PlayView project={project} lib={lib} />}
        </main>
        <InspectorPane {...props} />
      </div>
    </div>
  );
}
