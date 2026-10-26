import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useEffect, useRef, type ReactNode } from 'react';
import type { RuleOwner, RuleState } from '@/model/references';
import type { Project, Rule } from '@/model/schema';
import { ACTIONS, CONDITIONS, TRIGGERS } from '@/model/rule-templates';
import { ruleSegments, type Segment } from '@/model/sentence';
import type { Library } from '../assets/library';
import { editorStore } from '../store';
import * as R from '../store/rule-ops';
import { BlankPicker } from './BlankPicker';
import { HelpTip } from '../help/HelpTip';

export interface SentenceCardProps {
  project: Project;
  lib: Library;
  rule: Rule;
  owner: RuleOwner;
  state: RuleState;
  runaway: boolean;
  flash: boolean;
  readOnly: boolean;
  first: boolean;
  last: boolean;
}

function Menu({ trigger, items, onPick }: { trigger: ReactNode; items: [string, { label: string; help: string }][]; onPick: (key: string) => void }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="pop" sideOffset={6} align="start">
          {items.map(([k, t]) => (
            <DropdownMenu.Item key={k} className="opt" onSelect={() => onPick(k)}>
              <span>
                {t.label}
                <small>{t.help}</small>
              </span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** One rule shown as an English sentence whose blanks are pickers (FR-015). */
export function SentenceCard({ project, lib, rule, owner, state, runaway, flash, readOnly, first, last }: SentenceCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { edit } = editorStore.getState();
  useEffect(() => {
    if (flash) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [flash]);
  const segs = ruleSegments(rule, project, { asset: lib.name });

  // Group consecutive segments of the same condition/action so each part gets its own remove button.
  const groups: { part: Segment['part']; segs: Segment[] }[] = [];
  for (const s of segs) {
    const g = groups[groups.length - 1];
    const same = g && g.part && s.part && g.part.kind === s.part.kind && ('index' in g.part ? 'index' in s.part && g.part.index === s.part.index : true);
    if (same) g.segs.push(s);
    else groups.push({ part: s.part, segs: [s] });
  }

  const renderSeg = (s: Segment, i: number) =>
    'blank' in s ? (
      <BlankPicker
        key={i}
        project={project}
        lib={lib}
        rule={rule}
        owner={owner}
        path={s.path}
        kind={s.blank}
        disabled={readOnly}
        className={`blank ${s.status !== 'ok' ? s.status : ''}`}
        onPick={(v, at) => edit('Fill in rule', (d) => R.setRuleAt(d, rule.id, at ?? s.path, v))}
      >
        {s.text}
      </BlankPicker>
    ) : (
      <span key={i} className="w">
        {s.text}
      </span>
    );

  return (
    <div ref={ref} className={`rule ${rule.enabled ? '' : 'off'} ${state !== 'ok' ? state : ''} ${flash ? 'flash' : ''}`} data-testid="rule" data-rule-id={rule.id}>
      <div className="sentence">
        {groups.map((g, gi) => {
          const body = g.segs.map((s, i) => renderSeg(s, gi * 1000 + i));
          if (!g.part || g.part.kind === 'trigger') {
            if (g.part?.kind === 'trigger' && !readOnly)
              return (
                <span key={gi}>
                  <Menu
                    trigger={
                      <button className="blank" title="Change what starts this rule" style={{ borderBottomColor: 'var(--clay)' }}>
                        {String(g.segs[0]!.text)}
                      </button>
                    }
                    items={Object.entries(TRIGGERS)}
                    onPick={(k) => edit('Change trigger', (d) => R.setRuleAt(d, rule.id, ['trigger'], TRIGGERS[k as keyof typeof TRIGGERS].make()))}
                  />
                  {g.segs.slice(1).map((s, i) => renderSeg(s, gi * 1000 + i + 1))}
                </span>
              );
            return <span key={gi}>{body}</span>;
          }
          const part = g.part;
          return (
            <span key={gi} className="part" style={{ whiteSpace: 'normal' }}>
              {body}
              {!readOnly && (part.kind === 'condition' || rule.actions.length > 1) && (
                <button className="btn small ghost" style={{ padding: '0 4px', color: 'var(--dim)' }} onClick={() => edit(`Remove ${part.kind}`, (d) => R.removePart(d, rule.id, part))} aria-label={`Remove this ${part.kind}`} title={`Remove this ${part.kind === 'condition' ? 'check' : 'action'}`}>
                  ✕
                </button>
              )}
            </span>
          );
        })}
      </div>
      {runaway && (
        <div className="state broken" style={{ textTransform: 'none', letterSpacing: 0 }}>
          ⚠ Last Play, this rule kept setting itself off and was stopped.
        </div>
      )}
      <div className="meta">
        {state !== 'ok' && (
          <span className={`state ${state}`}>
            {state === 'incomplete' ? 'Fill in the yellow blanks' : 'Something it uses was deleted'}
          </span>
        )}
        <span className="grow" />
        {!readOnly && (
          <>
            <Menu
              trigger={<button className="add-part">＋ only if</button>}
              items={Object.entries(CONDITIONS)}
              onPick={(k) => edit('Add check', (d) => R.addCondition(d, rule.id, CONDITIONS[k as keyof typeof CONDITIONS].make()))}
            />
            {rule.conditions.items.length > 1 && (
              <button className="add-part" onClick={() => edit('Change and/or', (d) => R.setRuleAt(d, rule.id, ['conditions', 'join'], rule.conditions.join === 'all' ? 'any' : 'all'))} title="Switch between needing all checks or just one">
                {rule.conditions.join === 'all' ? 'all must be true' : 'any can be true'}
              </button>
            )}
            <Menu
              trigger={<button className="add-part" data-testid="add-action">＋ and then</button>}
              items={Object.entries(ACTIONS)}
              onPick={(k) => edit('Add action', (d) => R.addAction(d, rule.id, ACTIONS[k as keyof typeof ACTIONS].make()))}
            />
            <span className="mini">
              <label className="row" style={{ gap: 3, fontSize: 12 }} title="Turned-off rules don't run">
                <input type="checkbox" checked={rule.enabled} onChange={() => edit(rule.enabled ? 'Turn rule off' : 'Turn rule on', (d) => R.setRuleAt(d, rule.id, ['enabled'], !rule.enabled))} aria-label="Rule on" />
                on
              </label>
              <button className="btn small ghost" disabled={first} onClick={() => edit('Move rule up', (d) => R.moveRule(d, rule.id, -1))} aria-label="Move rule up" title="Earlier rules run first when things happen at the same moment">
                ↑
              </button>
              <button className="btn small ghost" disabled={last} onClick={() => edit('Move rule down', (d) => R.moveRule(d, rule.id, 1))} aria-label="Move rule down">
                ↓
              </button>
              <button className="btn small ghost" onClick={() => edit('Duplicate rule', (d) => void R.duplicateRule(d, rule.id))} aria-label="Duplicate rule" title="Duplicate">
                ⧉
              </button>
              <button className="btn small ghost danger" onClick={() => edit('Delete rule', (d) => R.deleteRule(d, rule.id))} aria-label="Delete rule" title="Delete">
                ✕
              </button>
            </span>
          </>
        )}
        {readOnly && <HelpTip text="Read-only in this tab." />}
      </div>
    </div>
  );
}
