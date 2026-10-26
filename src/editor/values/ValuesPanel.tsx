import type { Draft } from 'immer';
import { newId, uniqueName } from '@/model/ids';
import type { Project, Value } from '@/model/schema';
import type { PanelProps } from '../panels';
import { editorStore, useEditor } from '../store';
import { DELETE_GUARD } from '../delete-guard';
import { HelpTip } from '../help/HelpTip';

type Where = { kindId?: string };

function listOf(d: Draft<Project>, w: Where): Draft<Value>[] {
  return w.kindId ? d.kinds.find((k) => k.id === w.kindId)!.values : d.values;
}

function patchValue(w: Where, id: string, label: string, patch: (v: Draft<Value>) => void) {
  editorStore.getState().edit(label, (d) => {
    const v = listOf(d, w).find((x) => x.id === id);
    if (v) patch(v);
  });
}

const DEFAULT_START = { number: 0, text: '', bool: false } as const;

function ValueRow({ v, where, readOnly }: { v: Value; where: Where; readOnly: boolean }) {
  return (
    <div className="sticker" style={{ padding: 10 }} data-testid="value-row">
      <div className="row">
        <input
          key={v.name}
          className="field grow"
          defaultValue={v.name}
          maxLength={30}
          disabled={readOnly}
          aria-label="Value name"
          onBlur={(e) => {
            const name = e.currentTarget.value.trim().slice(0, 30);
            if (name && name !== v.name)
              patchValue(where, v.id, 'Rename value', (x) => {
                const p = editorStore.getState().project!;
                const others = (where.kindId ? p.kinds.find((k) => k.id === where.kindId)!.values : p.values).filter((o) => o.id !== v.id).map((o) => o.name);
                x.name = uniqueName(name, others, 30);
              });
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <select
          className="field"
          value={v.type}
          disabled={readOnly}
          aria-label="Kind of value"
          onChange={(e) =>
            patchValue(where, v.id, 'Change value type', (x) => {
              x.type = e.target.value as Value['type'];
              x.start = DEFAULT_START[x.type];
              delete x.min;
              delete x.max;
            })
          }
        >
          <option value="number">Number</option>
          <option value="text">Text</option>
          <option value="bool">True/false</option>
        </select>
        {!readOnly && (
          <button
            className="btn small ghost danger"
            aria-label={`Delete ${v.name}`}
            onClick={() =>
              DELETE_GUARD.request({ kind: 'value', id: v.id }, () =>
                editorStore.getState().edit(`Delete ${v.name}`, (d) => {
                  const list = listOf(d, where);
                  list.splice(list.findIndex((x) => x.id === v.id), 1);
                }),
              )
            }
          >
            ✕
          </button>
        )}
      </div>
      <div className="row" style={{ marginTop: 6, flexWrap: 'wrap' }}>
        <span className="muted">Starts at</span>
        {v.type === 'bool' ? (
          <select className="field" value={String(v.start)} disabled={readOnly} aria-label="Starting amount" onChange={(e) => patchValue(where, v.id, 'Change start', (x) => void (x.start = e.target.value === 'true'))}>
            <option value="false">false</option>
            <option value="true">true</option>
          </select>
        ) : (
          <input
            key={String(v.start)}
            className="field"
            style={{ width: v.type === 'number' ? 80 : 140 }}
            type={v.type === 'number' ? 'number' : 'text'}
            defaultValue={String(v.start)}
            disabled={readOnly}
            aria-label="Starting amount"
            onBlur={(e) => {
              const raw = e.currentTarget.value;
              const next = v.type === 'number' ? Number(raw) : raw;
              if (v.type === 'number' && !Number.isFinite(next)) return;
              if (next !== v.start) patchValue(where, v.id, 'Change start', (x) => void (x.start = next));
            }}
          />
        )}
        {v.type === 'number' &&
          (['min', 'max'] as const).map((k) => (
            <label key={k} className="row" style={{ gap: 4 }}>
              <span className="muted">{k === 'min' ? 'never below' : 'never above'}</span>
              <input
                key={String(v[k])}
                className="field"
                style={{ width: 64 }}
                type="number"
                placeholder="–"
                defaultValue={v[k] ?? ''}
                disabled={readOnly}
                aria-label={k === 'min' ? 'Lowest' : 'Highest'}
                onBlur={(e) => {
                  const raw = e.currentTarget.value.trim();
                  const n = raw === '' ? undefined : Number(raw);
                  if (n !== undefined && !Number.isFinite(n)) return;
                  if (n === v[k]) return;
                  const other = k === 'min' ? v.max : v.min;
                  if (n !== undefined && other !== undefined && (k === 'min' ? n > other : n < other)) return;
                  patchValue(where, v.id, `Change ${k}`, (x) => {
                    if (n === undefined) delete x[k];
                    else x[k] = n;
                  });
                }}
              />
            </label>
          ))}
      </div>
      {!where.kindId && (
        <label className="row" style={{ marginTop: 6 }}>
          <input type="checkbox" checked={v.remember} disabled={readOnly} onChange={(e) => patchValue(where, v.id, 'Change remember', (x) => void (x.remember = e.target.checked))} />
          Remember between plays <HelpTip text="In the exported game, this value keeps its amount after the player closes and reopens it." />
        </label>
      )}
    </div>
  );
}

/** Named values for the whole game or for each object of a Kind (FR-020). */
export function ValuesPanel({ project }: PanelProps) {
  const readOnly = useEditor((s) => s.readOnly);
  const add = (where: Where) =>
    editorStore.getState().edit('New value', (d) => {
      const list = listOf(d, where);
      list.push({ id: newId('v'), name: uniqueName(where.kindId ? 'Health' : 'Score', list.map((x) => x.name), 30), scope: where.kindId ? 'object' : 'game', type: 'number', start: 0, remember: false });
    });
  return (
    <div className="stack" data-tour="values-panel">
      <div className="section">
        <h4>
          Whole game <HelpTip text="One of each for the whole game, like Score or Lives. Kept when the scene changes." />
        </h4>
        {project.values.length === 0 && <div className="empty">No values yet. Values hold numbers like Score, Coins or Lives.</div>}
        {project.values.map((v) => (
          <ValueRow key={v.id} v={v} where={{}} readOnly={readOnly} />
        ))}
        {!readOnly && (
          <button className="btn small primary" onClick={() => add({})} data-testid="new-value">
            ＋ New value
          </button>
        )}
      </div>
      {project.kinds.map((k) => (
        <div className="section" key={k.id}>
          <h4>
            Each {k.name} has its own…
          </h4>
          {k.values.map((v) => (
            <ValueRow key={v.id} v={v} where={{ kindId: k.id }} readOnly={readOnly} />
          ))}
          {!readOnly && (
            <button className="btn small" onClick={() => add({ kindId: k.id })}>
              ＋ Value for each {k.name}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
