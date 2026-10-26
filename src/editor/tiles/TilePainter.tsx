import type { PanelProps } from '../panels';
import { editorStore, useEditor } from '../store';
import { setUI, useUI } from '../ui-state';
import * as ops from '../store/world-ops';
import { TileSetEditor } from './TileSetEditor';

/** Tile set + tile picker for the Paint / Fill box tools (FR-007). */
export function TilePainter({ project, lib }: PanelProps) {
  const sceneId = useEditor((s) => s.sceneId);
  const readOnly = useEditor((s) => s.readOnly);
  const { tileIndex, tool } = useUI();
  const scene = project.scenes.find((s) => s.id === sceneId);
  if (!scene) return null;
  const ts = project.tileSets.find((t) => t.id === scene.tileLayer.tileSetId);
  const url = ts ? lib.url(ts.assetId) : undefined;

  return (
    <div className="stack" data-tour="tiles-panel">
      <label className="stack" style={{ gap: 4 }}>
        <span className="muted">Tile set for this scene</span>
        <select
          className="field"
          value={ts?.id ?? ''}
          disabled={readOnly}
          onChange={(e) => editorStore.getState().edit('Change tile set', (d) => ops.assignTileSet(d, scene.id, e.target.value))}
        >
          {!ts && <option value="">Choose…</option>}
          {project.tileSets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {(['brush', 'rect', 'erase'] as const).map((t) => (
          <button key={t} className={`btn small ${tool === t ? 'on' : ''}`} onClick={() => setUI({ tool: t })}>
            {t === 'brush' ? '✎ Paint' : t === 'rect' ? '▭ Fill box' : '⌫ Erase'}
          </button>
        ))}
      </div>
      {ts && url ? (
        <>
          <div className="muted" style={{ fontSize: 12 }}>
            Pick a tile, then paint on the scene. <b style={{ color: 'var(--sky)' }}>■</b> = solid, <b style={{ color: 'var(--mint)' }}>═</b> = jump-through.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(ts.columns, 6)}, 1fr)`, gap: 3 }} role="listbox" aria-label="Tiles">
            {Array.from({ length: ts.count }, (_, i) => (
              <button
                key={i}
                role="option"
                aria-selected={tileIndex === i}
                className={`tile-btn ${tileIndex === i ? 'on' : ''}`}
                style={{ padding: 2 }}
                onClick={() => setUI({ tileIndex: i, tool: tool === 'select' || tool === 'erase' ? 'brush' : tool })}
                title={`Tile ${i + 1}${ts.oneWay[i] ? ' (jump-through)' : ts.solid[i] ? ' (solid)' : ''}`}
                data-testid={`tile-${i}`}
              >
                <span
                  style={{
                    display: 'block', width: '100%', aspectRatio: '1', imageRendering: 'pixelated',
                    backgroundImage: `url(${url})`,
                    backgroundSize: `${ts.columns * 100}% auto`,
                    backgroundPosition: `${(i % ts.columns) * (100 / Math.max(1, ts.columns - 1))}% ${Math.floor(i / ts.columns) * (100 / Math.max(1, Math.ceil(ts.count / ts.columns) - 1))}%`,
                  }}
                />
                {(ts.solid[i] || ts.oneWay[i]) && (
                  <span className="badge" style={{ background: ts.oneWay[i] ? 'var(--mint)' : 'var(--sky)' }}>
                    {ts.oneWay[i] ? '═' : '■'}
                  </span>
                )}
              </button>
            ))}
          </div>
          {!readOnly && <TileSetEditor tileSet={ts} index={tileIndex} />}
        </>
      ) : (
        <div className="empty">Choose a tile set above to start painting.</div>
      )}
    </div>
  );
}
