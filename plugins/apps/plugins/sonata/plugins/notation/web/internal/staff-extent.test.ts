import { describe, expect, test } from "bun:test";
import type { EngMeasure, EngStaff, EngTickable, StemDir } from "./convert";
import { keyLine, measureStaffExtents } from "./staff-extent";

function chord(keys: string[]): EngTickable {
  return {
    beat: 0,
    keys,
    duration: "w",
    dots: 0,
    beats: 4,
    isRest: false,
    tieToNext: false,
    alters: keys.map(() => 0),
  };
}

function staff(
  clef: EngStaff["clef"],
  keys: string[],
  stem: StemDir = "auto",
): EngStaff {
  return { clef, partId: "p", voices: [{ tickables: [chord(keys)], stem }] };
}

function measure(staves: EngStaff[], chordSymbol?: string): EngMeasure {
  return {
    index: 0,
    startBeat: 0,
    timeSig: { numerator: 4, denominator: 4 },
    keyName: "C",
    keyChanged: false,
    staves,
    chordSymbol,
  };
}

describe("keyLine", () => {
  test("outer lines of each clef", () => {
    expect(keyLine("e/4", "treble")).toBe(1);
    expect(keyLine("f/5", "treble")).toBe(5);
    expect(keyLine("g/2", "bass")).toBe(1);
    expect(keyLine("a/3", "bass")).toBe(5);
  });

  test("accidentals do not move the line; middle C is one ledger below treble", () => {
    expect(keyLine("c#/4", "treble")).toBe(keyLine("c/4", "treble"));
    expect(keyLine("c/4", "treble")).toBe(0);
  });
});

describe("measureStaffExtents", () => {
  test("a note high above the treble staff reaches above the staff lines", () => {
    const [plain] = measureStaffExtents(measure([staff("treble", ["b/4"])]));
    const [high] = measureStaffExtents(measure([staff("treble", ["c/7"])]));
    // c/7 sits five ledger lines up: its head is well above the top line (y=40).
    expect(high!.top).toBeLessThan(plain!.top);
    expect(high!.top).toBeLessThan(0);
  });

  test("a stem-down note below the bass staff reaches below it", () => {
    const [low] = measureStaffExtents(
      measure([staff("bass", ["c/2"], "down")]),
    );
    // Bottom line at y=80; c/2 is 1.5 spaces below it, its stem 3.5 more.
    expect(low!.bottom).toBeGreaterThan(80 + 15 + 35);
  });

  test("a chord symbol adds room above the top staff only", () => {
    const staves = [staff("treble", ["b/4"]), staff("bass", ["d/3"])];
    const [top0, bottom0] = measureStaffExtents(measure(staves));
    const [top1, bottom1] = measureStaffExtents(measure(staves, "C"));
    expect(top1!.top).toBeLessThan(top0!.top);
    expect(bottom1).toEqual(bottom0);
  });
});
