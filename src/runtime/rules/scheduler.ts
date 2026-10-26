/**
 * Game-time timers for "every N seconds", "after N seconds" and `wait`.
 * Times are in seconds since the scene started; everything is cleared on
 * scene change.
 */
export class Scheduler {
  private jobs: { at: number; rank: number; seq: number; run: () => void }[] = [];
  private seq = 0;

  /** `rank` orders jobs due at the same moment (the rule's dispatch order, FR-021). */
  at(time: number, run: () => void, rank = 0) {
    this.jobs.push({ at: time, rank, seq: this.seq++, run });
  }

  /** Runs every job due by `now`, earliest first (same moment: by rank, then scheduling order). Jobs may schedule more. */
  runDue(now: number) {
    for (let guard = 0; guard < 10_000; guard++) {
      let best = -1;
      for (let i = 0; i < this.jobs.length; i++) {
        const j = this.jobs[i]!;
        if (j.at > now + 1e-9) continue;
        const cur = best >= 0 ? this.jobs[best]! : undefined;
        // Times within 1e-9 s are the same moment (0.1 + 0.2 vs 0.3).
        const same = cur !== undefined && Math.abs(j.at - cur.at) <= 1e-9;
        if (!cur || (!same && j.at < cur.at) || (same && (j.rank < cur.rank || (j.rank === cur.rank && j.seq < cur.seq)))) best = i;
      }
      if (best < 0) return;
      const [job] = this.jobs.splice(best, 1);
      job!.run();
    }
  }

  get size() {
    return this.jobs.length;
  }

  clear() {
    this.jobs = [];
  }
}
