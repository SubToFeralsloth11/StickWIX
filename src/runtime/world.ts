import type { Kind, Project, Scene } from '../model/schema';
import { resolveObject } from '../model/resolve';
import { CONTROLLER_TYPES } from '../model/sticker-settings';
import { Contacts, SpatialHash, TileGrid, boxesOverlap, hitbox, moveBody } from './physics';
import { STEP_ORDER, STICKERS } from './stickers';
import type { Diagnostic, Instance, LiveSticker, RuntimeEvent, StepCtx, WorldApi } from './types';

export const OBJECT_CAP = 1000;

export interface WorldOptions {
  project: Project;
  scene: Scene;
  screen: { w: number; h: number };
  emit: (e: RuntimeEvent) => void;
  diagnostic: (d: Diagnostic) => void;
  playSound: (assetId: string | null) => void;
  frameCount: (assetId: string) => number;
  /** Mouse in scene coordinates. */
  mouseWorld: () => { x: number; y: number };
  cap?: number;
}

let serial = 0;

/** Live objects of one scene during Play, plus their physics. */
export class World implements WorldApi {
  readonly instances = new Map<string, Instance>();
  readonly tiles: TileGrid | null;
  readonly kinds: Map<string, Kind>;
  private readonly solids = new SpatialHash(128);
  readonly contacts = new Contacts();
  private readonly controllerKinds: string[];
  private readonly cap: number;
  private capReported = new Set<string>();
  private ctx: StepCtx | null = null;

  constructor(private readonly o: WorldOptions) {
    this.cap = o.cap ?? OBJECT_CAP;
    this.kinds = new Map(o.project.kinds.map((k) => [k.id, k]));
    this.controllerKinds = o.project.kinds
      .filter((k) => k.stickers.some((s) => CONTROLLER_TYPES.includes(s.type)))
      .map((k) => k.id);
    const layer = o.scene.tileLayer;
    const ts = o.project.tileSets.find((t) => t.id === layer.tileSetId);
    this.tiles = ts ? new TileGrid(layer.cellSize, layer.cells, ts.solid, ts.oneWay) : null;
  }

  get scene() {
    return this.o.scene;
  }

  /** Creates the scene's placed objects (no `created` events: "scene starts" covers them). */
  load(ctx: StepCtx) {
    this.ctx = ctx;
    const fresh: Instance[] = [];
    for (const obj of this.o.scene.objects) {
      const kind = this.kinds.get(obj.kindId);
      if (!kind) continue;
      const r = resolveObject(kind, obj);
      const inst = this.make(kind, obj.x, obj.y, obj.id, r.stickers, r.values, r.lookId, r.hidden);
      inst.rotation = obj.rotation;
      inst.layer = obj.layer + kind.layer;
      inst.w *= obj.scaleX;
      inst.h *= obj.scaleY;
      inst.hit = { x: inst.hit.x * obj.scaleX, y: inst.hit.y * obj.scaleY, w: inst.hit.w * obj.scaleX, h: inst.hit.h * obj.scaleY };
      fresh.push(inst);
    }
    for (const i of fresh) this.initStickers(i, ctx);
  }

  private make(
    kind: Kind,
    x: number,
    y: number,
    objectId: string | null,
    stickers: { id: string; type: LiveSticker['type']; settings: Record<string, unknown> }[],
    values: Record<string, number | string | boolean>,
    lookId: string | null,
    hidden: boolean,
  ): Instance {
    const id = objectId ?? `live${++serial}`;
    const hb = kind.hitbox ?? { x: 0, y: 0, w: kind.size.w, h: kind.size.h };
    const inst: Instance = {
      id, objectId, kindId: kind.id, x, y, w: kind.size.w, h: kind.size.h, hit: { ...hb },
      vx: 0, vy: 0, rotation: 0, layer: kind.layer, hidden, lookId, anim: null, grounded: false,
      facing: 1, dir: { x: 0, y: 0 }, values: new Map(Object.entries(values)),
      stickers: [...stickers]
        .sort((a, b) => STEP_ORDER[STICKERS[a.type].category] - STEP_ORDER[STICKERS[b.type].category])
        .map((s) => ({ id: s.id, type: s.type, settings: s.settings, state: {} })),
      body: false, dead: false, invincible: 0, alpha: 1, pop: 1, projectile: false, firedBy: null, bounce: 0, stun: 0,
      blocked: { left: false, right: false, up: false, down: false }, solid: 'none', dragged: false,
    };
    this.instances.set(id, inst);
    return inst;
  }

  private initStickers(inst: Instance, ctx: StepCtx) {
    for (const s of inst.stickers) STICKERS[s.type].init?.(inst, s.settings, s.state, ctx);
  }

  // ---------- WorldApi ----------

  *all() {
    for (const i of this.instances.values()) if (!i.dead) yield i;
  }

  get(id: string) {
    const i = this.instances.get(id);
    return i && !i.dead ? i : undefined;
  }

  byKind(kindId: string) {
    const out: Instance[] = [];
    for (const i of this.instances.values()) if (!i.dead && i.kindId === kindId) out.push(i);
    return out;
  }

  liveCount() {
    let n = 0;
    for (const i of this.instances.values()) if (!i.dead) n++;
    return n;
  }

