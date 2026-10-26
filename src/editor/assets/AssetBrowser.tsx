import { useMemo, useState } from 'react';
import type { PanelProps } from '../panels';
import { setDragPayload } from '../canvas/drop';
import { DROP_HANDLERS } from '../canvas/drop';
import { editorStore, useEditor } from '../store';
import { setUI } from '../ui-state';
import { ASSET_TOOLS } from './asset-tools';
import './place';

const CATEGORY_LABEL: Record<string, string> = {
  mine: 'My art',
  character: 'Characters',
  enemy: 'Enemies',
  item: 'Items',
  prop: 'Props',
  projectile: 'Projectiles',
  ui: 'Buttons & panels',
  background: 'Backgrounds',
};
const ORDER = ['mine', 'character', 'enemy', 'item', 'prop', 'projectile', 'ui', 'background'];

/** Built-in and custom art. Drag onto the scene (or double-click) to make an object (US1). */
export function AssetBrowser({ project, lib }: PanelProps) {
  const [q, setQ] = useState('');
  const [theme, setTheme] = useState('all');
  const sceneId = useEditor((s) => s.sceneId);
  const images = useMemo(() => lib.images(), [lib]);
  const shown = images.filter((i) => (theme === 'all' || i.theme === theme || i.theme === 'any') && i.name.toLowerCase().includes(q.trim().toLowerCase()));
  const groups = ORDER.map((c) => [c, shown.filter((i) => i.category === c)] as const).filter(([, list]) => list.length);

  const placeCentre = (img: (typeof images)[number]) => {
    const p = editorStore.getState().project;
    const scene = p?.scenes.find((s) => s.id === sceneId);
    if (!p || !scene) return;
    const ids = DROP_HANDLERS.image?.({ type: 'image', id: img.id, name: img.name, w: img.w, h: img.h }, { x: p.settings.screenWidth / 2, y: p.settings.screenHeight / 2 }, { project: p, sceneId: scene.id, snap: null });
    if (ids) {
      editorStore.getState().select(ids.map((id) => ({ kind: 'object', id })));
      setUI({ rightTab: 'inspect', tool: 'select' });
    }
  };

  if (!lib.ready) return <div className="muted">{lib.error ?? 'Loading art…'}</div>;
  return (
    <div className="stack" data-tour="art-panel">
      <div className="row">
        <input className="field grow" placeholder="Search art" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search art" />
        <select className="field" value={theme} onChange={(e) => setTheme(e.target.value)} aria-label="Game type">
          <option value="all">All</option>
          <option value="platformer">Platformer</option>
          <option value="topdown">Top-down</option>
          <option value="clicker">Clicker</option>
        </select>
      </div>
      {ASSET_TOOLS.map((T, i) => (
        <T key={i} project={project} lib={lib} />
      ))}
      <p className="dim" style={{ margin: 0, fontSize: 12 }}>
        Drag a picture onto the scene to make an object.
      </p>
      {project.kinds.length > 0 && (
        <div className="section">
          <h4>Kinds in this game</h4>
          <div className="grid">
            {project.kinds.map((k) => (
              <button
                key={k.id}
                className="tile-btn"
                draggable
                onDragStart={(e) => setDragPayload(e, { type: 'kind', kindId: k.id })}
                onClick={() => {
                  editorStore.getState().select([{ kind: 'kind', id: k.id }]);
                  setUI({ rightTab: 'inspect' });
                }}
                title={`${k.name}: drag to add another`}
              >
                {k.lookId && lib.url(k.lookId) ? <FrameImg url={lib.url(k.lookId)!} frames={lib.info(k.lookId)?.frames ?? 1} /> : <span>?</span>}
                <span className="lbl">{k.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {groups.map(([cat, list]) => (
        <div className="section" key={cat}>
          <h4>{CATEGORY_LABEL[cat] ?? cat}</h4>
          <div className="grid">
            {list.map((img) => (
              <button
                key={img.id}
                className="tile-btn"
                draggable
                onDragStart={(e) => setDragPayload(e, { type: 'image', id: img.id, name: img.name, w: img.w, h: img.h })}
                onDoubleClick={() => placeCentre(img)}
                title={`${img.name} (${img.w}×${img.h}${img.frames > 1 ? `, ${img.frames} frames` : ''})`}
                data-testid={`art-${img.id}`}
              >
                <FrameImg url={img.url} frames={img.frames} />
                <span className="lbl">{img.name}</span>
                {img.frames > 1 && <span className="badge">{img.frames}</span>}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** First frame of a horizontal strip. */
export function FrameImg({ url, frames }: { url: string; frames: number }) {
  if (frames <= 1) return <img src={url} alt="" draggable={false} />;
  return (
    <span style={{ width: '100%', height: '100%', display: 'block', overflow: 'hidden', position: 'relative' }}>
      <img src={url} alt="" draggable={false} style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${frames * 100}%`, maxWidth: 'none', objectFit: 'contain', objectPosition: 'left' }} />
    </span>
  );
}
