import { describe, expect, test } from "bun:test";
import type { TimelineEvent } from "../../core";
import type { TimelineChunk } from "../../shared/frames";
import {
  barColorClass,
  buildGroups,
  collectBarEvents,
  eventToBar,
  mergeHealth,
  okEvents,
  type TimelineWindow,
} from "./view-model";

const range: TimelineWindow = { fromMs: 10_000, toMs: 20_000 };

function ev(overrides: Partial<TimelineEvent>): TimelineEvent {
  return {
    id: "e1",
    source: "trace",
    worktree: "wt-a",
    startMs: 12_000,
    endMs: 13_000,
    label: "op",
    severity: "info",
    detail: {},
    ...overrides,
  };
}

function okChunk(
  worktree: string,
  source: TimelineEvent["source"],
  events: TimelineEvent[],
): TimelineChunk {
  return { source, worktree, ok: true, events };
}

describe("barColorClass", () => {
  test("severity overrides the source fill with semantic tokens", () => {
    expect(barColorClass(ev({ severity: "error" }))).toBe("bg-destructive");
    expect(barColorClass(ev({ severity: "warning" }))).toBe("bg-warning");
  });

  test("info bars keep per-source categorical identity", () => {
    expect(barColorClass(ev({ source: "trace" }))).not.toBe(
      barColorClass(ev({ source: "build" })),
    );
  });
});

describe("eventToBar", () => {
  test("maps to window-relative ms", () => {
    const bar = eventToBar(ev({ startMs: 12_000, endMs: 15_000 }), range, "b");
    expect(bar.startMs).toBe(2_000);
    expect(bar.durationMs).toBe(3_000);
    expect(bar.treatment).toBe("solid");
  });

  test("clips intervals straddling the window edges", () => {
    const bar = eventToBar(ev({ startMs: 5_000, endMs: 25_000 }), range, "b");
    expect(bar.startMs).toBe(0);
    expect(bar.durationMs).toBe(10_000);
  });

  test("point events map to zero duration (min-width floor paints them)", () => {
    const bar = eventToBar(ev({ startMs: 12_000, endMs: 12_000 }), range, "b");
    expect(bar.durationMs).toBe(0);
  });

  test("in-flight builds pulse", () => {
    const bar = eventToBar(ev({ detail: { inFlight: true } }), range, "b");
    expect(bar.treatment).toBe("pulse");
  });
});

describe("buildGroups", () => {
  test("groups by worktree, host excluded, sorted by event count then name", () => {
    const groups = buildGroups(
      [
        okChunk("wt-b", "trace", [ev({}), ev({ id: "e2" })]),
        okChunk("wt-a", "boot", [ev({})]),
        okChunk("wt-c", "report", [ev({})]),
      ],
      ["wt-a", "wt-d", "host"],
      range,
    );
    expect(groups.map((g) => g.worktree)).toEqual([
      "wt-b", // 2 events
      "wt-a", // 1 event, name < wt-c
      "wt-c",
      "wt-d", // health-only lane, zero events
    ]);
    expect(groups.find((g) => g.worktree === "wt-d")?.lanes).toEqual([]);
  });

  test("lanes follow the closed source order and bars sort by start", () => {
    const groups = buildGroups(
      [
        okChunk("wt-a", "build", [ev({})]),
        okChunk("wt-a", "trace", [
          ev({ id: "late", startMs: 15_000, endMs: 16_000 }),
          ev({ id: "early", startMs: 11_000, endMs: 12_000 }),
        ]),
      ],
      [],
      range,
    );
    const lanes = groups[0]!.lanes;
    expect(lanes.map((l) => l.source)).toEqual(["trace", "build"]);
    const traceBars = lanes[0]!.bars;
    expect(traceBars[0]!.startMs).toBeLessThan(traceBars[1]!.startMs);
  });

  test("error chunks become error rows, never lanes", () => {
    const groups = buildGroups(
      [{ source: "trace", worktree: "wt-a", ok: false, error: "timeout" }],
      [],
      range,
    );
    expect(groups[0]!.lanes).toEqual([]);
    expect(groups[0]!.errors).toEqual([{ source: "trace", error: "timeout" }]);
    expect(groups[0]!.eventCount).toBe(0);
  });

  test("events fully outside the window are dropped", () => {
    const groups = buildGroups(
      [okChunk("wt-a", "trace", [ev({ startMs: 1_000, endMs: 2_000 })])],
      [],
      range,
    );
    expect(groups).toEqual([]);
  });

  test("bar ids are unique across lanes and resolve back to their event", () => {
    const groups = buildGroups(
      [
        okChunk("wt-a", "trace", [ev({ id: "dup" })]),
        okChunk("wt-b", "trace", [ev({ id: "dup", worktree: "wt-b" })]),
      ],
      [],
      range,
    );
    const byId = collectBarEvents(groups);
    expect(byId.size).toBe(2);
    for (const group of groups) {
      for (const lane of group.lanes) {
        for (const bar of lane.bars) {
          expect(byId.get(bar.id)?.worktree).toBe(group.worktree);
        }
      }
    }
  });
});

describe("mergeHealth", () => {
  test("concatenates frames per lane and sorts by time", () => {
    const merged = mergeHealth([
      { worktree: "wt-a", samples: [{ atMs: 3 }, { atMs: 1 }] },
      { worktree: "wt-a", samples: [{ atMs: 2 }] },
      { worktree: "host", samples: [{ atMs: 5, loadAvg1: 1 }] },
    ]);
    expect(merged.get("wt-a")!.map((p) => p.atMs)).toEqual([1, 2, 3]);
    expect(merged.get("host")!).toHaveLength(1);
  });
});

describe("okEvents", () => {
  test("flattens ok chunks and skips error chunks", () => {
    const events = okEvents([
      okChunk("wt-a", "trace", [ev({})]),
      { source: "build", worktree: "wt-a", ok: false, error: "x" },
    ]);
    expect(events).toHaveLength(1);
  });
});
