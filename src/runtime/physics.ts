import type { Box, Instance } from './types';

/** Solid lookup for the scene's tile layer. */
export class TileGrid {
  constructor(
    readonly cellSize: number,
    private readonly cells: Record<string, number>,
    private readonly solid: readonly boolean[],
    private readonly oneWay: readonly boolean[],
  ) {}

  tileAt(cx: number, cy: number): number | undefined {
    return this.cells[`${cx},${cy}`];
  }

  /** 'solid' | 'oneWay' | null for the cell. */
  kind(cx: number, cy: number): 'solid' | 'oneWay' | null {
    const t = this.tileAt(cx, cy);
    if (t === undefined) return null;
    if (this.oneWay[t]) return 'oneWay';
    return this.solid[t] ? 'solid' : null;
  }
}

/** Uniform-grid broad phase. Rebuilt each step; O(n) insert, near-O(1) queries. */
export class SpatialHash {
  private cells = new Map<number, Instance[]>();
  constructor(private readonly size = 128) {}

  private key(cx: number, cy: number) {
    return (cx + 32768) * 65536 + (cy + 32768);
  }

  clear() {
    this.cells.clear();
  }

  insert(inst: Instance) {
    const b = hitbox(inst);
    const x0 = Math.floor(b.x / this.size), x1 = Math.floor((b.x + b.w) / this.size);
    const y0 = Math.floor(b.y / this.size), y1 = Math.floor((b.y + b.h) / this.size);
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) {
        const k = this.key(cx, cy);
        const list = this.cells.get(k);
        if (list) list.push(inst);
        else this.cells.set(k, [inst]);
      }
  }

  /** Every instance whose cells touch `b` (may include duplicates' removal already done). */
  query(b: Box, out: Set<Instance> = new Set()): Set<Instance> {
    const x0 = Math.floor(b.x / this.size), x1 = Math.floor((b.x + b.w) / this.size);
    const y0 = Math.floor(b.y / this.size), y1 = Math.floor((b.y + b.h) / this.size);
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) for (const i of this.cells.get(this.key(cx, cy)) ?? []) out.add(i);
    return out;
  }
}

export function hitbox(i: Instance): Box {
  return { x: i.x + i.hit.x, y: i.y + i.hit.y, w: i.hit.w, h: i.hit.h };
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

const EPS = 1e-6;

/**
 * Moves a body by its velocity for one step with axis-separated resolution
 * against solid tiles and Solid objects. Sub-steps never exceed half the
 * smaller of the hitbox and tile size, so fast bodies cannot tunnel.
 */
export function moveBody(inst: Instance, dt: number, tiles: TileGrid | null, solids: SpatialHash): void {
  const blocked = { left: false, right: false, up: false, down: false };
  const dx = inst.vx * dt;
  const dy = inst.vy * dt;
  const limit = Math.max(1, Math.min(inst.hit.w, inst.hit.h, tiles?.cellSize ?? Infinity) / 2);
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / limit));
  const sx = dx / n;
  const sy = dy / n;
  let stopX = false;
  let stopY = false;
  for (let k = 0; k < n; k++) {
    if (!stopX && sx !== 0) {
      inst.x += sx;
      const hit = blockingEdge(inst, hitbox(inst), tiles, solids, sx > 0 ? 'right' : 'left', 0);
      if (hit !== null) {
        inst.x = sx > 0 ? hit - inst.hit.x - inst.hit.w : hit - inst.hit.x;
        if (sx > 0) blocked.right = true;
        else blocked.left = true;
        stopX = true;
      }
    }
    if (!stopY && sy !== 0) {
      const prevBottom = inst.y + inst.hit.y + inst.hit.h - sy;
      inst.y += sy;
      const hit = blockingEdge(inst, hitbox(inst), tiles, solids, sy > 0 ? 'down' : 'up', prevBottom);
      if (hit !== null) {
        inst.y = sy > 0 ? hit - inst.hit.y - inst.hit.h : hit - inst.hit.y;
        if (sy > 0) blocked.down = true;
        else blocked.up = true;
        stopY = true;
      }
    }
  }
  if (blocked.left || blocked.right) inst.vx = inst.bounce > 0 && Math.abs(inst.vx) > 30 ? -inst.vx * inst.bounce : 0;
  if (blocked.down || blocked.up) inst.vy = inst.bounce > 0 && Math.abs(inst.vy) > 60 ? -inst.vy * inst.bounce : 0;
  inst.blocked = blocked;
  inst.grounded = blocked.down || (inst.vy >= 0 && dy === 0 && standingOn(inst, tiles, solids));
}

