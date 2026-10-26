import { describe, expect, it } from 'vitest';
import { PixelDoc, linePoints, MIN_SIZE, MAX_SIZE, hexToRgba } from '@/editor/pixel/canvas-model';

const RED = '#ff0000';
const BLUE = '#0000ff';

/** The colour at (x, y) of a frame, or null when transparent. */
function at(doc: PixelDoc, x: number, y: number, frame = doc.current) {
  return doc.pick(x, y, frame);
}

function painted(doc: PixelDoc, frame = doc.current) {
  let n = 0;
  for (let y = 0; y < doc.h; y++) for (let x = 0; x < doc.w; x++) if (at(doc, x, y, frame)) n++;
  return n;
}

describe('pixel canvas model (FR-033)', () => {
  it('starts with one transparent frame of the given size', () => {
    const doc = new PixelDoc(16, 24);
    expect(doc.w).toBe(16);
    expect(doc.h).toBe(24);
    expect(doc.frames).toHaveLength(1);
    expect(doc.frames[0]).toHaveLength(16 * 24 * 4);
    expect(painted(doc)).toBe(0);
  });

  it('accepts sizes 8..128 per side and rejects others', () => {
    expect(MIN_SIZE).toBe(8);
    expect(MAX_SIZE).toBe(128);
    expect(() => new PixelDoc(8, 128)).not.toThrow();
    expect(() => new PixelDoc(7, 16)).toThrow();
    expect(() => new PixelDoc(16, 129)).toThrow();
    expect(() => new PixelDoc(16.5, 16)).toThrow();
  });

  it('pencil paints one pixel; out-of-bounds is ignored', () => {
    const doc = new PixelDoc(8, 8);
    doc.beginStroke();
    doc.pencil(2, 3, RED);
    doc.pencil(-1, 0, RED);
    doc.pencil(8, 8, RED);
    expect(at(doc, 2, 3)).toBe(RED);
    expect(painted(doc)).toBe(1);
  });

  it('eraser clears a pixel to transparent', () => {
    const doc = new PixelDoc(8, 8);
    doc.beginStroke();
    doc.pencil(1, 1, RED);
    doc.erase(1, 1);
    expect(at(doc, 1, 1)).toBeNull();
    expect(doc.frames[0]![(1 * 8 + 1) * 4 + 3]).toBe(0);
  });

  it('fill floods 4-neighbours of the exact same colour only', () => {
    const doc = new PixelDoc(8, 8);
    doc.beginStroke();
    // A closed blue box from (2,2) to (5,5); diagonal gaps don't leak (4-neighbour).
    for (let i = 2; i <= 5; i++) {
      doc.pencil(i, 2, BLUE);
      doc.pencil(i, 5, BLUE);
      doc.pencil(2, i, BLUE);
      doc.pencil(5, i, BLUE);
    }
    doc.fill(3, 3, RED);
    expect(at(doc, 3, 3)).toBe(RED);
    expect(at(doc, 4, 4)).toBe(RED);
    expect(at(doc, 2, 2)).toBe(BLUE);
    expect(at(doc, 0, 0)).toBeNull();
    expect(painted(doc)).toBe(12 + 4);
    doc.fill(0, 0, RED);
    expect(at(doc, 0, 0)).toBe(RED);
    expect(at(doc, 7, 7)).toBe(RED);
    expect(at(doc, 2, 2)).toBe(BLUE);
  });

  it('fill with the same colour does nothing and adds no undo step', () => {
    const doc = new PixelDoc(8, 8);
    doc.fill(0, 0, RED);
    expect(doc.canUndo).toBe(true);
    doc.undo();
    expect(doc.canUndo).toBe(false);
    doc.fill(0, 0, RED);
    doc.fill(0, 0, RED);
    doc.undo();
    expect(painted(doc)).toBe(0);
    expect(doc.canUndo).toBe(false);
  });

  it('line draws a Bresenham line between two points', () => {
    expect(linePoints(0, 0, 3, 0)).toEqual([[0, 0], [1, 0], [2, 0], [3, 0]]);
    expect(linePoints(0, 0, 2, 2)).toEqual([[0, 0], [1, 1], [2, 2]]);
    expect(linePoints(3, 1, 0, 0)).toEqual([[3, 1], [2, 1], [1, 0], [0, 0]]);
    const doc = new PixelDoc(8, 8);
    doc.beginStroke();
    doc.line(0, 7, 7, 0, RED);
    for (let i = 0; i < 8; i++) expect(at(doc, i, 7 - i)).toBe(RED);
    expect(painted(doc)).toBe(8);
    doc.line(0, 7, 7, 0, null);
    expect(painted(doc)).toBe(0);
  });

  it('eyedropper returns the colour, or null on transparent pixels', () => {
    const doc = new PixelDoc(8, 8);
    doc.beginStroke();
    doc.pencil(4, 4, '#12ab34');
    expect(doc.pick(4, 4)).toBe('#12ab34');
    expect(doc.pick(0, 0)).toBeNull();
    expect(doc.pick(99, 0)).toBeNull();
    expect(hexToRgba('#12AB34')).toEqual([0x12, 0xab, 0x34, 255]);
  });

  it('adds, duplicates, moves and deletes frames, always keeping one', () => {
    const doc = new PixelDoc(8, 8);
    doc.beginStroke();
    doc.pencil(0, 0, RED);
    doc.duplicateFrame();
    expect(doc.frames).toHaveLength(2);
    expect(doc.current).toBe(1);
    expect(at(doc, 0, 0, 1)).toBe(RED);
    // The copy is independent.
    doc.beginStroke();
    doc.pencil(1, 0, BLUE);
    expect(at(doc, 1, 0, 0)).toBeNull();

    doc.addFrame();
    expect(doc.frames).toHaveLength(3);
    expect(doc.current).toBe(2);
    expect(painted(doc)).toBe(0);

    doc.moveFrame(2, 0);
    expect(painted(doc, 0)).toBe(0);
    expect(at(doc, 0, 0, 1)).toBe(RED);
    expect(doc.current).toBe(0);

    doc.deleteFrame();
    doc.deleteFrame();
    expect(doc.frames).toHaveLength(1);
    doc.deleteFrame();
    expect(doc.frames).toHaveLength(1);
  });

  it('gives onion-skin data: the previous frame at low alpha', () => {
    const doc = new PixelDoc(8, 8);
    expect(doc.onionSkin()).toBeNull();
    doc.beginStroke();
    doc.pencil(3, 3, RED);
    doc.addFrame();
    const onion = doc.onionSkin()!;
    const i = (3 * 8 + 3) * 4;
    expect([onion[i], onion[i + 1], onion[i + 2]]).toEqual([255, 0, 0]);
    expect(onion[i + 3]).toBeGreaterThan(0);
    expect(onion[i + 3]).toBeLessThan(128);
    expect(onion[3]).toBe(0);
  });

  it('undo/redo one step per stroke, frame change, fill or resize', () => {
    const doc = new PixelDoc(8, 8);
    doc.beginStroke();
    doc.pencil(0, 0, RED);
    doc.pencil(1, 0, RED);
    doc.beginStroke();
    doc.pencil(2, 0, RED);
    doc.addFrame();
    expect(doc.frames).toHaveLength(2);
    doc.undo();
    expect(doc.frames).toHaveLength(1);
    expect(painted(doc)).toBe(3);
    doc.undo();
    expect(painted(doc)).toBe(2);
    doc.undo();
    expect(painted(doc)).toBe(0);
    expect(doc.canUndo).toBe(false);
    doc.redo();
    expect(painted(doc)).toBe(2);
    doc.redo();
    doc.redo();
    expect(doc.frames).toHaveLength(2);
    expect(doc.canRedo).toBe(false);
    doc.undo();
    doc.beginStroke();
    expect(doc.canRedo).toBe(false);
  });

  it('resizing keeps the top-left pixels', () => {
    const doc = new PixelDoc(16, 16);
    doc.beginStroke();
    doc.pencil(1, 1, RED);
    doc.pencil(12, 12, BLUE);
    doc.resize(8, 32);
    expect([doc.w, doc.h]).toEqual([8, 32]);
    expect(at(doc, 1, 1)).toBe(RED);
    expect(painted(doc)).toBe(1);
    doc.resize(16, 16);
    expect(at(doc, 1, 1)).toBe(RED);
    expect(at(doc, 12, 12)).toBeNull();
    doc.undo();
    doc.undo();
    expect(at(doc, 12, 12)).toBe(BLUE);
    expect(() => doc.resize(200, 16)).toThrow();
  });

  it('exports frames as a horizontal strip and loads it back', () => {
    const doc = new PixelDoc(8, 10, 12);
    doc.beginStroke();
    doc.pencil(0, 0, RED);
    doc.addFrame();
    doc.beginStroke();
    doc.pencil(7, 9, BLUE);
    const strip = doc.exportStrip();
    expect(strip.width).toBe(16);
    expect(strip.height).toBe(10);
    expect(strip.frames).toEqual({ w: 8, h: 10, count: 2, fps: 12 });
    expect(strip.data).toHaveLength(16 * 10 * 4);
    expect(Array.from(strip.data.slice(0, 4))).toEqual([255, 0, 0, 255]);
    const j = (9 * 16 + 15) * 4;
    expect(Array.from(strip.data.slice(j, j + 4))).toEqual([0, 0, 255, 255]);

    const back = PixelDoc.fromStrip(strip.data, strip.width, strip.height, 2, 12);
    expect(back.frames).toHaveLength(2);
    expect(back.fps).toBe(12);
    expect(back.pick(0, 0, 0)).toBe(RED);
    expect(back.pick(7, 9, 1)).toBe(BLUE);
    expect(back.canUndo).toBe(false);
  });
});
