import { describe, expect, it } from 'vitest';
import { FixedLoop, STEP } from '@/runtime/loop';
import { createRng } from '@/runtime/random';

/** Integrates a falling body with the loop at a given display refresh rate. */
function simulate(hz: number, seconds: number) {
  let y = 0;
  let vy = 0;
  let steps = 0;
  const loop = new FixedLoop(() => {
    vy += 1400 * STEP;
    y += vy * STEP;
    steps++;
  });
  for (let t = 0; t < seconds * hz; t++) loop.advance(1 / hz);
  return { y, steps };
}

describe('FixedLoop', () => {
  it('steps at a fixed 1/60 s', () => {
    expect(STEP).toBeCloseTo(1 / 60);
    const n: number[] = [];
    const loop = new FixedLoop(() => n.push(1));
    for (let i = 0; i < 30; i++) loop.advance(1 / 60);
    expect(n).toHaveLength(30);
  });

  it('gives identical simulation at 30, 60 and 144 Hz frame pacing (FR-040)', () => {
    const a = simulate(30, 2);
    const b = simulate(60, 2);
    const c = simulate(144, 2);
    expect(a.steps).toBe(120);
    expect(b.steps).toBe(120);
    expect(c.steps).toBe(120);
    expect(a.y).toBe(b.y);
    expect(c.y).toBe(b.y);
  });

  it('caps catch-up at 5 steps per frame and drops the rest', () => {
    let n = 0;
    const loop = new FixedLoop(() => n++);
    expect(loop.advance(1)).toBe(5);
    expect(n).toBe(5);
    expect(loop.advance(1 / 60)).toBe(1);
  });

  it('reports the leftover fraction for render interpolation', () => {
    const loop = new FixedLoop(() => {});
    loop.advance(1.5 / 60);
    expect(loop.alpha).toBeCloseTo(0.5);
  });
});

describe('createRng', () => {
  it('is deterministic per seed and in [0,1)', () => {
    const a = createRng(42);
    const b = createRng(42);
    const xs = Array.from({ length: 100 }, () => a());
    expect(xs).toEqual(Array.from({ length: 100 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(createRng(43)()).not.toBe(xs[0]);
  });
});
