import { useState } from 'react';
import { GENRES, OBJECT_PRESETS, type Genre, type ObjectPreset } from '@/presets';
import type { PanelProps } from '../panels';
import { DROP_HANDLERS, setDragPayload } from '../canvas/drop';
import { editorStore, useEditor } from '../store';
import { setUI } from '../ui-state';
import { FrameImg } from './AssetBrowser';
import './preset-drop';

const GENRE_LABEL: Record<Genre, string> = { platformer: 'Platformer', topdown: 'Top-down', clicker: 'Clicker' };

/** Ready-made objects with their stickers, values and rules. Drag onto the scene (or double-click) to add one (US3). */
export function ObjectPresetPanel({ lib }: PanelProps) {
  const [genre, setGenre] = useState<Genre | 'all'>('all');
  const sceneId = useEditor((s) => s.sceneId);
  const shown = OBJECT_PRESETS.filter((p) => genre === 'all' || p.genres.includes(genre));

  const placeCentre = (preset: ObjectPreset) => {
    const p = editorStore.getState().project;
    const scene = p?.scenes.find((s) => s.id === sceneId);
    if (!p || !scene) return;
    const at = { x: p.settings.screenWidth / 2, y: p.settings.screenHeight / 2 };
    const ids = DROP_HANDLERS.preset?.({ type: 'preset', presetId: preset.id }, at, { project: p, sceneId: scene.id, snap: null });
    if (ids) {
      editorStore.getState().select(ids.map((id) => ({ kind: 'object', id })));
      setUI({ rightTab: 'inspect', tool: 'select' });
    }
  };

  return (
    <div className="stack">
      <div className="row">
        <select className="field grow" value={genre} onChange={(e) => setGenre(e.target.value as Genre | 'all')} aria-label="Game type">
          <option value="all">All game types</option>
          {GENRES.map((g) => (
            <option key={g} value={g}>
              {GENRE_LABEL[g]}
            </option>
          ))}
        </select>
      </div>
      <p className="dim" style={{ margin: 0, fontSize: 12 }}>
        Drag a ready-made object onto the scene. It comes with its stickers and rules.
      </p>
      <div className="section">
        <h4>{genre === 'all' ? 'Ready-made objects' : GENRE_LABEL[genre]}</h4>
        <div className="grid">
          {shown.map((preset) => {
            const url = lib.url(preset.icon);
            return (
              <button
                key={preset.id}
                className="tile-btn"
                draggable
                onDragStart={(e) => setDragPayload(e, { type: 'preset', presetId: preset.id })}
                onDoubleClick={() => placeCentre(preset)}
                title={`${preset.name}: ${preset.description}`}
                data-testid={`preset-${preset.id}`}
              >
                {url ? <FrameImg url={url} frames={lib.info(preset.icon)?.frames ?? 1} /> : <span>?</span>}
                <span className="lbl">{preset.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
