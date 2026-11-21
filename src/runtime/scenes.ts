import type { CursorStyle, GameProp, MouseButton, Scene } from '../model/schema';
import { Camera, type FollowSettings } from './camera';
import { Interpreter } from './rules/interpreter';
import type { RuleHost } from './rules/host';
import { UILayer } from './ui-layer';
import { World } from './world';
import type { Game } from './game';
import type { Diagnostic, Instance, RuntimeEvent, StepCtx } from './types';

/** A spark from "burst" (or a breaking block). Scene pixels, seconds. */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}

export const PARTICLE_CAP = 800;
const BUTTONS: MouseButton[] = ['left', 'right', 'middle'];

/**
 * One loaded scene during Play: its objects, camera, screen layer, timers and
 * rules. Changing or restarting a scene throws this away and builds a new one;
 * game-wide values live on the Game and carry over.
 */
export class SceneRuntime implements RuleHost {
  readonly world: World;
  readonly camera: Camera;
  readonly ui: UILayer;
  readonly interpreter: Interpreter;
  time = 0;
  texts: { text: string; until: number }[] = [];
  particles: Particle[] = [];
  flashFx: { color: string; until: number; dur: number } | null = null;
  /** undefined = no change; null = restart; string = go to that scene. */
  pending: string | null | undefined = undefined;
  /** Camera target set by rules: undefined = the Camera Follow sticker, null = nothing. */
  private followId: string | null | undefined = undefined;
  /** Object the mouse is over / was pressed on / is being held on. */
  private hoverId: string | null = null;
  private pressId: string | null = null;
  private hold: { id: string; button: 'left' | 'right'; t: number } | null = null;
  private wheelTotal = 0;

  constructor(
    private readonly game: Game,
    readonly scene: Scene,
  ) {
    const screen = { w: game.project.settings.screenWidth, h: game.project.settings.screenHeight };
    this.camera = new Camera(screen, { w: scene.width, h: scene.height });
    this.camera.zoom = game.project.settings.zoom;
    this.ui = new UILayer(scene.ui);
    this.world = new World({
      project: game.project,
      scene,
      screen,
      emit: (e) => game.emit(e),
      diagnostic: (d) => game.diagnostic(d),
      playSound: (id) => this.playSound(id),
      frameCount: (id) => game.assetInfo(id)?.frames ?? 1,
      mouseWorld: () => this.mouseWorld(),
      burst: (x, y, color, n) => this.burst(x, y, color, n),
      cursorHint: (h) => (game.cursorHint = h),
      wantsUntouch: () => this.interpreter.listens('stopsTouching'),
    });
    this.interpreter = new Interpreter(game.project, scene.id, this);
  }

  /** Mouse in world space; with a pointer leash it stays within the leash of the first object of that Kind. */
  mouseWorld() {
    const m = this.game.input.state.mouse;
    const p = { x: m.x / this.camera.zoom + this.camera.x, y: m.y / this.camera.zoom + this.camera.y };
    const { cursorLeashKind, cursorLeash } = this.game.project.settings;
    const anchor = cursorLeashKind ? this.world.byKind(cursorLeashKind)[0] : undefined;
    if (!anchor) return p;
    const cx = anchor.x + anchor.hit.x + anchor.hit.w / 2;
    const cy = anchor.y + anchor.hit.y + anchor.hit.h / 2;
    const dx = p.x - cx;
    const dy = p.y - cy;
    const d = Math.hypot(dx, dy);
    if (d <= cursorLeash) return p;
    return { x: cx + (dx / d) * cursorLeash, y: cy + (dy / d) * cursorLeash };
  }

  /** The (leashed) mouse back in screen space, for drawing the pointer picture. */
  mouseScreen() {
    const w = this.mouseWorld();
    return { x: (w.x - this.camera.x) * this.camera.zoom, y: (w.y - this.camera.y) * this.camera.zoom };
  }

  // ---------- RuleHost ----------

