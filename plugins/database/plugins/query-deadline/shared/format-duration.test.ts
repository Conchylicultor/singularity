import { describe, expect, test } from "bun:test";
import { formatDurationMs } from "./format-duration";

describe("formatDurationMs", () => {
  test("seconds up to two minutes, so the default deadline reads as 60s", () => {
    expect(formatDurationMs(0)).toBe("0s");
    expect(formatDurationMs(60_004)).toBe("60s");
    expect(formatDurationMs(119_000)).toBe("119s");
  });

  test("whole minutes, then hours", () => {
    expect(formatDurationMs(120_000)).toBe("2 min");
    expect(formatDurationMs(900_000)).toBe("15 min");
    expect(formatDurationMs(2 * 3_600_000 + 5 * 60_000)).toBe("2h 05m");
  });
});
