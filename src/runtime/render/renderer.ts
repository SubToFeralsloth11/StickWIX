import type { Project, Scene, TileSet, UIElement } from '../../model/schema';
import type { UIBox } from '../ui-layer';
import type { Instance } from '../types';

/** Everything a renderer needs to draw one frame. Read-only by convention. */
export interface GameView {
  project: Project;
  scene: Scene;
  tileSet: TileSet | undefined;
  screen: { w: number; h: number };
  camera: { x: number; y: number; offset: { x: number; y: number } };
  /** Seconds since the scene started (drives looks with several frames). */
  time: number;
  instances: Iterable<Instance>;
  ui: { el: UIElement; box: UIBox; lookId: string | null | undefined }[];
  /** "Show text" popups currently on screen. */
  texts: { text: string; until: number }[];
  frozen: boolean;
}

export interface Renderer {
  render(view: GameView): void;
  destroy(): void;
}

/** Image metadata the runtime needs (frame size and count) for any asset id, builtin or project. */
export type AssetInfo = (assetId: string) => { w: number; h: number; frames: number; fps: number } | undefined;
