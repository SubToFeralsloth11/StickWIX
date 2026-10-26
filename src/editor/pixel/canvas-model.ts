/**
 * Pixel editor document (FR-033): RGBA frames of one size, drawing tools,
 * frame list and an in-editor undo history. Pure — no DOM — so it is unit
 * tested directly; PixelEditor.tsx draws it onto canvases.
 *
 * Undo granularity: one step per stroke. Callers start a pencil/eraser/line
 * stroke with `beginStroke()`; fill, frame changes and resize record their own
 * step.
 */

export const MIN_SIZE = 8;
export const MAX_SIZE = 128;
const UNDO_LIMIT = 60;
/** Alpha multiplier for the onion-skin copy of the previous frame. */
const ONION_ALPHA = 0.3;

type Pixels = Uint8ClampedArray<ArrayBuffer>;

export type Rgba = [number, number, number, number];

/** '#rrggbb' → [r, g, b, 255]. */
export function hexToRgba(hex: string): Rgba {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

/** Pixels on the straight line from (x0, y0) to (x1, y1), both ends included (Bresenham). */
export function linePoints(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const out: [number, number][] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    out.push([x, y]);
    if (x === x1 && y === y1) return out;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

export function validSize(n: number): boolean {
  return Number.isInteger(n) && n >= MIN_SIZE && n <= MAX_SIZE;
}

interface Snapshot {
  w: number;
  h: number;
  frames: Pixels[];
  current: number;
}

export interface Strip {
  /** RGBA pixels of all frames side by side, `width = w * count`. */
  data: Pixels;
  width: number;
  height: number;
  frames: { w: number; h: number; count: number; fps: number };
}

export class PixelDoc {
  w: number;
  h: number;
  frames: Pixels[];
  current = 0;
  fps: number;
  /** Bumped on every change so React can re-render. */
  version = 0;
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];

  constructor(w: number, h: number, fps = 8) {
    if (!validSize(w) || !validSize(h)) throw new RangeError(`Pictures can be ${MIN_SIZE} to ${MAX_SIZE} pixels per side.`);
    this.w = w;
    this.h = h;
    this.fps = fps;
    this.frames = [new Uint8ClampedArray(w * h * 4)];
  }

  /** Splits a horizontal strip of `count` frames (as saved by exportStrip). */
  static fromStrip(data: Uint8ClampedArray, width: number, height: number, count: number, fps: number): PixelDoc {
    const w = width / count;
    const doc = new PixelDoc(w, height, fps);
    doc.frames = Array.from({ length: count }, (_, f) => {
      const frame = new Uint8ClampedArray(w * height * 4);
      for (let y = 0; y < height; y++) frame.set(data.subarray((y * width + f * w) * 4, (y * width + f * w + w) * 4), y * w * 4);
      return frame;
    });
    return doc;
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  private snapshot(): Snapshot {
    return { w: this.w, h: this.h, frames: this.frames.map((f) => f.slice()), current: this.current };
  }

  private restore(s: Snapshot) {
    this.w = s.w;
    this.h = s.h;
    this.frames = s.frames;
    this.current = s.current;
    this.version++;
  }

  /** Records an undo step for the stroke that is about to start. */
  beginStroke() {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }

  undo() {
    const s = this.undoStack.pop();
    if (!s) return;
    this.redoStack.push(this.snapshot());
    this.restore(s);
  }

  redo() {
    const s = this.redoStack.pop();
    if (!s) return;
    this.undoStack.push(this.snapshot());
    this.restore(s);
  }

  private inside(x: number, y: number) {
    return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  private set(x: number, y: number, c: Rgba) {
    if (!this.inside(x, y)) return;
    this.frames[this.current]!.set(c, (y * this.w + x) * 4);
    this.version++;
  }

  /** Paints one pixel (part of a stroke). */
  pencil(x: number, y: number, color: string) {
    this.set(x, y, hexToRgba(color));
  }

  /** Clears one pixel to transparent (part of a stroke). */
  erase(x: number, y: number) {
    this.set(x, y, [0, 0, 0, 0]);
  }

  /** Straight line in `color`, or erasing when `color` is null (part of a stroke). */
  line(x0: number, y0: number, x1: number, y1: number, color: string | null) {
    const c: Rgba = color ? hexToRgba(color) : [0, 0, 0, 0];
    for (const [x, y] of linePoints(x0, y0, x1, y1)) this.set(x, y, c);
  }

  /** Flood-fills the 4-connected area of exactly the clicked colour. Records its own undo step. */
  fill(x: number, y: number, color: string) {
    if (!this.inside(x, y)) return;
    const frame = this.frames[this.current]!;
    const c = hexToRgba(color);
    const start = (y * this.w + x) * 4;
    const target = [frame[start]!, frame[start + 1]!, frame[start + 2]!, frame[start + 3]!];
    if (target.every((v, i) => v === c[i])) return;
    this.beginStroke();
    const same = (i: number) => frame[i] === target[0] && frame[i + 1] === target[1] && frame[i + 2] === target[2] && frame[i + 3] === target[3];
    const stack = [x, y];
    while (stack.length) {
      const cy = stack.pop()!;
      const cx = stack.pop()!;
      const i = (cy * this.w + cx) * 4;
      if (!same(i)) continue;
      frame.set(c, i);
      if (cx > 0) stack.push(cx - 1, cy);
      if (cx < this.w - 1) stack.push(cx + 1, cy);
      if (cy > 0) stack.push(cx, cy - 1);
      if (cy < this.h - 1) stack.push(cx, cy + 1);
    }
    this.version++;
  }

  /** Eyedropper: '#rrggbb' at (x, y), or null for transparent / outside. */
  pick(x: number, y: number, frame = this.current): string | null {
    if (!this.inside(x, y)) return null;
    const px = this.frames[frame]!;
    const i = (y * this.w + x) * 4;
    return px[i + 3] ? rgbToHex(px[i]!, px[i + 1]!, px[i + 2]!) : null;
  }

  select(index: number) {
    if (index < 0 || index >= this.frames.length || index === this.current) return;
    this.current = index;
    this.version++;
  }

  /** Inserts an empty frame after the current one and selects it. */
  addFrame() {
    this.beginStroke();
    this.frames.splice(this.current + 1, 0, new Uint8ClampedArray(this.w * this.h * 4));
    this.current++;
    this.version++;
  }

  /** Inserts a copy of the current frame after it and selects the copy. */
  duplicateFrame() {
    this.beginStroke();
    this.frames.splice(this.current + 1, 0, this.frames[this.current]!.slice());
    this.current++;
    this.version++;
  }

  /** Deletes the current frame; the last remaining frame is never deleted. */
  deleteFrame() {
    if (this.frames.length <= 1) return;
    this.beginStroke();
    this.frames.splice(this.current, 1);
    this.current = Math.min(this.current, this.frames.length - 1);
    this.version++;
  }

  /** Moves a frame to another position; the moved frame becomes current. */
  moveFrame(from: number, to: number) {
    const n = this.frames.length;
    if (from === to || from < 0 || to < 0 || from >= n || to >= n) return;
    this.beginStroke();
    const [f] = this.frames.splice(from, 1);
    this.frames.splice(to, 0, f!);
    this.current = to;
    this.version++;
  }

  /** Changes the picture size, keeping the top-left pixels. Records its own undo step. */
  resize(w: number, h: number) {
    if (!validSize(w) || !validSize(h)) throw new RangeError(`Pictures can be ${MIN_SIZE} to ${MAX_SIZE} pixels per side.`);
    if (w === this.w && h === this.h) return;
    this.beginStroke();
    const cw = Math.min(w, this.w);
    this.frames = this.frames.map((old) => {
      const next = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < Math.min(h, this.h); y++) next.set(old.subarray(y * this.w * 4, (y * this.w + cw) * 4), y * w * 4);
      return next;
    });
    this.w = w;
    this.h = h;
    this.version++;
  }

  /** The previous frame with its alpha lowered, drawn under the current one; null on the first frame. */
  onionSkin(): Pixels | null {
    if (this.current === 0) return null;
    const out = this.frames[this.current - 1]!.slice();
    for (let i = 3; i < out.length; i += 4) out[i] = Math.round(out[i]! * ONION_ALPHA);
    return out;
  }

  /** All frames side by side in one RGBA image, plus the Asset frame info. */
  exportStrip(): Strip {
    const count = this.frames.length;
    const width = this.w * count;
    const data = new Uint8ClampedArray(width * this.h * 4);
    this.frames.forEach((frame, f) => {
      for (let y = 0; y < this.h; y++) data.set(frame.subarray(y * this.w * 4, (y + 1) * this.w * 4), (y * width + f * this.w) * 4);
    });
    return { data, width, height: this.h, frames: { w: this.w, h: this.h, count, fps: this.fps } };
  }
}
