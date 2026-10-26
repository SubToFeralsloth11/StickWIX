import { describe, expect, it } from 'vitest';
import { FpsMeter, fpsRequested } from '@/runtime/render/fps-overlay';

describe('FpsMeter', () => {
  it('reports frames per second over the recent window', () => {
    const m = new FpsMeter(1);
    let fps = 0;
    for (let i = 0; i <= 120; i++) fps = m.frame(i * (1000 / 60));
    expect(fps).toBeCloseTo(60, 0);
  });

  it('drops old frames so a slowdown shows up within the window', () => {
    const m = new FpsMeter(1);
    let t = 0;
    for (let i = 0; i < 60; i++) m.frame((t += 1000 / 60));
    let fps = 0;
    for (let i = 0; i < 30; i++) fps = m.frame((t += 1000 / 30));
    expect(fps).toBeLessThan(35);
  });

  it('is turned on by ?fps', () => {
    expect(fpsRequested('?fps')).toBe(true);
    expect(fpsRequested('?x=1&fps=1')).toBe(true);
    expect(fpsRequested('')).toBe(false);
  });
});
