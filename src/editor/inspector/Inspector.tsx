import type { ComponentType } from 'react';
import type { Kind, ObjectInstance, Project, Scene } from '@/model/schema';
import type { Library } from '../assets/library';
import type { PanelProps } from '../panels';
import { editorStore, useEditor } from '../store';
import { setUI, useUI } from '../ui-state';
import * as ops from '../store/world-ops';
import { StickerCard } from './StickerCard';
import { AddStickerMenu } from './AddStickerMenu';
import { FrameImg } from '../assets/AssetBrowser';
import { HelpTip } from '../help/HelpTip';
import { DELETE_GUARD } from '../delete-guard';

export interface KindSectionProps {
  project: Project;
  lib: Library;
  kind: Kind;
  /** The selected object, when one is selected. */
  object?: ObjectInstance;
  scene: Scene;
}

/** Extra Kind sections (values of each object, rules about this Kind) added by other panels. */
export const INSPECTOR_SECTIONS: ComponentType<KindSectionProps>[] = [];

/** Edit what is selected: an object/Kind, several objects, or the scene and game settings. */
export function Inspector({ project, lib }: PanelProps) {
  const selection = useEditor((s) => s.selection);
  const sceneId = useEditor((s) => s.sceneId);
  const scene = project.scenes.find((s) => s.id === sceneId) ?? project.scenes[0]!;
  const objs = selection.filter((s) => s.kind === 'object');
  const kindSel = selection.find((s) => s.kind === 'kind');

  if (objs.length > 1) return <div className="muted">{objs.length} objects selected. Use the bar above the scene to move them to the front or back, duplicate or delete them.</div>;
  const object = objs.length === 1 ? scene.objects.find((o) => o.id === objs[0]!.id) : undefined;
  const kind = project.kinds.find((k) => k.id === (object?.kindId ?? kindSel?.id));
  if (kind) return <KindInspector project={project} lib={lib} kind={kind} object={object} scene={scene} />;
  return <SceneSettings project={project} lib={lib} scene={scene} />;
}

