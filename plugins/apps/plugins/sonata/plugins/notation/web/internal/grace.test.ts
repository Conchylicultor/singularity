import { describe, expect, test } from "bun:test";
import type { Note } from "@plugins/apps/plugins/sonata/plugins/score/core";
import { extractGraces } from "./grace";

let nextId = 0;
function note(
  pitch: number,
  start: number,
  duration: number,
  track = "t0",
): Note {
  return {
    id: `n${nextId++}`,
    pitch,
    start,
    duration,
    velocity: 80,
    track,
  };
}

describe("extractGraces", () => {
  test("one grace attaches to its principal (as a slashed acciaccatura)", () => {
    const grace = note(66, 0, 0.05);
    const principal = note(60, 0.05, 1);
    const { mainNotes, graceByPrincipalId } = extractGraces([grace, principal]);
    // The grace is removed from the main stream.
    expect(mainNotes.map((n) => n.id)).toEqual([principal.id]);
    const graces = graceByPrincipalId.get(principal.id)!;
    expect(graces.length).toBe(1);
    expect(graces[0]!.pitch).toBe(66);
    expect(graces[0]!.slash).toBe(true);
  });

  test("two graces bind to one principal as a single unslashed group", () => {
    const g1 = note(65, 0.0, 0.05);
    const g2 = note(67, 0.06, 0.05);
    const principal = note(60, 0.12, 1);
    const { mainNotes, graceByPrincipalId } = extractGraces([g1, g2, principal]);
    expect(mainNotes.map((n) => n.id)).toEqual([principal.id]);
    const graces = graceByPrincipalId.get(principal.id)!;
    // Ordered by start; a multi-grace group is NOT slashed.
    expect(graces.map((g) => g.pitch)).toEqual([65, 67]);
    expect(graces.every((g) => !g.slash)).toBe(true);
  });

  test("a lone short note with no following principal stays a main note", () => {
    // Short, but the only other note starts too far away to be its principal.
    const stray = note(72, 0, 0.05);
    const far = note(60, 1, 1);
    const { mainNotes, graceByPrincipalId } = extractGraces([stray, far]);
    expect(mainNotes.map((n) => n.id).sort()).toEqual([far.id, stray.id].sort());
    expect(graceByPrincipalId.size).toBe(0);
  });

  test("two adjacent short notes don't claim each other as principals", () => {
    // Neither is long enough to be a principal → both kept, none extracted.
    const a = note(64, 0, 0.05);
    const b = note(66, 0.05, 0.05);
    const { mainNotes, graceByPrincipalId } = extractGraces([a, b]);
    expect(mainNotes.length).toBe(2);
    expect(graceByPrincipalId.size).toBe(0);
  });

  test("a metric 32nd (a full 0.125 before a longer note) is NOT a grace", () => {
    // The last note of a 32nd run: short, and followed by a longer note — but a
    // whole 32nd (0.125 beat) away, not squeezed against it. Must stay a real note.
    const thirtySecond = note(84, 0.875, 0.125);
    const principal = note(79, 1.0, 1);
    const { mainNotes, graceByPrincipalId } = extractGraces([thirtySecond, principal]);
    expect(mainNotes.length).toBe(2);
    expect(graceByPrincipalId.size).toBe(0);
  });

  test("a normal note is untouched", () => {
    const n = note(60, 0, 1);
    const { mainNotes, graceByPrincipalId } = extractGraces([n]);
    expect(mainNotes).toEqual([n]);
    expect(graceByPrincipalId.size).toBe(0);
  });

  test("a grace only binds to a same-track principal", () => {
    const grace = note(66, 0, 0.05, "t0");
    const other = note(60, 0.05, 1, "t1"); // different track → not its principal.
    const { mainNotes, graceByPrincipalId } = extractGraces([grace, other]);
    // No same-track principal → the short note is kept.
    expect(mainNotes.length).toBe(2);
    expect(graceByPrincipalId.size).toBe(0);
  });
});
