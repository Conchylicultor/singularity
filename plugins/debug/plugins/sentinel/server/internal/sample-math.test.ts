import { describe, expect, test } from "bun:test";
import { countBuildProcesses, counterDelta, mapPgStatsRow } from "./sample-math";

describe("mapPgStatsRow", () => {
  test("coerces pg numerics (strings) and defaults nulls", () => {
    expect(
      mapPgStatsRow({
        locks_waiting: "3",
        blk_read_time: "1234.5",
        xact_commit: 42,
        wait_events: { IO: 4, LWLock: 1 },
        active_backends: "7",
        total_backends: 31,
      }),
    ).toEqual({
      locksWaiting: 3,
      blkReadTimeMs: 1234.5,
      xactCommit: 42,
      waitEvents: { IO: 4, LWLock: 1 },
      activeBackends: 7,
      totalBackends: 31,
    });
    expect(
      mapPgStatsRow({
        locks_waiting: null,
        blk_read_time: null,
        xact_commit: null,
        wait_events: null,
        active_backends: null,
        total_backends: null,
      }),
    ).toEqual({
      locksWaiting: 0,
      blkReadTimeMs: 0,
      xactCommit: 0,
      waitEvents: {},
      activeBackends: 0,
      totalBackends: 0,
    });
  });
});

describe("counterDelta", () => {
  test("null baseline → null (first tick)", () => {
    expect(counterDelta(null, 100)).toBeNull();
  });
  test("normal advance", () => {
    expect(counterDelta(100, 250)).toBe(150);
  });
  test("counter reset (pg restart) → null, not a bogus negative spike", () => {
    expect(counterDelta(500, 20)).toBeNull();
  });
});

describe("countBuildProcesses", () => {
  test("counts CLI build/check/push invocations, ignores noise", () => {
    const ps = [
      "/bin/zsh ./singularity build",
      "bun /repo/singularity check type-check",
      "singularity push -m msg",
      "vim singularity-notes.md", // not a CLI invocation
      "vite serve dev/singularity/web", // path mention only, no CLI verb after the name
      "grep singularity build.log", // 'singularity' is a grep arg... matches shape
    ].join("\n");
    // The grep line legitimately matches the loose shape — the count is a
    // pressure gauge, not an exact census; one-off false positives are noise
    // the detector's dwell absorbs.
    expect(countBuildProcesses(ps)).toBe(4);
  });
  test("empty output → 0", () => {
    expect(countBuildProcesses("")).toBe(0);
  });
});
