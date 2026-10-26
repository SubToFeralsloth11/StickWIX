import type { RecentEvent } from '../runtime/events';

/** One change the user acted out in the frozen world (FR-029). */
export type Intent =
  | { type: 'destroy'; instId: string }
  | { type: 'move'; instId: string; x: number; y: number }
  | { type: 'create'; kindId: string; x: number; y: number }
  | { type: 'value'; valueId: string; objectId?: string; op: 'add' | 'subtract' | 'set'; amount: number | string | boolean }
  | { type: 'sound'; assetId: string }
  | { type: 'scene'; sceneId: string }
  | { type: 'visibility'; instId: string; hidden: boolean }
  | { type: 'look'; instId: string; assetId: string };

/** Something the user tried that rules can't express; reported, never turned into an action. */
export interface Unsupported {
  what: string;
}

/** What the Show-me session needs from a running game. */
export interface Freezable {
  freeze(): void;
  resume(): void;
  recentEvents(): RecentEvent[];
}

/**
 * A Show-me run: freeze, pick what just happened, act out the result, get a
 * rule. Intents are kept in the order performed (US4 #3); consecutive changes
 * to the same value merge into one ("Score +1 +1" is one "goes up by 2").
 */
export class ShowMeSession {
  readonly events: RecentEvent[];
  trigger: RecentEvent | null = null;
  readonly intents: Intent[] = [];
  readonly unsupported: Unsupported[] = [];
  private closed = false;

  constructor(private readonly game: Freezable) {
    game.freeze();
    this.events = game.recentEvents();
  }

  pick(e: RecentEvent | null) {
    this.trigger = e;
  }

  log(intent: Intent | Unsupported) {
    if ('what' in intent) {
      this.unsupported.push(intent);
      return;
    }
    const last = this.intents[this.intents.length - 1];
    if (intent.type === 'value' && last?.type === 'value' && last.valueId === intent.valueId && last.objectId === intent.objectId) {
      this.intents[this.intents.length - 1] = mergeValue(last, intent);
      return;
    }
    if (intent.type === 'move' && last?.type === 'move' && last.instId === intent.instId) {
      this.intents[this.intents.length - 1] = intent;
      return;
    }
    this.intents.push(intent);
  }

  /** Removes the last acted-out change. */
  undo(): Intent | undefined {
    return this.intents.pop();
  }

  /** Ends the session and resumes play; the caller adds the rule (confirm) or nothing (cancel). */
  close() {
    if (this.closed) return;
    this.closed = true;
    this.game.resume();
  }
}

type ValueIntent = Extract<Intent, { type: 'value' }>;

/** Folds two consecutive changes of one value into a single equivalent change. */
function mergeValue(a: ValueIntent, b: ValueIntent): ValueIntent {
  if (b.op === 'set') return b;
  if (typeof b.amount !== 'number') return b;
  const delta = (op: ValueIntent['op'], n: number) => (op === 'subtract' ? -n : n);
  if (a.op === 'set') {
    if (typeof a.amount !== 'number') return b;
    return { ...a, amount: a.amount + delta(b.op, b.amount) };
  }
  if (typeof a.amount !== 'number') return b;
  const total = delta(a.op, a.amount) + delta(b.op, b.amount);
  return { ...a, op: total < 0 ? 'subtract' : 'add', amount: Math.abs(total) };
}
