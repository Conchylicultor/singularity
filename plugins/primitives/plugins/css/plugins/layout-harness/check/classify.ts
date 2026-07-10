// Classifies a FAILED `layout-geometry` subprocess run into a *fatal* geometry
// regression vs. an *environmental* (inconclusive) flake, from the combined
// stdout+stderr transcript of the spawned `bun test` run.
//
// CRITICAL: callers pass the FULL, untruncated `stdout + stderr`, never a tail —
// a real assertion/oracle failure printed early in a long, timeout-laced
// transcript must not be trimmed away and misread as environmental (the single
// most dangerous failure mode). Fatal wins on any overlap; anything unrecognized
// is fatal (ambiguous → fatal).

// The oracle reports a real geometry violation by `throw new Error(r.detail)`,
// and every `detail` string starts with its invariant kind at line start (see
// core/oracle.ts). This is the closed set of `GeometryInvariant` kinds MINUS
// `falsification` (which the suite reports via its own "falsification did not
// bite:" throw, matched separately below). If a kind is added to core/oracle.ts,
// add it here too — the unit test guards this list against drift.
export const ORACLE_INVARIANT_KINDS = [
  "noOverlap",
  "noClip",
  "leftPack",
  "rigidIntegrity",
  "pinnedRight",
  "neverTruncatesWhenRoomy",
  "truncationOnsetOrder",
] as const;

// Fatal signatures — a REAL regression. Checked FIRST and win over any timeout
// wording elsewhere in the same transcript.
const FATAL_SIGNATURES: RegExp[] = [
  // The two `expect()`-based tests: the non-empty-catalog assertion and the
  // falsification's closing `expect(r.ok).toBe(false)`.
  /\bAssertionError\b/,
  // The falsification guard: the mutated construct failed to violate its invariant.
  /falsification did not bite:/,
  // Any oracle invariant violation — `new Error(r.detail)`, `detail` prefixed
  // with the invariant kind at line start.
  new RegExp(`^(${ORACLE_INVARIANT_KINDS.join("|")}):`, "m"),
];

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
  if (FATAL_SIGNATURES.some((re) => re.test(fullOutput))) return "fatal";
  if (ENVIRONMENTAL_SIGNATURES.some((re) => re.test(fullOutput))) return "inconclusive";
  // Unrecognized (Vite build error, OOM kill, Chromium segfault, …) → fatal.
  return "fatal";
}
