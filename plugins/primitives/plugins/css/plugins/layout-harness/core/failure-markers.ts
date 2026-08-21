// The three ways the geometry suite fails for a REAL reason, each as one marker
// string plus the helper that mints its Error.
//
// Kept here, in `core/`, because BOTH ends of a subprocess boundary need them
// and neither may re-spell them: the suite (`web/internal/layout-geometry.test.ts`)
// throws them, and `check/classify.ts` — running in a different process, reading
// only the captured stdout+stderr — recognises them as FATAL. `core/` is the one
// runtime both sides can import (the suite is web, the check is node), the same
// reason `types.ts` gives for `HOST_MARKER_ATTR`.
//
// Why a marker and not the invariant's own kind name. `classify.ts` used to
// match the `GeometryInvariant` kind at line start — a hand-written list of the
// kinds, and an anchor. Both halves were wrong:
//
//   - The list drifted. Adding a kind to `GeometryInvariant` and forgetting the
//     list turned a real regression into an "environmental timeout" that passed
//     non-fatally, and the drift test compared the list against a SECOND
//     hand-written list, so the two went stale together and still agreed.
//   - The anchor never matched. bun:test prints a thrown error as
//     `error: noOverlap: …`, so `^noOverlap:` did not line up with real output
//     at all — a genuine violation sharing a transcript with a genuine bun
//     timeout classified `inconclusive`.
//
// And the anchor could not simply be dropped: bun ALSO prints the failing test's
// name (`(fail) badge/long > noOverlap`), so an unanchored kind name cannot tell
// "the test named noOverlap timed out" from "noOverlap was violated". A kind
// list cannot be made sound. A marker can: it appears only when the suite really
// threw, so `classify.ts` matches it as a plain substring — immune to bun's
// `error: ` prefix, to indentation, and to wrapping — and a NEW invariant kind
// needs no classifier edit at all, because there is no list left to update.
//
// Each marker is minted by a helper rather than exported for callers to
// interpolate: building the message and stamping the marker are one step, so a
// throw site cannot forget the stamp.

/** Stamped on the throw for an oracle-reported invariant violation. */
export const GEOMETRY_VIOLATION_MARKER = "layout-geometry invariant violated:";

/** Stamped on the throw for a falsification that left its invariant satisfied. */
export const FALSIFICATION_NOT_BITING_MARKER = "falsification did not bite:";

/** Stamped on the throw for uncaught errors escaping the measurer page. */
export const FIXTURE_PAGE_ERROR_MARKER = "fixture page error:";

/** The oracle judged the measured boxes and reported `detail` as a violation. */
export function geometryViolationError(detail: string): Error {
  return new Error(`${GEOMETRY_VIOLATION_MARKER} ${detail}`);
}

/** A falsification's mutation left its `expectViolated` invariant satisfied. */
export function falsificationDidNotBiteError(detail: string): Error {
  return new Error(`${FALSIFICATION_NOT_BITING_MARKER} ${detail}`);
}

/** Uncaught errors escaped to the top of the measurer page. */
export function fixturePageError(detail: string): Error {
  return new Error(`${FIXTURE_PAGE_ERROR_MARKER} ${detail}`);
}

/** Every marker whose presence in a transcript means a REAL failure. */
export const FATAL_MARKERS = [
  GEOMETRY_VIOLATION_MARKER,
  FALSIFICATION_NOT_BITING_MARKER,
  FIXTURE_PAGE_ERROR_MARKER,
] as const;
