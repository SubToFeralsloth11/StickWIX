import { useRef, useState } from 'react';
import { playerTemplate } from 'virtual:stickwix-inline';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { downloadFile, exportGame } from '@/export/export-game';
import type { Project } from '@/model/schema';
import { getAsset } from '@/storage/db';
import { exportProjectFile, importProjectFile, projectFileName, slugify } from '@/storage/project-file';
import type { Library } from '../assets/library';
import type { PanelProps } from '../panels';
import { toast } from '../toast';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Reads a drawn/imported asset blob: from IndexedDB, else from the editor's
 * in-memory object URL (so a backup still works when storage is failing).
 */
function assetLoader(project: Project, lib?: Library) {
  return async (assetId: string): Promise<Blob | undefined> => {
    const stored = await getAsset(project.id, assetId).catch(() => undefined);
    if (stored) return stored;
    const url = lib?.url(assetId);
    if (!url) return undefined;
    const res = await fetch(url).catch(() => undefined);
    return res?.ok ? res.blob() : undefined;
  };
}

async function saveProjectFile(project: Project, lib?: Library) {
  downloadFile(projectFileName(project.name), await exportProjectFile(project, assetLoader(project, lib)));
}

/** "Export a backup" from the cannot-save status (BACKUP_ACTION) and the Export menu. */
export function exportProjectBackup(project: Project, lib?: Library): void {
  saveProjectFile(project, lib).then(
    () => toast(`Saved ${projectFileName(project.name)}. Open it later with Import on the home screen.`),
    (e) => toast(message(e), { error: true }),
  );
}

async function saveGame(project: Project, lib: Library) {
  const template = playerTemplate ?? (await fetch(`${import.meta.env.BASE_URL}player-template.html`).then((r) => (r.ok ? r.text() : undefined), () => undefined));
  if (!template) throw new Error('The game player could not be loaded, so the game could not be exported.');
  const html = await exportGame(project, {
    template,
    loadAsset: assetLoader(project, lib),
    builtinUrl: (id) => lib.url(id),
    manifest: lib.manifest,
  });
  downloadFile(`${slugify(project.name)}.html`, html, 'text/html');
}

/** Top-bar Export menu: a playable single HTML file, or a `.stickwix` project file (FR-035, FR-036). */
export function ExportMenu({ project, lib }: PanelProps) {
  const [busy, setBusy] = useState(false);
  const exportHtml = () => {
    setBusy(true);
    saveGame(project, lib)
      .then(() => toast(`Exported ${slugify(project.name)}.html. Open it in any browser to play, even offline.`))
      .catch((e) => toast(message(e), { error: true }))
      .finally(() => setBusy(false));
  };
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="btn" data-testid="export-menu" disabled={busy} aria-busy={busy}>
          {busy ? 'Exporting…' : 'Export'}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="pop" sideOffset={6} align="end">
          <DropdownMenu.Item className="opt" onSelect={exportHtml} data-testid="export-game">
            <span>
              Export game (.html)
              <small>One file anyone can open and play in a browser.</small>
            </span>
          </DropdownMenu.Item>
          <DropdownMenu.Item className="opt" onSelect={() => exportProjectBackup(project, lib)} data-testid="export-project">
            <span>
              Export project file (.stickwix)
              <small>A backup you can import to keep editing.</small>
            </span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Home-screen Import: opens a `.stickwix` file as a new project. */
export function ImportButton({ onImported }: { onImported: (id: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const onFile = (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    importProjectFile(file)
      .then((p) => {
        toast(`Imported "${p.name}".`);
        onImported(p.id);
      })
      .catch((e) => toast(message(e), { error: true }))
      .finally(() => {
        setBusy(false);
        if (input.current) input.current.value = '';
      });
  };
  return (
    <>
      <button className="btn" onClick={() => input.current?.click()} disabled={busy} data-testid="import-project">
        {busy ? 'Importing…' : 'Import'}
      </button>
      <input
        ref={input}
        type="file"
        accept=".stickwix"
        hidden
        data-testid="import-file"
        onChange={(e) => onFile(e.currentTarget.files?.[0])}
      />
    </>
  );
}
