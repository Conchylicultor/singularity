/**
 * Pure sliding-window math for the aggregate (subtree-cascade) render-loop tier.
 *
 * One `AggregateWindow` per aggregate root sums mutation timestamps across the
 * root's subtree (the `events` ring) AND keeps a per-leaf timestamp ring (so
 * breadth/recurrence can be measured). It has NO DOM dependency — all timestamps
 * are caller-supplied — so the breadth/rate logic is unit-testable in isolation.
 *
 * Every public accessor prunes (idempotent) before reading, so callers may read
 * `rate` / `recurringBreadth` / `sampleLeaves` in any order within one `now`.
 * Kept allocation-light: prune mutates the rings in place; reads scan once.
 */
export class AggregateWindow {
  // Aggregate mutation timestamps within the window (one entry per subtree hit).
  private events: number[] = [];
  // Per-leaf-signature timestamp rings — the breadth/recurrence signal.
  private leafHits = new Map<string, number[]>();

  constructor(
    private readonly windowMs: number,
    private readonly maxLeaves: number,
  ) {}

  /**
   * Record one subtree mutation at time `t`, attributed to `leaf`. A new leaf key
   * is only created while under the `maxLeaves` cap (bounds memory); an existing
   * key is always updated regardless of the cap.
   */
  record(leaf: string, t: number): void {
    this.events.push(t);
    const ring = this.leafHits.get(leaf);
    if (ring) {
      ring.push(t);
    } else if (this.leafHits.size < this.maxLeaves) {
      this.leafHits.set(leaf, [t]);
    }
  }

  /** Drop events / per-leaf timestamps older than the window; reap empty leaves. */
  private prune(now: number): void {
    while (this.events.length > 0 && now - this.events[0]! > this.windowMs) {
      this.events.shift();
    }
    for (const [leaf, ring] of this.leafHits) {
      while (ring.length > 0 && now - ring[0]! > this.windowMs) ring.shift();
      if (ring.length === 0) this.leafHits.delete(leaf);
    }
  }

  /** Summed subtree mutations per second over the window. */
  rate(now: number): number {
    this.prune(now);
    return (this.events.length * 1000) / this.windowMs;
  }

  /** Count of distinct leaves hit ≥ `minRepeat` times within the window. */
  recurringBreadth(now: number, minRepeat: number): number {
    this.prune(now);
    let breadth = 0;
    for (const ring of this.leafHits.values()) {
      if (ring.length >= minRepeat) breadth += 1;
    }
    return breadth;
  }

  /** The `n` hottest leaf signatures (most hits first) for attribution. */
  sampleLeaves(now: number, n: number): string[] {
    this.prune(now);
    return [...this.leafHits.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, n)
      .map(([leaf]) => leaf);
  }

  /** Timestamp of the most recent aggregate event, or 0 if the window is empty. */
  get lastEventAt(): number {
    return this.events.length > 0 ? this.events[this.events.length - 1]! : 0;
  }
}
