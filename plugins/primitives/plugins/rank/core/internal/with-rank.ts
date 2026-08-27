import { Rank } from "./rank";

/** A stored row with its raw `rank` key replaced by the `Rank` value object. */
export type Ranked<R extends { rank: string }> = Omit<R, "rank"> & {
  rank: Rank;
};

/**
 * THE one spelling of the storage↔wire `rank` gap.
 *
 * A `rank` column deliberately stores the RAW fractional-indexing key: its value
 * type is `string`, which keeps `table.$inferSelect` honest and keeps the
 * `fields` registry's `rank` type a plain string (the recorded decision — see
 * `plugins/fields/plugins/rank/core/internal/rank.ts`). The WIRE schemas
 * (`Task`, `Agent`, `Block`, …) declare the {@link Rank} value object instead,
 * via `RankSchema`, because that is where sort/compare/between belong.
 *
 * So every read that hands a stored row out as its wire type differs from it in
 * exactly one field. This names that difference instead of asserting it away:
 *
 * ```ts
 * async function listTasks(): Promise<Task[]> {
 *   return (await db.select().from(tasks)).map(withRank);
 * }
 * ```
 *
 * The point is what `tsc` then checks. `rows.map(withRank)` against a DECLARED
 * return type is a checked assignment, so every OTHER field of the row must line
 * up — a column that stops matching its wire schema becomes a compile error
 * rather than something a cast laundered. That is precisely what the
 * `as unknown as Task[]` casts this replaces were hiding.
 *
 * Safe on a live-state loader too: `RankSchema` accepts an already-wrapped
 * `Rank` as well as a raw string, so a loader whose output the resource runtime
 * re-parses stays correct.
 */
export function withRank<R extends { rank: string }>(row: R): Ranked<R> {
  return { ...row, rank: Rank.from(row.rank) };
}
