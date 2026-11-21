import type { Instance } from './types';

export interface FollowSettings {
  smoothing: number;
  deadzone: number;
  clampToScene: boolean;
}

/**
 * Scene camera. Without a Camera Follow target it stays at the scene's
 * top-left. Position is the top-left of the visible area in scene pixels;
 * with zoom the visible area is the screen size divided by the zoom.
 */
export class Camera {
  x = 0;
  y = 0;
  /** 1 = 100%; bigger zooms in. */
  zoom = 1;
  private shakeLeft = 0;
  private shakeTotal = 0;
  /** Offset applied when drawing (shake); not part of the camera position. */
  offset = { x: 0, y: 0 };

  constructor(
    private readonly screen: { w: number; h: number },
    private readonly scene: { w: number; h: number },
  ) {}

  /** Visible width/height in scene pixels. */
  get viewW() {
    return this.screen.w / this.zoom;
  }
  get viewH() {
    return this.screen.h / this.zoom;
  }

  /** Jumps straight to the target (scene start). */
  snap(target: Instance | null, s: FollowSettings | null) {
    if (!target || !s) return;
    this.centerOn(target.x + target.w / 2, target.y + target.h / 2);
    if (s.clampToScene) this.clamp();
  }

  centerOn(x: number, y: number) {
    this.x = x - this.viewW / 2;
    this.y = y - this.viewH / 2;
  }

  update(target: Instance | null, s: FollowSettings | null, dt: number, rng: () => number) {
    if (target && s) {
      const cx = target.x + target.w / 2 - this.viewW / 2;
      const cy = target.y + target.h / 2 - this.viewH / 2;
      let gx = this.x;
      let gy = this.y;
      if (cx - this.x > s.deadzone) gx = cx - s.deadzone;
      else if (this.x - cx > s.deadzone) gx = cx + s.deadzone;
      if (cy - this.y > s.deadzone) gy = cy - s.deadzone;
      else if (this.y - cy > s.deadzone) gy = cy + s.deadzone;
      // Smoothing is a time constant in seconds: exponential follow, frame-rate independent.
      const k = s.smoothing <= 0 ? 1 : 1 - Math.exp(-dt / s.smoothing);
      this.x += (gx - this.x) * k;
      this.y += (gy - this.y) * k;
      if (s.clampToScene) this.clamp();
    }
    if (this.shakeLeft > 0) {
      this.shakeLeft = Math.max(0, this.shakeLeft - dt);
      const amp = 8 * (this.shakeLeft / this.shakeTotal);
      this.offset = { x: (rng() * 2 - 1) * amp, y: (rng() * 2 - 1) * amp };
    } else this.offset = { x: 0, y: 0 };
  }

  shake(seconds: number) {
    this.shakeLeft = Math.max(this.shakeLeft, seconds);
    this.shakeTotal = Math.max(this.shakeLeft, 1e-6);
  }

  private clamp() {
    this.x = Math.min(Math.max(0, this.x), Math.max(0, this.scene.w - this.viewW));
    this.y = Math.min(Math.max(0, this.y), Math.max(0, this.scene.h - this.viewH));
  }
}
