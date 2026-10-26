import { useCallback, useEffect, useState } from 'react';
import { deleteProject, duplicateProject, listProjects, putProject, renameProject, type ProjectMeta } from '@/storage/db';
import { openProject } from '../App';
import { Logo } from '../Logo';
import { toast } from '../toast';
import { NewProjectDialog } from './NewProjectDialog';
import { ImportButton } from './ImportExport';
import { ConfirmDialog } from '../ConfirmDialog';

function when(iso: string) {
  const d = new Date(iso);
  const mins = (Date.now() - d.getTime()) / 60000;
  if (mins < 1) return 'just now';
  if (mins < 60) return `${Math.floor(mins)} min ago`;
  if (mins < 60 * 24) return `${Math.floor(mins / 60)} h ago`;
  return d.toLocaleDateString();
}

const HUES = ['#ff7a59', '#5fe0b0', '#ffd166', '#7cc4ff', '#b78cff', '#ff5d8f'];

export function HomeScreen() {
  const [projects, setProjects] = useState<ProjectMeta[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ProjectMeta | null>(null);

  const refresh = useCallback(() => {
    listProjects()
      .then(setProjects)
      .catch(() => {
        setProjects([]);
        toast("This browser won't let StickWIX store games. Try a normal (not private) window.", { error: true, ms: 8000 });
      });
  }, []);
  useEffect(refresh, [refresh]);

  return (
    <div className="home">
      <div className="home-inner">
        <header className="row" style={{ justifyContent: 'space-between' }}>
          <div className="brand">
            <Logo size={56} />
            <div>
              <h1>
                Stick<em>WIX</em>
              </h1>
              <div className="muted">Make games with stickers, sentences and Show-me. No code.</div>
            </div>
          </div>
          <div className="row">
            <ImportButton onImported={openProject} />
            <button className="btn primary" onClick={() => setCreating(true)} data-tour="new-project">
              ＋ New game
            </button>
          </div>
        </header>

        <h2>Your games</h2>
        {projects === null ? (
          <div className="muted">Loading…</div>
        ) : projects.length === 0 ? (
          <div className="empty">
            No games yet. Press <b>New game</b> and pick a starter to have something playable in a minute.
          </div>
        ) : (
          <div className="cards">
            {projects.map((p, i) => (
              <div key={p.id} className="pcard" data-testid="project-card">
                <button className="thumb btn ghost" style={{ background: HUES[i % HUES.length] + '22', color: HUES[i % HUES.length] }} onClick={() => openProject(p.id)} aria-label={`Open ${p.name}`}>
                  <span style={{ fontWeight: 900, fontSize: 36 }}>{p.name.slice(0, 2).toUpperCase()}</span>
                </button>
                {renaming === p.id ? (
                  <form
                    className="row"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const name = String(new FormData(e.currentTarget).get('name') ?? '').trim();
                      setRenaming(null);
                      if (name) void renameProject(p.id, name.slice(0, 60)).then(refresh);
                    }}
                  >
                    <input className="field grow" name="name" defaultValue={p.name} autoFocus aria-label="New name" maxLength={60} onBlur={(e) => e.currentTarget.form?.requestSubmit()} />
                  </form>
                ) : (
                  <h3>{p.name}</h3>
                )}
                <div className="muted" style={{ fontSize: 12 }}>
                  Changed {when(p.updatedAt)}
                </div>
                <div className="row" style={{ flexWrap: 'wrap' }}>
                  <button className="btn small primary" onClick={() => openProject(p.id)}>
                    Open
                  </button>
                  <button className="btn small" onClick={() => setRenaming(p.id)}>
                    Rename
                  </button>
                  <button
                    className="btn small"
                    onClick={() =>
                      void duplicateProject(p.id).then((c) => {
                        toast(`Made "${c.name}"`);
                        refresh();
                      })
                    }
                  >
                    Duplicate
                  </button>
                  <button className="btn small danger" onClick={() => setDeleting(p)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="dim" style={{ marginTop: 28, fontSize: 12.5 }}>
          Games are kept in this browser only. Use <b>Export project file</b> in the editor to keep a backup or move a game to another computer.
        </p>
      </div>
      {creating && (
        <NewProjectDialog
          onClose={() => setCreating(false)}
          onCreate={(doc) =>
            void putProject(doc)
              .then(() => openProject(doc.id))
              .catch(() => toast("Couldn't save the new game in this browser.", { error: true }))
          }
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete "${deleting.name}"?`}
          body="This removes the game and its drawings from this browser. It can't be undone."
          confirm="Delete game"
          danger
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            const id = deleting.id;
            setDeleting(null);
            void deleteProject(id).then(refresh);
          }}
        />
      )}
    </div>
  );
}