  get values() {
    return this.game.values;
  }
  get input() {
    return this.game.input.state;
  }
  get rng() {
    return this.game.rng;
  }
  get sceneChanging() {
    return this.pending !== undefined;
  }
  get timeScale() {
    return this.game.timeScale;
  }
  set timeScale(v: number) {
    this.game.timeScale = v;
  }
  playSound(assetId: string | null) {
    if (assetId) this.game.audio.play(assetId);
  }
  showText(text: string, seconds: number) {
    this.texts.push({ text, until: this.time + seconds });
  }
  share(text: string) {
    const shared = this.game.share?.(text);
    if (!shared) this.showText(text, 3);
  }
  requestScene(sceneId: string | null) {
    if (this.pending === undefined) this.pending = sceneId;
  }
  recordTimer(ruleId: string, seconds: number) {
    this.game.recent.record({ type: 'timer', ruleId, seconds }, this.game.totalTime);
  }
  diagnostic(d: Diagnostic) {
    this.game.diagnostic(d);
  }
  message(name: string) {
    this.game.emit({ type: 'message', name });
  }
  music(assetId: string | null) {
    this.game.audio.music(assetId);
  }
  stopSounds() {
    this.game.audio.stopSounds?.();
  }
  setVolume(v: number) {
    this.game.audio.volume?.(v);
  }
  setCursor(style: CursorStyle) {
    this.game.cursor.style = style;
  }
  setCursorLook(assetId: string) {
    this.game.cursor.look = assetId;
    this.game.cursor.style = 'look';
  }
  lockPointer(lock: boolean) {
    this.game.platform?.lockPointer(lock);
  }
  pointerLocked() {
    return this.game.platform?.pointerLocked() ?? false;
  }
  fullscreen(mode: 'on' | 'off' | 'toggle') {
    this.game.platform?.fullscreen(mode);
  }
  flash(color: string, seconds: number) {
    this.flashFx = { color, until: this.time + seconds, dur: seconds };
  }
  follow(id: string | null) {
    this.followId = id;
  }

