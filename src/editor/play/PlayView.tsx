import { useEffect, useRef, useState, type ComponentType } from 'react';
import type { Project } from '@/model/schema';
import { WebAudio } from '@/runtime/audio';
import { createGame, type Game } from '@/runtime/game';
import { attachDomInput } from '@/runtime/input';
import { PixiRenderer } from '@/runtime/render/pixi-renderer';
import type { Library } from '../assets/library';
import { editorStore } from '../store';
import { setUI } from '../ui-state';

/** Layers over the running game (Show-me). They get the live game. */
export interface PlayOverlayProps {
  game: Game;
  project: Project;
  lib: Library;
  /** Game px → CSS px inside the play area. */
  scale: number;
  stop: () => void;
}
export const PLAY_OVERLAYS: ComponentType<PlayOverlayProps>[] = [];

/** Keys the play view must not hand to the game (they belong to the editor). */
export const RESERVED_KEYS = new Set<string>();

/**
 * Play: runs the game from a snapshot of the document, starting in the scene
 * being edited. Stop throws the run away, so the document is untouched (FR-005).
 */
export function PlayView({ project, lib }: { project: Project; lib: Library }) {
  const wrap = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [scale, setScale] = useState(1);
  const W = project.settings.screenWidth;
  const H = project.settings.screenHeight;

  useEffect(() => {
    // Snapshot once: later edits (there are none while playing) never reach the running game.
    const snapshot = editorStore.getState().project ?? project;
    const sceneId = editorStore.getState().sceneId ?? snapshot.startSceneId;
    let g: Game | null = null;
    let detach = () => {};
    let dead = false;
    const audio = new WebAudio((id) => lib.url(id));
    void PixiRenderer.create(box.current!, { screen: { w: W, h: H }, pixelArt: snapshot.settings.pixelArt, textureUrl: (id) => lib.url(id), assetInfo: lib.info }).then((renderer) => {
      if (dead) {
        renderer.destroy();
        return;
      }
      g = createGame(snapshot, { renderer, audio, remember: null, assetInfo: lib.info, sceneId });
      const canvas = renderer.canvas;
      detach = attachDomInput(
        g.input,
        canvas,
        (cx, cy) => {
          const r = canvas.getBoundingClientRect();
          return { x: ((cx - r.left) / r.width) * W, y: ((cy - r.top) / r.height) * H };
        },
        { ignoreKey: (e) => RESERVED_KEYS.has(e.code) || e.metaKey || e.ctrlKey },
      );
      const unlock = () => audio.unlock();
      window.addEventListener('pointerdown', unlock, { once: true });
      window.addEventListener('keydown', unlock, { once: true });
      audio.unlock();
      canvas.tabIndex = 0;
      canvas.focus();
      g.start();
      setGame(g);
    });
    return () => {
      dead = true;
      detach();
      if (g) {
        setUI({ lastRun: [...g.diagnostics] });
        g.stop();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Letterbox: largest size that keeps the game's aspect ratio (FR-035 parity with exports).
  useEffect(() => {
    const el = wrap.current!;
    const fit = () => setScale(Math.min((el.clientWidth - 24) / W, (el.clientHeight - 64) / H));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, H]);

  // Escape stops Play.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && setUI({ playing: false });
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div ref={wrap} className="play-wrap" data-testid="play-view">
      <div className="game" style={{ width: W * scale, height: H * scale }}>
        <div ref={box} style={{ width: '100%', height: '100%' }} />
        {game && PLAY_OVERLAYS.map((O, i) => <O key={i} game={game} project={project} lib={lib} scale={scale} stop={() => setUI({ playing: false })} />)}
      </div>
    </div>
  );
}
