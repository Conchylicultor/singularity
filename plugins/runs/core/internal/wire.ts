import { z } from "zod";
import { RunOutcomeSchema } from "@plugins/runs/plugins/run-outcome/core";

/**
 * One row of the merged run space.
 *
 * The base half is spelled out and validated; the arm half rides along in the
 * `catchall`, keyed by the arm's own namespaced column ids (`build.targets`,
 * `deploy.verb`). That asymmetry is the point: `runs` knows the base columns
 * exactly and knows *nothing* about an arm's, which is what lets an arm be added
 * without editing this file.
 *
 * An arm's value therefore arrives as `unknown` and the arm narrows it — the arm
 * is the only code that knows what its own column holds. `outcome` is the one
 * place the schema is strict about a value an arm produces: a `CASE` that missed
 * a branch throws here rather than putting an unlabelled row on screen.
 */
export const UnionRunSchema = z
  .object({
    /** Which arm this row came from — the discriminator. */
    kind: z.string(),
    /** The row's id **within its own ledger**; unique only per kind. */
    id: z.string(),
    label: z.string(),
    outcome: RunOutcomeSchema,
    trigger: z.string().nullable(),
    startedAt: z.coerce.date(),
    finishedAt: z.coerce.date().nullable(),
    /** Wall-clock milliseconds; measured against `now()` while in flight. */
    duration: z.number(),
    namespace: z.string().nullable(),
    message: z.string().nullable(),
  })
  .catchall(z.unknown());

export type UnionRun = z.infer<typeof UnionRunSchema>;

/**
 * The row key for the merged space.
 *
 * `id` alone is not one: two ledgers can mint the same id, and a DataView whose
 * row keys collide silently renders one row where there are two. The kind is
 * what makes it global — the same pair the keyset seek orders by.
 *
 * Takes the PAIR rather than a whole run, so a caller holding a domain id (the
 * build detail pane knowing which build run is open) can name a row without
 * inventing one. Passing a bare id is then not a thing that can be spelled.
 */
export function runRowKey(run: { kind: string; id: string }): string {
  return `${run.kind}:${run.id}`;
}
