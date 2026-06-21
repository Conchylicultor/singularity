/**
 * Pure sliding-window math for the aggregate (subtree-cascade) render-loop tier.
 *
 * One `AggregateWindow` per aggregate root sums mutation timestamps across the
 * root's subtree AND keeps a per-leaf timestamp ring (so breadth/recurrence can
 * be measured). Aggregate rate is tracked PER CLASS (`childlist` vs `attr`)
 * because a childList rebuild is only ~2 records yet far costlier than an
 * attribute write — the two cannot share one count-based threshold. It has NO DOM
 * dependency — all timestamps are caller-supplied — so the breadth/rate logic is
 * unit-testable in isolation.
 *
 * Every public accessor prunes (idempotent) before reading, so callers may read
 * `rate` / `recurringBreadth` / `sampleLeaves` in any order within one `now`.
 * Kept allocation-light: prune mutates the rings in place; reads scan once.
 */

/** Mutation class buckets the aggregate rate is split across. */
export type AggregateKind = "childlist" | "attr";

export class AggregateWindow {
  // Per-class aggregate mutation timestamps within the window.
  private childlistEvents: number[] = [];
  private attrEvents: number[] = [];
  // Per-leaf-signature timestamp rings (class-agnostic) — the breadth signal.
  private leafHits = new Map<string, number[]>();

  constructor(
    private readonly windowMs: number,
    private readonly maxLeaves: number,
  ) {}

  /**
   * Record one subtree mutation at time `t`, attributed to `leaf` and bucketed by
   * `kind`. A new leaf key is only created while under the `maxLeaves` cap (bounds
   * memory); an existing key is always updated regardless of the cap.
   */
  record(leaf: string, t: number, kind: AggregateKind): void {
    (kind === "childlist" ? this.childlistEvents : this.attrEvents).push(t);
    const ring = this.leafHits.get(leaf);
    if (ring) {
      ring.push(t);
    } else if (this.leafHits.size < this.maxLeaves) {
      this.leafHits.set(leaf, [t]);
    }
  }

  /** Drop one timestamp array's entries older than the window (in place). */
  private pruneRing(ring: number[], now: number): void {
    while (ring.length > 0 && now - ring[0]! > this.windowMs) ring.shift();
  }

  /** Drop events / per-leaf timestamps older than the window; reap empty leaves. */
  private prune(now: number): void {
    this.pruneRing(this.childlistEvents, now);
    this.pruneRing(this.attrEvents, now);
    for (const [leaf, ring] of this.leafHits) {
      this.pruneRing(ring, now);
      if (ring.length === 0) this.leafHits.delete(leaf);
    }
  }

  /** Summed subtree mutations per second over the window, for one class. */
  rate(now: number, kind: AggregateKind): number {
    this.prune(now);
    const ring = kind === "childlist" ? this.childlistEvents : this.attrEvents;
    return (ring.length * 1000) / this.windowMs;
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

  /** Timestamp of the most recent aggregate event (any class), or 0 if empty. */
  get lastEventAt(): number {
    const lastChild = this.childlistEvents[this.childlistEvents.length - 1] ?? 0;
    const lastAttr = this.attrEvents[this.attrEvents.length - 1] ?? 0;
    return Math.max(lastChild, lastAttr);
  }
}
