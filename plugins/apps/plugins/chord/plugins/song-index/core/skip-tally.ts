import { z } from "zod";

// ── Skipped sections, counted by reason ──────────────────────────────────────

/** How many example section ids a reason keeps. The counts are exact; examples are for a human to open. */
export const SKIP_EXAMPLES_PER_REASON = 20;

export const SkipSummaryEntrySchema = z.object({
  reason: z.string(),
  count: z.number().int(),
  examples: z.array(z.object({ id: z.string(), detail: z.string() })),
});
/** One reason, its count, and up to `SKIP_EXAMPLES_PER_REASON` examples. */
export type SkipSummaryEntry = z.infer<typeof SkipSummaryEntrySchema>;

/**
 * The reasons a load left sections out, largest first.
 *
 * An **array**, not a reason → entry object: the summary is stored in a `jsonb`
 * column, and Postgres stores a jsonb object's keys in its own order, so an
 * object could not carry the ranking back out of the database. The order is
 * what makes the summary readable ("what did this load mostly drop?"), so it is
 * kept in the one shape that survives the round trip.
 */
export const SkipSummarySchema = z.array(SkipSummaryEntrySchema);
export type SkipSummary = z.infer<typeof SkipSummarySchema>;

/** Accumulates skips while a load streams; `summary()` is what the state row stores. */
export class SkipTally {
  readonly #byReason = new Map<
    string,
    { count: number; examples: { id: string; detail: string }[] }
  >();

  add(reason: string, id: string, detail: string): void {
    let entry = this.#byReason.get(reason);
    if (entry === undefined) {
      entry = { count: 0, examples: [] };
      this.#byReason.set(reason, entry);
    }
    entry.count++;
    if (entry.examples.length < SKIP_EXAMPLES_PER_REASON) {
      entry.examples.push({ id, detail });
    }
  }

  get total(): number {
    let total = 0;
    for (const { count } of this.#byReason.values()) total += count;
    return total;
  }

  /** Reasons sorted by count, largest first; ties in the order they were first seen. */
  summary(): SkipSummary {
    return [...this.#byReason]
      .map(([reason, { count, examples }]) => ({
        reason,
        count,
        examples: [...examples],
      }))
      .sort((a, b) => b.count - a.count);
  }
}
