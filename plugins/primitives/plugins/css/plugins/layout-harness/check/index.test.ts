import { describe, expect, test } from "bun:test";
import { classifyFailure, ORACLE_INVARIANT_KINDS } from "./classify";

// Pure unit tests over synthetic subprocess transcripts — no browser, no Vite,
// no spawn. This proves the fatal-vs-environmental split directly: an
// environmental timeout must be inconclusive (non-fatal, re-runs), a real
// geometry regression must stay fatal, and — the dangerous case — a fatal
// signature must WIN even when timeout wording is present as noise.

// Captured live from bun 1.3.x (see the plan's Step 0): the `beforeAll` cold
// path (Vite + Chromium) overruns as a HOOK timeout, worded differently from a
// per-test timeout.
const HOOK_TIMEOUT = `bun test v1.3.13

plugins/primitives/plugins/css/plugins/layout-harness/web/internal/layout-geometry.test.ts:
(fail) (unnamed) [120001ms]
  ^ a beforeEach/afterEach hook timed out for this test.

 0 pass
 1 fail`;

const TEST_TIMEOUT = `plugins/primitives/plugins/css/plugins/layout-harness/web/internal/layout-geometry.test.ts:
(fail) grid/uniform-cards > noOverlap [120000ms]
  ^ this test timed out after 120000ms.

 0 pass
 1 fail`;

const PLAYWRIGHT_TIMEOUT = `error: browserType.launch: Timeout 120000ms exceeded.
Call log:
  - <launching> /path/to/chromium --headless
 0 pass
 1 fail`;

// A REAL oracle violation with the word "timeout" injected elsewhere as noise —
// the fatal oracle signature MUST win over the environmental wording.
const ORACLE_FAILURE_WITH_TIMEOUT_NOISE = `some unrelated log mentioning a timeout here
plugins/.../layout-geometry.test.ts:
(fail) badge/long > noOverlap
error: noOverlap: at width 320px, slot "leading" (right=140.0) overlaps "content" (left=132.0) by 8.0px (ε=0.5)
 0 pass
 1 fail`;

const ASSERTION_FAILURE = `(fail) the fixture catalog is non-empty
error: expect(received).toBeGreaterThan(expected)
AssertionError: Expected 0 to be greater than 0
 0 pass
 1 fail`;

const FALSIFICATION_FAILURE = `(fail) badge > falsification(...)
error: falsification did not bite: applying {"kind":"swapLeafDisplay","value":"inline"} to "badge" left invariant noOverlap satisfied — the mutated construct should have violated it
 0 pass
 1 fail`;

const GARBAGE = `Segmentation fault (core dumped)
[some vite build error]
 0 pass`;

describe("classifyFailure", () => {
  test("bun beforeAll hook timeout → inconclusive", () => {
    expect(classifyFailure(HOOK_TIMEOUT)).toBe("inconclusive");
  });

  test("bun per-test timeout → inconclusive", () => {
    expect(classifyFailure(TEST_TIMEOUT)).toBe("inconclusive");
  });

  test("Playwright launch timeout → inconclusive", () => {
    expect(classifyFailure(PLAYWRIGHT_TIMEOUT)).toBe("inconclusive");
  });

  test("oracle violation wins over timeout noise → fatal", () => {
    expect(classifyFailure(ORACLE_FAILURE_WITH_TIMEOUT_NOISE)).toBe("fatal");
  });

  test("AssertionError → fatal", () => {
    expect(classifyFailure(ASSERTION_FAILURE)).toBe("fatal");
  });

  test("falsification did not bite → fatal", () => {
    expect(classifyFailure(FALSIFICATION_FAILURE)).toBe("fatal");
  });

  test("unrecognized garbage → fatal (ambiguous → fatal)", () => {
    expect(classifyFailure(GARBAGE)).toBe("fatal");
  });

  // Every oracle invariant kind, on its own, classifies fatal — guards the
  // FATAL signature list against drift from core/oracle.ts.
  test("every oracle invariant kind → fatal", () => {
    for (const kind of ORACLE_INVARIANT_KINDS) {
      expect(classifyFailure(`${kind}: at width 320px, slot "x" overlaps "y"`)).toBe("fatal");
    }
  });

  // Drift guard: the fatal invariant-kind allowlist must equal the set of
  // GeometryInvariant kinds the oracle emits (all kinds MINUS `falsification`,
  // which is matched by its own signature).
  test("invariant-kind allowlist matches oracle.ts's emitted kinds", () => {
    const emitted: string[] = [...ORACLE_INVARIANT_KINDS];
    expect(emitted.sort()).toEqual(
      [
        "noOverlap",
        "noClip",
        "leftPack",
        "rigidIntegrity",
        "pinnedRight",
        "neverTruncatesWhenRoomy",
        "truncationOnsetOrder",
      ].sort(),
    );
  });
});
