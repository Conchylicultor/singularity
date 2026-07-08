import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  setErrorReporter,
  type ServerErrorReport,
} from "@plugins/framework/plugins/server-core/core";
import type { TripContext } from "../../core";
import type { TraceEventClassSpec } from "./registry";
import { captureAtTripPhase, assembleEvents } from "./capture";

// Capture the loud server-error reports the engine files on a bad section, so
// "isolated but loud" is asserted, not assumed. setErrorReporter is global —
// save/restore around each test.
let reports: ServerErrorReport[] = [];
let prevReporter: ((r: ServerErrorReport) => void) | undefined;

beforeEach(() => {
  reports = [];
  prevReporter = undefined;
  setErrorReporter((r) => reports.push(r));
});
afterEach(() => {
  setErrorReporter(prevReporter ?? (() => {}));
});

const ctx: TripContext = {
  id: "test-id",
  atMs: 1_000,
  wallTime: "2026-07-08T00:00:00.000Z",
  windowStartMs: 0,
  trigger: { kind: "loader", label: "x", durationMs: 500, thresholdMs: 100 },
};

describe("captureAtTripPhase", () => {
  test("fans out to every class, skips undefined, isolates a thrower", () => {
    const specs: TraceEventClassSpec[] = [
      { id: "a", schema: z.unknown(), captureAtTrip: () => ({ n: 1 }) },
      { id: "skip", schema: z.unknown(), captureAtTrip: () => undefined },
      {
        id: "boom",
        schema: z.unknown(),
        captureAtTrip: () => {
          throw new Error("nope");
        },
      },
      { id: "no-capture", schema: z.unknown() },
    ];

    const out = captureAtTripPhase(specs, ctx);

    expect(out.get("a")).toEqual({ n: 1 });
    expect(out.has("skip")).toBe(false);
    expect(out.has("boom")).toBe(false);
    expect(out.has("no-capture")).toBe(false);
    // The thrower is loud: exactly one report, naming the class.
    expect(reports).toHaveLength(1);
    expect(reports[0]?.message).toContain('trace class "boom"');
  });
});

describe("assembleEvents", () => {
  test("persists a captureAtTrip section that passes its schema", async () => {
    const specs: TraceEventClassSpec[] = [
      { id: "spans", schema: z.object({ n: z.number() }) },
    ];
    const events = await assembleEvents(
      specs,
      ctx,
      new Map([["spans", { n: 3 }]]),
    );
    expect(events).toEqual({ spans: { n: 3 } });
    expect(reports).toHaveLength(0);
  });

  test("enrich receives the phase-1 output and its result is validated", async () => {
    let seen: unknown;
    const specs: TraceEventClassSpec[] = [
      {
        id: "contention",
        schema: z.object({ load: z.number() }),
        enrich: (_c, atTrip) => {
          seen = atTrip;
          return { load: 42 };
        },
      },
    ];
    const events = await assembleEvents(
      specs,
      ctx,
      new Map([["contention", { fromTrip: true }]]),
    );
    expect(seen).toEqual({ fromTrip: true });
    expect(events).toEqual({ contention: { load: 42 } });
  });

  test("a section that fails validation is OMITTED and reported; siblings survive", async () => {
    const specs: TraceEventClassSpec[] = [
      { id: "good", schema: z.object({ ok: z.boolean() }) },
      { id: "bad", schema: z.object({ ok: z.boolean() }) },
    ];
    const events = await assembleEvents(
      specs,
      ctx,
      new Map<string, unknown>([
        ["good", { ok: true }],
        ["bad", { ok: "not-a-boolean" }],
      ]),
    );
    expect(events).toEqual({ good: { ok: true } });
    expect(events).not.toHaveProperty("bad");
    expect(reports).toHaveLength(1);
    expect(reports[0]?.message).toContain('trace class "bad"');
    expect(reports[0]?.message).toContain("failed validation");
  });

  test("a class with neither phase-1 output nor a ring contributes no section", async () => {
    const specs: TraceEventClassSpec[] = [
      { id: "empty", schema: z.unknown() },
    ];
    const events = await assembleEvents(specs, ctx, new Map());
    expect(events).toEqual({});
    expect(reports).toHaveLength(0);
  });

  test("an enrich that throws is isolated and reported", async () => {
    const specs: TraceEventClassSpec[] = [
      {
        id: "throws",
        schema: z.unknown(),
        enrich: () => {
          throw new Error("enrich boom");
        },
      },
      { id: "fine", schema: z.number() },
    ];
    const events = await assembleEvents(
      specs,
      ctx,
      new Map<string, unknown>([["fine", 7]]),
    );
    expect(events).toEqual({ fine: 7 });
    expect(reports).toHaveLength(1);
    expect(reports[0]?.message).toContain('trace class "throws"');
  });
});
