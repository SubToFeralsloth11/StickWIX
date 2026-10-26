import { useRef, useState } from 'react';
import { importAsset, ImportRejected } from '@/storage/import-asset';
import { putBlobUrl } from '../assets/library';
import type { PanelProps } from '../panels';
import { editorStore, useEditor } from '../store';
import { toast } from '../toast';
import { openPixelEditor, PixelEditorHost } from './PixelEditor';

/** "Import picture or sound" and "Draw new" at the top of the Art tab (US6, FR-033/FR-034). */
export function ArtTools({ project, lib }: PanelProps) {
  const readOnly = useEditor((s) => s.readOnly);
  const input = useRef<HTMLInputElement>(null);
  const [frameWidth, setFrameWidth] = useState('');
  const [busy, setBusy] = useState(false);

  const importFiles = async (files: File[]) => {
    setBusy(true);
    const added: string[] = [];
    const problems: string[] = [];
    const fw = Number(frameWidth) || undefined;
    for (const file of files) {
      try {
        const takenNames = editorStore.getState().project?.assets.map((a) => a.name) ?? [];
        const asset = await importAsset(project.id, file, { frameWidth: fw, takenNames });
        putBlobUrl(project.id, asset.id, file);
        editorStore.getState().edit(`Import "${asset.name}"`, (d) => void d.assets.push(asset));
        added.push(asset.kind === 'image' ? `"${asset.name}" is in My art` : `"${asset.name}" is in your sounds`);
      } catch (err) {
        problems.push(err instanceof ImportRejected ? `${file.name}: ${err.message}` : `${file.name} could not be saved (${err instanceof Error ? err.message : String(err)}).`);
      }
    }
    setBusy(false);
    if (problems.length) toast([...problems, ...(added.length ? [`Added: ${added.join(', ')}.`] : [])].join(' • '), { error: true, ms: 4000 + 2500 * problems.length });
    else if (added.length) toast(`${added.join('. ')}.`);
  };

  if (readOnly) return null;
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row">
        <button className="btn small grow" onClick={() => input.current?.click()} disabled={busy} data-testid="import-asset">
          {busy ? 'Importing…' : 'Import picture or sound'}
        </button>
        <button className="btn small" onClick={() => openPixelEditor()} data-testid="draw-new">
          Draw new
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept=".png,.wav,.mp3,image/png,audio/wav,audio/x-wav,audio/mpeg"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length) void importFiles(files);
        }}
      />
      <label className="row dim" style={{ fontSize: 12 }} title="For a picture with several animation frames side by side. Leave empty for a normal picture.">
        Animation strip? Frame width
        <input className="field" style={{ width: 64 }} type="number" min={1} placeholder="px" value={frameWidth} onChange={(e) => setFrameWidth(e.target.value)} aria-label="Frame width for animation strips" />
      </label>
      <PixelEditorHost project={project} lib={lib} />
    </div>
  );
}
