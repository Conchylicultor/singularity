import { describe, expect, it } from "bun:test";
import { formatRelativeTime } from "./relative-time";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// A date `ms` in the past, relative to the moment of the call.
const ago = (ms: number) => new Date(Date.now() - ms);

describe("formatRelativeTime", () => {
  it('defaults to the "ago" spelling', () => {
    expect(formatRelativeTime(ago(10 * SECOND))).toBe("just now");
    expect(formatRelativeTime(ago(11 * MINUTE))).toBe("11m ago");
    expect(formatRelativeTime(ago(3 * HOUR))).toBe("3h ago");
    expect(formatRelativeTime(ago(2 * DAY))).toBe("2d ago");
  });

  it('"ago" is the same as the default', () => {
    expect(formatRelativeTime(ago(11 * MINUTE), "ago")).toBe("11m ago");
  });

  it('"short" drops the suffix and says "now" under a minute', () => {
    expect(formatRelativeTime(ago(10 * SECOND), "short")).toBe("now");
    expect(formatRelativeTime(ago(11 * MINUTE), "short")).toBe("11m");
    expect(formatRelativeTime(ago(3 * HOUR), "short")).toBe("3h");
    expect(formatRelativeTime(ago(2 * DAY), "short")).toBe("2d");
  });

  it('"short" switches unit at the same boundaries', () => {
    expect(formatRelativeTime(ago(59 * SECOND), "short")).toBe("now");
    expect(formatRelativeTime(ago(60 * SECOND), "short")).toBe("1m");
    expect(formatRelativeTime(ago(59 * MINUTE), "short")).toBe("59m");
    expect(formatRelativeTime(ago(60 * MINUTE), "short")).toBe("1h");
    expect(formatRelativeTime(ago(23 * HOUR), "short")).toBe("23h");
    expect(formatRelativeTime(ago(24 * HOUR), "short")).toBe("1d");
  });
});
