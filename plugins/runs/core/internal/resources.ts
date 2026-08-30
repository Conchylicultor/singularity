import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

/**
 * Scalar invalidation tick for the merged run space — a cheap `{ rev }` hash the
 * server pushes only when one of the arm ledgers actually changes.
 *
 * The surface is a server-delegated keyset query, so it keeps this OUT of its
 * query key and refetches its loaded window in place when `rev` moves. A live
 * resource over the rows themselves would be an unbounded collection across
 * four growing ledgers, which the working-set contract forbids; a hash of a
 * bounded window is bounded by construction. Mirrors `deploy.runs-revision`.
 *
 * `hasRuns` rides along because the surface has to tell "this machine has never
 * run anything" apart from "nothing matches this view" — every tab here is a
 * filter, and the default one is empty in normal operation. A BOOLEAN and not a
 * count on purpose: a live total across four growing ledgers is a number with no
 * bounded reader, and naming it `total` invites someone to serve one. It costs
 * no query of its own — the fingerprint window already read the rows.
 */
export const runsRevisionResource = resourceDescriptor<{
  rev: string;
  hasRuns: boolean;
}>("runs.revision", z.object({ rev: z.string(), hasRuns: z.boolean() }), {
  rev: "",
  hasRuns: false,
});
