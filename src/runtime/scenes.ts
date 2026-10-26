import type { Scene } from '../model/schema';
import { Camera, type FollowSettings } from './camera';
import { Interpreter } from './rules/interpreter';
import type { RuleHost } from './rules/host';
import { UILayer } from './ui-layer';
import { World } from './world';
import type { Game } from './game';
import type { Diagnostic, Instance, RuntimeEvent, StepCtx } from './types';

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
  /** undefined = no change; null = restart; string = go to that scene. */
  pending: string | null | undefined = undefined;

  constructor(
    private readonly game: Game,
    readonly scene: Scene,
  ) {
    const screen = { w: game.project.settings.screenWidth, h: game.project.settings.screenHeight };
    this.camera = new Camera(screen, { w: scene.width, h: scene.height });
    this.ui = new UILayer(scene.ui);
    this.world = new World({
      project: game.project,
      scene,
      screen,
      emit: (e) => game.emit(e),
      diagnostic: (d) => game.diagnostic(d),
      playSound: (id) => this.playSound(id),
      frameCount: (id) => game.assetInfo(id)?.frames ?? 1,
      mouseWorld: () => ({ x: game.input.state.mouse.x + this.camera.x, y: game.input.state.mouse.y + this.camera.y }),
    });
    this.interpreter = new Interpreter(game.project, scene.id, this);
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
  playSound(assetId: string | null) {
    if (assetId) this.game.audio.play(assetId);
  }
  showText(text: string, seconds: number) {
    this.texts.push({ text, until: this.time + seconds });
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

  // ---------- Lifecycle ----------

  ctx(): StepCtx {
    return { dt: this.game.dt, input: this.game.input.state, world: this.world, emit: (e) => this.game.emit(e), rng: this.game.rng };
  }

  followTarget(): { inst: Instance; s: FollowSettings } | null {
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
    const { input } = this.game;
    const st = input.state;
    for (const key of st.pressed) this.game.emit({ type: 'key', key, mode: 'pressed' });
    for (const key of st.held) this.game.emit({ type: 'key', key, mode: 'held' });
    for (const key of st.released) this.game.emit({ type: 'key', key, mode: 'released' });
    if (st.mouse.pressed) this.click(st.mouse.x, st.mouse.y);
    if (this.sceneChanging) return;
    this.world.step(ctx);
    if (this.sceneChanging) return;
    this.interpreter.tick();
    const f = this.followTarget();
    this.camera.update(f?.inst ?? null, f?.s ?? null, ctx.dt, this.game.rng);
    this.texts = this.texts.filter((t) => t.until > this.time);
  }

  /** UI buttons sit above the world; otherwise the topmost object under the mouse is clicked. */
  private click(sx: number, sy: number) {
    const button = this.ui.buttonAt(sx, sy, this.game.screen, (t) => this.values.format(t), (id) => this.game.assetInfo(id));
    if (button) {
      this.game.emit({ type: 'clicked', id: button.id, ui: true } satisfies RuntimeEvent);
      return;
    }
    const inst = this.world.topmostAt(sx + this.camera.x, sy + this.camera.y);
    if (inst) this.game.emit({ type: 'clicked', id: inst.id });
  }
}