  burst(x: number, y: number, color: string, count: number) {
    const rng = this.game.rng;
    for (let k = 0; k < count && this.particles.length < PARTICLE_CAP; k++) {
      const a = rng() * Math.PI * 2;
      const v = 60 + rng() * 180;
      const life = 0.35 + rng() * 0.5;
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, life, max: life, color, size: 2 + rng() * 4 });
    }
  }

  gameProp(p: GameProp): number {
    const st = this.game.input.state;
    switch (p) {
      case 'mouseX': return this.mouseWorld().x;
      case 'mouseY': return this.mouseWorld().y;
      case 'screenMouseX': return st.mouse.x;
      case 'screenMouseY': return st.mouse.y;
      case 'mouseMoveX': return st.move.x;
      case 'mouseMoveY': return st.move.y;
      case 'holdTime': return this.hold?.t ?? 0;
      case 'time': return this.time;
      case 'totalTime': return this.game.totalTime;
      case 'cameraX': return this.camera.x;
      case 'cameraY': return this.camera.y;
      case 'zoom': return this.camera.zoom * 100;
      case 'sceneWidth': return this.scene.width;
      case 'sceneHeight': return this.scene.height;
      case 'screenWidth': return this.game.screen.w;
      case 'screenHeight': return this.game.screen.h;
      case 'objectCount': return this.world.liveCount();
      case 'wheel': return this.wheelTotal;
    }
  }

  // ---------- Lifecycle ----------

  ctx(): StepCtx {
    return { dt: this.game.dt * this.game.timeScale, input: this.game.input.state, world: this.world, emit: (e) => this.game.emit(e), rng: this.game.rng };
  }

  followTarget(): { inst: Instance; s: FollowSettings } | null {
    if (this.followId !== undefined) {
      const inst = this.followId ? this.world.get(this.followId) : undefined;
      return inst ? { inst, s: { smoothing: 0.15, deadzone: 16, clampToScene: true } } : null;
    }
    for (const i of this.world.all()) {
      const st = i.stickers.find((s) => s.type === 'cameraFollow');
      if (st) return { inst: i, s: st.settings as unknown as FollowSettings };
    }
    return null;
  }

  start() {
    this.world.load(this.ctx());
    const f = this.followTarget();
    this.camera.snap(f?.inst ?? null, f?.s ?? null);
    this.interpreter.startTimers();
    this.game.emit({ type: 'sceneStart' });
  }

  step() {
    const ctx = this.ctx();
    this.time += ctx.dt;
    const st = this.game.input.state;
    const it = this.interpreter;
    for (const key of st.pressed) this.game.emit({ type: 'key', key, mode: 'pressed' });
    for (const key of st.held) this.game.emit({ type: 'key', key, mode: 'held' });
    for (const key of st.released) this.game.emit({ type: 'key', key, mode: 'released' });
    if (it.listens('key')) this.game.emit({ type: 'keyUp', held: st.held });
    if (it.listens('mouse'))
      for (const button of BUTTONS) {
        if (st.buttons.pressed.has(button)) this.game.emit({ type: 'mouse', button, mode: 'pressed' });
        if (st.buttons.held.has(button)) this.game.emit({ type: 'mouse', button, mode: 'held' });
        if (st.buttons.released.has(button)) this.game.emit({ type: 'mouse', button, mode: 'released' });
      }
    if (st.wheel) {
      this.wheelTotal += st.wheel;
      this.game.emit({ type: 'wheel', direction: st.wheel > 0 ? 'up' : 'down' });
    }
    this.pointer(st, ctx.dt);
    if (this.sceneChanging) return;
    if (it.listens('everyFrame')) this.game.emit({ type: 'frame' });
    if (this.sceneChanging) return;
    this.world.step(ctx);
    if (this.sceneChanging) return;
    it.tick();
    const f = this.followTarget();
    this.camera.update(f?.inst ?? null, f?.s ?? null, ctx.dt, this.game.rng);
    this.texts = this.texts.filter((t) => t.until > this.time);
    this.stepParticles(ctx.dt);
    if (this.flashFx && this.flashFx.until <= this.time) this.flashFx = null;
    for (const i of this.world.all()) if (i.say && i.say.until <= this.time) i.say = null;
  }

  /** Clicks, hovering, holding and letting go. UI buttons sit above the world. */
  private pointer(st: StepCtx['input'], dt: number) {
    const m = this.mouseWorld();
    const under = this.world.topmostAt(m.x, m.y);
    const id = under?.id ?? null;
    if (id !== this.hoverId) {
      if (this.hoverId) this.game.emit({ type: 'hover', id: this.hoverId, mode: 'leave' });
      if (id) this.game.emit({ type: 'hover', id, mode: 'enter' });
      this.hoverId = id;
    }
    for (const button of ['left', 'right'] as const) {
      if (!st.buttons.pressed.has(button)) continue;
      const ui = button === 'left' ? this.ui.buttonAt(st.mouse.x, st.mouse.y, this.game.screen, (t) => this.values.format(t), (x) => this.game.assetInfo(x)) : undefined;
      if (ui) {
        this.game.emit({ type: 'clicked', id: ui.id, ui: true } satisfies RuntimeEvent);
        continue;
      }
      if (button === 'left') this.pressId = id;
      if (under) this.game.emit(button === 'left' ? { type: 'clicked', id: under.id } : { type: 'clicked', id: under.id, button: 'right' });
    }
    if (st.buttons.released.has('left') && this.pressId) {
      const was = this.pressId;
      this.pressId = null;
      this.game.emit({ type: 'letGo', id: was });
    }
    // Holding: the clock restarts when the mouse moves onto another object (mine block after block).
    const button = st.buttons.held.has('left') ? 'left' : st.buttons.held.has('right') ? 'right' : null;
    if (!button || !under) this.hold = null;
    else if (this.hold && this.hold.id === under.id && this.hold.button === button) {
      const from = this.hold.t;
      this.hold.t += dt;
      if (this.interpreter.listens('holdOn')) this.game.emit({ type: 'holding', id: under.id, button, from, to: this.hold.t });
    } else this.hold = { id: under.id, button, t: 0 };
  }

  private stepParticles(dt: number) {
    if (!this.particles.length) return;
    for (const p of this.particles) {
      p.life -= dt;
      p.vy += 500 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }
}
