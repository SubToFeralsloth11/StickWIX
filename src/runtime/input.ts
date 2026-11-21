import type { MouseButton } from '../model/schema';
import type { InputState } from './types';

const BUTTONS: MouseButton[] = ['left', 'middle', 'right'];

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
    buttons: { held: new Set(), pressed: new Set(), released: new Set() },
    wheel: 0,
    move: { x: 0, y: 0 },
  };
  /** Screen size the locked pointer is kept inside. */
  bounds = { w: Infinity, h: Infinity };

  keyDown(code: string) {
    if (!this.state.held.has(code)) this.state.pressed.add(code);
    this.state.held.add(code);
  }

  keyUp(code: string) {
    if (this.state.held.delete(code)) this.state.released.add(code);
  }

  /** Mouse position in screen pixels (game resolution, not CSS pixels). */
  mouseMove(x: number, y: number) {
    const m = this.state.mouse;
    this.state.move.x += x - m.x;
    this.state.move.y += y - m.y;
    m.x = x;
    m.y = y;
  }

  /** Relative movement (locked pointer): the virtual mouse stays on screen. */
  mouseMoveBy(dx: number, dy: number) {
    const m = this.state.mouse;
    this.state.move.x += dx;
    this.state.move.y += dy;
    m.x = Math.min(Math.max(0, m.x + dx), this.bounds.w);
    m.y = Math.min(Math.max(0, m.y + dy), this.bounds.h);
  }

  mouseDown(x: number, y: number, button: MouseButton = 'left') {
    this.mouseMove(x, y);
    const b = this.state.buttons;
    if (!b.held.has(button)) b.pressed.add(button);
    b.held.add(button);
    if (button !== 'left') return;
    if (!this.state.mouse.down) this.state.mouse.pressed = true;
    this.state.mouse.down = true;
  }

  mouseUp(x: number, y: number, button: MouseButton = 'left') {
    this.mouseMove(x, y);
    const b = this.state.buttons;
    if (b.held.delete(button)) b.released.add(button);
    if (button !== 'left') return;
    if (this.state.mouse.down) this.state.mouse.released = true;
    this.state.mouse.down = false;
  }

  wheel(notches: number) {
    this.state.wheel += notches;
  }

  /** Releases everything (window blur) so keys never stick. */
  releaseAll() {
    for (const k of this.state.held) this.state.released.add(k);
    this.state.held.clear();
    if (this.state.mouse.down) this.state.mouse.released = true;
    this.state.mouse.down = false;
    const b = this.state.buttons;
    for (const x of b.held) b.released.add(x);
    b.held.clear();
  }

  /** Called after each simulation step. */
  endStep() {
    const s = this.state;
    s.pressed.clear();
    s.released.clear();
    s.mouse.pressed = false;
    s.mouse.released = false;
    s.buttons.pressed.clear();
    s.buttons.released.clear();
    s.wheel = 0;
    s.move.x = 0;
    s.move.y = 0;
  }
}

export interface DomInputOptions {
  keyTarget?: Window | HTMLElement;
  ignoreKey?: (e: KeyboardEvent) => boolean;
  /** Stop the browser's right-click menu over the game. */
  blockContextMenu?: boolean;
  /** Game pixels per CSS pixel, for locked-pointer movement. */
  scale?: () => number;
}

/** Wires DOM events to an Input. `toGame` maps client coords to game pixels. Returns a detach function. */
export function attachDomInput(
  input: Input,
  target: HTMLElement,
  toGame: (clientX: number, clientY: number) => { x: number; y: number },
  opts: DomInputOptions = {},
) {
  const keyTarget = opts.keyTarget ?? window;
  const GAME_KEYS: Record<string, true> = { Space: true, ArrowUp: true, ArrowDown: true, ArrowLeft: true, ArrowRight: true };
  const doc = target.ownerDocument;
  const locked = () => doc.pointerLockElement === target;
  const onKeyDown = (e: Event) => {
    const ke = e as KeyboardEvent;
    if (opts.ignoreKey?.(ke)) return;
    if (GAME_KEYS[ke.code]) ke.preventDefault();
    input.keyDown(ke.code);
  };
  const onKeyUp = (e: Event) => input.keyUp((e as KeyboardEvent).code);
  const button = (e: PointerEvent | MouseEvent): MouseButton => BUTTONS[e.button] ?? 'left';
  const move = (e: PointerEvent) => {
    if (locked()) {
      const k = opts.scale?.() ?? 1;
      input.mouseMoveBy(e.movementX * k, e.movementY * k);
    } else {
      const p = toGame(e.clientX, e.clientY);
      input.mouseMove(p.x, p.y);
    }
  };
  const onMove = (e: PointerEvent) => move(e);
  const onDown = (e: PointerEvent) => {
    move(e);
    input.mouseDown(input.state.mouse.x, input.state.mouse.y, button(e));
  };
  const onUp = (e: PointerEvent) => {
    move(e);
    input.mouseUp(input.state.mouse.x, input.state.mouse.y, button(e));
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (e.deltaY) input.wheel(e.deltaY < 0 ? 1 : -1);
  };
  const onMenu = (e: Event) => {
    if (opts.blockContextMenu) e.preventDefault();
  };
  const onBlur = () => input.releaseAll();
  keyTarget.addEventListener('keydown', onKeyDown);
  keyTarget.addEventListener('keyup', onKeyUp);
  target.addEventListener('pointermove', onMove);
  target.addEventListener('pointerdown', onDown);
  target.addEventListener('wheel', onWheel, { passive: false });
  target.addEventListener('contextmenu', onMenu);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('blur', onBlur);
  return () => {
    keyTarget.removeEventListener('keydown', onKeyDown);
    keyTarget.removeEventListener('keyup', onKeyUp);
    target.removeEventListener('pointermove', onMove);
    target.removeEventListener('pointerdown', onDown);
    target.removeEventListener('wheel', onWheel);
    target.removeEventListener('contextmenu', onMenu);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('blur', onBlur);
  };
}