function KindInspector({ project, lib, kind, object, scene }: KindSectionProps) {
  const readOnly = useEditor((s) => s.readOnly);
  const scope = useUI((s) => s.editScope);
  const { edit } = editorStore.getState();
  const perObject = !!object && scope === 'object';
  const count = project.scenes.reduce((n, s) => n + s.objects.filter((o) => o.kindId === kind.id).length, 0);
  const look = (perObject && object?.overrides.lookId !== undefined ? object.overrides.lookId : kind.lookId) ?? null;

  return (
    <div className="stack" data-testid="inspector">
      <div className="row">
        <div className="tile-btn" style={{ width: 56, flex: 'none' }}>
          {look && lib.url(look) ? <FrameImg url={lib.url(look)!} frames={lib.info(look)?.frames ?? 1} /> : '?'}
        </div>
        <div className="grow stack" style={{ gap: 2 }}>
          <input
            key={kind.id + kind.name}
            className="field"
            defaultValue={kind.name}
            disabled={readOnly}
            maxLength={40}
            aria-label="Kind name"
            onBlur={(e) => {
              const v = e.currentTarget.value.trim();
              if (v && v !== kind.name)
                edit('Rename Kind', (d) => {
                  const k = d.kinds.find((x) => x.id === kind.id)!;
                  k.name = d.kinds.some((x) => x.id !== kind.id && x.name.toLowerCase() === v.toLowerCase()) ? `${v} 2` : v;
                });
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
          <span className="muted" style={{ fontSize: 12 }}>
            A Kind of thing · {count} in the game
          </span>
        </div>
      </div>

      {object && (
        <div className="row" role="radiogroup" aria-label="What to change" data-tour="edit-scope">
          <span className="muted">Change</span>
          <button role="radio" aria-checked={scope === 'kind'} className={`btn small ${scope === 'kind' ? 'on' : ''}`} onClick={() => setUI({ editScope: 'kind' })}>
            Every {kind.name}
          </button>
          <button role="radio" aria-checked={scope === 'object'} className={`btn small ${scope === 'object' ? 'on' : ''}`} onClick={() => setUI({ editScope: 'object' })}>
            Just this one
          </button>
          <HelpTip text="Changes to every object of this Kind, or only to the selected one." />
        </div>
      )}

      <div className="section">
        <h4>Look</h4>
        <select
          className="field"
          style={{ width: '100%' }}
          value={look ?? ''}
          disabled={readOnly}
          aria-label="Look"
          onChange={(e) => {
            const v = e.target.value || null;
            edit('Change look', (d) => {
              if (perObject && object) {
                const o = ops.sceneOf(d, scene.id).objects.find((x) => x.id === object.id)!;
                o.overrides.lookId = v;
              } else {
                const k = d.kinds.find((x) => x.id === kind.id)!;
                k.lookId = v;
                const info = v ? lib.info(v) : undefined;
                if (info) k.size = { w: info.w, h: info.h };
              }
            });
          }}
        >
          <option value="">(none)</option>
          {lib.images().map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        {!perObject && (
          <div className="row" style={{ marginTop: 6 }}>
            <span className="muted">Size</span>
            {(['w', 'h'] as const).map((axis) => (
              <input
                key={axis + kind.size[axis]}
                className="field"
                style={{ width: 70 }}
                type="number"
                min={1}
                max={4096}
                defaultValue={kind.size[axis]}
                disabled={readOnly}
                aria-label={axis === 'w' ? 'Width' : 'Height'}
                onBlur={(e) => {
                  const v = Math.round(Number(e.currentTarget.value));
                  if (v >= 1 && v <= 4096 && v !== kind.size[axis]) edit('Resize Kind', (d) => void (d.kinds.find((x) => x.id === kind.id)!.size[axis] = v));
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="section" data-tour="stickers">
        <h4>
          Stickers <HelpTip text="Ready-made behaviours. Stick one on, then tune its sliders." />
        </h4>
        {kind.stickers.length === 0 && <div className="empty" style={{ marginBottom: 8 }}>No stickers yet. This {kind.name} just sits there.</div>}
        {kind.stickers.map((s) => (
          <StickerCard
            key={s.id}
            project={project}
            lib={lib}
            sticker={s}
            overrides={perObject ? (object?.overrides.stickers?.[s.id] ?? {}) : undefined}
            readOnly={readOnly}
            onChange={(key, value) =>
              edit(perObject ? `Change this ${kind.name}` : `Change every ${kind.name}`, (d) =>
                ops.setStickerSetting(d, kind.id, s.id, key, value, perObject && object ? { sceneId: scene.id, objectId: object.id } : undefined),
              )
            }
            onReset={(key) => object && edit('Use Kind setting', (d) => ops.clearOverride(d, scene.id, object.id, s.id, key))}
            onRemove={() => edit(`Remove ${s.type}`, (d) => ops.removeSticker(d, kind.id, s.id))}
          />
        ))}
        {!readOnly && !perObject && <AddStickerMenu kindId={kind.id} kindName={kind.name} have={kind.stickers.map((s) => s.type)} />}
      </div>

      {INSPECTOR_SECTIONS.map((S, i) => (
        <S key={i} project={project} lib={lib} kind={kind} object={object} scene={scene} />
      ))}

      {object && <ObjectSection object={object} scene={scene} readOnly={readOnly} />}

      {!readOnly && (
        <button
          className="btn small danger"
          onClick={() =>
            DELETE_GUARD.request({ kind: 'kind', id: kind.id }, () => {
              edit(`Delete ${kind.name}`, (d) => {
                d.kinds = d.kinds.filter((k) => k.id !== kind.id);
                for (const s of d.scenes) s.objects = s.objects.filter((o) => o.kindId !== kind.id);
              });
              editorStore.getState().select([]);
            })
          }
        >
          Delete the {kind.name} Kind and all {count} of them
        </button>
      )}
    </div>
  );
}

function ObjectSection({ object, scene, readOnly }: { object: ObjectInstance; scene: Scene; readOnly: boolean }) {
  const { edit } = editorStore.getState();
  const num = (key: 'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY', label: string, step = 1) => (
    <label className="stack" style={{ gap: 2 }}>
      <span className="muted" style={{ fontSize: 12 }}>
        {label}
      </span>
      <input
        key={key + object[key]}
        className="field"
        type="number"
        step={step}
        defaultValue={Math.round(object[key] * 100) / 100}
        disabled={readOnly}
        onBlur={(e) => {
          const v = Number(e.currentTarget.value);
          if (Number.isFinite(v) && v !== object[key]) edit('Change object', (d) => ops.setObjectTransform(d, scene.id, object.id, { [key]: v }));
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </label>
  );
  return (
    <div className="section">
      <h4>This object</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        {num('x', 'X')}
        {num('y', 'Y')}
        {num('rotation', 'Turn °', 15)}
        {num('scaleX', 'Width ×', 0.25)}
        {num('scaleY', 'Height ×', 0.25)}
      </div>
      <label className="row" style={{ marginTop: 8 }}>
        <input
          type="checkbox"
          checked={!!object.overrides.hidden}
          disabled={readOnly}
          onChange={(e) =>
            edit(e.target.checked ? 'Hide at start' : 'Show at start', (d) => {
              const o = ops.sceneOf(d, scene.id).objects.find((x) => x.id === object.id)!;
              if (e.target.checked) o.overrides.hidden = true;
              else delete o.overrides.hidden;
            })
          }
        />
        Hidden when the scene starts <HelpTip text='Starts invisible; a rule with "appears" can show it.' />
      </label>
    </div>
  );
}

function SceneSettings({ project, lib, scene }: { project: Project; lib: Library; scene: Scene }) {
  const readOnly = useEditor((s) => s.readOnly);
  const { edit } = editorStore.getState();
  const bgs = lib.images().filter((i) => i.category === 'background');
  const bgValue = 'color' in scene.background ? 'color' : `${scene.background.assetId}|${scene.background.mode}`;
  return (
    <div className="stack" data-testid="scene-settings">
      <div className="muted">Nothing selected. Click an object on the scene to change it.</div>
      <div className="section">
        <h4>Scene: {scene.name}</h4>
        <div className="row">
          <span className="muted">Size</span>
          {(['width', 'height'] as const).map((k) => (
            <input
              key={k + scene[k]}
              className="field"
              type="number"
              style={{ width: 84 }}
              defaultValue={scene[k]}
              disabled={readOnly}
              aria-label={`Scene ${k}`}
              onBlur={(e) => {
                const v = Number(e.currentTarget.value);
                if (Number.isFinite(v) && v !== scene[k]) edit('Resize scene', (d) => ops.resizeScene(d, scene.id, k === 'width' ? v : scene.width, k === 'height' ? v : scene.height));
              }}
            />
          ))}
        </div>
        <label className="stack" style={{ gap: 4, marginTop: 8 }}>
          <span className="muted">Background</span>
          <select
            className="field"
            value={bgValue}
            disabled={readOnly}
            onChange={(e) =>
              edit('Change background', (d) => {
                const s = ops.sceneOf(d, scene.id);
                if (e.target.value === 'color') s.background = { color: 'color' in scene.background ? scene.background.color : '#87ceeb' };
                else {
                  const [assetId, mode] = e.target.value.split('|') as [string, 'stretch' | 'tile' | 'parallax'];
                  s.background = { assetId, mode };
                }
              })
            }
          >
            <option value="color">Plain colour</option>
            {bgs.flatMap((b) =>
              (['parallax', 'stretch', 'tile'] as const).map((m) => (
                <option key={b.id + m} value={`${b.id}|${m}`}>
                  {b.name} ({m === 'parallax' ? 'scrolls slowly' : m === 'stretch' ? 'fills screen' : 'repeats'})
                </option>
              )),
            )}
          </select>
        </label>
        {'color' in scene.background && (
          <input
            type="color"
            value={scene.background.color}
            disabled={readOnly}
            aria-label="Background colour"
            onChange={(e) => edit('Change background colour', (d) => void (ops.sceneOf(d, scene.id).background = { color: e.target.value }))}
            style={{ marginTop: 6, width: '100%', height: 32, border: 0, background: 'none' }}
          />
        )}
      </div>
      <div className="section">
        <h4>Whole game</h4>
        <label className="stack" style={{ gap: 4 }}>
          <span className="muted">Music</span>
          <select
            className="field"
            value={project.settings.backgroundMusic ?? ''}
            disabled={readOnly}
            onChange={(e) => edit('Change music', (d) => void (d.settings.backgroundMusic = e.target.value || null))}
          >
            <option value="">No music</option>
            {lib
              .sounds()
              .filter((s) => s.category === 'music' || s.category === 'mine')
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>
        <div className="row" style={{ marginTop: 8 }}>
          <span className="muted">Screen</span>
          <select
            className="field"
            value={`${project.settings.screenWidth}x${project.settings.screenHeight}`}
            disabled={readOnly}
            onChange={(e) => {
              const [w, h] = e.target.value.split('x').map(Number) as [number, number];
              edit('Change screen size', (d) => {
                d.settings.screenWidth = w;
                d.settings.screenHeight = h;
                for (const s of d.scenes) {
                  s.width = Math.max(s.width, w);
                  s.height = Math.max(s.height, h);
                }
              });
            }}
          >
            {['640x360', '800x450', '960x540', '1280x720', '640x480', '800x600', '480x640'].map((s) => (
              <option key={s} value={s}>
                {s.replace('x', ' × ')}
              </option>
            ))}
          </select>
        </div>
        <label className="row" style={{ marginTop: 8 }}>
          <input type="checkbox" checked={project.settings.pixelArt} disabled={readOnly} onChange={(e) => edit('Change pixel art', (d) => void (d.settings.pixelArt = e.target.checked))} />
          Crisp pixel art <HelpTip text="Keeps pixel art sharp when the game is scaled up." />
        </label>
      </div>
    </div>
  );
}
