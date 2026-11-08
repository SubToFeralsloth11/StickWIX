/** Rolling frame-rate meter over the last `window` seconds of frames. */
export class FpsMeter {
  private times: number[] = [];
  constructor(private readonly windowSec = 1) {}

  /** Call once per rendered frame with a ms timestamp; returns the current FPS. */
  frame(nowMs: number): number {
    this.times.push(nowMs);
    const cutoff = nowMs - this.windowSec * 1000;
    while (this.times.length > 2 && this.times[0]! < cutoff) this.times.shift();
    return this.fps();
  }

  fps(): number {
    const n = this.times.length;
    if (n < 2) return 0;
    return ((n - 1) * 1000) / (this.times[n - 1]! - this.times[0]!);
  }
}

/** True when the page URL asks for the overlay (`?fps`). */
export function fpsRequested(search: string = typeof location === 'undefined' ? '' : location.search): boolean {
  return new URLSearchParams(search).has('fps');
}

/**
 * `?fps` overlay (SC-004): a small corner readout of the current and average
 * frame rate since start. The averages are also published on
 * `window.__stickwixFps` so performance tests can read them.
 */
export function attachFpsOverlay(parent: HTMLElement): () => void {
  const el = document.createElement('div');
  el.setAttribute('data-testid', 'fps');
  el.style.cssText =
    'position:absolute;left:6px;top:6px;z-index:30;font:700 12px ui-monospace,Menlo,monospace;color:#5fe0b0;background:#15131ccc;padding:2px 6px;border-radius:6px;pointer-events:none';
  parent.appendChild(el);
  const meter = new FpsMeter(1);
  let frames = 0;
  let start = 0;
  let raf = 0;
  const stats = { current: 0, average: 0, frames: 0, seconds: 0 };
  Object.assign(window, { __stickwixFps: stats });
  const tick = (now: number) => {
    if (!start) start = now;
    frames++;
    stats.current = meter.frame(now);
    stats.seconds = (now - start) / 1000;
    stats.frames = frames;
    stats.average = stats.seconds > 0 ? (frames - 1) / stats.seconds : 0;
    el.textContent = `${Math.round(stats.current)} fps · avg ${stats.average.toFixed(1)}`;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(raf);
    el.remove();
  };
}