  /** Spawns a new object at (x, y), or returns null at the object cap (FR-041). */
  spawn(kindId: string, x: number, y: number): Instance | null {
    const kind = this.kinds.get(kindId);
    if (!kind || !this.ctx) return null;
    if (this.liveCount() >= this.cap) {
      if (!this.capReported.has(kindId)) {
        this.capReported.add(kindId);
        this.o.diagnostic({ type: 'objectCap', sceneId: this.o.scene.id, kindId });
      }
      return null;
    }
    const r = resolveObject(kind, { overrides: {} });
    const inst = this.make(kind, x, y, null, r.stickers, r.values, r.lookId, false);
    this.initStickers(inst, this.ctx);
    this.o.emit({ type: 'created', id: inst.id });
    return inst;
  }

  destroy(inst: Instance) {
    if (inst.dead) return;
    inst.dead = true;
    inst.dragged = false;
    this.o.emit({ type: 'destroyed', id: inst.id });
  }

  solidAt(x: number, y: number, ignore?: Instance) {
    if (this.tiles) {
      const c = this.tiles.cellSize;
      if (this.tiles.kind(Math.floor(x / c), Math.floor(y / c))) return true;
    }
    const p = { x, y, w: 0.01, h: 0.01 };
    for (const s of this.solids.query(p)) if (s !== ignore && !s.dead && !s.hidden && boxesOverlap(p, hitbox(s))) return true;
    return false;
  }

  overlaps(a: Instance, b: Instance) {
    return boxesOverlap(hitbox(a), hitbox(b));
  }

  mouseWorld() {
    return this.o.mouseWorld();
  }

  playSound(assetId: string | null) {
    this.o.playSound(assetId);
  }

  controllerKindIds() {
    return this.controllerKinds;
  }

  topmostAt(x: number, y: number) {
    let best: Instance | undefined;
    for (const i of this.instances.values()) {
      if (i.dead || i.hidden) continue;
      if (x < i.x || y < i.y || x >= i.x + i.w || y >= i.y + i.h) continue;
      if (!best || i.layer >= best.layer) best = i;
    }
    return best;
  }

  cellSize() {
    return this.tiles?.cellSize ?? this.o.scene.tileLayer.cellSize;
  }

  // ---------- Simulation ----------

  /** One fixed step: stickers → movement → contacts → animation → bounds → sweep. */
  step(ctx: StepCtx) {
    this.ctx = ctx;
    const list = [...this.instances.values()];
    for (const inst of list) {
      if (inst.dead) continue;
      for (const s of inst.stickers) {
        if (inst.dead) break;
        STICKERS[s.type].step?.(inst, s.settings, s.state, ctx);
      }
    }
    this.move(list, ctx.dt);
    this.touch(ctx);
    this.animate(ctx.dt);
    this.cull();
    for (const [id, i] of this.instances) if (i.dead) this.instances.delete(id);
  }

  private rebuildSolids() {
    this.solids.clear();
    for (const i of this.instances.values()) if (!i.dead && !i.hidden && i.solid !== 'none') this.solids.insert(i);
  }

  private move(list: Instance[], dt: number) {
    // Solids move kinematically and carry whatever stands on them.
    this.rebuildSolids();
    for (const s of list) {
      if (s.dead || s.dragged || s.solid === 'none' || (s.vx === 0 && s.vy === 0)) continue;
      const dx = s.vx * dt;
      const dy = s.vy * dt;
      const top = s.y + s.hit.y;
      const riders = list.filter((b) => {
        if (b === s || b.dead || b.solid !== 'none' || !b.body) return false;
        const hb = hitbox(b);
        const sb = hitbox(s);
        return Math.abs(hb.y + hb.h - top) < 1.5 && hb.x + hb.w > sb.x && hb.x < sb.x + sb.w;
      });
      s.x += dx;
      s.y += dy;
      for (const r of riders) {
        r.x += dx;
        if (dy < 0 || r.vy >= 0) r.y += dy;
      }
    }
    this.rebuildSolids();
    for (const i of list) {
      if (i.dead || i.dragged || i.solid !== 'none') continue;
      if (!i.body && i.vx === 0 && i.vy === 0) continue;
      moveBody(i, dt, this.tiles, this.solids);
      if (i.projectile && (i.blocked.left || i.blocked.right || i.blocked.up || i.blocked.down)) this.destroy(i);
    }
  }

  private touch(ctx: StepCtx) {
    const live: Instance[] = [];
    for (const i of this.instances.values()) if (!i.dead && !i.hidden) live.push(i);
    this.contacts.update(live, (a, b) => {
      ctx.emit({ type: 'touch', a: a.id, b: b.id });
      for (const [self, other] of [[a, b], [b, a]] as const) {
        for (const s of self.stickers) {
          if (self.dead || other.dead) return;
          STICKERS[s.type].onContact?.(self, other, s.settings, s.state, ctx);
        }
      }
    });
  }

  private animate(dt: number) {
    for (const i of this.instances.values()) {
      const a = i.anim;
      if (!a || !a.assetId || i.dead) continue;
      a.t += dt;
      const n = this.o.frameCount(a.assetId);
      const f = Math.floor(a.t * a.fps);
      a.frame = a.loop ? f % n : Math.min(n - 1, f);
    }
  }

  /** Objects more than one screen outside the scene are removed and "leave the scene" (FR-042). */
  private cull() {
    const { w: sw, h: sh } = this.o.screen;
    const W = this.o.scene.width;
    const H = this.o.scene.height;
    for (const i of this.instances.values()) {
      if (i.dead) continue;
      if (i.x + i.w < -sw || i.y + i.h < -sh || i.x > W + sw || i.y > H + sh) {
        i.dead = true;
        this.o.emit({ type: 'leavesScene', id: i.id });
      }
    }
  }

  touching(a: Instance, b: Instance) {
    return this.contacts.touching(a.id, b.id) || this.overlaps(a, b);
  }
}
