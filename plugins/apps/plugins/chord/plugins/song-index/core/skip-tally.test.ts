import { describe, expect, it } from "bun:test";
import {
  SKIP_EXAMPLES_PER_REASON,
  SkipSummarySchema,
  SkipTally,
} from "./skip-tally";

describe("SkipTally", () => {
  it("counts every skip but keeps a bounded number of examples", () => {
    const tally = new SkipTally();
    for (let i = 0; i < SKIP_EXAMPLES_PER_REASON + 5; i++) {
      tally.add("no-chords", `id${i}`, "none sounding");
    }
    tally.add("no-document", "x", "json is null");
    const summary = tally.summary();
    const byReason = (reason: string) =>
      summary.find((entry) => entry.reason === reason);
    expect(byReason("no-chords")?.count).toBe(SKIP_EXAMPLES_PER_REASON + 5);
    expect(byReason("no-chords")?.examples).toHaveLength(
      SKIP_EXAMPLES_PER_REASON,
    );
    expect(byReason("no-document")).toEqual({
      reason: "no-document",
      count: 1,
      examples: [{ id: "x", detail: "json is null" }],
    });
    expect(tally.total).toBe(SKIP_EXAMPLES_PER_REASON + 6);
    expect(SkipSummarySchema.parse(summary)).toEqual(summary);
  });

  it("orders reasons by count", () => {
    const tally = new SkipTally();
    tally.add("rare", "a", "");
    tally.add("common", "b", "");
    tally.add("common", "c", "");
    expect(tally.summary().map((entry) => entry.reason)).toEqual([
      "common",
      "rare",
    ]);
  });

  /**
   * The reason the summary is an array: a jsonb OBJECT's keys come back in
   * Postgres's own order, not the order they were written in, so the ranking
   * would be lost on the round trip. Only the shape can carry the promise, so
   * the shape is what is asserted here; `find-db.test.ts` runs the same summary
   * through a real jsonb column and reads the order back out.
   */
  it("is a list, which is what lets the order be stored", () => {
    const tally = new SkipTally();
    tally.add("zzz-rare", "a", "");
    for (let i = 0; i < 3; i++) tally.add("aaa-common", `b${i}`, "");
    const summary = tally.summary();
    expect(Array.isArray(summary)).toBe(true);
    expect(summary.map((entry) => entry.reason)).toEqual([
      "aaa-common",
      "zzz-rare",
    ]);
  });

  it("summarizes nothing as an empty list", () => {
    expect(new SkipTally().summary()).toEqual([]);
  });
});
