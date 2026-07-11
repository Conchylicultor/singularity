import { describe, expect, test } from "bun:test";
import type { TimelineEvent } from "../../core";
import {
  buildBands,
  duressBands,
  incidentInputs,
  intervalEvents,
  MAX_INCIDENT_MEMBER_SPAN_MS,
  type IncidentInfoLike,
} from "./bands";
import type { TimelineWindow } from "./view-model";

const range: TimelineWindow = { fromMs: 0, toMs: 100_000 };

function ev(startMs: number, endMs: number, id = `${startMs}-${endMs}`): TimelineEvent {
  return {
    id,
    source: "trace",
    worktree: "wt-a",
    startMs,
    endMs,
    label: "op",
    severity: "info",
    detail: {},
  };
}

describe("intervalEvents", () => {
  test("drops point events", () => {
    expect(intervalEvents([ev(1, 1), ev(1, 2)])).toHaveLength(1);
  });

  test("drops intervals wider than the incident-member cap (aggregate-window traces)", () => {
    const wide = ev(0, MAX_INCIDENT_MEMBER_SPAN_MS + 1);
    const atCap = ev(0, MAX_INCIDENT_MEMBER_SPAN_MS);
    expect(intervalEvents([wide, atCap])).toEqual([atCap]);
  });

  test("drops duress episodes — they band on their own, never chain incidents", () => {
    const episode: TimelineEvent = { ...ev(1_000, 20_000), source: "duress" };
    expect(intervalEvents([episode, ev(1, 2)])).toHaveLength(1);
  });
});

describe("duressBands", () => {
  const episode = (
    startMs: number,
    endMs: number,
    detail: Record<string, unknown> = {},
  ): TimelineEvent => ({
    id: `duress:${startMs}`,
    source: "duress",
    worktree: "host",
    startMs,
    endMs,
    label: "duress: decompressions",
    severity: "warning",
    detail,
  });

  test("one clipped band per episode, carrying the open/endUnknown flags", () => {
    const bands = duressBands(
      [
        episode(-5_000, 20_000, { clearedAtMs: 20_000 }),
        episode(80_000, 100_000, { open: true, endUnknown: false }),
      ],
      range,
    );
    expect(bands).toEqual([
      {
        id: "duress:-5000",
        startMs: 0,
        endMs: 20_000,
        label: "duress: decompressions",
        open: false,
        endUnknown: false,
      },
      {
        id: "duress:80000",
        startMs: 80_000,
        endMs: 100_000,
        label: "duress: decompressions",
        open: true,
        endUnknown: false,
      },
    ]);
  });

  test("ignores non-duress events and fully-clipped episodes", () => {
    expect(duressBands([ev(1_000, 2_000), episode(-20_000, -10_000)], range)).toEqual([]);
  });
});

describe("incidentInputs", () => {
  test("maps an interval to (end wallTime, span) keyed by index", () => {
    const inputs = incidentInputs([ev(10_000, 25_000)]);
    expect(inputs).toEqual([
      {
        id: "0",
        wallTime: new Date(25_000).toISOString(),
        windowSpanMs: 15_000,
      },
    ]);
  });

  test("index ids stay collision-free for duplicate source ids", () => {
    const inputs = incidentInputs([ev(1, 2, "dup"), ev(3, 4, "dup")]);
    expect(new Set(inputs.map((i) => i.id)).size).toBe(2);
  });
});

describe("buildBands", () => {
  test("one band per multi-event incident, spanning the union extent", () => {
    const events = [ev(10_000, 20_000), ev(15_000, 40_000), ev(70_000, 80_000)];
    const infoById = new Map<string, IncidentInfoLike>([
      ["0", { incidentId: 0, size: 2, colorIndex: 0 }],
      ["1", { incidentId: 0, size: 2, colorIndex: 0 }],
      ["2", { incidentId: 1, size: 1, colorIndex: 1 }],
    ]);
    const bands = buildBands(events, infoById, range);
    expect(bands).toEqual([
      { incidentId: 0, colorIndex: 0, size: 2, startMs: 10_000, endMs: 40_000 },
    ]);
  });

  test("solo incidents (size 1) render no band", () => {
    const events = [ev(10_000, 20_000)];
    const infoById = new Map<string, IncidentInfoLike>([
      ["0", { incidentId: 0, size: 1, colorIndex: 0 }],
    ]);
    expect(buildBands(events, infoById, range)).toEqual([]);
  });

  test("bands clip to the window and sort by start", () => {
    const events = [ev(80_000, 120_000), ev(90_000, 110_000), ev(-5_000, 10_000), ev(2_000, 12_000)];
    const infoById = new Map<string, IncidentInfoLike>([
      ["0", { incidentId: 1, size: 2, colorIndex: 1 }],
      ["1", { incidentId: 1, size: 2, colorIndex: 1 }],
      ["2", { incidentId: 0, size: 2, colorIndex: 0 }],
      ["3", { incidentId: 0, size: 2, colorIndex: 0 }],
    ]);
    const bands = buildBands(events, infoById, range);
    expect(bands.map((b) => b.incidentId)).toEqual([0, 1]);
    expect(bands[0]).toMatchObject({ startMs: 0, endMs: 12_000 });
    expect(bands[1]).toMatchObject({ startMs: 80_000, endMs: 100_000 });
  });
});
