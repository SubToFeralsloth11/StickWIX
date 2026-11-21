import type { CursorStyle, Project } from '../model/schema';
import { silentAudio, type AudioAdapter } from './audio';
import { RecentEvents, type RecentEvent } from './events';
import { Input } from './input';
import { FixedLoop, STEP } from './loop';
import { createRng } from './random';
import type { AssetInfo, GameView, Renderer } from './render/renderer';
import { SceneRuntime } from './scenes';
import type { Diagnostic, RuntimeEvent } from './types';
import { Values, type RememberAdapter } from './values';

export interface GameOptions {
  renderer?: Renderer;
  audio?: AudioAdapter;
  /** "Remember between plays" storage; null in the editor keeps every Play fresh. */
  remember?: RememberAdapter | null;
  seed?: number;
  assetInfo?: AssetInfo;
  /** Scene to start in (defaults to the project's start scene). */
  sceneId?: string;
  onDiagnostic?: (d: Diagnostic) => void;
  /** Sends a "share" action's message out of the game; returns false when nothing could take it, so the game shows it instead. */
  share?: (text: string) => boolean;
  /** Browser powers rules can ask for (pointer lock, full screen). */
  platform?: Platform;
}

export interface Platform {
  lockPointer(lock: boolean): void;
  pointerLocked(): boolean;
  fullscreen(mode: 'on' | 'off' | 'toggle'): void;
}

/**
 * A running game. Built from a deep copy of the project, so Play can never
 * change the document being edited (FR-005). The simulation advances in fixed
 * 1/60 s steps (FR-040); rendering happens once per animation frame.
 */
export class Game {
  readonly project: Project;
  readonly input = new Input();
  readonly values: Values;
  readonly rng: () => number;
  readonly recent = new RecentEvents();
  readonly diagnostics: Diagnostic[] = [];
  readonly audio: AudioAdapter;
  readonly assetInfo: AssetInfo;
  readonly screen: { w: number; h: number };
  readonly share: ((text: string) => boolean) | undefined;
  readonly platform: Platform | undefined;
  readonly dt = STEP;
  /** Mouse pointer chosen by settings and rules. */
  cursor: { style: CursorStyle; look: string | null; size: number };
  /** Per-step pointer wish from stickers (hand over Clickables, hidden for Follow Mouse); cleared every step. */
  cursorHint: 'pointer' | 'none' | null = null;
  /** Game speed multiplier (slow motion). */
  timeScale = 1;
  /** Paused with the pause key. */
  paused = false;
  scene: SceneRuntime;
  totalTime = 0;
  frozen = false;
  private readonly renderer: Renderer | undefined;
  private readonly loop: FixedLoop;
  private raf = 0;
  private lastFrame = 0;
  private running = false;
  private listeners = new Set<(e: RuntimeEvent) => void>();

  constructor(project: Project, private readonly opts: GameOptions = {}) {
    this.project = structuredClone(project);
    this.rng = createRng(opts.seed ?? (Date.now() & 0x7fffffff));
    this.audio = opts.audio ?? silentAudio;
    this.renderer = opts.renderer;
    this.assetInfo = opts.assetInfo ?? (() => undefined);
    this.share = opts.share;
    this.platform = opts.platform;
    const st = this.project.settings;
    this.cursor = { style: st.cursor, look: st.cursorLook, size: st.cursorSize };
    this.audio.volume?.(st.volume);
    this.screen = { w: this.project.settings.screenWidth, h: this.project.settings.screenHeight };
    this.values = new Values(this.project, (e) => this.emit(e), opts.remember ?? null);
    this.loop = new FixedLoop(() => this.step());
    this.scene = this.makeScene(opts.sceneId ?? this.project.startSceneId);
    if (this.project.settings.backgroundMusic) this.audio.music(this.project.settings.backgroundMusic);
    this.scene.start();
  }

  private makeScene(id: string) {
    const scene = this.project.scenes.find((s) => s.id === id) ?? this.project.scenes[0]!;
    return new SceneRuntime(this, scene);
  }

  /** Every rule-triggerable event goes through here: Show-me buffer, listeners, then rules. */
  emit(e: RuntimeEvent) {
    this.recent.record(e, this.totalTime);
    for (const l of this.listeners) l(e);
    this.scene.interpreter.dispatch(e);
  }

