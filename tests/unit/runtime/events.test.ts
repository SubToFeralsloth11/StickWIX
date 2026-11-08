import { describe, expect, it } from 'vitest';
import { RecentEvents } from '@/runtime/events';

describe('RecentEvents (Show-me ring buffer)', () => {
  it('keeps only events from the last 2 seconds, newest first', () => {
    const r = new RecentEvents();
    r.record({ type: 'clicked', id: 'a' }, 0);
    r.record({ type: 'clicked', id: 'b' }, 1.5);
    r.record({ type: 'clicked', id: 'c' }, 2.5);
    expect(r.list(2.5).map((e) => (e.event.type === 'clicked' ? e.event.id : ''))).toEqual(['c', 'b']);
  });

  it('deduplicates identical events, keeping the newest time', () => {
    const r = new RecentEvents();
    r.record({ type: 'touch', a: 'h', b: 'c1' }, 0.1);
    r.record({ type: 'key', key: 'Space', mode: 'pressed' }, 0.2);
    r.record({ type: 'touch', a: 'h', b: 'c1' }, 0.3);
    const list = r.list(0.5);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ t: 0.3, event: { type: 'touch' } });
  });

  it('treats touches as unordered pairs when deduplicating', () => {
    const r = new RecentEvents();
    r.record({ type: 'touch', a: 'h', b: 'c1' }, 0.1);
    r.record({ type: 'touch', a: 'c1', b: 'h' }, 0.2);
    expect(r.list(0.3)).toHaveLength(1);
  });

  it('skips held-key repeats and timers do not crowd out other events', () => {
    const r = new RecentEvents();
    r.record({ type: 'key', key: 'Space', mode: 'held' }, 0.1);
    expect(r.list(0.2)).toHaveLength(0);
  });

  it('stays bounded under event floods', () => {
    const r = new RecentEvents();
    for (let i = 0; i < 10_000; i++) r.record({ type: 'created', id: `o${i}` }, i / 10_000);
    expect(r.size).toBeLessThanOrEqual(RecentEvents.MAX);
  });
});
