import { describe, expect, test } from "bun:test";
import { formatDurationMs, formatLocal, formatLocalFull, tzName } from "./format";

// A fixed instant: 2026-07-17 13:44:54.123 UTC. Every assertion pins an
// explicit IANA zone so the test is deterministic regardless of host TZ.
const MS = Date.UTC(2026, 6, 17, 13, 44, 54, 123);

describe("formatLocal", () => {
  test("HH:MM:SS.mmm in the given zone", () => {
    expect(formatLocal(MS, "UTC")).toBe("13:44:54.123");
  });

  test("respects the zone offset (New York, EDT = UTC-4 in July)", () => {
    expect(formatLocal(MS, "America/New_York")).toBe("09:44:54.123");
  });

  test("pads sub-second to three digits", () => {
    expect(formatLocal(Date.UTC(2026, 0, 1, 0, 0, 0, 7), "UTC")).toBe("00:00:00.007");
  });

  test("truncates fractional ms (slow-op wall times are floats)", () => {
    expect(formatLocal(MS + 0.801513671875, "UTC")).toBe("13:44:54.123");
  });
});

describe("formatLocalFull", () => {
  test("YYYY-MM-DD HH:MM:SS in the given zone", () => {
    expect(formatLocalFull(MS, "UTC")).toBe("2026-07-17 13:44:54");
  });

  test("zone shift can cross the date boundary", () => {
    // 00:30 UTC on the 17th is still the 16th in New York.
    const ms = Date.UTC(2026, 6, 17, 0, 30, 0, 0);
    expect(formatLocalFull(ms, "America/New_York")).toBe("2026-07-16 20:30:00");
  });
});

describe("formatDurationMs", () => {
  test("sub-second → ms", () => {
    expect(formatDurationMs(840)).toBe("840ms");
    expect(formatDurationMs(0)).toBe("0ms");
  });

  test("seconds → one decimal", () => {
    expect(formatDurationMs(3200)).toBe("3.2s");
  });

  test("minutes → m + zero-padded s", () => {
    expect(formatDurationMs(60_000)).toBe("1m 00s");
    expect(formatDurationMs(694_000)).toBe("11m 34s");
  });
});

describe("tzName", () => {
  test("echoes an explicit zone", () => {
    expect(tzName("UTC")).toBe("UTC");
  });

  test("resolves to a non-empty host zone when omitted", () => {
    expect(tzName().length).toBeGreaterThan(0);
  });
});
