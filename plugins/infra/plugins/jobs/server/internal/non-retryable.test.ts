import { describe, expect, test } from "bun:test";
import { NonRetryableError, isNonRetryableError } from "./non-retryable";

describe("isNonRetryableError", () => {
  test("detects a NonRetryableError instance", () => {
    expect(isNonRetryableError(new NonRetryableError("drift"))).toBe(true);
  });

  test("rejects a plain Error", () => {
    expect(isNonRetryableError(new Error("boom"))).toBe(false);
  });

  test("rejects non-error values", () => {
    expect(isNonRetryableError(null)).toBe(false);
    expect(isNonRetryableError(undefined)).toBe(false);
    expect(isNonRetryableError("string")).toBe(false);
    expect(isNonRetryableError({})).toBe(false);
  });

  test("detects via the global brand even across class identities", () => {
    // A separate object carrying the same Symbol.for brand is detected — this
    // is the property that makes detection survive module-identity differences
    // (HMR, worker pools, duplicate plugin copies).
    const brand = Symbol.for("@plugins/jobs:NonRetryableError");
    const impostor = { [brand]: true };
    expect(isNonRetryableError(impostor)).toBe(true);
  });

  test("preserves message and name", () => {
    const err = new NonRetryableError("event drift for job X");
    expect(err.message).toBe("event drift for job X");
    expect(err.name).toBe("NonRetryableError");
  });
});
