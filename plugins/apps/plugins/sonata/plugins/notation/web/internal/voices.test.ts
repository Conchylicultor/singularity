import { describe, expect, test } from "bun:test";
import { partitionVoices, type NoteLike } from "./voices";

let nextId = 0;
function n(pitch: number, start: number, end: number, voice?: number): NoteLike {
  return { id: `n${nextId++}`, pitch, start, end, voice };
}

function means(groups: { notes: NoteLike[] }[]): number[] {
  return groups.map(
    (g) => g.notes.reduce((s, x) => s + x.pitch, 0) / g.notes.length,
  );
}

describe("partitionVoices", () => {
  test("held note under a moving line → 2 voices, held note is one sustained unit", () => {
    // A whole-bar held C4 under a stepwise-descending upper line.
    const notes: NoteLike[] = [
      n(60, 0, 4), // held
      n(67, 0, 1),
      n(65, 1, 2),
      n(64, 2, 3),
      n(62, 3, 4),
    ];
    const groups = partitionVoices(notes, { maxVoicesPerStaff: 2 });
    expect(groups.length).toBe(2);
    // Voice 0 (upper) is the moving line; voice 1 is the single held note.
    expect(groups[0]!.notes.length).toBe(4);
    expect(groups[1]!.notes.length).toBe(1);
    expect(groups[1]!.notes[0]!.pitch).toBe(60);
    // Descending mean pitch ordering.
    const m = means(groups);
    expect(m[0]!).toBeGreaterThan(m[1]!);
  });

  test("a block chord (same start+end) collapses to one voice / one unit", () => {
    const notes = [n(60, 0, 4), n(64, 0, 4), n(67, 0, 4)];
    const groups = partitionVoices(notes, { maxVoicesPerStaff: 2 });
    expect(groups.length).toBe(1);
    expect(groups[0]!.notes.length).toBe(3);
  });

  test("four staggered lines → ≤4 voices in descending-pitch order", () => {
    // Four genuinely independent lines, each a distinct span at the downbeat.
    const notes: NoteLike[] = [
      // Soprano: four quarters.
      n(72, 0, 1),
      n(72, 1, 2),
      n(72, 2, 3),
      n(72, 3, 4),
      // Alto: two halves.
      n(67, 0, 2),
      n(67, 2, 4),
      // Tenor: dotted-half + quarter.
      n(64, 0, 3),
      n(64, 3, 4),
      // Bass: a whole note.
      n(52, 0, 4),
    ];
    const groups = partitionVoices(notes, { maxVoicesPerStaff: 4 });
    expect(groups.length).toBe(4);
    const m = means(groups);
    for (let i = 1; i < m.length; i++) {
      expect(m[i - 1]!).toBeGreaterThan(m[i]!);
    }
  });

  test("the voice cap merges overflow lines", () => {
    // Same four lines, but capped at 2 → exactly 2 voices.
    const notes: NoteLike[] = [
      n(72, 0, 1),
      n(72, 1, 2),
      n(67, 0, 2),
      n(64, 0, 3),
      n(52, 0, 4),
    ];
    const groups = partitionVoices(notes, { maxVoicesPerStaff: 2 });
    expect(groups.length).toBe(2);
  });

  test("explicit Note.voice is honored verbatim", () => {
    // Two lines whose pitches overlap in range — only the explicit voice tag
    // separates them; inference would not produce this grouping.
    const notes: NoteLike[] = [
      n(60, 0, 1, 1),
      n(62, 1, 2, 1),
      n(72, 0, 2, 0),
    ];
    const groups = partitionVoices(notes, { maxVoicesPerStaff: 2 });
    expect(groups.length).toBe(2);
    // Ordered by descending mean pitch: voice 0 (pitch 72) is the upper group.
    expect(groups[0]!.notes.every((x) => x.voice === 0)).toBe(true);
    expect(groups[1]!.notes.every((x) => x.voice === 1)).toBe(true);
  });

  test("empty input yields no voices", () => {
    expect(partitionVoices([], { maxVoicesPerStaff: 2 })).toEqual([]);
  });
});
