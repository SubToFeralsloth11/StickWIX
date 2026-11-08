import type { Target, Trigger, TriggerType } from '../../model/schema';
import type { Instance, RuntimeEvent } from '../types';
import { evalNum, type Binding, type RuleHost } from './host';

/** Which trigger types an event can satisfy. Timers are driven by the scheduler instead. */
export function triggerTypesFor(e: RuntimeEvent): TriggerType[] {
  switch (e.type) {
    case 'sceneStart':
      return ['sceneStart'];
    case 'key':
      return ['key'];
    case 'clicked':
      return ['clicked'];
    case 'touch':
      return ['touches'];
    case 'valueChanged':
      return ['valueChanges', 'valueReaches'];
    case 'created':
      return ['created'];
    case 'destroyed':
      return ['destroyed'];
    case 'leavesScene':
      return ['leavesScene'];
    case 'sticker':
      return ['sticker'];
    case 'timer':
      return [];
  }
}

/**
 * Does trigger-side target `t` accept instance `inst`? Records bindings:
 * "any Coin" binds "that Coin"; "this object" binds self for Kind rules;
 * every accepted instance is noted as a subject of the trigger.
 */
function accepts(t: Target, inst: Instance, ownerKind: string | undefined, b: Binding): boolean {
  let ok: boolean;
  switch (t.t) {
    case 'object':
      ok = inst.id === t.id;
      break;
    case 'any':
    case 'that':
      ok = inst.kindId === t.kindId;
      if (ok) b.that.set(t.kindId, inst.id);
      break;
    case 'self':
      ok = !!ownerKind && inst.kindId === ownerKind;
      if (ok) b.self = inst.id;
      break;
    case 'ui':
    case 'unset':
      ok = false;
  }
  if (ok) (b.subjects ??= []).push(inst.id);
  return ok;
}

function fresh(): Binding {
  return { that: new Map() };
}

/** Matches an event against a trigger; returns the binding or null. */
export function matchTrigger(
  trigger: Trigger,
  e: RuntimeEvent,
  ownerKind: string | undefined,
  host: RuleHost,
  /** Instances the dead-or-alive event refers to (destroyed/left objects are no longer in the world). */
  lookup: (id: string) => Instance | undefined,
): Binding | null {
  const b = fresh();
  const one = (t: Target, id: string) => {
    const inst = lookup(id);
    return inst && accepts(t, inst, ownerKind, b) ? b : null;
  };
  switch (trigger.type) {
    case 'sceneStart':
      return e.type === 'sceneStart' ? b : null;
    case 'key':
      if (e.type !== 'key' || typeof trigger.key !== 'string') return null;
      return e.key === trigger.key && e.mode === trigger.mode ? b : null;
    case 'clicked':
      if (e.type !== 'clicked') return null;
      if (e.ui) return trigger.target.t === 'ui' && trigger.target.id === e.id ? b : null;
      return one(trigger.target, e.id);
    case 'touches': {
      if (e.type !== 'touch') return null;
      const A = lookup(e.a);
      const B = lookup(e.b);
      if (!A || !B) return null;
      for (const [x, y] of [[A, B], [B, A]] as const) {
        const bb = fresh();
        if (accepts(trigger.a, x, ownerKind, bb) && accepts(trigger.b, y, ownerKind, bb)) return bb;
      }
      return null;
    }
    case 'valueChanges':
    case 'valueReaches': {
      if (e.type !== 'valueChanged' || 'unset' in trigger.value || trigger.value.valueId !== e.valueId) return null;
      if (e.objectId) {
        const inst = lookup(e.objectId);
        if (!inst) return null;
        if (trigger.value.of) {
          if (!accepts(trigger.value.of, inst, ownerKind, b)) return null;
        } else if (ownerKind) {
          if (inst.kindId !== ownerKind) return null;
          b.self = inst.id;
          b.subjects = [inst.id];
        } else {
          b.that.set(inst.kindId, inst.id);
          b.subjects = [inst.id];
        }
      }
      if (trigger.type === 'valueChanges') return b;
      const target = evalNum(trigger.amount, b, host);
      if (target === null || typeof e.to !== 'number' || typeof e.from !== 'number') return null;
      // Crossing from either side, or landing exactly on it.
      const crossed = (e.from < target && e.to >= target) || (e.from > target && e.to <= target);
      return crossed ? b : null;
    }
    case 'created':
      return e.type === 'created' ? one(trigger.target, e.id) : null;
    case 'destroyed':
      return e.type === 'destroyed' ? one(trigger.target, e.id) : null;
    case 'leavesScene':
      return e.type === 'leavesScene' ? one(trigger.target, e.id) : null;
    case 'sticker':
      return e.type === 'sticker' && e.event === trigger.event ? one(trigger.target, e.id) : null;
    case 'every':
    case 'after':
      return null;
  }
}
