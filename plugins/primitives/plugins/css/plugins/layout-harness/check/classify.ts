// Classifies a FAILED `layout-geometry` subprocess run into a *fatal* geometry
// regression vs. an *environmental* (inconclusive) flake, from the combined
// stdout+stderr transcript of the spawned `bun test` run.
//
// CRITICAL: callers pass the FULL, untruncated `stdout + stderr`, never a tail —
// a real assertion/oracle failure printed early in a long, timeout-laced
// transcript must not be trimmed away and misread as environmental (the single
// most dangerous failure mode). Fatal wins on any overlap; anything unrecognized
// is fatal (ambiguous → fatal).

import { FATAL_MARKERS } from "../core/failure-markers";

// The suite stamps every REAL failure with a marker minted in
// `core/failure-markers.ts` — an oracle violation, a falsification that did not
// bite, a crashed fixture. Both ends read those constants, so recognizing a real
// regression needs no list of invariant kinds here and a NEW `GeometryInvariant`
// kind needs no edit to this file at all.
//
// Matched as a plain SUBSTRING, deliberately. The previous signature anchored the
// invariant's kind name to line start (`^noOverlap:`), which never matched real
// output: bun:test prints a thrown error as `error: noOverlap: …`. A genuine
// violation sharing a transcript with a genuine bun timeout therefore classified
// `inconclusive` — waved through as a flake. The anchor could not just be dropped
// either, because bun also prints the failing test's NAME (`(fail) badge/long >
// noOverlap`), so a bare kind name cannot tell a violation from a timeout on a
// test named after one. A marker appears only when the suite really threw, so it
// needs no anchor and survives bun's prefix, indentation and wrapping.

// Fatal signatures — a REAL regression. Checked FIRST and win over any timeout
// wording elsewhere in the same transcript.
const FATAL_SIGNATURES: RegExp[] = [
  // The two `expect()`-based tests: the non-empty-catalog assertion and the
  // falsification's closing `expect(r.ok).toBe(false)`.
  /\bAssertionError\b/,
];

// A crashed fixture very often ALSO times out (a React update-depth loop burns
// the settle budget, a torn-down tree never settles), so its transcript carries
// timeout wording as well — which is why the markers are checked ABOVE the
// environmental pass. Classified environmental, such a run would be waved through
// as a flake AND re-tried forever, which is how the Layout Lab stayed broken.
function hasFatalMarker(fullOutput: string): boolean {
  return FATAL_MARKERS.some((marker) => fullOutput.includes(marker));
}

// Environmental signatures — an inconclusive flake, consulted only when NO fatal
// signature matched.
const ENVIRONMENTAL_SIGNATURES: RegExp[] = [
  // bun:test per-test timeout: "this test timed out after <n>ms."
  /timed out after \d+\s*ms/i,
  // bun:test hook timeout — the dominant cold-path flake: the suite's `beforeAll`
  // cold-builds a Vite page + launches Chromium and overruns the hook budget.
  // bun words this differently from the per-test case: "a beforeEach/afterEach
  // hook timed out for this test." (captured live from bun 1.3.x; the per-test
  // regex above does NOT cover it).
  /hook timed out for this test/i,
  // Generic Playwright timeout (browserType.launch / page.goto / waitForFunction):
  // "Timeout <n>ms exceeded".
  /Timeout \d+ms exceeded/i,
];

export function classifyFailure(fullOutput: string): "inconclusive" | "fatal" {
  // Fatal wins on any overlap — checked first and unconditionally.
  if (hasFatalMarker(fullOutput)) return "fatal";
  if (FATAL_SIGNATURES.some((re) => re.test(fullOutput))) return "fatal";
  if (ENVIRONMENTAL_SIGNATURES.some((re) => re.test(fullOutput)))
    return "inconclusive";
  // Unrecognized (Vite build error, OOM kill, Chromium segfault, …) → fatal.
  return "fatal";
}
