import type { Target, Trigger } from '../model/schema';
import type { RecentEvent } from '../runtime/events';

/** The facts about live objects that generalisation needs. */
export interface WorldFacts {
  /** Kind and placed-object id of an instance (dead ones included). */
  instance(id: string): { kindId: string; objectId: string | null } | undefined;
  /** How many objects of the Kind exist in the scene (placed + live). */
  countOfKind(kindId: string): number;
}

/** Instance ids a trigger binds, so actions about them can say "that [Kind]". */
export interface Generalised {
  trigger: Trigger;
  /** instance id → target to use for it inside actions. */
  bound: Map<string, Target>;
  /** Whether "only this one" would change anything (some subject's Kind has several objects). */
  canGeneralise: boolean;
}

/**
 * Turns the picked event into a trigger. An object whose Kind has more than
 * one object becomes "any [Kind]" (and "that [Kind]" in actions) unless
 * `onlyThis` is set (FR-030); a lone object stays itself.
 */
export function generalise(e: RecentEvent['event'], facts: WorldFacts, onlyThis: boolean): Generalised {
  const bound = new Map<string, Target>();
  let canGeneralise = false;
  const subject = (instId: string): Target => {
    const i = facts.instance(instId);
    if (!i) return { t: 'unset' };
    const many = facts.countOfKind(i.kindId) > 1 || !i.objectId;
    if (many && i.objectId) canGeneralise = true;
    if ((many && !onlyThis) || !i.objectId) {
      bound.set(instId, { t: 'that', kindId: i.kindId });
      return { t: 'any', kindId: i.kindId };
    }
    bound.set(instId, { t: 'object', id: i.objectId });
    return { t: 'object', id: i.objectId };
  };

  let trigger: Trigger;
  switch (e.type) {
    case 'sceneStart':
      trigger = { type: 'sceneStart' };
      break;
    case 'timer':
      trigger = { type: 'after', seconds: { lit: Math.round(e.seconds * 10) / 10 } };
      break;
    case 'key':
      trigger = { type: 'key', key: e.key, mode: e.mode };
      break;
    case 'clicked':
      trigger = e.ui ? { type: 'clicked', target: { t: 'ui', id: e.id } } : { type: 'clicked', target: subject(e.id) };
      break;
    case 'touch': {
      // Put a lone object (usually the player) first: "When Hero touches any Coin".
      const ia = facts.instance(e.a);
      const ib = facts.instance(e.b);
      const aMany = ia ? facts.countOfKind(ia.kindId) > 1 : true;
      const bMany = ib ? facts.countOfKind(ib.kindId) > 1 : true;
      const [first, second] = aMany && !bMany ? [e.b, e.a] : [e.a, e.b];
      trigger = { type: 'touches', a: subject(first), b: subject(second) };
      break;
    }
    case 'valueChanged':
      if (e.objectId) {
        const of = subject(e.objectId);
        trigger = { type: 'valueChanges', value: { valueId: e.valueId, of } };
      } else trigger = { type: 'valueChanges', value: { valueId: e.valueId } };
      break;
    case 'created':
    case 'destroyed':
    case 'leavesScene':
      trigger = { type: e.type, target: subject(e.id) };
      break;
    case 'sticker':
      trigger = { type: 'sticker', target: subject(e.id), event: e.event };
      break;
  }
  return { trigger, bound, canGeneralise };
}
