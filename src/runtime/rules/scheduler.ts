/**
 * Game-time timers for "every N seconds", "after N seconds" and `wait`.
 * Times are in seconds since the scene started; everything is cleared on
 * scene change.
 */
export class Scheduler {
  private jobs: { at: number; seq: number; run: () => void }[] = [];
  private seq = 0;

  at(time: number, run: () => void) {
    this.jobs.push({ at: time, seq: this.seq++, run });
  }

  /** Runs every job due by `now`, earliest first (ties in scheduling order). Jobs may schedule more. */
  runDue(now: number) {
    for (let guard = 0; guard < 10_000; guard++) {
      let best = -1;
      for (let i = 0; i < this.jobs.length; i++) {
        const j = this.jobs[i]!;
        if (j.at > now + 1e-9) continue;
        const cur = best >= 0 ? this.jobs[best]! : undefined;
        if (!cur || j.at < cur.at || (j.at === cur.at && j.seq < cur.seq)) best = i;
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
