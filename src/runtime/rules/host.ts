import type { Num, Operand, Target, ValueRef } from '../../model/schema';
import type { Camera } from '../camera';
import type { UILayer } from '../ui-layer';
import type { Values, Scalar } from '../values';
import type { World } from '../world';
import type { Diagnostic, Instance, InputState } from '../types';

/** What the rule engine needs from the running game. */
export interface RuleHost {
  world: World;
  values: Values;
  camera: Camera;
  ui: UILayer;
  input: InputState;
  rng: () => number;
  time: number;
  playSound(assetId: string | null): void;
  showText(text: string, seconds: number): void;
  /** Scene change happens at the end of the step; remaining actions stop. */
  requestScene(sceneId: string | null): void;
  readonly sceneChanging: boolean;
  /** Notes a timer firing for the Show-me event list. */
  recordTimer(ruleId: string, seconds: number): void;
  diagnostic(d: Diagnostic): void;
}

/** Instances a trigger bound: "this object", "that [Kind]", and every object the event was about. */
export interface Binding {
  self?: string;
  that: Map<string, string>;
  /** Instance ids the trigger matched (a Kind-owned rule binds "this object" to the one of its Kind). */
  subjects?: string[];
}

export const emptyBinding = (): Binding => ({ that: new Map() });

/** Instances a target refers to right now (actions/conditions side). */
export function resolveTarget(t: Target, b: Binding, host: RuleHost): Instance[] {
  const w = host.world;
  switch (t.t) {
    case 'object': {
      const i = w.get(t.id);
      return i ? [i] : [];
    }
    case 'any':
      return w.byKind(t.kindId);
    case 'that': {
      const id = b.that.get(t.kindId);
      const i = id ? w.get(id) : undefined;
      return i ? [i] : [];
    }
    case 'self': {
      const i = b.self ? w.get(b.self) : undefined;
      return i ? [i] : [];
    }
    case 'ui':
    case 'unset':
      return [];
  }
}

/** The instance whose per-object value a ValueRef reads (defaults to "this object", then the only bound one). */
export function valueOwner(ref: ValueRef, b: Binding, host: RuleHost): Instance | undefined {
  if (!host.values.isObjectValue(ref.valueId)) return undefined;
  if (ref.of) return resolveTarget(ref.of, b, host)[0];
  if (b.self) return host.world.get(b.self);
  const kindId = [...host.world.kinds.values()].find((k) => k.values.some((v) => v.id === ref.valueId))?.id;
  const bound = kindId ? b.that.get(kindId) : undefined;
  return bound ? host.world.get(bound) : undefined;
}

export function readValue(ref: ValueRef, b: Binding, host: RuleHost): Scalar | undefined {
  return host.values.get(ref.valueId, valueOwner(ref, b, host));
}

/** A number blank's current amount, or null if unset/unreadable. */
export function evalNum(n: Num, b: Binding, host: RuleHost): number | null {
  if ('lit' in n) return n.lit;
  if ('ref' in n) {
    const v = readValue(n.ref, b, host);
    const x = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(x) ? x : null;
  }
  return null;
}

export function evalOperand(o: Operand, b: Binding, host: RuleHost): Scalar | null {
  if ('lit' in o) return o.lit;
  if ('ref' in o) return readValue(o.ref, b, host) ?? null;
  return null;
}
