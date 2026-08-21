import { describe, expect, test } from "bun:test";
import {
  FALSIFICATION_NOT_BITING_MARKER,
  FIXTURE_PAGE_ERROR_MARKER,
  GEOMETRY_VIOLATION_MARKER,
} from "../core/failure-markers";
import { classifyFailure } from "./classify";

// Pure unit tests over synthetic subprocess transcripts — no browser, no Vite,
// no spawn. This proves the fatal-vs-environmental split directly: an
// environmental timeout must be inconclusive (non-fatal, re-runs), a real
// geometry regression must stay fatal, and — the dangerous case — a fatal
// signature must WIN even when timeout wording is present as noise.
//
// Every fatal transcript below is built from the marker constant the suite
// actually throws with, so a fixture here cannot drift from the real output the
// way a re-spelled literal could.

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

// A REAL oracle violation, in the shape bun actually prints one: the thrown
// message arrives behind bun's own `error: ` prefix, under a `(fail) … > <kind>`
// name line.
const ORACLE_FAILURE = `bun test v1.3.13

plugins/.../layout-geometry.test.ts:
(fail) badge/long > noOverlap
error: ${GEOMETRY_VIOLATION_MARKER} noOverlap: at width 320px, slot "leading" (right=140.0) overlaps "content" (left=132.0) by 8.0px (ε=0.5)
      at <anonymous> (.../layout-geometry.test.ts:179:24)
 0 pass
 1 fail`;

// THE dangerous case, and the one the old line-anchored kind regex got wrong: a
// real violation and a real bun hook timeout in the SAME run. The violation must
// win. Under the old signature this classified `inconclusive` — a genuine
// geometry regression waved through as a flake, non-fatal and never cached, so
// re-run forever without anyone being told.
const ORACLE_FAILURE_WITH_REAL_TIMEOUT = `bun test v1.3.13

plugins/.../layout-geometry.test.ts:
(fail) badge/long > noOverlap
error: ${GEOMETRY_VIOLATION_MARKER} noOverlap: at width 320px, slot "leading" (right=140.0) overlaps "content" (left=132.0) by 8.0px (ε=0.5)
(fail) control-panel/region > railAlignment [120001ms]
  ^ a beforeEach/afterEach hook timed out for this test.

 0 pass
 2 fail`;

// The mirror image, and the reason the old signature was anchored in the first
// place: the ONLY invariant-kind mention is bun's own test-NAME line. Nothing
// was violated — a test that happens to be named after an invariant timed out.
// This must stay environmental, or every cold-start flake inside a fixture
// describe becomes a hard build failure.
const TIMEOUT_ON_A_TEST_NAMED_AFTER_AN_INVARIANT = `bun test v1.3.13

plugins/.../layout-geometry.test.ts:
(fail) badge/long > noOverlap [120001ms]
  ^ a beforeEach/afterEach hook timed out for this test.

 0 pass
 1 fail`;

const ASSERTION_FAILURE = `(fail) the fixture catalog is non-empty
error: expect(received).toBeGreaterThan(expected)
AssertionError: Expected 0 to be greater than 0
 0 pass
 1 fail`;

const FALSIFICATION_FAILURE = `(fail) badge > falsification(...)
error: ${FALSIFICATION_NOT_BITING_MARKER} applying {"kind":"swapLeafDisplay","value":"inline"} to "badge" left invariant noOverlap satisfied — the mutated construct should have violated it
 0 pass
 1 fail`;

// A crashed fixture. The suite drains the measurer's `pageerror` buffer and
// throws with the page-error marker.
const PAGE_ERROR_FAILURE = `(fail) adaptive-bar/inside-horizontal-strip > no page error while measuring this fixture
error: ${FIXTURE_PAGE_ERROR_MARKER} 1 uncaught error(s) escaped to the top of the measurer page while measuring "adaptive-bar/inside-horizontal-strip" across widths [720, 320].

Error: Minified React error #185
    at chunk-abc123.js:1:2345
 0 pass
 1 fail`;

// The dangerous case for THIS signature: a crashing fixture usually times out
// too (a render loop burns the settle budget), so the transcript carries both.
// The crash must win — waved through as environmental, the run would be
// non-fatal AND uncached, i.e. silently retried forever.
const PAGE_ERROR_WITH_TIMEOUT_NOISE = `(fail) adaptive-bar/rich-widgets > noOverlap [120000ms]
  ^ this test timed out after 120000ms.
error: ${FIXTURE_PAGE_ERROR_MARKER} 3 uncaught error(s) escaped to the top of the measurer page while it loaded.
 0 pass
 2 fail`;

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

  test("oracle violation → fatal", () => {
    expect(classifyFailure(ORACLE_FAILURE)).toBe("fatal");
  });

  test("oracle violation wins over a REAL co-occurring hook timeout → fatal", () => {
    expect(classifyFailure(ORACLE_FAILURE_WITH_REAL_TIMEOUT)).toBe("fatal");
  });

  test("a timeout on a test merely NAMED after an invariant → inconclusive", () => {
    expect(classifyFailure(TIMEOUT_ON_A_TEST_NAMED_AFTER_AN_INVARIANT)).toBe(
      "inconclusive",
    );
  });

  test("AssertionError → fatal", () => {
    expect(classifyFailure(ASSERTION_FAILURE)).toBe("fatal");
  });

  test("falsification did not bite → fatal", () => {
    expect(classifyFailure(FALSIFICATION_FAILURE)).toBe("fatal");
  });

  test("fixture page error → fatal", () => {
    expect(classifyFailure(PAGE_ERROR_FAILURE)).toBe("fatal");
  });

  test("fixture page error wins over timeout noise → fatal", () => {
    expect(classifyFailure(PAGE_ERROR_WITH_TIMEOUT_NOISE)).toBe("fatal");
  });

  test("unrecognized garbage → fatal (ambiguous → fatal)", () => {
    expect(classifyFailure(GARBAGE)).toBe("fatal");
  });
});
