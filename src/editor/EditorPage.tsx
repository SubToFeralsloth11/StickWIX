import { useEffect, useMemo, useState } from 'react';
import { getProject, putProject } from '@/storage/db';
import { createAutosave, type Autosave } from '@/storage/autosave';
import { acquireProjectLock, type ProjectLock } from '@/storage/tab-lock';
import { NewerVersionError } from '@/model/migrations';
import { editorStore, useEditor } from './store';
import { openProject } from './App';
import { Editor } from './Editor';
import { toast } from './toast';

/**
 * Opens one project: loads it, takes the tab lock (a second tab gets
 * read-only), and autosaves every change within 2 s (FR-002, SC-007).
 */
export function EditorPage({ projectId }: { projectId: string }) {
  const project = useEditor((s) => s.project);
  const [error, setError] = useState<string | null>(null);
  const autosave: Autosave = useMemo(
    () => createAutosave({ save: (doc) => putProject({ ...doc, updatedAt: new Date().toISOString() }) }),
    [],
  );

  useEffect(() => {
    let lock: ProjectLock | null = null;
    let cancelled = false;
    let unsub = () => {};
    (async () => {
      try {
        const doc = await getProject(projectId);
        if (cancelled) return;
        if (!doc) {
          toast("That game isn't in this browser any more.", { error: true });
          openProject(null);
          return;
        }
        lock = await acquireProjectLock(projectId);
        if (cancelled) {
          lock.release();
          return;
        }
        editorStore.getState().load(doc, { readOnly: lock.readOnly });
        unsub = editorStore.getState().subscribeProject((p) => autosave.schedule(p));
      } catch (e) {
        if (!cancelled) setError(e instanceof NewerVersionError ? e.message : `This game could not be opened: ${String(e)}`);
      }
    })();
    const flush = () => void autosave.flush();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      cancelled = true;
      unsub();
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
      void autosave.flush().finally(() => lock?.release());
      editorStore.setState({ project: null, selection: [], sceneId: null });
    };
  }, [projectId, autosave]);

  if (error)
    return (
      <div className="home">
        <div className="home-inner">
          <h2>Can't open this game</h2>
          <p>{error}</p>
          <button className="btn" onClick={() => openProject(null)}>
            Back to my games
          </button>
        </div>
      </div>
    );
  if (!project || project.id !== projectId) return <div className="home" />;
  return <Editor autosave={autosave} />;
}
