import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';
import type { Project } from '@/model/schema';
import { currentManifest, loadManifest } from '../assets/library';
import { blankProject } from './new-project';
import { STARTERS } from './starters';

/** Name a new game and start blank or from a starter game (FR-001, US3). */
export function NewProjectDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (p: Project) => void }) {
  const [name, setName] = useState('My Game');
  const [ready, setReady] = useState(!!currentManifest());
  useEffect(() => {
    void loadManifest().then(() => setReady(true));
  }, []);

  const create = (make: (name: string) => Project) => {
    if (!ready) return;
    onCreate(make(name));
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-bg" />
        <Dialog.Content className="dialog wide" aria-describedby={undefined}>
          <Dialog.Title asChild>
            <h2>New game</h2>
          </Dialog.Title>
          <label className="row" style={{ marginBottom: 16 }}>
            <span className="muted">Name</span>
            <input className="field grow" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label="Game name" />
          </label>
          <div className="cards">
            {STARTERS.map((s) => (
              <button key={s.id} className="pcard starter" onClick={() => create((n) => s.create(n))} disabled={!ready} data-testid={`starter-${s.id}`} data-tour={`starter-${s.id}`}>
                <div className="thumb" style={{ background: s.color + '22' }}>
                  <img src={s.thumb} alt="" style={{ width: 64, height: 64, objectFit: 'contain' }} />
                </div>
                <h3>{s.name}</h3>
                <span className="muted">{s.description}</span>
              </button>
            ))}
            <button className="pcard starter" onClick={() => create((n) => blankProject(n, currentManifest()))} disabled={!ready} data-testid="starter-blank">
              <div className="thumb" style={{ fontSize: 44 }}>＋</div>
              <h3>Blank</h3>
              <span className="muted">An empty level with every tile set ready to paint.</span>
            </button>
          </div>
          <div className="actions">
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
