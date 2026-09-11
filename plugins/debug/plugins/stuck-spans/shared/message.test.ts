import { describe, expect, test } from "bun:test";
import { describeChain, formatAge, stuckSpanMessage } from "./message";

describe("formatAge", () => {
  test("seconds, minutes, hours", () => {
    expect(formatAge(45_000)).toBe("45 s");
    expect(formatAge(60_000)).toBe("1 min");
    expect(formatAge(187_000)).toBe("3 min");
    expect(formatAge(3_600_000)).toBe("1 h");
    expect(formatAge(4_200_000)).toBe("1 h 10 min");
  });
});

describe("stuckSpanMessage", () => {
  test("names the chain outermost first, ending at the stuck span", () => {
    expect(
      stuckSpanMessage({
        kind: "push",
        label: "conversations-gone-stats",
        ageMs: 187_000,
        ancestors: [
          { id: 10703, kind: "flush", label: "flushNotifies", ageMs: 187_010 },
        ],
      }),
    ).toBe(
      "An operation has been running for 3 min and has not finished: " +
        "flush flushNotifies → push conversations-gone-stats",
    );
  });

  test("a top-level span is its own chain", () => {
    expect(
      describeChain({ kind: "http", label: "GET /api/x", ancestors: [] }),
    ).toBe("http GET /api/x");
  });
});
