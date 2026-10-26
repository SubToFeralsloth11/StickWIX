import { useRef, useState } from 'react';
import type { Anchor, UIElement } from '@/model/schema';
import { Values } from '@/runtime/values';
import { layoutUI } from '@/runtime/ui-layer';
import type { PanelProps } from '../panels';
import type { OverlayProps } from '../canvas/SceneCanvas';
import { editorStore, useEditor } from '../store';
import { setUI, useUI } from '../ui-state';
import * as ops from '../store/world-ops';
import { DELETE_GUARD } from '../delete-guard';
import { HelpTip } from '../help/HelpTip';

const ANCHORS: Anchor[] = ['tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br'];

function patchUI(sceneId: string, id: string, label: string, patch: (el: UIElement) => void) {
  editorStore.getState().edit(label, (d) => {
    const el = ops.sceneOf(d, sceneId).ui.find((u) => u.id === id);
    if (el) patch(el as UIElement);
  });
}

/** Screen layer: text that can show values, buttons and images fixed to the screen (FR-010). */
export function UILayerEditor({ project, lib }: PanelProps) {
  const sceneId = useEditor((s) => s.sceneId) ?? project.startSceneId;
  const readOnly = useEditor((s) => s.readOnly);
  const selected = useUI((s) => s.uiSelection);
  const scene = project.scenes.find((s) => s.id === sceneId)!;
  const el = scene.ui.find((u) => u.id === selected);
  const add = (type: UIElement['type']) => {
    let id = '';
    editorStore.getState().edit(`Add ${type}`, (d) => {
      const firstValue = d.values[0]?.name;
      id = ops.addUIElement(d, sceneId, type, type === 'text' ? { text: firstValue ? `${firstValue}: {${firstValue}}` : 'Hello!' } : type === 'image' ? { lookId: 'builtin:img/heart' } : {});
    });
    setUI({ uiSelection: id });
  };
  return (
    <div className="stack" data-tour="screen-panel">
      <p className="muted" style={{ margin: 0 }}>
        Things stuck to the screen. They stay put when the camera scrolls. Drag them inside the yellow screen frame.
      </p>
      {!readOnly && (
        <div className="row">
          <button className="btn small primary" onClick={() => add('text')} data-testid="add-ui-text">
            ＋ Text
          </button>
          <button className="btn small primary" onClick={() => add('button')} data-testid="add-ui-button">
            ＋ Button
          </button>
          <button className="btn small primary" onClick={() => add('image')}>
            ＋ Image
          </button>
        </div>
      )}
      <div className="list">
        {scene.ui.map((u) => (
          <div key={u.id} className={`list-item ${u.id === selected ? 'on' : ''}`} onClick={() => setUI({ uiSelection: u.id })}>
            <span className="chip">{u.type}</span>
            <span className="grow">{u.name}</span>
          </div>
        ))}
      </div>
      {el && (
        <div className="sticker" style={{ padding: 10 }}>
          <div className="stack">
            <label className="row">
              <span className="muted">Name</span>
              <input key={el.id + el.name} className="field grow" aria-label="Screen item name" defaultValue={el.name} maxLength={40} disabled={readOnly} onBlur={(e) => {
                const v = e.currentTarget.value.trim();
                if (v && v !== el.name && !scene.ui.some((u) => u.id !== el.id && u.name.toLowerCase() === v.toLowerCase())) patchUI(sceneId, el.id, 'Rename', (x) => void (x.name = v));
              }} />
              <HelpTip text="Rules use this name, e.g. 'When Upgrade is clicked'." />
            </label>
            {el.type !== 'image' && (
              <label className="stack" style={{ gap: 3 }}>
                <span className="muted">
                  Words {project.values.length > 0 && <>(show a value with {'{'}{project.values[0]!.name}{'}'})</>}
                </span>
                <input key={el.id + el.text} className="field" defaultValue={el.text} maxLength={200} disabled={readOnly} onBlur={(e) => e.currentTarget.value !== el.text && patchUI(sceneId, el.id, 'Change text', (x) => void (x.text = e.currentTarget.value))} />
                {!readOnly && project.values.length > 0 && (
                  <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
                    {project.values.map((v) => (
                      <button key={v.id} className="btn small" onClick={() => patchUI(sceneId, el.id, 'Insert value', (x) => void (x.text = `${x.text}{${v.name}}`))}>
                        + {v.name}
                      </button>
                    ))}
                  </div>
                )}
              </label>
            )}
            <div className="row">
              <span className="muted">Stick to</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 22px)', gap: 2 }} role="radiogroup" aria-label="Screen corner">
                {ANCHORS.map((a) => (
                  <button key={a} role="radio" aria-checked={el.anchor === a} aria-label={a} className={`btn small ${el.anchor === a ? 'on' : ''}`} style={{ width: 22, height: 22, padding: 0 }} disabled={readOnly} onClick={() => patchUI(sceneId, el.id, 'Change corner', (x) => void (x.anchor = a))} />
                ))}
              </div>
              <span className="grow" />
              {(['x', 'y'] as const).map((k) => (
                <input key={k + el[k]} className="field" type="number" style={{ width: 64 }} defaultValue={el[k]} aria-label={k} disabled={readOnly} onBlur={(e) => {
                  const n = Number(e.currentTarget.value);
                  if (Number.isFinite(n) && n !== el[k]) patchUI(sceneId, el.id, 'Move', (x) => void (x[k] = n));
                }} />
              ))}
            </div>
            {el.type !== 'image' && (
              <div className="row">
                <span className="muted">Size</span>
                <input key={'s' + el.style.size} className="field" type="number" min={6} max={200} style={{ width: 64 }} defaultValue={el.style.size} disabled={readOnly} onBlur={(e) => {
                  const n = Math.round(Number(e.currentTarget.value));
                  if (n >= 6 && n <= 200 && n !== el.style.size) patchUI(sceneId, el.id, 'Text size', (x) => void (x.style.size = n));
                }} />
                <input type="color" value={el.style.color} disabled={readOnly} aria-label="Colour" onChange={(e) => patchUI(sceneId, el.id, 'Text colour', (x) => void (x.style.color = e.target.value))} />
                <select className="field" value={el.style.font} disabled={readOnly} aria-label="Font" onChange={(e) => patchUI(sceneId, el.id, 'Font', (x) => void (x.style.font = e.target.value as UIElement['style']['font']))}>
                  <option value="round">Round</option>
                  <option value="pixel">Pixel</option>
                  <option value="bold">Bold</option>
                </select>
              </div>
            )}
            {el.type !== 'text' && (
              <label className="row">
                <span className="muted">Picture</span>
                <select className="field grow" value={el.lookId ?? ''} disabled={readOnly} onChange={(e) => patchUI(sceneId, el.id, 'Change picture', (x) => void (x.lookId = e.target.value || null))}>
                  <option value="">{el.type === 'button' ? '(plain button)' : '(none)'}</option>
                  {lib.images().map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="row">
              <input type="checkbox" checked={el.hidden} disabled={readOnly} onChange={(e) => patchUI(sceneId, el.id, e.target.checked ? 'Hide at start' : 'Show at start', (x) => void (x.hidden = e.target.checked))} />
              Hidden at start
            </label>
            {!readOnly && (
              <button
                className="btn small danger"
                onClick={() =>
                  DELETE_GUARD.request({ kind: 'ui', id: el.id }, () => {
                    editorStore.getState().edit(`Delete ${el.name}`, (d) => {
                      const s = ops.sceneOf(d, sceneId);
                      s.ui = s.ui.filter((u) => u.id !== el.id);
                    });
                    setUI({ uiSelection: null });
                  })
                }
              >
                Delete {el.name}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Draws screen items inside the screen frame on the canvas; drag to move them. */
export function UILayerOverlay({ project, scene, lib, toView, zoom }: OverlayProps) {
  const selected = useUI((s) => s.uiSelection);
  const rightTab = useUI((s) => s.rightTab);
  const readOnly = useEditor((s) => s.readOnly);
  const drag = useRef<{ id: string; sx: number; sy: number; x: number; y: number } | null>(null);
  const [delta, setDelta] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const screen = { w: project.settings.screenWidth, h: project.settings.screenHeight };
  const values = new Values(project, () => {}, null);
  const origin = toView(0, 0);
  return (
    <>
      {scene.ui.map((el) => {
        const box = layoutUI(el, values.format(el.text), screen, (id) => lib.info(id));
        const d = delta?.id === el.id ? delta : null;
        const look = el.lookId ? lib.url(el.lookId) : undefined;
        return (
          <div
            key={el.id}
            className={`ui-el ${selected === el.id ? 'selected' : ''}`}
            title={`${el.name} (screen ${el.type})`}
            style={{
              left: origin.x + (box.x + (d?.dx ?? 0)) * zoom, top: origin.y + (box.y + (d?.dy ?? 0)) * zoom, width: box.w * zoom, height: box.h * zoom,
              opacity: el.hidden ? 0.45 : 1, display: 'grid', placeItems: 'center', overflow: 'hidden',
              background: el.type === 'button' && !look ? '#ff7a59' : undefined, borderRadius: el.type === 'button' ? 10 : 2,
              color: el.style.color, fontSize: el.style.size * zoom, fontWeight: 800, whiteSpace: 'nowrap',
              textShadow: '0 2px 0 #15131c, 0 -1px 0 #15131c, 2px 0 0 #15131c, -2px 0 0 #15131c',
              backgroundImage: look ? `url(${look})` : undefined, backgroundSize: '100% 100%', imageRendering: 'pixelated',
              fontFamily: el.style.font === 'pixel' ? '"Courier New", monospace' : el.style.font === 'bold' ? 'Impact, "Arial Black", sans-serif' : 'inherit',
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              setUI({ uiSelection: el.id, ...(rightTab !== 'screen' ? { rightTab: 'screen' } : {}) });
              if (readOnly) return;
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              drag.current = { id: el.id, sx: e.clientX, sy: e.clientY, x: el.x, y: el.y };
            }}
            onPointerMove={(e) => {
              const g = drag.current;
              if (g) setDelta({ id: g.id, dx: (e.clientX - g.sx) / zoom, dy: (e.clientY - g.sy) / zoom });
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              const g = drag.current;
              drag.current = null;
              setDelta(null);
              if (!g) return;
              const dx = Math.round((e.clientX - g.sx) / zoom);
              const dy = Math.round((e.clientY - g.sy) / zoom);
              if (dx || dy) patchUI(scene.id, g.id, 'Move screen item', (x) => {
                x.x = g.x + dx;
                x.y = g.y + dy;
              });
            }}
          >
            {el.type !== 'image' ? box.text : ''}
          </div>
        );
      })}
    </>
  );
}
