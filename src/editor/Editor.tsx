import { useEffect, useState } from 'react';
import type { Autosave } from '@/storage/autosave';
import { useEditor, editorStore } from './store';
import { setUI, useUI } from './ui-state';
import { useLibrary } from './assets/library';
import { LEFT_TABS, RIGHT_TABS, type PanelTab, type PanelProps } from './panels';
import { SceneCanvas } from './canvas/SceneCanvas';
import { PlayView } from './play/PlayView';
import { SaveStatus } from './SaveStatus';
import { Logo } from './Logo';
import { openProject } from './App';
import { deleteObjects, duplicateObjects, moveObjects } from './store/world-ops';
import { toast } from './toast';
import { EXPORT_ACTIONS, TOP_BAR_EXTRAS, BACKUP_ACTION } from './topbar';

function Tabs({ tabs, active, onPick, props }: { tabs: PanelTab[]; active: string; onPick: (id: string) => void; props: PanelProps }) {
  const current = tabs.find((t) => t.id === active) ?? tabs[0]!;
  return (
    <>
      <div className="tabs" role="tablist">
        {tabs.map((t) => {
          const n = t.badge?.(props) ?? 0;
          return (
            <button key={t.id} role="tab" aria-selected={t.id === current.id} className={`tab ${t.id === current.id ? 'on' : ''}`} onClick={() => onPick(t.id)} data-tour={`tab-${t.id}`}>
              {t.label}
              {n > 0 && <span className="count">{n}</span>}
            </button>
          );
        })}
      </div>
      <div className="panel-body" role="tabpanel">
        {current.render(props)}
      </div>
    </>
  );
}

function isTyping(e: KeyboardEvent) {
  const t = e.target;
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t instanceof HTMLElement && t.isContentEditable);
}

/** Keyboard shortcuts: undo/redo, delete, duplicate, nudge (editing only, never while typing or playing). */
function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || useUI.getState().playing) return;
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

export function Editor({ autosave }: { autosave: Autosave }) {
  const project = useEditor((s) => s.project)!;
  const readOnly = useEditor((s) => s.readOnly);
  const canUndo = useEditor((s) => s.canUndo());
  const canRedo = useEditor((s) => s.canRedo());
  const undoLabel = useEditor((s) => s.undoLabel());
  const redoLabel = useEditor((s) => s.redoLabel());
  const { leftTab, rightTab, playing } = useUI();
  const lib = useLibrary(project);
  const [naming, setNaming] = useState(false);
  useShortcuts();
  useEffect(() => {
    if (lib.error) toast(lib.error, { error: true });
  }, [lib.error]);

  const props: PanelProps = { project, lib };
  return (
    <div className="editor" data-testid="editor">
      <div className="topbar">
        <button className="btn ghost icon" onClick={() => openProject(null)} aria-label="Back to my games" title="My games">
          <Logo size={28} />
        </button>
        {naming && !readOnly ? (
          <input
            className="field"
            autoFocus
            defaultValue={project.name}
            maxLength={60}
            aria-label="Game name"
            onBlur={(e) => {
              const v = e.currentTarget.value.trim();
              if (v && v !== project.name) editorStore.getState().edit('Rename game', (d) => void (d.name = v));
              setNaming(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setNaming(false);
            }}
          />
        ) : (
          <button className="btn ghost title" onClick={() => setNaming(true)} title="Rename">
            {project.name}
          </button>
        )}
        <span className="sep" />
        <button className="btn ghost icon" disabled={!canUndo || playing} onClick={() => editorStore.getState().undo()} title={undoLabel ? `Undo ${undoLabel} (Ctrl/⌘ Z)` : 'Undo'} aria-label="Undo">
          ↶
        </button>
        <button className="btn ghost icon" disabled={!canRedo || playing} onClick={() => editorStore.getState().redo()} title={redoLabel ? `Redo ${redoLabel} (Shift Ctrl/⌘ Z)` : 'Redo'} aria-label="Redo">
          ↷
        </button>
        <span className="grow" />
        {playing ? (
          <button className="btn danger solid" onClick={() => setUI({ playing: false })} data-testid="stop" data-tour="stop">
            ■ Stop
          </button>
        ) : (
          <button className="btn go" onClick={() => setUI({ playing: true })} data-testid="play" data-tour="play">
            ▶ Play
          </button>
        )}
        <span className="grow" />
        {TOP_BAR_EXTRAS.map((X, i) => (
          <X key={i} project={project} lib={lib} />
        ))}
        {EXPORT_ACTIONS.map((X, i) => (
          <X key={i} project={project} lib={lib} />
        ))}
        <SaveStatus autosave={autosave} onBackup={() => BACKUP_ACTION.run?.(project)} />
      </div>
      {readOnly && (
        <div className="banner" role="alert">
          This game is open in another tab, so it's read-only here. Close the other tab and reload to edit.
        </div>
      )}
      <div className="work" style={readOnly ? { height: 'calc(100vh - 52px - 36px)' } : undefined}>
        <aside className="panel left">
          <Tabs tabs={LEFT_TABS} active={leftTab} onPick={(id) => setUI({ leftTab: id })} props={props} />
        </aside>
        <main className="stage">
          <SceneCanvas project={project} lib={lib} />
          {playing && <PlayView project={project} lib={lib} />}
        </main>
        <aside className="panel right">
          <Tabs tabs={RIGHT_TABS} active={rightTab} onPick={(id) => setUI({ rightTab: id })} props={props} />
        </aside>
      </div>
    </div>
  );
}
