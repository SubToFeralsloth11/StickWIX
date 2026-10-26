import type { Project, Rule, Target, Trigger } from './schema';

export type RuleState = 'ok' | 'incomplete' | 'broken';
export type RefKind = 'kind' | 'object' | 'ui' | 'value' | 'scene' | 'asset';
export type Ref = { kind: RefKind; id: string };

export interface RuleOwner {
  type: 'game' | 'scene' | 'kind';
  /** Scene id or Kind id (absent for game rules). */
  id?: string;
}

export interface Blank {
  /** JSON path inside the rule, e.g. ["actions", 0, "target"]. */
  path: (string | number)[];
  problem: 'unset' | 'missing';
  ref?: Ref;
}

export interface LocatedRule {
  rule: Rule;
  owner: RuleOwner;
  /** Index in the owner's rule list. */
  index: number;
}

/** Every rule in the project with its owner, in dispatch order (game → scenes → kinds). */
export function allRules(p: Project): LocatedRule[] {
  const out: LocatedRule[] = [];
  p.rules.forEach((rule, index) => out.push({ rule, owner: { type: 'game' }, index }));
  for (const s of p.scenes) s.rules.forEach((rule, index) => out.push({ rule, owner: { type: 'scene', id: s.id }, index }));
  for (const k of p.kinds) k.rules.forEach((rule, index) => out.push({ rule, owner: { type: 'kind', id: k.id }, index }));
  return out;
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** Walks a rule and yields every reference and unset blank with its path. */
function* walk(node: unknown, path: (string | number)[]): Generator<{ path: (string | number)[]; ref?: Ref; unset?: true }> {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) yield* walk(node[i], [...path, i]);
    return;
  }
  if (!isObj(node)) return;
  if (node.unset === true || node.t === 'unset') {
    yield { path, unset: true };
    return;
  }
  if (node.t === 'object' && typeof node.id === 'string') yield { path, ref: { kind: 'object', id: node.id } };
  if (node.t === 'ui' && typeof node.id === 'string') yield { path, ref: { kind: 'ui', id: node.id } };
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === 'string') {
      if (k === 'kindId') yield { path: [...path, k], ref: { kind: 'kind', id: v } };
      else if (k === 'valueId') yield { path: [...path, k], ref: { kind: 'value', id: v } };
      else if (k === 'sceneId') yield { path: [...path, k], ref: { kind: 'scene', id: v } };
      else if (k === 'assetId') yield { path: [...path, k], ref: { kind: 'asset', id: v } };
    } else if (k !== 'note') yield* walk(v, [...path, k]);
  }
}

/** Ids that exist in the project, per reference kind. */
export function existingIds(p: Project): Record<RefKind, Set<string>> {
  return {
    kind: new Set(p.kinds.map((k) => k.id)),
    object: new Set(p.scenes.flatMap((s) => s.objects.map((o) => o.id))),
    ui: new Set(p.scenes.flatMap((s) => s.ui.map((u) => u.id))),
    value: new Set([...p.values.map((v) => v.id), ...p.kinds.flatMap((k) => k.values.map((v) => v.id))]),
    scene: new Set(p.scenes.map((s) => s.id)),
    asset: new Set(p.assets.map((a) => a.id)),
  };
}

/** Kind ids the trigger binds, so actions may say "that [Kind]". */
export function boundKinds(trigger: Trigger): Set<string> {
  const out = new Set<string>();
  const add = (t: Target) => {
    if (t.t === 'any' || t.t === 'that') out.add(t.kindId);
  };
  if ('target' in trigger) add(trigger.target);
  if (trigger.type === 'touches') {
    add(trigger.a);
    add(trigger.b);
  }
  return out;
}

/** Finds unset blanks and references to deleted things in a rule (FR-023). */
export function ruleBlanks(rule: Rule, ids: Record<RefKind, Set<string>>, objectKinds?: Map<string, string>): Blank[] {
  const out: Blank[] = [];
  for (const item of walk({ trigger: rule.trigger, conditions: rule.conditions, actions: rule.actions }, [])) {
    if (item.unset) out.push({ path: item.path, problem: 'unset' });
    else if (item.ref) {
      const { kind, id } = item.ref;
      const builtin = kind === 'asset' && id.startsWith('builtin:');
      if (!builtin && !ids[kind].has(id)) out.push({ path: item.path, problem: 'missing', ref: item.ref });
    }
  }
  // "that [Kind]" outside the trigger needs the trigger to bind that Kind.
  const bound = boundKinds(rule.trigger);
  if (rule.trigger.type === 'touches' && objectKinds) {
    for (const t of [rule.trigger.a, rule.trigger.b]) if (t.t === 'object') {
      const k = objectKinds.get(t.id);
      if (k) bound.add(k);
    }
  }
  const check = (node: unknown, path: (string | number)[]) => {
    for (const item of walkThat(node, path))
      if (!bound.has(item.kindId)) out.push({ path: item.path, problem: 'missing', ref: { kind: 'kind', id: item.kindId } });
  };
  check(rule.conditions, ['conditions']);
  check(rule.actions, ['actions']);
  return out;
}

function* walkThat(node: unknown, path: (string | number)[]): Generator<{ path: (string | number)[]; kindId: string }> {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) yield* walkThat(node[i], [...path, i]);
    return;
  }
  if (!isObj(node)) return;
  if (node.t === 'that' && typeof node.kindId === 'string') yield { path, kindId: node.kindId };
  for (const [k, v] of Object.entries(node)) if (typeof v === 'object') yield* walkThat(v, [...path, k]);
}

export function ruleState(blanks: Blank[]): RuleState {
  if (blanks.some((b) => b.problem === 'missing')) return 'broken';
  return blanks.length ? 'incomplete' : 'ok';
}

/** State of every rule, keyed by rule id. */
export function ruleStates(p: Project): Map<string, { state: RuleState; blanks: Blank[] }> {
  const ids = existingIds(p);
  const objectKinds = new Map(p.scenes.flatMap((s) => s.objects.map((o) => [o.id, o.kindId] as const)));
  const out = new Map<string, { state: RuleState; blanks: Blank[] }>();
  for (const { rule } of allRules(p)) {
    const blanks = ruleBlanks(rule, ids, objectKinds);
    out.set(rule.id, { state: ruleState(blanks), blanks });
  }
  return out;
}

/** Rules that would break if `ref` were deleted (shown in the delete warning). */
export function rulesReferencing(p: Project, ref: Ref): LocatedRule[] {
  return allRules(p).filter(({ rule }) => {
    for (const item of walk({ trigger: rule.trigger, conditions: rule.conditions, actions: rule.actions }, []))
      if (item.ref && item.ref.kind === ref.kind && item.ref.id === ref.id) return true;
    return false;
  });
}
