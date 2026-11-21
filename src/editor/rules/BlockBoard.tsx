import * as Dialog from '@radix-ui/react-dialog';
import { useLayoutEffect, useRef, useState } from 'react';
import type { RuleOwner, RuleState } from '@/model/references';
import type { Project, Rule } from '@/model/schema';
import { ACTIONS, CONDITIONS, TRIGGERS } from '@/model/rule-templates';
import { ruleSegments } from '@/model/sentence';
import type { Library } from '../assets/library';
import { editorStore } from '../store';
import * as R from '../store/rule-ops';
import { groupSegments, SegmentChip } from './SentenceCard';
import { TemplateMenu } from './TemplateMenu';
import '../features.css';

export interface BoardSection {
  owner: RuleOwner;
  label: string;
  rules: Rule[];
}

type Wire = { d: string; kind: 'check' | 'do' };

/**
 * The same rules as blocks joined by glowing wires: the "When" block on the
 * left, its checks in the middle and the actions on the right, numbered in
 * the order they run. Every blank is the same picker as in the sentence view.
 */
export function BlockBoard({ open, onOpenChange, sections, project, lib, readOnly, states }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sections: BoardSection[];
  project: Project;
  lib: Library;
  readOnly: boolean;
  states: Map<string, { state: RuleState }>;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-bg" />
        <Dialog.Content className="board" aria-describedby={undefined}>
          <header className="board-head">
            <Dialog.Title className="board-title">Block board</Dialog.Title>
            <span className="muted">Each row is one rule. Wires show what happens next: When → checks → actions, top to bottom.</span>
            <span className="grow" />
            <Dialog.Close asChild>
              <button className="btn" aria-label="Close block board">
                Done
              </button>
            </Dialog.Close>
          </header>
          <div className="board-body">
            {sections.map((sec) => (
              <section key={`${sec.owner.type}:${sec.owner.id ?? ''}`} className="board-section">
                <h4>{sec.label}</h4>
                {sec.rules.length === 0 && <div className="empty">No rules here yet.</div>}
                {sec.rules.map((rule) => (
                  <RuleGraph key={rule.id} rule={rule} owner={sec.owner} project={project} lib={lib} readOnly={readOnly} state={states.get(rule.id)?.state ?? 'ok'} />
                ))}
              </section>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function RuleGraph({ rule, owner, project, lib, readOnly, state }: { rule: Rule; owner: RuleOwner; project: Project; lib: Library; readOnly: boolean; state: RuleState }) {
  const { edit } = editorStore.getState();
  const wrap = useRef<HTMLDivElement>(null);
  const [wires, setWires] = useState<Wire[]>([]);
  const groups = groupSegments(ruleSegments(rule, project, { asset: lib.name }));
  const trig = groups.filter((g) => g.part?.kind === 'trigger').flatMap((g) => g.segs);
  const conds = groups.filter((g) => g.part?.kind === 'condition');
  const acts = groups.filter((g) => g.part?.kind === 'action');
  const chip = (segs: typeof trig, skipFirst = false) =>
    segs.slice(skipFirst ? 1 : 0).map((s, i) => <SegmentChip key={i} seg={s} project={project} lib={lib} rule={rule} owner={owner} readOnly={readOnly} />);

  // Wires are measured from the laid-out blocks, so they follow wrapping text and resizes.
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      const base = el.getBoundingClientRect();
      const box = (q: string) => [...el.querySelectorAll<HTMLElement>(q)].map((n) => n.getBoundingClientRect());
      const right = (r: DOMRect) => ({ x: r.right - base.left, y: r.top + r.height / 2 - base.top });
      const left = (r: DOMRect) => ({ x: r.left - base.left, y: r.top + r.height / 2 - base.top });
      const curve = (a: { x: number; y: number }, b: { x: number; y: number }) => {
        const k = Math.max(24, (b.x - a.x) / 2);
        return `M${a.x},${a.y} C${a.x + k},${a.y} ${b.x - k},${b.y} ${b.x},${b.y}`;
      };
      const [t] = box('[data-node="when"]');
      const cs = box('[data-node="check"]');
      const as = box('[data-node="do"]');
      if (!t) return;
      const out: Wire[] = [];
      for (const c of cs) out.push({ d: curve(right(t), left(c)), kind: 'check' });
      const from = cs.length ? cs.map(right) : [right(t)];
      // Checks merge at one point before fanning out to the actions.
      const mx = cs.length ? Math.max(...from.map((p) => p.x)) + 18 : 0;
      const my = cs.length ? from.reduce((n, p) => n + p.y, 0) / from.length : 0;
      if (cs.length) for (const p of from) out.push({ d: curve(p, { x: mx, y: my }), kind: 'check' });
      const start = cs.length ? { x: mx, y: my } : from[0]!;
      for (const a of as) out.push({ d: curve(start, left(a)), kind: 'do' });
      setWires(out);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rule, project]);

  return (
    <div ref={wrap} className={`graph ${rule.enabled ? '' : 'off'} ${state !== 'ok' ? state : ''}`} data-testid="rule-graph">
      <svg className="wires" aria-hidden>
        <defs>
          <filter id="wire-glow" x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="3.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {wires.map((w, i) => (
          <g key={i} className={`wire ${w.kind}`}>
            <path d={w.d} className="wire-glow" filter="url(#wire-glow)" />
            <path d={w.d} className="wire-flow" />
          </g>
        ))}
      </svg>
      <div className="col">
        <div className="node when" data-node="when">
          <div className="node-head">
            {readOnly ? (
              <span>WHEN</span>
            ) : (
              <TemplateMenu
                title="Change what starts this rule"
                templates={TRIGGERS}
                onPick={(k) => edit('Change trigger', (d) => R.setRuleAt(d, rule.id, ['trigger'], TRIGGERS[k as keyof typeof TRIGGERS].make()))}
                trigger={<button className="node-tag">WHEN ▾</button>}
              />
            )}
            <span className="grow" />
            <label className="node-toggle" title="Turned-off rules don't run">
              <input type="checkbox" checked={rule.enabled} disabled={readOnly} onChange={() => edit(rule.enabled ? 'Turn rule off' : 'Turn rule on', (d) => R.setRuleAt(d, rule.id, ['enabled'], !rule.enabled))} aria-label="Rule on" />
            </label>
          </div>
          <div className="node-body sentence">{chip(trig, true)}</div>
        </div>
      </div>
      {(conds.length > 0 || !readOnly) && (
        <div className="col">
          {conds.map((g, i) => {
            const index = g.part && 'index' in g.part ? g.part.index : i;
            const c = rule.conditions.items[index]!;
            return (
              <div key={i} className={`node check ${c.not ? 'negated' : ''}`} data-node="check">
                <div className="node-head">
                  <span className="node-tag">{i === 0 ? 'ONLY IF' : rule.conditions.join === 'all' ? 'AND' : 'OR'}</span>
                  <span className="grow" />
                  {!readOnly && (
                    <>
                      <button className="btn small ghost" title="Flip: run when this is NOT true" aria-label="Flip this check" onClick={() => edit('Flip check', (d) => R.setRuleAt(d, rule.id, ['conditions', 'items', index, 'not'], c.not ? undefined : true))}>
                        ¬
                      </button>
                      <button className="btn small ghost" aria-label="Remove this check" onClick={() => edit('Remove condition', (d) => R.removePart(d, rule.id, { kind: 'condition', index }))}>
                        ✕
                      </button>
                    </>
                  )}
                </div>
                <div className="node-body sentence">{chip(g.segs)}</div>
              </div>
            );
          })}
          {!readOnly && (
            <div className="row" style={{ gap: 4 }}>
              <TemplateMenu title="Only if…" templates={CONDITIONS} onPick={(k) => edit('Add check', (d) => R.addCondition(d, rule.id, CONDITIONS[k as keyof typeof CONDITIONS].make()))} trigger={<button className="node-add">＋ check</button>} />
              {conds.length > 1 && (
                <button className="node-add" onClick={() => edit('Change and/or', (d) => R.setRuleAt(d, rule.id, ['conditions', 'join'], rule.conditions.join === 'all' ? 'any' : 'all'))}>
                  {rule.conditions.join === 'all' ? 'all must be true' : 'any can be true'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
      <div className="col">
        {acts.map((g, i) => (
          <div key={i} className="node do" data-node="do">
            <div className="node-head">
              <span className="node-tag">DO {i + 1}</span>
              <span className="grow" />
              {!readOnly && (
                <>
                  <button className="btn small ghost" disabled={i === 0} aria-label="Run earlier" onClick={() => edit('Move action', (d) => R.moveAction(d, rule.id, i, -1))}>
                    ↑
                  </button>
                  <button className="btn small ghost" disabled={i === acts.length - 1} aria-label="Run later" onClick={() => edit('Move action', (d) => R.moveAction(d, rule.id, i, 1))}>
                    ↓
                  </button>
                  {acts.length > 1 && (
                    <button className="btn small ghost" aria-label="Remove this action" onClick={() => edit('Remove action', (d) => R.removePart(d, rule.id, { kind: 'action', index: i }))}>
                      ✕
                    </button>
                  )}
                </>
              )}
            </div>
            <div className="node-body sentence">{chip(g.segs)}</div>
          </div>
        ))}
        {!readOnly && <TemplateMenu title="And then…" templates={ACTIONS} onPick={(k) => edit('Add action', (d) => R.addAction(d, rule.id, ACTIONS[k as keyof typeof ACTIONS].make()))} trigger={<button className="node-add">＋ action</button>} />}
      </div>
    </div>
  );
}
