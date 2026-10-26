import type { Project } from '@/model/schema';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'cannotSave';

export interface AutosaveOptions {
  save: (doc: Project) => Promise<void>;
  /** Quiet period after the last change before saving. */
  delayMs?: number;
  /** Longest a change may wait under continuous edits (keeps loss under 2 s, SC-007). */
  maxWaitMs?: number;
}

export interface Autosave {
  /** Queue `doc` as the latest state to save. No-op save-wise while `cannotSave` (the doc is still kept for `retry`). */
  schedule(doc: Project): void;
  /** Save any pending document now and wait until everything is written (or saving failed). */
  flush(): Promise<void>;
  /** Leave `cannotSave` and try saving the latest document again. */
  retry(): Promise<void>;
  status(): AutosaveStatus;
  subscribe(cb: (status: AutosaveStatus) => void): () => void;
}

export function createAutosave({ save, delayMs = 500, maxWaitMs = 1500 }: AutosaveOptions): Autosave {
  let current: AutosaveStatus = 'idle';
  let pending: Project | null = null;
  let firstPendingAt: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;
  let blocked = false;
  const listeners = new Set<(s: AutosaveStatus) => void>();

  const setStatus = (s: AutosaveStatus) => {
    if (s === current) return;
    current = s;
    for (const cb of listeners) cb(s);
  };

  const clearTimer = () => {
    clearTimeout(timer ?? undefined);
    timer = null;
  };

  const kick = () => {
    clearTimer();
    if (inFlight || blocked || !pending) return;
    const doc = pending;
    pending = null;
    firstPendingAt = null;
    setStatus('saving');
    inFlight = save(doc).then(
      () => {
        inFlight = null;
        if (pending && timer === null) kick();
        else setStatus('saved');
      },
      () => {
        inFlight = null;
        blocked = true;
        pending ??= doc;
        clearTimer();
        setStatus('cannotSave');
      },
    );
  };

  const flush = async () => {
    clearTimer();
    while (!blocked && (inFlight || pending)) {
      if (!inFlight) kick();
      await inFlight;
    }
  };

  return {
    schedule(doc) {
      pending = doc;
      if (blocked) return;
      const now = Date.now();
      firstPendingAt ??= now;
      clearTimer();
      const wait = Math.max(0, Math.min(delayMs, maxWaitMs - (now - firstPendingAt)));
      timer = setTimeout(kick, wait);
    },
    flush,
    async retry() {
      blocked = false;
      await flush();
    },
    status: () => current,
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
