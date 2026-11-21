import type { PanelProps } from '../panels';
import { editorStore, useEditor } from '../store';
import { Icon } from './icons';
import { addScene, openSection } from './actions';

/** Quick scene switcher above the canvas. Double-click a tab to manage scenes. */
export function SceneTabs({ project }: PanelProps) {
  const sceneId = useEditor((s) => s.sceneId);
  const readOnly = useEditor((s) => s.readOnly);
  return (
    <div className="scene-tabs" role="tablist" aria-label="Scenes">
      {project.scenes.map((s) => {
        const on = s.id === sceneId;
        const start = s.id === project.startSceneId;
        return (
          <button
            key={s.id}
            role="tab"
            aria-selected={on}
            className={`scene-tab ${on ? 'on' : ''}`}
            onClick={() => editorStore.getState().setScene(s.id)}
            onDoubleClick={() => openSection('scenes')}
            title={start ? `${s.name}: the game starts here` : `${s.name} (double-click to rename or reorder)`}
            data-testid="scene-tab"
          >
            {start && <Icon name="flag" size={13} />}
            <span>{s.name}</span>
          </button>
        );
      })}
      {!readOnly && (
        <button className="scene-tab add" onClick={addScene} aria-label="Add a scene" title="Add a scene">
          <Icon name="plus" size={15} />
        </button>
      )}
    </div>
  );
}
