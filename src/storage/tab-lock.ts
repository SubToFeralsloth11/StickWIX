/** One writer per project across tabs: the first opener edits, later openers get read-only mode. */
export interface ProjectLock {
  readOnly: boolean;
  /** Give up the lock (no-op for read-only locks). Safe to call more than once. */
  release(): void;
}

export interface LockOptions {
  /** BroadcastChannel fallback only: how long to wait for another tab to answer "held". */
  fallbackWaitMs?: number;
}

const LOCK_PREFIX = 'stickwix-project:';
const CHANNEL = 'stickwix-tab-lock';

type LockMessage = { type: 'query' | 'held'; projectId: string };

export function acquireProjectLock(projectId: string, options: LockOptions = {}): Promise<ProjectLock> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  return locks ? viaWebLocks(locks, projectId) : viaBroadcast(projectId, options.fallbackWaitMs ?? 300);
}

function viaWebLocks(locks: LockManager, projectId: string): Promise<ProjectLock> {
  return new Promise((resolve, reject) => {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    locks
      .request(LOCK_PREFIX + projectId, { ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve({ readOnly: true, release: () => {} });
          return undefined;
        }
        resolve({ readOnly: false, release });
        return held;
      })
      .catch(reject);
  });
}

/** Fallback without Web Locks: ask other tabs whether they hold the project; a holder answers "held". */
function viaBroadcast(projectId: string, waitMs: number): Promise<ProjectLock> {
  if (typeof BroadcastChannel === 'undefined') return Promise.resolve({ readOnly: false, release: () => {} });
  const channel = new BroadcastChannel(CHANNEL);
  return new Promise((resolve) => {
    let holder = false;
    const timer = setTimeout(() => {
      holder = true;
      resolve({ readOnly: false, release: () => channel.close() });
    }, waitMs);
    channel.onmessage = (event: MessageEvent<LockMessage>) => {
      const msg = event.data;
      if (msg.projectId !== projectId) return;
      if (msg.type === 'query' && holder) channel.postMessage({ type: 'held', projectId } satisfies LockMessage);
      else if (msg.type === 'held' && !holder) {
        clearTimeout(timer);
        channel.close();
        resolve({ readOnly: true, release: () => {} });
      }
    };
    channel.postMessage({ type: 'query', projectId } satisfies LockMessage);
  });
}
