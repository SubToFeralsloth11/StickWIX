import { useEffect, useState } from 'react';
import { rulesReferencing, type Ref } from '@/model/references';
import { sentenceText } from '@/model/sentence';
import { ConfirmDialog } from './ConfirmDialog';
import { editorStore } from './store';
import { DELETE_GUARD } from './delete-guard';

const NOUN: Record<Ref['kind'], string> = { kind: 'Kind', object: 'object', ui: 'screen item', value: 'value', scene: 'scene', asset: 'picture or sound' };

function nameOf(ref: Ref): string {
  const p = editorStore.getState().project!;
  switch (ref.kind) {
    case 'kind': return p.kinds.find((k) => k.id === ref.id)?.name ?? '';
    case 'value': return [...p.values, ...p.kinds.flatMap((k) => k.values)].find((v) => v.id === ref.id)?.name ?? '';
    case 'scene': return p.scenes.find((s) => s.id === ref.id)?.name ?? '';
    case 'ui': return p.scenes.flatMap((s) => s.ui).find((u) => u.id === ref.id)?.name ?? '';
    case 'asset': return p.assets.find((a) => a.id === ref.id)?.name ?? '';
    case 'object': return '';
  }
}

/**
 * Warns before deleting something rules use, listing those rules; if confirmed
 * they are marked broken (red) and stop running until fixed. Deletes that
 * affect no rules go straight through.
 */
export function DeleteConfirm() {
  const [pending, setPending] = useState<{ ref: Ref; run: () => void; rules: string[] } | null>(null);
  useEffect(() => {
    DELETE_GUARD.request = (ref, run) => {
      const p = editorStore.getState().project;
      if (!p) return run();
      const affected = rulesReferencing(p, ref);
      // Deleting a Kind also removes its own rules and objects; only rules elsewhere would break.
      const breaking = affected.filter((r) => !(ref.kind === 'kind' && r.owner.type === 'kind' && r.owner.id === ref.id));
      if (!breaking.length) return run();
      setPending({ ref, run, rules: breaking.map((r) => sentenceText(r.rule, p)) });
    };
    return () => {
      DELETE_GUARD.request = (_ref, run) => run();
    };
  }, []);
  if (!pending) return null;
  const n = pending.rules.length;
  return (
    <ConfirmDialog
      title={`Delete the ${NOUN[pending.ref.kind]} "${nameOf(pending.ref)}"?`}
      body={
        <>
          <p>
            {n === 1 ? 'This rule uses it' : `These ${n} rules use it`}. After deleting, {n === 1 ? 'it' : 'they'} will turn red and stop working until you fill in the missing part:
          </p>
          <ul style={{ paddingLeft: 18, maxHeight: 220, overflow: 'auto' }}>
            {pending.rules.map((s, i) => (
              <li key={i} style={{ marginBottom: 6 }}>
                {s}
              </li>
            ))}
          </ul>
        </>
      }
      confirm="Delete anyway"
      danger
      onCancel={() => setPending(null)}
      onConfirm={() => {
        const run = pending.run;
        setPending(null);
        run();
      }}
    />
  );
}
