import type { Game, Platform } from './game';

/**
 * Pointer lock and full screen for a game canvas. Browsers only grant these
 * shortly after a click or key press; rules run within a frame of the input,
 * which is inside that window. A refused request is simply ignored.
 */
export function browserPlatform(canvas: HTMLCanvasElement, fullscreenEl: HTMLElement): Platform {
  const doc = canvas.ownerDocument;
  return {
    lockPointer(lock) {
      if (lock && doc.pointerLockElement !== canvas) {
        try {
          void Promise.resolve(canvas.requestPointerLock?.()).catch(() => {});
        } catch {
          // Not allowed right now (no recent click).
        }
      } else if (!lock && doc.pointerLockElement === canvas) doc.exitPointerLock();
    },
    pointerLocked: () => doc.pointerLockElement === canvas,
    fullscreen(mode) {
      const on = !!doc.fullscreenElement;
      const want = mode === 'toggle' ? !on : mode === 'on';
      if (want && !on) void fullscreenEl.requestFullscreen?.().catch(() => {});
      else if (!want && on) void doc.exitFullscreen?.().catch(() => {});
    },
  };
}

/** "Lock the pointer" setting: clicking the game captures the mouse. Returns a detach function. */
export function lockOnClick(game: Game, canvas: HTMLCanvasElement): () => void {
  if (!game.project.settings.lockCursor) return () => {};
  const onDown = () => game.platform?.lockPointer(true);
  canvas.addEventListener('pointerdown', onDown);
  return () => canvas.removeEventListener('pointerdown', onDown);
}
