import { current, type Draft } from 'immer';
import { newId } from '@/model/ids';
import type { RuleOwner } from '@/model/references';
import type { Action, Condition, Project, Rule, Trigger } from '@/model/schema';

type P = Draft<Project>;

/** The rule list owned by game, a scene or a Kind. */
export function ownerList(p: P, owner: RuleOwner): Draft<Rule>[] {
  if (owner.type === 'game') return p.rules;
  if (owner.type === 'scene') {
    const s = p.scenes.find((x) => x.id === owner.id);
    if (!s) throw new Error('No such scene');
    return s.rules;
  }
  const k = p.kinds.find((x) => x.id === owner.id);
  if (!k) throw new Error('No such Kind');
  return k.rules;
}

export function findRule(p: P, ruleId: string): { list: Draft<Rule>[]; index: number; owner: RuleOwner } | null {
  const owners: RuleOwner[] = [{ type: 'game' }, ...p.scenes.map((s) => ({ type: 'scene' as const, id: s.id })), ...p.kinds.map((k) => ({ type: 'kind' as const, id: k.id }))];
  for (const owner of owners) {
    const list = ownerList(p, owner);
    const index = list.findIndex((r) => r.id === ruleId);
    if (index >= 0) return { list, index, owner };
  }
  return null;
}

export function addRule(p: P, owner: RuleOwner, trigger: Trigger, action: Action): string {
  const id = newId('r');
  ownerList(p, owner).push({ id, enabled: true, trigger, conditions: { join: 'all', items: [] }, actions: [action] });
  return id;
}

/** Sets the value at a JSON path inside a rule (a blank chosen in the sentence). */
export function setRuleAt(p: P, ruleId: string, path: readonly (string | number)[], value: unknown) {
  const f = findRule(p, ruleId);
  if (!f || !path.length) return;
  let node: Record<string | number, unknown> = f.list[f.index] as unknown as Record<string | number, unknown>;
  for (const k of path.slice(0, -1)) node = node[k] as Record<string | number, unknown>;
  node[path[path.length - 1]!] = value;
}

export function getRuleAt(rule: Rule, path: readonly (string | number)[]): unknown {
  let node: unknown = rule;
  for (const k of path) node = node && typeof node === 'object' ? (node as Record<string | number, unknown>)[k] : undefined;
  return node;
}

export function duplicateRule(p: P, ruleId: string): string | null {
  const f = findRule(p, ruleId);
  if (!f) return null;
  const copy = structuredClone(current(f.list[f.index]!));
  copy.id = newId('r');
  f.list.splice(f.index + 1, 0, copy);
  return copy.id;
}

export function deleteRule(p: P, ruleId: string) {
  const f = findRule(p, ruleId);
  if (f) f.list.splice(f.index, 1);
}

/** Moves a rule up/down within its owner's list (same-moment order, FR-021). */
export function moveRule(p: P, ruleId: string, by: -1 | 1) {
  const f = findRule(p, ruleId);
  if (!f) return;
  const to = f.index + by;
  if (to < 0 || to >= f.list.length) return;
  const [r] = f.list.splice(f.index, 1);
  f.list.splice(to, 0, r!);
}

export function setRuleOwner(p: P, ruleId: string, owner: RuleOwner) {
  const f = findRule(p, ruleId);
  if (!f) return;
  const [r] = f.list.splice(f.index, 1);
  ownerList(p, owner).push(r!);
}

export function addCondition(p: P, ruleId: string, c: Condition) {
  const f = findRule(p, ruleId);
  const r = f?.list[f.index];
  if (r && r.conditions.items.length < 8) r.conditions.items.push(c);
}

export function addAction(p: P, ruleId: string, a: Action) {
  const f = findRule(p, ruleId);
  const r = f?.list[f.index];
  if (r && r.actions.length < 20) r.actions.push(a);
}

/** Removes a condition or action. The last action can't be removed (a rule needs one). */
export function removePart(p: P, ruleId: string, part: { kind: 'condition' | 'action'; index: number }) {
  const f = findRule(p, ruleId);
  const r = f?.list[f.index];
  if (!r) return;
  if (part.kind === 'condition') r.conditions.items.splice(part.index, 1);
  else if (r.actions.length > 1) r.actions.splice(part.index, 1);
}

export function moveAction(p: P, ruleId: string, index: number, by: -1 | 1) {
  const f = findRule(p, ruleId);
  const r = f?.list[f.index];
  if (!r) return;
  const to = index + by;
  if (to < 0 || to >= r.actions.length) return;
  const [a] = r.actions.splice(index, 1);
  r.actions.splice(to, 0, a!);
}
