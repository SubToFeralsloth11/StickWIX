/** Fixed simulation step: 60 updates per second regardless of display rate (FR-040). */
export const STEP = 1 / 60;
const MAX_STEPS_PER_FRAME = 5;

/**
 * Fixed-timestep accumulator. Frames feed real elapsed time; the step callback
 * runs in whole 1/60 s steps. Steps are counted in integers, so the same total
 * time always produces the same number of steps whatever the frame pacing.
 */
export class FixedLoop {
  private acc = 0;
  /** Leftover fraction of a step (0..1) after the last advance, for interpolation. */
  alpha = 0;

  constructor(private readonly step: () => void) {}

  /** Advances by `elapsed` seconds; returns how many steps ran. */
  advance(elapsed: number): number {
    // Tolerance absorbs float error when frame times are 1/30, 1/144 ...
    this.acc += Math.max(0, elapsed);
    let n = 0;
    while (this.acc >= STEP - 1e-9 && n < MAX_STEPS_PER_FRAME) {
      this.step();
      this.acc -= STEP;
      n++;
    }
    if (this.acc >= STEP) this.acc = 0; // too far behind: drop the backlog instead of spiralling
    this.acc = Math.max(0, this.acc);
    this.alpha = this.acc / STEP;
    return n;
  }

  reset() {
    this.acc = 0;
    this.alpha = 0;
  }
}
