import type { EventSource } from "./schema";
import type { ExtractionStatus } from "./vocab";

/**
 * The one derivation of a source's extraction status from the two columns the
 * run ledger writes. Web-safe `core/` so the sources list and any server-side
 * caller answer it identically — a second copy of these rules is how "ok" and
 * "empty" start disagreeing between two surfaces.
 *
 * Takes a `Pick`, not the whole row, so ANY caller holding just the two facts
 * (a projection, a test, a future rollup) can ask without materializing a source.
 */
export function extractionStatus(
  source: Pick<EventSource, "lastOutcome" | "lastEventCount">,
): ExtractionStatus {
  // No run has COMPLETED yet — not a failure, and specifically not "empty": we
  // have never asked the page anything. A source created a minute ago and a
  // source whose every run died are genuinely different states.
  if (source.lastOutcome === null) return "never";

  // The newest run failed, and that beats an older good extraction. What the
  // user needs from this column is the CURRENT state, not the best one on
  // record — an event list that is quietly frozen at last week's extraction is
  // the thing this status exists to surface.
  if (source.lastOutcome === "failed") return "failed";

  // A count of zero is "empty" whatever the outcome, `unchanged` included: an
  // unchanged run means the page has not moved since the extraction that found
  // nothing, so the source is still empty — reporting `ok` because this
  // particular run was a cheap cache hit would hide it for as long as the site
  // sits still, which is precisely how long the breakage lasts.
  if (source.lastEventCount === 0) return "empty";

  // Everything else. This also covers `lastEventCount === null` under an
  // `unchanged` outcome — unreachable in practice, because the first run always
  // extracts (a null `lastFingerprint` can never be a cache hit) and an
  // extraction always writes the count — but answered rather than crashed: a
  // status column is not worth a thrown exception over an impossible row.
  return "ok";
}
