import { describe, expect, test } from "bun:test";
import { planSegments } from "./segments";

const f = (inode: string, size: number) => ({ inode, size });

describe("planSegments", () => {
  test("first boot seeds the live file's tail, aligned to a line", () => {
    expect(planSegments(null, [f("A", 100)], 30)).toEqual({
      segments: [{ slot: 0, inode: "A", from: 70, to: 100, alignToLine: true }],
      gap: false,
    });
  });

  test("first boot on a small file reads it whole, unaligned", () => {
    expect(planSegments(null, [f("A", 10)], 30).segments).toEqual([
      { slot: 0, inode: "A", from: 0, to: 10, alignToLine: false },
    ]);
  });

  test("first boot with no file reads nothing", () => {
    expect(planSegments(null, [null, f("B", 5)])).toEqual({
      segments: [],
      gap: false,
    });
  });

  test("same inode: resume from the offset", () => {
    expect(planSegments({ inode: "A", offset: 40 }, [f("A", 100)])).toEqual({
      segments: [
        { slot: 0, inode: "A", from: 40, to: 100, alignToLine: false },
      ],
      gap: false,
    });
  });

  test("rotated once: finish the old file in .1, then the new live file from 0", () => {
    const plan = planSegments({ inode: "A", offset: 40 }, [
      f("B", 7),
      f("A", 120),
    ]);
    expect(plan).toEqual({
      segments: [
        { slot: 1, inode: "A", from: 40, to: 120, alignToLine: false },
        { slot: 0, inode: "B", from: 0, to: 7, alignToLine: false },
      ],
      gap: false,
    });
  });

  test("rotated twice: .2 rest, then .1 whole, then live whole", () => {
    const plan = planSegments({ inode: "A", offset: 5 }, [
      f("C", 1),
      f("B", 2),
      f("A", 9),
    ]);
    expect(plan.segments.map((s) => [s.slot, s.from, s.to])).toEqual([
      [2, 5, 9],
      [1, 0, 2],
      [0, 0, 1],
    ]);
    expect(plan.gap).toBe(false);
  });

  test("a file seen under two names (renamed mid-snapshot) is read once", () => {
    // live opened as B, then B rotated to .1 before .1 was opened.
    const plan = planSegments({ inode: "A", offset: 3 }, [
      f("B", 4),
      f("B", 4),
      f("A", 8),
    ]);
    expect(plan.segments.map((s) => [s.slot, s.inode])).toEqual([
      [2, "A"],
      [0, "B"],
    ]);
  });

  test("cursor file rotated out entirely: gap, seed the live tail", () => {
    const plan = planSegments(
      { inode: "Z", offset: 10 },
      [f("C", 100), f("B", 50), f("A", 50), null],
      30,
    );
    expect(plan).toEqual({
      segments: [{ slot: 0, inode: "C", from: 70, to: 100, alignToLine: true }],
      gap: true,
    });
  });

  test("truncated in place: gap, re-read the file from 0", () => {
    expect(planSegments({ inode: "A", offset: 80 }, [f("A", 20)])).toEqual({
      segments: [{ slot: 0, inode: "A", from: 0, to: 20, alignToLine: false }],
      gap: true,
    });
  });

  test("live file missing mid-rotation: finish what the cursor's file holds", () => {
    const plan = planSegments({ inode: "A", offset: 4 }, [null, f("A", 9)]);
    expect(plan.segments).toEqual([
      { slot: 1, inode: "A", from: 4, to: 9, alignToLine: false },
    ]);
  });
});
