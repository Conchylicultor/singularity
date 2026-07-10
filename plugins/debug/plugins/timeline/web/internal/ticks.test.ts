import { describe, expect, test } from "bun:test";
import { formatWallclock, pickTickStep, wallclockTicks } from "./ticks";

const MINUTE = 60_000;
const HOUR = 3_600_000;

describe("pickTickStep", () => {
  test("chooses the smallest nice step under the target count", () => {
    expect(pickTickStep(15 * MINUTE)).toBe(2 * MINUTE); // 7.5 ticks
    expect(pickTickStep(HOUR)).toBe(10 * MINUTE); // 6 ticks
    expect(pickTickStep(6 * HOUR)).toBe(HOUR); // 6 ticks
    expect(pickTickStep(24 * HOUR)).toBe(3 * HOUR); // 8 ticks
  });

  test("caps at the largest step for huge spans", () => {
    expect(pickTickStep(30 * 24 * HOUR)).toBe(12 * HOUR);
  });
});

describe("formatWallclock", () => {
  test("renders zero-padded HH:MM (and optional seconds)", () => {
    expect(formatWallclock(Date.now())).toMatch(/^\d{2}:\d{2}$/);
    expect(formatWallclock(Date.now(), { seconds: true })).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});

describe("wallclockTicks", () => {
  test("ticks are step-aligned to the epoch and window-relative", () => {
    // 12:00:30 → 13:00:30 UTC on day 0: hour span → 10m step, first tick 12:10.
    const fromMs = 12 * HOUR + 30_000;
    const ticks = wallclockTicks({ fromMs, toMs: fromMs + HOUR });
    expect(ticks.length).toBeGreaterThanOrEqual(5);
    expect(ticks.length).toBeLessThanOrEqual(8);
    const step = 10 * MINUTE;
    for (const tick of ticks) {
      expect((tick.relMs + fromMs) % step).toBe(0);
      expect(tick.relMs).toBeGreaterThanOrEqual(0);
      expect(tick.relMs).toBeLessThanOrEqual(HOUR);
      expect(tick.label).toMatch(/^\d{2}:\d{2}$/);
    }
    expect(ticks[0]!.relMs).toBe(step - 30_000);
  });
});
