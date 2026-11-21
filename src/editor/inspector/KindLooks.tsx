import { useEffect, useState } from 'react';
import type { Kind } from '@/model/schema';
import { newId, uniqueName } from '@/model/ids';
import type { Library } from '../assets/library';
import { editorStore } from '../store';
import { HelpTip } from '../help/HelpTip';
import '../features.css';

/** A look playing its frames at `fps` (or looping once a second through a single frame). */
export function AnimPreview({ lib, lookId, fps, size = 44 }: { lib: Library; lookId: string | null; fps: number; size?: number }) {
  const url = lookId ? lib.url(lookId) : undefined;
  const frames = lookId ? (lib.info(lookId)?.frames ?? 1) : 1;
  const [f, setF] = useState(0);
  useEffect(() => {
    if (frames <= 1) return;
    const t = setInterval(() => setF((x) => (x + 1) % frames), 1000 / Math.max(1, fps));
    return () => clearInterval(t);
  }, [frames, fps]);
  if (!url) return <span className="anim-prev empty-prev" style={{ width: size, height: size }}>?</span>;
  return (
    <span
      className="anim-prev"
      style={{ width: size, height: size, backgroundImage: `url("${url}")`, backgroundSize: `${frames * 100}% 100%`, backgroundPositionX: frames > 1 ? `${(f / (frames - 1)) * 100}%` : '0%' }}
    />
  );
}

const editKind = (label: string, kindId: string, fn: (k: Kind) => void) =>
  editorStore.getState().edit(label, (d) => {
    const k = d.kinds.find((x) => x.id === kindId);
    if (k) fn(k as Kind);
  });

