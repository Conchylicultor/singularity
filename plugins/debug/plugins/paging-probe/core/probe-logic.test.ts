import { describe, expect, test } from "bun:test";
import {
  expectedTickAt,
  lateByMs,
  parseProbeArgs,
  pickTouchSlice,
  PROBE_VARIANTS,
  TICK_MS,
} from "./probe-logic";

const OUT = "/tmp/paging-probe-lean.jsonl";

function argv(variant: string, out = OUT): string[] {
  return [
    variant,
    "--fat-size-mb",
    "400",
    "--touch-slice-mb",
    "25",
    "--gc-each-minute",
    "1",
    "--boost-qos",
    "0",
    "--out",
    out,
  ];
}

describe("parseProbeArgs", () => {
  test("parses a full valid argv", () => {
    expect(parseProbeArgs(argv("fat-touch"))).toEqual({
      variant: "fat-touch",
      fatSizeMb: 400,
      touchSliceMb: 25,
      gcEachMinute: true,
      boostQos: false,
      outPath: OUT,
    });
  });

  test("accepts every known variant", () => {
    for (const v of PROBE_VARIANTS) {
      expect(parseProbeArgs(argv(v)).variant).toBe(v);
    }
  });

  test("rejects an unknown variant", () => {
    expect(() => parseProbeArgs(argv("fat-warm"))).toThrow(/unknown or missing probe variant/);
  });

  test("rejects a missing variant", () => {
    expect(() => parseProbeArgs([])).toThrow(/unknown or missing probe variant/);
  });

  test("rejects a missing --out", () => {
    expect(() =>
      parseProbeArgs(["lean", "--fat-size-mb", "400", "--touch-slice-mb", "25", "--gc-each-minute", "1", "--boost-qos", "0"]),
    ).toThrow(/--out/);
  });

  test("rejects an unknown flag", () => {
    expect(() => parseProbeArgs(["lean", "--bogus", "1", "--out", OUT])).toThrow(/unknown flag/);
  });

  test("rejects a non-integer size", () => {
    expect(() =>
      parseProbeArgs(["lean", "--fat-size-mb", "4.5", "--touch-slice-mb", "25", "--gc-each-minute", "1", "--boost-qos", "0", "--out", OUT]),
    ).toThrow(/non-negative integer/);
  });

  test("rejects a non-boolean flag value", () => {
    expect(() =>
      parseProbeArgs(["lean", "--fat-size-mb", "400", "--touch-slice-mb", "25", "--gc-each-minute", "yes", "--boost-qos", "0", "--out", OUT]),
    ).toThrow(/must be 0 or 1/);
  });

  test("rejects a flag missing its value", () => {
    expect(() => parseProbeArgs(["lean", "--out"])).toThrow(/missing its value/);
  });
});

describe("expectedTickAt / lateByMs — drift-free arithmetic", () => {
  const FIRST = 1_000_000;

  test("expected time advances by exactly TICK_MS per tick from the anchor", () => {
    expect(expectedTickAt(FIRST, 0)).toBe(FIRST);
    expect(expectedTickAt(FIRST, 1)).toBe(FIRST + TICK_MS);
    expect(expectedTickAt(FIRST, 5)).toBe(FIRST + 5 * TICK_MS);
  });

  test("a single slow tick does not smear the schedule forward", () => {
    // Tick 3 fires 3 s late, but tick 4's expected time is still anchored to
    // FIRST + 4*TICK_MS — the lateness of one tick is not absorbed into the next.
    const late = lateByMs(FIRST + 3 * TICK_MS + 3_000, FIRST, 3);
    expect(late).toBe(3_000);
    const onTimeNext = lateByMs(FIRST + 4 * TICK_MS, FIRST, 4);
    expect(onTimeNext).toBe(0);
  });

  test("an early tick clamps to 0", () => {
    expect(lateByMs(FIRST + 2 * TICK_MS - 500, FIRST, 2)).toBe(0);
  });
});

describe("pickTouchSlice", () => {
  test("picks a contiguous run of the requested size with an injected rand", () => {
    expect(pickTouchSlice(400, 25, () => 0)).toEqual({ startChunk: 0, endChunk: 25 });
    // rand=0.5 -> floor(0.5 * (400-25+1)) = floor(188) = 188
    expect(pickTouchSlice(400, 25, () => 0.5)).toEqual({ startChunk: 188, endChunk: 213 });
  });

  test("never runs off the end even at rand -> 1", () => {
    const slice = pickTouchSlice(400, 25, () => 0.999999);
    expect(slice.endChunk).toBeLessThanOrEqual(400);
    expect(slice.endChunk - slice.startChunk).toBe(25);
  });

  test("a slice as large as the heap touches all of it", () => {
    expect(pickTouchSlice(10, 25, () => 0.7)).toEqual({ startChunk: 0, endChunk: 10 });
  });

  test("an empty heap yields an empty run", () => {
    expect(pickTouchSlice(0, 25)).toEqual({ startChunk: 0, endChunk: 0 });
  });
});
