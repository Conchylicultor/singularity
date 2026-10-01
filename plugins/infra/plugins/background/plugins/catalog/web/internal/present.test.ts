import { describe, expect, test } from "bun:test";
import { formatPeriod, triggerWords } from "./present";

describe("formatPeriod", () => {
  test("reads in the largest whole unit", () => {
    expect(formatPeriod(1_000)).toBe("second");
    expect(formatPeriod(10_000)).toBe("10 seconds");
    expect(formatPeriod(60_000)).toBe("minute");
    expect(formatPeriod(300_000)).toBe("5 minutes");
    expect(formatPeriod(3_600_000)).toBe("hour");
    expect(formatPeriod(1_500)).toBe("1500 ms");
  });

  test("an event trigger names its events when known", () => {
    expect(triggerWords({ kind: "event", names: ["a", "b"] })).toBe(
      "When a or b fires",
    );
    expect(triggerWords({ kind: "event", names: [] })).toBe(
      "When an event fires",
    );
    expect(triggerWords({ kind: "interval", everyMs: 5_000 })).toBe(
      "Every 5 seconds",
    );
    expect(triggerWords({ kind: "file-change" })).toBe(
      "When watched files change",
    );
  });
});
