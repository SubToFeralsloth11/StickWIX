import { useState } from 'react';
import type { PanelProps } from '../panels';
import { editorStore, useEditor } from '../store';
import * as ops from '../store/world-ops';
import { DELETE_GUARD } from '../delete-guard';

/** Scenes: add, rename, reorder, duplicate, delete, choose the start scene (FR-006). */
export function ScenesPanel({ project }: PanelProps) {
  const sceneId = useEditor((s) => s.sceneId);
  const readOnly = useEditor((s) => s.readOnly);
  const [renaming, setRenaming] = useState<string | null>(null);
  const { edit, setScene } = editorStore.getState();

  return (
    <div className="stack" data-tour="scenes-panel">
      <div className="list">
        {project.scenes.map((s, i) => (
          <div key={s.id} className={`list-item ${s.id === sceneId ? 'on' : ''}`} onClick={() => setScene(s.id)} data-testid="scene-item">
            <span title={s.id === project.startSceneId ? 'The game starts here' : undefined}>{s.id === project.startSceneId ? '🏁' : '▫'}</span>
            {renaming === s.id ? (
              <input
                className="field grow"
                autoFocus
                defaultValue={s.name}
                maxLength={40}
                aria-label="Scene name"
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  const v = e.currentTarget.value;
                  setRenaming(null);
                  if (v.trim() && v !== s.name) edit('Rename scene', (d) => ops.renameScene(d, s.id, v));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') setRenaming(null);
                }}
              />
            ) : (
              <span className="grow" onDoubleClick={() => !readOnly && setRenaming(s.id)}>
                {s.name}
              </span>
            )}
            {!readOnly && (
              <span className="acts" onClick={(e) => e.stopPropagation()}>
                <button className="btn small ghost" disabled={i === 0} onClick={() => edit('Move scene', (d) => ops.moveScene(d, s.id, i - 1))} aria-label={`Move ${s.name} up`}>
                  ↑
                </button>
                <button className="btn small ghost" disabled={i === project.scenes.length - 1} onClick={() => edit('Move scene', (d) => ops.moveScene(d, s.id, i + 1))} aria-label={`Move ${s.name} down`}>
                  ↓
                </button>
                <button className="btn small ghost" onClick={() => setRenaming(s.id)} aria-label={`Rename ${s.name}`}>
                  ✎
                </button>
              </span>
            )}
          </div>
        ))}
      </div>
      {!readOnly && (
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button
            className="btn small"
            onClick={() => {
              let id = '';
              edit('Add scene', (d) => void (id = ops.addScene(d, 'Level')));
              setScene(id);
            }}
          >
            ＋ New scene
          </button>
          {sceneId && (
            <>
              <button
                className="btn small"
                onClick={() => {
                  let id = '';
                  edit('Duplicate scene', (d) => void (id = ops.duplicateScene(d, sceneId)));
                  setScene(id);
                }}
              >
                Duplicate
              </button>
              <button className="btn small" disabled={project.startSceneId === sceneId} onClick={() => edit('Set start scene', (d) => ops.setStartScene(d, sceneId))}>
                Start here
              </button>
              <button
                className="btn small danger"
                disabled={project.scenes.length <= 1}
                title={project.scenes.length <= 1 ? 'A game needs at least one scene' : undefined}
                onClick={() =>
                  DELETE_GUARD.request({ kind: 'scene', id: sceneId }, () => {
                    edit('Delete scene', (d) => void ops.deleteScene(d, sceneId));
                    setScene(editorStore.getState().project!.scenes[0]!.id);
                  })
                }
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
