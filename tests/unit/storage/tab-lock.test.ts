import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { acquireProjectLock } from '@/storage/tab-lock';

type Cb = (lock: { name: string } | null) => Promise<unknown> | unknown;

/** In-memory navigator.locks honoring `ifAvailable` (exclusive mode only). */
function memoryLocks() {
  const held = new Set<string>();
  return {
    held,
    request(name: string, options: { ifAvailable?: boolean }, cb: Cb): Promise<unknown> {
      if (held.has(name)) {
        if (options.ifAvailable) return Promise.resolve(cb(null));
        return Promise.reject(new Error('waiting not supported in mock'));
      }
      held.add(name);
      return Promise.resolve(cb({ name })).finally(() => held.delete(name));
    },
  };
}

const originalLocks = Object.getOwnPropertyDescriptor(navigator, 'locks');
function setLocks(value: unknown) {
  Object.defineProperty(navigator, 'locks', { value, configurable: true });
}

afterEach(() => {
  if (originalLocks) Object.defineProperty(navigator, 'locks', originalLocks);
  else Reflect.deleteProperty(navigator, 'locks');
});

describe('tab lock (Web Locks)', () => {
  let locks: ReturnType<typeof memoryLocks>;
  beforeEach(() => {
    locks = memoryLocks();
    setLocks(locks);
  });

  it('first opener gets write access, second opener is read-only', async () => {
    const first = await acquireProjectLock('p1');
    const second = await acquireProjectLock('p1');
    expect(first.readOnly).toBe(false);
    expect(second.readOnly).toBe(true);
    first.release();
    second.release();
  });

  it('different projects do not block each other', async () => {
    const a = await acquireProjectLock('p1');
    const b = await acquireProjectLock('p2');
    expect(a.readOnly).toBe(false);
    expect(b.readOnly).toBe(false);
    a.release();
    b.release();
  });

  it('release frees the lock for the next opener', async () => {
    const first = await acquireProjectLock('p1');
    first.release();
    await Promise.resolve();
    await Promise.resolve();
    const next = await acquireProjectLock('p1');
    expect(next.readOnly).toBe(false);
    next.release();
  });
});

describe('tab lock (BroadcastChannel fallback)', () => {
  beforeEach(() => setLocks(undefined));

  it('second opener in another tab is read-only; release lets a new opener write', async () => {
    const opts = { fallbackWaitMs: 50 };
    const a = await acquireProjectLock('p9', opts);
    expect(a.readOnly).toBe(false);
    const b = await acquireProjectLock('p9', opts);
    expect(b.readOnly).toBe(true);
    const other = await acquireProjectLock('p10', opts);
    expect(other.readOnly).toBe(false);

    a.release();
    b.release();
    other.release();
    const c = await acquireProjectLock('p9', opts);
    expect(c.readOnly).toBe(false);
    c.release();
  });
});
