import { useMemo, useState, type ComponentType } from 'react';
import { allRules, ruleStates, type RuleOwner } from '@/model/references';
import { ACTIONS, TRIGGERS, type Template } from '@/model/rule-templates';
import type { ActionType, TriggerType } from '@/model/schema';
import type { PanelProps } from '../panels';
import { editorStore, useEditor } from '../store';
import { setUI, useUI } from '../ui-state';
import * as R from '../store/rule-ops';
import { SentenceCard } from './SentenceCard';
import { TemplateMenu } from './TemplateMenu';
import { BlockBoard } from './BlockBoard';

/** Extra buttons next to "New rule" (the rule preset menu). Receives the owner new rules go to. */
export const RULES_TOOLBAR: ComponentType<PanelProps & { owner: RuleOwner }>[] = [];

const ownerKey = (o: RuleOwner) => `${o.type}:${o.id ?? ''}`;

function rulesOf(p: PanelProps['project'], o: RuleOwner) {
  if (o.type === 'game') return p.rules;
  if (o.type === 'scene') return p.scenes.find((s) => s.id === o.id)?.rules ?? [];
  return p.kinds.find((k) => k.id === o.id)?.rules ?? [];
}

/** Sentence rules: add, fill in, reorder, turn off, duplicate, delete, choose who owns them (FR-015, FR-021). */
export function RulesPanel({ project, lib }: PanelProps) {
  const sceneId = useEditor((s) => s.sceneId) ?? project.startSceneId;
  const readOnly = useEditor((s) => s.readOnly);
  const selection = useEditor((s) => s.selection);
  const { focusRuleId, lastRun } = useUI();
  const states = useMemo(() => ruleStates(project), [project]);
  const runaway = new Set(lastRun.flatMap((d) => (d.type === 'runaway' ? [d.ruleId] : [])));
  const selectedKind = (() => {
    const s = selection[0];
    if (!s) return undefined;
    if (s.kind === 'kind') return s.id;
    if (s.kind === 'object') return project.scenes.flatMap((x) => x.objects).find((o) => o.id === s.id)?.kindId;
    return undefined;
  })();
  const [filter, setFilter] = useState<string>('here');
  const [board, setBoard] = useState(false);
  const scene = project.scenes.find((s) => s.id === sceneId)!;

  const owners: { owner: RuleOwner; label: string }[] = [
    { owner: { type: 'game' }, label: 'Whole game' },
    ...project.scenes.map((s) => ({ owner: { type: 'scene', id: s.id } as RuleOwner, label: `Scene: ${s.name}` })),
    ...project.kinds.map((k) => ({ owner: { type: 'kind', id: k.id } as RuleOwner, label: `Every ${k.name}` })),
  ];
  const visible = owners.filter(({ owner }) => {
    if (filter === 'all') return true;
    if (filter === 'here') return owner.type === 'game' || (owner.type === 'scene' && owner.id === sceneId) || (owner.type === 'kind' && (owner.id === selectedKind || project.kinds.find((k) => k.id === owner.id)!.rules.length > 0));
    return ownerKey(owner) === filter;
  });
  const newOwner: RuleOwner = filter.startsWith('kind:') ? { type: 'kind', id: filter.slice(5) } : filter === 'game:' ? { type: 'game' } : { type: 'scene', id: sceneId };
  const total = allRules(project).length;

  return (
    <div className="stack" data-tour="rules-panel">
      <div className="row">
        <select className="field grow" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Which rules to show">
          <option value="here">Rules for {scene.name}</option>
          <option value="all">All rules ({total})</option>
          {owners.map(({ owner, label }) => (
            <option key={ownerKey(owner)} value={ownerKey(owner)}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {!readOnly && (
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <NewRuleMenu
            onCreate={(t, a) => {
              let id = '';
              editorStore.getState().edit('New rule', (d) => void (id = R.addRule(d, newOwner, TRIGGERS[t].make(), ACTIONS[a].make())));
              setUI({ focusRuleId: id });
            }}
          />
          {RULES_TOOLBAR.map((T, i) => (
            <T key={i} project={project} lib={lib} owner={newOwner} />
          ))}
          <button className="btn board-btn" onClick={() => setBoard(true)} title="See these rules as blocks joined by glowing wires" data-testid="open-block-board">
            ⧉ Block board
          </button>
        </div>
      )}
      <BlockBoard
        open={board}
        onOpenChange={setBoard}
        project={project}
        lib={lib}
        readOnly={readOnly}
        states={states}
        sections={visible.map(({ owner, label }) => ({ owner, label, rules: rulesOf(project, owner) })).filter((x) => x.rules.length > 0)}
      />
      {visible.map(({ owner, label }) => {
        const list = rulesOf(project, owner);
        if (!list.length && !(owner.type === 'scene' && owner.id === sceneId) && ownerKey(owner) !== filter) return null;
        return (
          <div key={ownerKey(owner)} className="section">
            <h4>
              {label}
              <span className="dim" style={{ letterSpacing: 0, textTransform: 'none' }}>
                {list.length} rule{list.length === 1 ? '' : 's'}
              </span>
            </h4>
            {list.length === 0 && <div className="empty">No rules here yet. Press "New rule", or use Show-me while playing.</div>}
            {list.map((rule, i) => (
              <div key={rule.id}>
                <SentenceCard
                  project={project}
                  lib={lib}
                  rule={rule}
                  owner={owner}
                  state={states.get(rule.id)?.state ?? 'ok'}
                  runaway={runaway.has(rule.id)}
                  flash={focusRuleId === rule.id}
                  readOnly={readOnly}
                  first={i === 0}
                  last={i === list.length - 1}
                />
                {!readOnly && filter !== 'here' && (
                  <select
                    className="field"
                    style={{ fontSize: 12, marginTop: -4, marginBottom: 8 }}
                    value={ownerKey(owner)}
                    aria-label="Rule belongs to"
                    onChange={(e) => {
                      const target = owners.find((o) => ownerKey(o.owner) === e.target.value)?.owner;
                      if (target) editorStore.getState().edit('Move rule', (d) => R.setRuleOwner(d, rule.id, target));
                    }}
                  >
                    {owners.map((o) => (
                      <option key={ownerKey(o.owner)} value={ownerKey(o.owner)}>
                        Belongs to: {o.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** Two-step menu: what starts the rule, then what it does first. */
function NewRuleMenu({ onCreate }: { onCreate: (t: TriggerType, a: ActionType) => void }) {
  const [trigger, setTrigger] = useState<TriggerType | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <TemplateMenu<unknown>
      key={trigger ?? 'when'}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setTrigger(null);
      }}
      stayOpen={trigger === null}
      title={trigger === null ? '1. When…' : `2. When ${TRIGGERS[trigger].label}, then…`}
      templates={(trigger === null ? TRIGGERS : ACTIONS) as Record<string, Template<unknown>>}
      onPick={(k) => {
        if (trigger === null) setTrigger(k as TriggerType);
        else {
          onCreate(trigger, k as ActionType);
          setTrigger(null);
        }
      }}
      trigger={
        <button className="btn primary" data-testid="new-rule" data-tour="new-rule">
          ＋ New rule
        </button>
      }
    />
  );
}
