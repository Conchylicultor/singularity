import { describe, expect, test } from "bun:test";
import { sourceState } from "./source-state";

// The precedence itself is what is worth pinning: each test switches ON one
// higher-ranked fact over a lower one that says something different, so a
// re-ordering of the three arms fails here rather than in the UI.

describe("sourceState", () => {
  test("a disabled source is `disabled`, whatever its last run said", () => {
    // The row a user switched off after it kept failing: `Failed` would be
    // asking for attention they already gave.
    expect(
      sourceState({
        enabled: false,
        status: "idle",
        lastOutcome: "failed",
        lastEventCount: null,
      }),
    ).toBe("disabled");
  });

  test("disabled beats a run in flight", () => {
    expect(
      sourceState({
        enabled: false,
        status: "running",
        lastOutcome: "extracted",
        lastEventCount: 12,
      }),
    ).toBe("disabled");
  });

  test("a run in flight beats the last extraction's verdict", () => {
    expect(
      sourceState({
        enabled: true,
        status: "running",
        lastOutcome: "failed",
        lastEventCount: null,
      }),
    ).toBe("running");
  });

  test("otherwise it is the extraction status", () => {
    expect(
      sourceState({
        enabled: true,
        status: "idle",
        lastOutcome: "extracted",
        lastEventCount: 12,
      }),
    ).toBe("ok");
    expect(
      sourceState({
        enabled: true,
        status: "idle",
        lastOutcome: "extracted",
        lastEventCount: 0,
      }),
    ).toBe("empty");
    expect(
      sourceState({
        enabled: true,
        status: "idle",
        lastOutcome: null,
        lastEventCount: null,
      }),
    ).toBe("never");
  });

  test("`status: error` is never painted — the extraction verdict answers instead", () => {
    // A terminal failure always writes a failed run too, so `failed` is never
    // less informative than `error`, and a transient failure leaves
    // `status: idle` where only the extraction status tells the truth.
    expect(
      sourceState({
        enabled: true,
        status: "error",
        lastOutcome: "failed",
        lastEventCount: null,
      }),
    ).toBe("failed");
  });
});
