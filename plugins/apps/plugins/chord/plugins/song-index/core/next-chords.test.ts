import { describe, expect, it } from "bun:test";
import {
  NextChordCountSchema,
  bestModeWindows,
  windowsInModes,
  type NextChordCount,
} from "./next-chords";
import { chordTokenFromParts } from "./token";

const vi = chordTokenFromParts({ root: 9, intervals: [3, 4], inversion: 0 });

const count = (byMode: NextChordCount["byMode"]): NextChordCount =>
  NextChordCountSchema.parse({ token: vi, byMode });

describe("NextChordCountSchema", () => {
  it("keeps only the modes that have windows", () => {
    expect(count({ major: 12 }).byMode.minor).toBeUndefined();
  });

  it("refuses a mode the build does not know", () => {
    const parsed = NextChordCountSchema.safeParse({
      token: vi,
      byMode: { major: 3, aeolian: 2 },
    });
    expect(parsed.success).toBe(false);
  });
});

describe("windowsInModes", () => {
  it("sums the modes the caller plays", () => {
    const row = count({ major: 12, minor: 5, dorian: 2 });
    expect(windowsInModes(row, ["major"])).toBe(12);
    expect(windowsInModes(row, ["major", "minor"])).toBe(17);
    // A mode with no window is 0, which is what it really adds there.
    expect(windowsInModes(row, ["lydian"])).toBe(0);
  });

  it("throws when asked to sum no mode at all", () => {
    // 0 for every chord is a ranking that never fails and never moves: a
    // caller that lost its mode list must hear about it.
    expect(() => windowsInModes(count({ major: 12 }), [])).toThrow(
      /at least one mode/,
    );
  });
});

describe("bestModeWindows", () => {
  it("is the largest single mode, which is how the rows are ranked", () => {
    expect(bestModeWindows(count({ major: 3, minor: 9 }))).toBe(9);
  });
});
