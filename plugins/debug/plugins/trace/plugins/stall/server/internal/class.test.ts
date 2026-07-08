import { describe, expect, test } from "bun:test";
import type { TripContext, TraceTrigger } from "@plugins/debug/plugins/trace/plugins/engine/core";
import { StallSectionSchema, type StallSection } from "../../core";
import { captureStallSection } from "./class";

const section: StallSection = {
  nSamples: 200,
  sampleRateHz: 230,
  topLeaves: [{ key: "buildPluginTree @ x/tree.ts:120", count: 120, pct: 60 }],
  topStacks: [{ stack: "buildPluginTree ← scanDir", count: 120, pct: 60 }],
};

function ctxFor(trigger: TraceTrigger): TripContext {
  return { id: "t", atMs: 1_000, wallTime: "2026-07-08T00:00:00.000Z", windowStartMs: 0, trigger };
}

describe("captureStallSection", () => {
  test("passes a stall trigger's detail through, and it is StallSection-valid", () => {
    const out = captureStallSection(
      ctxFor({ kind: "stall", label: "x", durationMs: 41_000, thresholdMs: 3_000, critical: true, detail: section }),
    );
    expect(out).toEqual(section);
    // The engine validates each section against the class schema before persist —
    // assert the passthrough output actually satisfies it (no empty/faked section).
    expect(StallSectionSchema.safeParse(out).success).toBe(true);
  });

  test("returns undefined for a non-stall trip (no empty stall section on a slow span)", () => {
    expect(
      captureStallSection(ctxFor({ kind: "loader", label: "x", durationMs: 500, thresholdMs: 100 })),
    ).toBeUndefined();
    expect(
      captureStallSection(ctxFor({ kind: "op-time", label: "y", durationMs: 9_000, thresholdMs: 6_000 })),
    ).toBeUndefined();
  });
});
