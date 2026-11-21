import type { Project, Scene, TileSet, UIElement } from '../../model/schema';
import type { UIBox } from '../ui-layer';
import type { Particle } from '../scenes';
import type { Instance } from '../types';

/** Everything a renderer needs to draw one frame. Read-only by convention. */
export interface GameView {
  project: Project;
  scene: Scene;
  tileSet: TileSet | undefined;
  screen: { w: number; h: number };
  camera: { x: number; y: number; zoom: number; offset: { x: number; y: number } };
  /** Seconds since the scene started (drives looks with several frames). */
  time: number;
  instances: Iterable<Instance>;
  ui: { el: UIElement; box: UIBox; lookId: string | null | undefined }[];
  /** "Show text" popups currently on screen. */
  texts: { text: string; until: number }[];
  frozen: boolean;
  paused: boolean;
  /** Live tile cells (rules can change them); `version` goes up on every change. */
  tiles: { cells: Record<string, number>; version: number } | null;
  particles: readonly Particle[];
  /** Full-screen colour flash fading out (alpha 1 → 0). */
  flash: { color: string; alpha: number } | null;
  /** Pointer: CSS cursor for the canvas, plus a picture drawn at the mouse (screen pixels). */
  cursor: { css: string; look: string | null; size: number; x: number; y: number };
}

export interface Renderer {
  render(view: GameView): void;
  destroy(): void;
}

/** Image metadata the runtime needs (frame size and count) for any asset id, builtin or project. */
export type AssetInfo = (assetId: string) => { w: number; h: number; frames: number; fps: number } | undefined;
