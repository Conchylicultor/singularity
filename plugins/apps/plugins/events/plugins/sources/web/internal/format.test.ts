import { describe, expect, test } from "bun:test";
import type { EventSourceRun } from "@plugins/apps/plugins/events/plugins/events-core/core";
import { describeRun, formatDuration } from "./format";

function run(patch: Partial<EventSourceRun>): EventSourceRun {
  return {
    id: "run-1",
    sourceId: "evs-1",
    startedAt: new Date("2026-08-03T10:00:00Z"),
    finishedAt: new Date("2026-08-03T10:00:03Z"),
    outcome: "extracted",
    eventsFound: 0,
    eventsCreated: 0,
    eventsUpdated: 0,
    eventsDisappeared: 0,
    fingerprint: null,
    durationMs: 3400,
    error: null,
    flags: [],
    ...patch,
  };
}

describe("describeRun", () => {
  test("spells out why an unchanged run did nothing", () => {
    const text = describeRun(run({ outcome: "unchanged", eventsFound: 0 }));
    expect(text).toContain("unchanged");
    expect(text).toContain("skipped");
  });

  test("counts only the non-zero terms of an extraction", () => {
    expect(
      describeRun(
        run({ outcome: "extracted", eventsFound: 12, eventsCreated: 3 }),
      ),
    ).toBe("12 found · 3 new");
  });

  test("reports all four terms when all moved", () => {
    expect(
      describeRun(
        run({
          outcome: "extracted",
          eventsFound: 12,
          eventsCreated: 3,
          eventsUpdated: 2,
          eventsDisappeared: 1,
        }),
      ),
    ).toBe("12 found · 3 new · 2 updated · 1 gone");
  });

  test("says 'no changes' rather than a bare count when nothing moved", () => {
    expect(describeRun(run({ outcome: "extracted", eventsFound: 12 }))).toBe(
      "12 found · no changes",
    );
  });

  test("surfaces a failed run's own error text", () => {
    expect(
      describeRun(run({ outcome: "failed", error: "HTTP 404 for /soirees" })),
    ).toBe("HTTP 404 for /soirees");
  });

  test("never renders an empty line for a failure with no error text", () => {
    expect(describeRun(run({ outcome: "failed", error: null })).length).
      toBeGreaterThan(0);
  });
});

describe("formatDuration", () => {
  test("null duration stays null (the run has not finished)", () => {
    expect(formatDuration(null)).toBeNull();
  });

  test("sub-second in milliseconds", () => {
    expect(formatDuration(340)).toBe("340 ms");
  });

  test("seconds to one decimal", () => {
    expect(formatDuration(3400)).toBe("3.4 s");
  });

  test("minutes and seconds past a minute", () => {
    expect(formatDuration(95_000)).toBe("1m 35s");
  });
});
