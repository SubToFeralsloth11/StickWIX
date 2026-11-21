import type { ReactNode } from 'react';
import { CURSORS, type CursorStyle } from '@/model/schema';
import { keyName } from '@/model/sentence';
import type { PanelProps } from '../panels';
import { editorStore, useEditor } from '../store';
import { HelpTip } from '../help/HelpTip';
import { KeyPicker } from '../inspector/StickerCard';
import '../features.css';

const CURSOR_LABEL: Record<CursorStyle, string> = {
  default: 'Normal arrow',
  none: 'Hidden',
  crosshair: 'Crosshair',
  pointer: 'Pointing hand',
  grab: 'Grabbing hand',
  look: 'My own picture',
};

const SCREENS = ['640x360', '800x450', '960x540', '1280x720', '1920x1080', '640x480', '800x600', '480x640', '360x640'];

function Row({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <div className="set-row">
      <span className="set-label">
        {label} {help && <HelpTip text={help} />}
      </span>
      <div className="set-ctl">{children}</div>
    </div>
  );
}

/** Whole-game settings: screen, sound, mouse pointer and cursor lock, pause key, camera. */
export function GameSettingsPanel({ project, lib }: PanelProps) {
  const readOnly = useEditor((s) => s.readOnly);
  const { edit } = editorStore.getState();
  const s = project.settings;
  const set = <K extends keyof typeof s>(label: string, key: K, v: (typeof s)[K]) => edit(label, (d) => void (d.settings[key] = v));

  return (
    <div className="stack settings-panel" data-testid="game-settings">
      <section className="set-group">
        <h4>Screen</h4>
        <Row label="Game size" help="The size of the game screen in pixels. Scenes are at least this big.">
          <select
            className="field"
            value={`${s.screenWidth}x${s.screenHeight}`}
            disabled={readOnly}
            aria-label="Screen size"
            onChange={(e) => {
              const [w, h] = e.target.value.split('x').map(Number) as [number, number];
              edit('Change screen size', (d) => {
                d.settings.screenWidth = w;
                d.settings.screenHeight = h;
                for (const sc of d.scenes) {
                  sc.width = Math.max(sc.width, w);
                  sc.height = Math.max(sc.height, h);
                }
              });
            }}
          >
            {[...new Set([...SCREENS, `${s.screenWidth}x${s.screenHeight}`])].map((v) => (
              <option key={v} value={v}>
                {v.replace('x', ' × ')}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Crisp pixel art" help="Keeps pixel art sharp when the game is scaled up.">
          <input type="checkbox" checked={s.pixelArt} disabled={readOnly} onChange={(e) => set('Change pixel art', 'pixelArt', e.target.checked)} aria-label="Crisp pixel art" />
        </Row>
        <Row label="Border colour" help="Fills the space around the game when the window is a different shape.">
          <input type="color" value={s.letterbox} disabled={readOnly} onChange={(e) => set('Change border colour', 'letterbox', e.target.value)} aria-label="Border colour" />
        </Row>
        <Row label="Camera zoom" help="How close the camera starts. Rules can zoom while playing.">
          <input type="range" min={0.25} max={4} step={0.25} value={s.zoom} disabled={readOnly} onChange={(e) => set('Change zoom', 'zoom', Number(e.target.value))} aria-label="Camera zoom" />
          <b className="set-val">{Math.round(s.zoom * 100)}%</b>
        </Row>
        <Row label="Show FPS counter" help="Shows how many frames per second the game draws.">
          <input type="checkbox" checked={s.showFps} disabled={readOnly} onChange={(e) => set('Change FPS counter', 'showFps', e.target.checked)} aria-label="Show FPS counter" />
        </Row>
      </section>

      <section className="set-group">
        <h4>Mouse</h4>
        <Row label="Pointer" help="What the mouse pointer looks like over the game.">
          <select className="field" value={s.cursor} disabled={readOnly} onChange={(e) => set('Change pointer', 'cursor', e.target.value as CursorStyle)} aria-label="Pointer">
            {CURSORS.map((c) => (
              <option key={c} value={c}>
                {CURSOR_LABEL[c]}
              </option>
            ))}
          </select>
        </Row>
        {s.cursor === 'look' && (
          <>
            <Row label="Pointer picture" help="Its middle sits on the mouse position.">
              <select className="field" value={s.cursorLook ?? ''} disabled={readOnly} onChange={(e) => set('Change pointer picture', 'cursorLook', e.target.value || null)} aria-label="Pointer picture">
                <option value="">(choose a picture)</option>
                {lib.images().map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Pointer size">
              <input type="range" min={8} max={128} step={4} value={s.cursorSize} disabled={readOnly} onChange={(e) => set('Change pointer size', 'cursorSize', Number(e.target.value))} aria-label="Pointer size" />
              <b className="set-val">{s.cursorSize}px</b>
            </Row>
          </>
        )}
        <Row label="Lock the pointer" help="Clicking the game captures the mouse, so it can't leave the game (great for shooters). Esc lets it go. Rules can also lock and unlock it.">
          <input type="checkbox" checked={s.lockCursor} disabled={readOnly} onChange={(e) => set('Change pointer lock', 'lockCursor', e.target.checked)} aria-label="Lock the pointer" />
        </Row>
        <Row label="Use the right button" help="Stops the browser menu from popping up on right-click, so rules can use the right mouse button.">
          <input type="checkbox" checked={s.blockContextMenu} disabled={readOnly} onChange={(e) => set('Change right-click', 'blockContextMenu', e.target.checked)} aria-label="Use the right button" />
        </Row>
      </section>

      <section className="set-group">
        <h4>Sound</h4>
        <Row label="Music">
          <select className="field" value={s.backgroundMusic ?? ''} disabled={readOnly} onChange={(e) => set('Change music', 'backgroundMusic', e.target.value || null)} aria-label="Music">
            <option value="">No music</option>
            {lib
              .sounds()
              .filter((x) => x.category === 'music' || x.category === 'mine')
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </select>
        </Row>
        <Row label="Volume">
          <input type="range" min={0} max={1} step={0.05} value={s.volume} disabled={readOnly} onChange={(e) => set('Change volume', 'volume', Number(e.target.value))} aria-label="Volume" />
          <b className="set-val">{Math.round(s.volume * 100)}%</b>
        </Row>
      </section>

      <section className="set-group">
        <h4>Keys</h4>
        <Row label="Pause key" help="Pressing it pauses and resumes the game. Leave empty for no pause.">
          <KeyPicker value={s.pauseKey ?? ''} onChange={(code) => set('Change pause key', 'pauseKey', code || null)} />
          {s.pauseKey && (
            <button className="btn small ghost" disabled={readOnly} onClick={() => set('Remove pause key', 'pauseKey', null)} aria-label={`Remove pause key ${keyName(s.pauseKey)}`}>
              ✕
            </button>
          )}
        </Row>
        <Row label="Show-me key" help="Press it while playing to teach the game a new rule by acting it out.">
          <KeyPicker value={s.showMeKey} onChange={(code) => code && set('Change Show-me key', 'showMeKey', code)} />
        </Row>
      </section>
    </div>
  );
}
