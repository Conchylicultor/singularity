import { describe, expect, test } from "bun:test";
import { detectWallJumpMs, SLEEP_JUMP_FACTOR } from "./wall-jump";

const CADENCE = 10_000;

describe("detectWallJumpMs", () => {
  test("an on-time tick is not a jump", () => {
    expect(detectWallJumpMs(10_000, 0, CADENCE)).toBeUndefined();
  });

  test("a merely-late tick (a wedged loop) is not a jump — the stall evidence survives", () => {
    expect(detectWallJumpMs(SLEEP_JUMP_FACTOR * CADENCE, 0, CADENCE)).toBeUndefined();
  });

  test("a gap beyond the factor is a jump carrying the true gap", () => {
    const gap = SLEEP_JUMP_FACTOR * CADENCE + 1;
    expect(detectWallJumpMs(gap, 0, CADENCE)).toBe(gap);
  });

  test("a multi-hour sleep reports the full gap", () => {
    expect(detectWallJumpMs(3_600_000, 0, CADENCE)).toBe(3_600_000);
  });
});
