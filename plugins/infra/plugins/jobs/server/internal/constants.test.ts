import { describe, expect, test } from "bun:test";
import {
  DEFAULT_WAIT_TIMEOUT_MS,
  MAX_WAIT_TIMEOUT_MS,
  resolveWaitTimeoutMs,
} from "./constants";

describe("resolveWaitTimeoutMs", () => {
  test("omitted timeout falls back to the default (never forever)", () => {
    expect(resolveWaitTimeoutMs(undefined, undefined)).toBe(
      DEFAULT_WAIT_TIMEOUT_MS,
    );
  });

  test("unbounded opt-out returns null (no racer armed)", () => {
    expect(resolveWaitTimeoutMs(undefined, true)).toBeNull();
    // unbounded wins even when a timeout is also supplied.
    expect(resolveWaitTimeoutMs(5000, true)).toBeNull();
  });

  test("an explicit value under the ceiling is passed through", () => {
    expect(resolveWaitTimeoutMs(60_000, undefined)).toBe(60_000);
  });

  test("an explicit value over the ceiling is clamped to the max", () => {
    expect(resolveWaitTimeoutMs(MAX_WAIT_TIMEOUT_MS * 10, undefined)).toBe(
      MAX_WAIT_TIMEOUT_MS,
    );
  });

  test("zero and negative values clamp up to 1ms (loud, not forever)", () => {
    expect(resolveWaitTimeoutMs(0, undefined)).toBe(1);
    expect(resolveWaitTimeoutMs(-1000, undefined)).toBe(1);
  });

  test("the default sits comfortably under the ceiling", () => {
    expect(DEFAULT_WAIT_TIMEOUT_MS).toBeLessThan(MAX_WAIT_TIMEOUT_MS);
  });
});
