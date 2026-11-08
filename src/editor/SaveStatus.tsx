import { useSyncExternalStore } from 'react';
import type { Autosave } from '@/storage/autosave';

/** "Saved" / "Saving…" / "Can't save" indicator (FR-002, storage-full edge case). */
export function SaveStatus({ autosave, onBackup }: { autosave: Autosave; onBackup: () => void }) {
  const status = useSyncExternalStore(
    (cb) => autosave.subscribe(cb),
    () => autosave.status(),
  );
  if (status === 'cannotSave')
    return (
      <span className="save cannot" role="alert">
        <i /> Can't save in this browser
        <button className="btn small danger solid" onClick={onBackup}>
          Export a backup
        </button>
        <button className="btn small" onClick={() => void autosave.retry()}>
          Try again
        </button>
      </span>
    );
  return (
    <span className={`save ${status === 'saving' ? 'saving' : ''}`} aria-live="polite">
      <i /> {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : 'All changes saved'}
    </span>
  );
}