  onEvent(cb: (e: RuntimeEvent) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  diagnostic(d: Diagnostic) {
    const same = this.diagnostics.some((x) => JSON.stringify(x) === JSON.stringify(d));
    if (same) return;
    this.diagnostics.push(d);
    this.opts.onDiagnostic?.(d);
  }

  /** One fixed simulation step. */
  step() {
    const pauseKey = this.project.settings.pauseKey;
    if (pauseKey && this.input.state.pressed.has(pauseKey)) this.paused = !this.paused;
    if (this.paused) {
      this.input.endStep();
      return;
    }
    this.totalTime += this.dt;
    this.cursorHint = null;
    this.input.bounds = this.screen;
    this.scene.step();
    this.input.endStep();
    if (this.scene.pending !== undefined) this.switchScene(this.scene.pending ?? this.scene.scene.id);
  }

  private switchScene(id: string) {
    this.scene.interpreter.scheduler.clear();
    this.scene = this.makeScene(id);
    this.scene.start();
  }

  /** Runs `n` steps (tests, headless simulation). */
  run(n: number) {
    for (let i = 0; i < n; i++) this.step();
  }

  /** Feeds real elapsed time; steps unless frozen, then draws. */
  frame(elapsed: number) {
    if (!this.frozen) this.loop.advance(elapsed);
    this.render();
  }

  view(): GameView {
    const s = this.scene;
    return {
      project: this.project,
      scene: s.scene,
      tileSet: this.project.tileSets.find((t) => t.id === s.scene.tileLayer.tileSetId),
      screen: this.screen,
      camera: { x: s.camera.x, y: s.camera.y, zoom: s.camera.zoom, offset: s.camera.offset },
      time: s.time,
      instances: s.world.all(),
      ui: s.ui.boxes(this.screen, (t) => this.values.format(t), (id) => this.assetInfo(id), (name) => {
        const def = this.values.byName(name);
        const v = def ? this.values.game.get(def.id) : undefined;
        return typeof v === 'number' ? v : undefined;
      }),
      texts: s.texts,
      frozen: this.frozen,
      paused: this.paused,
      tiles: s.world.tiles ? { cells: s.world.tiles.cells, version: s.world.tiles.version } : null,
      particles: s.particles,
      flash: s.flashFx ? { color: s.flashFx.color, alpha: Math.max(0, (s.flashFx.until - s.time) / s.flashFx.dur) } : null,
      cursor: this.cursorView(),
    };
  }

  /** What to draw for the pointer: a CSS cursor name, or a picture at the mouse. */
  cursorView(): GameView['cursor'] {
    const c = this.cursor;
    const css = this.cursorHint === 'none' ? 'none' : c.style === 'look' ? 'none' : this.cursorHint === 'pointer' && c.style === 'default' ? 'pointer' : c.style;
    const m = this.input.state.mouse;
    return { css, look: this.cursorHint !== 'none' && c.style === 'look' ? c.look : null, size: c.size, x: m.x, y: m.y };
  }

  render() {
    this.renderer?.render(this.view());
  }

  /** Starts the animation-frame driver (browser only). */
  start() {
    if (this.running || typeof requestAnimationFrame === 'undefined') return;
    this.running = true;
    this.lastFrame = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      const elapsed = Math.min(0.25, (now - this.lastFrame) / 1000);
      this.lastFrame = now;
      this.frame(elapsed);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** Stops for good: Stop in the editor discards the whole game. */
  stop() {
    this.running = false;
    if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.raf);
    this.audio.stop();
    this.renderer?.destroy();
    this.listeners.clear();
  }

  /** Show-me: pause the simulation but keep drawing. */
  freeze() {
    this.frozen = true;
    this.input.releaseAll();
    this.input.endStep();
  }

  resume() {
    this.frozen = false;
    this.loop.reset();
  }

  /** Rule-triggerable events from the last 2 seconds, newest first (FR-028). */
  recentEvents(): RecentEvent[] {
    return this.recent.list(this.totalTime);
  }
}

export function createGame(project: Project, opts: GameOptions = {}) {
  return new Game(project, opts);
}
