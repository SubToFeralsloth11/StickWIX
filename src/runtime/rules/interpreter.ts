import type { Project, Rule, TriggerType } from '../../model/schema';
import { allRules, ruleStates, type RuleOwner } from '../../model/references';
import type { RuntimeEvent } from '../types';
import { runAction } from './actions';
import { checkConditions } from './conditions';
import { evalNum, type Binding, type RuleHost } from './host';
import { Scheduler } from './scheduler';
import { matchTrigger, triggerTypesFor } from './triggers';

/** Nested trigger dispatches allowed within one moment before a chain is cut (FR-022). */
export const MAX_DEPTH = 64;

interface Live {
  rule: Rule;
  owner: RuleOwner;
  /** Position in dispatch order (game → scene → Kind, each in list order). */
  order: number;
}

/**
 * Runs sentence rules straight from the document. Dispatch order is game →
 * scene → Kind rules, each in list order (FR-021). Only enabled rules whose
 * state is `ok` run; incomplete and broken ones are skipped (FR-023).
 */
export class Interpreter {
  private byType = new Map<TriggerType, Live[]>();
  private timers: Live[] = [];
  private depth = 0;
  private stack: string[] = [];
  private reported = new Set<string>();
  readonly scheduler = new Scheduler();

  constructor(project: Project, sceneId: string, private readonly host: RuleHost) {
    const states = ruleStates(project);
    for (const [order, { rule, owner }] of allRules(project).entries()) {
      if (!rule.enabled || states.get(rule.id)?.state !== 'ok') continue;
      if (owner.type === 'scene' && owner.id !== sceneId) continue;
      const live = { rule, owner, order };
      const t = rule.trigger.type;
      if (t === 'every' || t === 'after') this.timers.push(live);
      else {
        const list = this.byType.get(t) ?? [];
        list.push(live);
        this.byType.set(t, list);
      }
    }
  }

  /** Schedules timer rules relative to the scene start (time 0). */
  startTimers() {
    for (const live of this.timers) this.armTimer(live, 0);
  }

  private armTimer(live: Live, from: number) {
    const tr = live.rule.trigger;
    if (tr.type !== 'every' && tr.type !== 'after') return;
    const secs = evalNum(tr.seconds, { that: new Map() }, this.host);
    // Zero/negative "every" would fire forever in one moment; treat as not set.
    if (secs === null || secs <= 0) return;
    this.scheduler.at(from + secs, () => {
      this.host.recordTimer(live.rule.id, from + secs);
      for (const b of this.bindingsFor(live, null)) this.runRule(live, b);
      if (tr.type === 'every') this.armTimer(live, from + secs);
    }, live.order);
  }

  /**
   * Bindings to run a rule with. A Kind rule binds "this object" to the
   * trigger's subject of its own Kind (once per event, FR-019); only when the
   * event has no such subject (keys, timers, game values, other Kinds) does it
   * run once for every object of the Kind.
   */
  private bindingsFor(live: Live, b: Binding | null): Binding[] {
    if (live.owner.type !== 'kind' || b?.self) return [b ?? { that: new Map() }];
    const kindId = live.owner.id!;
    const own = b?.subjects?.find((id) => this.host.world.instances.get(id)?.kindId === kindId);
    if (own) return [{ ...b!, self: own }];
    return this.host.world.byKind(kindId).map((i) => ({ self: i.id, that: new Map(b?.that ?? []), subjects: b?.subjects }));
  }

  /** Feeds an event to every matching rule, depth-first. */
  dispatch(e: RuntimeEvent) {
    const types = triggerTypesFor(e);
    // No rule listens (e.g. touches between unrelated objects): nothing to do, no allocation.
    if (!types.some((t) => this.byType.has(t))) return;
    if (this.depth >= MAX_DEPTH) {
      const culprit = this.stack[this.stack.length - 1];
      if (culprit && !this.reported.has(culprit)) {
        this.reported.add(culprit);
        this.host.diagnostic({ type: 'runaway', ruleId: culprit });
      }
      return;
    }
    this.depth++;
    try {
      const lookup = (id: string) => this.host.world.instances.get(id);
      // One event can satisfy several trigger types ("changes" and "reaches"); keep list order across them.
      const lists = types.map((t) => this.byType.get(t) ?? []);
      const candidates = lists.length === 1 ? lists[0]! : lists.flat().sort((a, b) => a.order - b.order);
      for (const live of candidates) {
        if (this.host.sceneChanging) return;
        const ownerKind = live.owner.type === 'kind' ? live.owner.id : undefined;
        const b = matchTrigger(live.rule.trigger, e, ownerKind, this.host, lookup);
        if (!b) continue;
        for (const bb of this.bindingsFor(live, b)) this.runRule(live, bb);
      }
    } finally {
      this.depth--;
    }
  }

  private runRule(live: Live, b: Binding) {
    if (this.host.sceneChanging) return;
    if (!checkConditions(live.rule.conditions, b, this.host)) return;
    this.runFrom(live, b, 0);
  }

  private runFrom(live: Live, b: Binding, start: number) {
    this.stack.push(live.rule.id);
    try {
      const actions = live.rule.actions;
      for (let i = start; i < actions.length; i++) {
        if (this.host.sceneChanging) return;
        const wait = runAction(actions[i]!, b, this.host);
        if (wait !== null) {
          this.scheduler.at(this.host.time + wait, () => {
            // Skipped if an object the rule was about is gone.
            const gone = [b.self, ...b.that.values()].some((id) => id !== undefined && !this.host.world.get(id));
            if (!gone) this.runFrom(live, b, i + 1);
          }, live.order);
          return;
        }
      }
    } finally {
      this.stack.pop();
    }
  }

  /** Runs timers and resumed waits due at the host's current time. */
  tick() {
    this.depth = 0;
    this.scheduler.runDue(this.host.time);
  }
}
