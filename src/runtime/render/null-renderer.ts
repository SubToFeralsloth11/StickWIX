import type { GameView, Renderer } from './renderer';

/** Headless renderer for tests and simulation: records what it was asked to draw. */
export class NullRenderer implements Renderer {
  frames = 0;
  last: GameView | null = null;
  destroyed = false;

  render(view: GameView) {
    this.frames++;
    this.last = view;
  }

  destroy() {
    this.destroyed = true;
  }
}