/** True when there is support directly under the body's feet. */
export function standingOn(inst: Instance, tiles: TileGrid | null, solids: SpatialHash): boolean {
  const b = hitbox(inst);
  return blockingEdge(inst, { x: b.x, y: b.y + b.h, w: b.w, h: 1 }, tiles, solids, 'down', b.y + b.h) !== null;
}

/**
 * Returns the coordinate of the edge that blocks movement in `dir`, or null.
 * One-way tiles/objects only block downward movement from above `prevBottom`.
 */
function blockingEdge(
  inst: Instance,
  b: Box,
  tiles: TileGrid | null,
  solids: SpatialHash,
  dir: 'left' | 'right' | 'up' | 'down',
  prevBottom: number,
): number | null {
  let best: number | null = null;
  const take = (edge: number) => {
    if (best === null) best = edge;
    else best = dir === 'right' || dir === 'down' ? Math.min(best, edge) : Math.max(best, edge);
  };
  if (tiles) {
    const c = tiles.cellSize;
    const x0 = Math.floor((b.x + EPS) / c), x1 = Math.floor((b.x + b.w - EPS) / c);
    const y0 = Math.floor((b.y + EPS) / c), y1 = Math.floor((b.y + b.h - EPS) / c);
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) {
        const k = tiles.kind(cx, cy);
        if (!k) continue;
        if (k === 'oneWay' && !(dir === 'down' && prevBottom <= cy * c + EPS)) continue;
        take(dir === 'right' ? cx * c : dir === 'left' ? (cx + 1) * c : dir === 'down' ? cy * c : (cy + 1) * c);
      }
  }
  for (const s of solids.query(b)) {
    if (s === inst || s.dead || s.hidden) continue;
    const sb = hitbox(s);
    if (!boxesOverlap(b, sb)) continue;
    if (s.solid === 'oneWay' && !(dir === 'down' && prevBottom <= sb.y + EPS)) continue;
    take(dir === 'right' ? sb.x : dir === 'left' ? sb.x + sb.w : dir === 'down' ? sb.y : sb.y + sb.h);
  }
  return best;
}

/**
 * Finds every overlapping pair among `insts` and reports pairs that started
 * touching this step (contact start fires once per touch). Pairs live in
 * identity-keyed sets (no per-pair strings or tuples): a pile of objects at
 * the 1,000-object cap is ~500k pairs per step.
 */
export class Contacts {
  /** Instance → the later-listed instances it overlaps. */
  private current = new Map<Instance, Set<Instance>>();
  /** Broad phase: cell → indices into this step's instance list. */
  private cells = new Map<number, number[]>();

  update(insts: Instance[], onStart: (a: Instance, b: Instance) => void) {
    const size = 128;
    const boxes = insts.map(hitbox);
    this.cells.clear();
    const next = new Map<Instance, Set<Instance>>();
    for (let i = 0; i < insts.length; i++) {
      const b = boxes[i]!;
      const x0 = Math.floor(b.x / size), x1 = Math.floor((b.x + b.w) / size);
      const y0 = Math.floor(b.y / size), y1 = Math.floor((b.y + b.h) / size);
      for (let cx = x0; cx <= x1; cx++)
        for (let cy = y0; cy <= y1; cy++) {
          const k = (cx + 32768) * 65536 + (cy + 32768);
          let list = this.cells.get(k);
          if (!list) this.cells.set(k, (list = []));
          // Everything already in the cell has a lower index: each pair is checked once per shared cell.
          for (const j of list)
            if (boxesOverlap(b, boxes[j]!)) {
              const a = insts[j]!;
              let set = next.get(a);
              if (!set) next.set(a, (set = new Set()));
              set.add(insts[i]!);
            }
          list.push(i);
        }
    }
    const prev = this.current;
    this.current = next;
    for (const [a, set] of next)
      for (const b of set) if (!prev.get(a)?.has(b) && !prev.get(b)?.has(a)) onStart(a, b);
  }

  touching(a: Instance, b: Instance) {
    return !!(this.current.get(a)?.has(b) || this.current.get(b)?.has(a));
  }

  clear() {
    this.current.clear();
  }
}
