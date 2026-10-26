import type { RuntimeEvent } from './types';

export interface RecentEvent {
  t: number;
  event: RuntimeEvent;
}

const WINDOW = 2;

function keyOf(e: RuntimeEvent): string {
  switch (e.type) {
    case 'touch':
      return e.a < e.b ? `touch|${e.a}|${e.b}` : `touch|${e.b}|${e.a}`;
    case 'key':
      return `key|${e.key}|${e.mode}`;
    case 'valueChanged':
      return `value|${e.valueId}|${e.objectId ?? ''}`;
    case 'timer':
      return `timer|${e.ruleId}`;
    case 'sticker':
      return `sticker|${e.id}|${e.event}`;
    case 'clicked':
    case 'created':
    case 'destroyed':
    case 'leavesScene':
      return `${e.type}|${e.id}`;
    case 'sceneStart':
      return 'sceneStart';
  }
}

/**
 * The last 2 seconds of rule-triggerable events, for Show-me (FR-028).
 * Insertion-ordered map keyed by event identity: re-recording an event moves
 * it to the newest position, which deduplicates for free.
 */
export class RecentEvents {
  static readonly MAX = 256;
  private items = new Map<string, RecentEvent>();

  get size() {
    return this.items.size;
  }

  record(event: RuntimeEvent, t: number) {
    if (event.type === 'key' && event.mode === 'held') return; // fires every step; "pressed" covers it
    const k = keyOf(event);
    this.items.delete(k);
    this.items.set(k, { t, event });
    if (this.items.size > RecentEvents.MAX) this.items.delete(this.items.keys().next().value!);
  }

  /** Events within the 2 s window ending at `now`, newest first. */
  list(now: number): RecentEvent[] {
    for (const [k, v] of this.items) {
      if (now - v.t <= WINDOW) break;
      this.items.delete(k);
    }
    return [...this.items.values()].filter((e) => now - e.t <= WINDOW).reverse();
  }

  clear() {
    this.items.clear();
  }
}