/** Named animations of a Kind ("walk", "mine"...) that rules and the Animator sticker play. */
export function AnimationsSection({ kind, lib, readOnly }: { kind: Kind; lib: Library; readOnly: boolean }) {
  const images = lib.images().filter((i) => i.category !== 'background');
  return (
    <div className="section" data-testid="animations">
      <h4>
        <span className="row" style={{ gap: 6 }}>
          Animations <HelpTip text='Give this Kind animations with names like "walk" or "mine". Rules can play them ("plays its walk animation") and the Animator sticker switches them by itself.' />
        </span>
      </h4>
      {kind.animations.length === 0 && <div className="empty" style={{ marginBottom: 8 }}>No animations yet. Multi-frame looks become animations you can start and stop.</div>}
      <div className="stack">
        {kind.animations.map((a) => (
          <div key={a.id} className="anim-row">
            <AnimPreview lib={lib} lookId={a.lookId ?? kind.lookId} fps={a.fps} />
            <div className="grow stack" style={{ gap: 4 }}>
              <div className="row">
                <input
                  key={a.id + a.name}
                  className="field grow"
                  defaultValue={a.name}
                  maxLength={30}
                  disabled={readOnly}
                  aria-label="Animation name"
                  onBlur={(e) => {
                    const v = e.currentTarget.value.trim();
                    if (!v || v === a.name) return;
                    editKind('Rename animation', kind.id, (k) => {
                      const x = k.animations.find((y) => y.id === a.id)!;
                      const name = uniqueName(v, k.animations.filter((y) => y.id !== a.id).map((y) => y.name), 30);
                      if (k.startAnim === x.name) k.startAnim = name;
                      x.name = name;
                    });
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                />
                <button className="btn small ghost danger" disabled={readOnly} aria-label={`Delete animation ${a.name}`} onClick={() => editKind('Delete animation', kind.id, (k) => {
                  k.animations = k.animations.filter((y) => y.id !== a.id);
                  if (k.startAnim === a.name) k.startAnim = null;
                })}>
                  ✕
                </button>
              </div>
              <select
                className="field"
                value={a.lookId ?? ''}
                disabled={readOnly}
                aria-label="Animation look"
                onChange={(e) => editKind('Change animation look', kind.id, (k) => void (k.animations.find((y) => y.id === a.id)!.lookId = e.target.value || null))}
              >
                <option value="">(its normal look)</option>
                {images.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                    {i.frames > 1 ? ` (${i.frames} frames)` : ''}
                  </option>
                ))}
              </select>
              <div className="row">
                <input
                  type="range"
                  min={1}
                  max={30}
                  step={1}
                  value={a.fps}
                  disabled={readOnly}
                  aria-label="Animation speed"
                  onChange={(e) => editKind('Change animation speed', kind.id, (k) => void (k.animations.find((y) => y.id === a.id)!.fps = Number(e.target.value)))}
                />
                <b className="set-val">{a.fps} fps</b>
                <label className="row" style={{ gap: 4, fontSize: 12 }}>
                  <input type="checkbox" checked={a.loop} disabled={readOnly} onChange={(e) => editKind('Change animation loop', kind.id, (k) => void (k.animations.find((y) => y.id === a.id)!.loop = e.target.checked))} />
                  loop
                </label>
              </div>
            </div>
          </div>
        ))}
      </div>
      {!readOnly && (
        <button
          className="btn small"
          style={{ marginTop: 8 }}
          onClick={() =>
            editKind('Add animation', kind.id, (k) => {
              const name = uniqueName(k.animations.length ? 'animation' : 'walk', k.animations.map((y) => y.name), 30);
              k.animations.push({ id: newId('a'), name, lookId: k.lookId, fps: 8, loop: true });
            })
          }
        >
          ＋ Add animation
        </button>
      )}
      {kind.animations.length > 0 && (
        <label className="set-row" style={{ marginTop: 8 }}>
          <span className="set-label">Plays at the start</span>
          <select className="field" value={kind.startAnim ?? ''} disabled={readOnly} aria-label="Animation at the start" onChange={(e) => editKind('Change start animation', kind.id, (k) => void (k.startAnim = e.target.value || null))}>
            <option value="">(none)</option>
            {kind.animations.map((a) => (
              <option key={a.id} value={a.name}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

/** Tint, see-through, frame auto-play and mouse pass-through for every object of a Kind. */
export function AppearanceSection({ kind, readOnly }: { kind: Kind; readOnly: boolean }) {
  return (
    <div className="section" data-testid="appearance">
      <h4>Appearance</h4>
      <label className="set-row">
        <span className="set-label">
          Flip through frames by itself <HelpTip text="On: a look with several frames always animates. Off: it shows its first frame until a rule or the Animator plays an animation." />
        </span>
        <input type="checkbox" checked={kind.autoPlay} disabled={readOnly} onChange={(e) => editKind('Change auto-play', kind.id, (k) => void (k.autoPlay = e.target.checked))} aria-label="Flip through frames by itself" />
      </label>
      <label className="set-row">
        <span className="set-label">Tint</span>
        <span className="row" style={{ gap: 6 }}>
          <input type="color" value={kind.tint ?? '#ffffff'} disabled={readOnly} onChange={(e) => editKind('Change tint', kind.id, (k) => void (k.tint = e.target.value))} aria-label="Tint" />
          {kind.tint && (
            <button className="btn small ghost" disabled={readOnly} onClick={() => editKind('Remove tint', kind.id, (k) => void (k.tint = null))}>
              none
            </button>
          )}
        </span>
      </label>
      <label className="set-row">
        <span className="set-label">See-through</span>
        <span className="row" style={{ gap: 6 }}>
          <input type="range" min={0} max={0.95} step={0.05} value={1 - kind.opacity} disabled={readOnly} onChange={(e) => editKind('Change see-through', kind.id, (k) => void (k.opacity = Math.round((1 - Number(e.target.value)) * 100) / 100))} aria-label="See-through" />
          <b className="set-val">{Math.round((1 - kind.opacity) * 100)}%</b>
        </span>
      </label>
      <label className="set-row">
        <span className="set-label">
          Clicks pass through <HelpTip text="The mouse ignores it: clicks go to whatever is underneath. Use it for custom pointers and decorations." />
        </span>
        <input type="checkbox" checked={kind.ignoreMouse} disabled={readOnly} onChange={(e) => editKind('Change click-through', kind.id, (k) => void (k.ignoreMouse = e.target.checked))} aria-label="Clicks pass through" />
      </label>
      <label className="set-row">
        <span className="set-label">Layer</span>
        <input
          key={kind.layer}
          className="field"
          type="number"
          style={{ width: 70 }}
          defaultValue={kind.layer}
          disabled={readOnly}
          aria-label="Layer"
          onBlur={(e) => {
            const v = Math.round(Number(e.currentTarget.value));
            if (Number.isFinite(v) && v !== kind.layer) editKind('Change layer', kind.id, (k) => void (k.layer = v));
          }}
        />
      </label>
    </div>
  );
}
