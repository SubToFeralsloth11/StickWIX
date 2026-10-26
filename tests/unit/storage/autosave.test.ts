import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAutosave, type AutosaveStatus } from '@/storage/autosave';
import { newProject } from '@/model/defaults';
import type { Project } from '@/model/schema';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(save: (doc: Project) => Promise<void>) {
  const auto = createAutosave({ save, delayMs: 500 });
  const statuses: AutosaveStatus[] = [];
  auto.subscribe((s) => statuses.push(s));
  return { auto, statuses };
}

describe('autosave', () => {
  it('saves the latest document after the debounce delay', async () => {
    const save = vi.fn(async () => {});
    const { auto } = setup(save);
    const p = newProject('A');
    auto.schedule(p);
    auto.schedule({ ...p, name: 'B' });
    await vi.advanceTimersByTimeAsync(499);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ name: 'B' }));
  });

  it('first save under continuous edits happens no later than 2 s after the first change', async () => {
    const save = vi.fn(async () => {});
    const { auto } = setup(save);
    const p = newProject('A');
    let elapsed = 0;
    while (save.mock.calls.length === 0 && elapsed < 5000) {
      auto.schedule(p);
      await vi.advanceTimersByTimeAsync(100);
      elapsed += 100;
    }
    expect(save).toHaveBeenCalled();
    expect(elapsed).toBeLessThanOrEqual(2000);
  });

  it('reports idle → saving → saved', async () => {
    let finish!: () => void;
    const save = vi.fn(() => new Promise<void>((r) => (finish = r)));
    const { auto, statuses } = setup(save);
    expect(auto.status()).toBe('idle');
    auto.schedule(newProject('A'));
    await vi.advanceTimersByTimeAsync(500);
    expect(auto.status()).toBe('saving');
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(auto.status()).toBe('saved');
    expect(statuses).toEqual(['saving', 'saved']);
  });

  it('flush saves pending changes immediately', async () => {
    const save = vi.fn(async () => {});
    const { auto } = setup(save);
    auto.schedule(newProject('A'));
    await auto.flush();
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('saves a change made while a save is in flight', async () => {
    const resolvers: (() => void)[] = [];
    const save = vi.fn(() => new Promise<void>((r) => resolvers.push(r)));
    const { auto } = setup(save);
    const p = newProject('A');
    auto.schedule(p);
    await vi.advanceTimersByTimeAsync(500);
    auto.schedule({ ...p, name: 'later' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
    resolvers[0]?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'later' }));
    resolvers[1]?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(auto.status()).toBe('saved');
  });

  it('quota error → cannotSave and no further silent attempts until retry', async () => {
    const save = vi.fn<(doc: Project) => Promise<void>>(async () => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    const { auto } = setup(save);
    const p = newProject('A');
    auto.schedule(p);
    await vi.advanceTimersByTimeAsync(500);
    expect(auto.status()).toBe('cannotSave');
    expect(save).toHaveBeenCalledTimes(1);

    auto.schedule({ ...p, name: 'more' });
    await vi.advanceTimersByTimeAsync(5000);
    await auto.flush();
    expect(save).toHaveBeenCalledTimes(1);
    expect(auto.status()).toBe('cannotSave');

    save.mockImplementation(async () => {});
    await auto.retry();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'more' }));
    expect(auto.status()).toBe('saved');
  });

  it('unsubscribe stops notifications', async () => {
    const save = vi.fn(async () => {});
    const auto = createAutosave({ save });
    const cb = vi.fn();
    const off = auto.subscribe(cb);
    off();
    auto.schedule(newProject('A'));
    await auto.flush();
    expect(cb).not.toHaveBeenCalled();
  });
});
