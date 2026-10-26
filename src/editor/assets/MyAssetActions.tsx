import { useState } from 'react';
import { assetUsers, deleteAssetFromProject } from '@/model/asset-references';
import type { Project } from '@/model/schema';
import { ConfirmDialog } from '../ConfirmDialog';
import { DELETE_GUARD } from '../delete-guard';
import { openPixelEditor } from '../pixel/PixelEditor';
import { editorStore, useEditor } from '../store';
import { toast } from '../toast';

/**
 * Small edit/delete buttons on a custom picture or sound (US6). Deleting first
 * lists the things that use it (they show a placeholder look), then goes
 * through DELETE_GUARD, which lists the rules that will break.
 */
export function MyAssetActions({ project, assetId, inline }: { project: Project; assetId: string; inline?: boolean }) {
  const readOnly = useEditor((s) => s.readOnly);
  const [confirming, setConfirming] = useState(false);
  const asset = project.assets.find((a) => a.id === assetId);
  if (!asset || readOnly) return null;
  const noun = asset.kind === 'image' ? 'picture' : 'sound';

  const doDelete = () => {
    editorStore.getState().edit(`Delete ${noun} "${asset.name}"`, (d) => deleteAssetFromProject(d, asset.id));
    toast(`Deleted "${asset.name}".`);
  };

  const users = confirming ? assetUsers(project, asset.id) : [];
  const others = users.flatMap((u) => (u.type === 'rule' ? [] : [u.label]));
  const ruleCount = users.length - others.length;

  return (
    <>
      <span style={inline ? { display: 'flex', gap: 2 } : { position: 'absolute', top: 2, left: 2, display: 'flex', gap: 2, zIndex: 1 }}>
        {asset.kind === 'image' && asset.source === 'drawn' && (
          <button className="btn small icon" onClick={() => openPixelEditor(asset.id)} title={`Edit drawing "${asset.name}"`} aria-label={`Edit drawing ${asset.name}`}>
            ✎
          </button>
        )}
        <button className="btn small icon danger" onClick={() => setConfirming(true)} title={`Delete "${asset.name}"`} aria-label={`Delete ${asset.name}`}>
          ✕
        </button>
      </span>
      {confirming && (
        <ConfirmDialog
          title={`Delete the ${noun} "${asset.name}"?`}
          body={
            <>
              {others.length ? (
                <>
                  <p>{asset.kind === 'image' ? 'These use it. They will show a pink checker pattern until you choose another picture:' : 'These use it. They will make no sound until you choose another one:'}</p>
                  <ul style={{ paddingLeft: 18, maxHeight: 200, overflow: 'auto' }}>
                    {others.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p>Nothing in your game uses it{ruleCount ? ' except some rules' : ''}.</p>
              )}
              {ruleCount > 0 && <p className="muted">{ruleCount === 1 ? '1 rule uses it too' : `${ruleCount} rules use it too`}; you will see {ruleCount === 1 ? 'it' : 'them'} next.</p>}
            </>
          }
          confirm="Delete"
          danger
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            DELETE_GUARD.request({ kind: 'asset', id: asset.id }, doDelete);
          }}
        />
      )}
    </>
  );
}
