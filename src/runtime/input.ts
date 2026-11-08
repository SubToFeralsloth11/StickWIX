import type { InputState } from './types';

/**
 * Keyboard/mouse state fed by an adapter (DOM listeners in the browser, scripts
 * in tests). Edges (pressed/released) survive until the next simulation step
 * consumes them, so a tap between two steps is never lost.
 */
export class Input {
  readonly state: InputState = {
    held: new Set(),
    pressed: new Set(),
    released: new Set(),
    mouse: { x: 0, y: 0, down: false, pressed: false, released: false },
  };

  keyDown(code: string) {
    if (!this.state.held.has(code)) this.state.pressed.add(code);
    this.state.held.add(code);
  }

  keyUp(code: string) {
    if (this.state.held.delete(code)) this.state.released.add(code);
  }

  /** Mouse position in screen pixels (game resolution, not CSS pixels). */
  mouseMove(x: number, y: number) {
    this.state.mouse.x = x;
    this.state.mouse.y = y;
  }

  mouseDown(x: number, y: number) {
    this.mouseMove(x, y);
    if (!this.state.mouse.down) this.state.mouse.pressed = true;
    this.state.mouse.down = true;
  }

  mouseUp(x: number, y: number) {
    this.mouseMove(x, y);
    if (this.state.mouse.down) this.state.mouse.released = true;
    this.state.mouse.down = false;
  }

  /** Releases everything (window blur) so keys never stick. */
  releaseAll() {
    for (const k of this.state.held) this.state.released.add(k);
    this.state.held.clear();
    if (this.state.mouse.down) this.state.mouse.released = true;
    this.state.mouse.down = false;
  }

  /** Called after each simulation step. */
  endStep() {
    this.state.pressed.clear();
    this.state.released.clear();
    this.state.mouse.pressed = false;
    this.state.mouse.released = false;
  }
}

/** Wires DOM events to an Input. `toGame` maps client coords to game pixels. Returns a detach function. */
export function attachDomInput(
  input: Input,
  target: HTMLElement,
  toGame: (clientX: number, clientY: number) => { x: number; y: number },
  opts: { keyTarget?: Window | HTMLElement; ignoreKey?: (e: KeyboardEvent) => boolean } = {},
) {
  const keyTarget = opts.keyTarget ?? window;
  const GAME_KEYS: Record<string, true> = { Space: true, ArrowUp: true, ArrowDown: true, ArrowLeft: true, ArrowRight: true };
  const onKeyDown = (e: Event) => {
    const ke = e as KeyboardEvent;
    if (opts.ignoreKey?.(ke)) return;
    if (GAME_KEYS[ke.code]) ke.preventDefault();
    input.keyDown(ke.code);
  };
  const onKeyUp = (e: Event) => input.keyUp((e as KeyboardEvent).code);
  const pos = (e: PointerEvent) => toGame(e.clientX, e.clientY);
  const onMove = (e: PointerEvent) => {
    const p = pos(e);
    input.mouseMove(p.x, p.y);
  };
  const onDown = (e: PointerEvent) => {
    const p = pos(e);
    input.mouseDown(p.x, p.y);
  };
  const onUp = (e: PointerEvent) => {
    const p = pos(e);
    input.mouseUp(p.x, p.y);
  };
  const onBlur = () => input.releaseAll();
  keyTarget.addEventListener('keydown', onKeyDown);
  keyTarget.addEventListener('keyup', onKeyUp);
  target.addEventListener('pointermove', onMove);
  target.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('blur', onBlur);
  return () => {
    keyTarget.removeEventListener('keydown', onKeyDown);
    keyTarget.removeEventListener('keyup', onKeyUp);
    target.removeEventListener('pointermove', onMove);
    target.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('blur', onBlur);
  };
}
