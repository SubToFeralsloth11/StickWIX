import type { Action, Rule, Target, Trigger } from '../model/schema';
import type { Intent } from './session';
import type { Generalised, WorldFacts } from './generalise';

/** Target for an object mentioned by an action: the trigger's binding, its placed object, or every one of its Kind. */
function targetFor(instId: string, g: Generalised, facts: WorldFacts): Target {
  const bound = g.bound.get(instId);
  if (bound) return bound;
  const i = facts.instance(instId);
  if (!i) return { t: 'unset' };
  return i.objectId ? { t: 'object', id: i.objectId } : { t: 'any', kindId: i.kindId };
}

/** Exactly one action per acted-out change, in the order performed (US4 #3). */
export function intentToAction(intent: Intent, g: Generalised, facts: WorldFacts): Action {
  switch (intent.type) {
    case 'destroy':
      return { type: 'destroy', target: targetFor(intent.instId, g, facts) };
    case 'move':
      return { type: 'moveTo', target: targetFor(intent.instId, g, facts), to: { at: { x: { lit: Math.round(intent.x) }, y: { lit: Math.round(intent.y) } } } };
    case 'create':
      return { type: 'create', kindId: intent.kindId, place: { at: { x: { lit: Math.round(intent.x) }, y: { lit: Math.round(intent.y) } } } };
    case 'value':
      return {
        type: 'changeValue',
        value: intent.objectId ? { valueId: intent.valueId, of: targetFor(intent.objectId, g, facts) } : { valueId: intent.valueId },
        op: intent.op,
        amount: { lit: intent.amount },
      };
    case 'sound':
      return { type: 'playSound', assetId: intent.assetId };
    case 'scene':
      return { type: 'changeScene', sceneId: intent.sceneId };
    case 'visibility':
      return { type: intent.hidden ? 'hide' : 'show', target: targetFor(intent.instId, g, facts) };
    case 'look':
      return { type: 'changeLook', target: targetFor(intent.instId, g, facts), assetId: intent.assetId };
  }
}

/** Builds the rule; with no acted-out changes it is null (a rule needs at least one action). */
export function toRule(id: string, trigger: Trigger, g: Generalised, intents: Intent[], facts: WorldFacts): Rule | null {
  if (!intents.length) return null;
  return {
    id,
    enabled: true,
    trigger,
    conditions: { join: 'all', items: [] },
    actions: intents.map((i) => intentToAction(i, g, facts)).slice(0, 20),
  };
}
