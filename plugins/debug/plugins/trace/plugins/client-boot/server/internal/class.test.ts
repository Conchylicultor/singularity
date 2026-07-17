import { describe, expect, test } from "bun:test";
import type {
  TripContext,
  TraceTrigger,
} from "@plugins/debug/plugins/trace/plugins/engine/core";
import {
  ClientBootSectionSchema,
  toClientBootSection,
  type ClientBootSection,
} from "../../core";
import { captureClientBootSection } from "./class";

const section: ClientBootSection = toClientBootSection({
  spans: [
    {
      id: "s1",
      phase: "boot-tasks",
      label: "boot snapshot",
      startMs: 100,
      durationMs: 400,
    },
  ],
  navigation: null,
  paint: { firstPaintMs: 900, firstContentfulPaintMs: 950 },
  firstCommitMs: 800,
  longTasks: [{ startMs: 300, durationMs: 120, name: "self" }],
  assets: [
    {
      name: "http://x.localhost:9000/assets/chunk-a.js",
      initiatorType: "script",
      startMs: 10,
      responseStartMs: 40,
      responseEndMs: 90,
      transferSize: 50_000,
      decodedBodySize: 150_000,
    },
  ],
  capturedAt: 1_752_000_000_000,
});

function ctxFor(trigger: TraceTrigger): TripContext {
  return { id: "t", atMs: 1_000, wallTime: "2026-07-17T00:00:00.000Z", windowStartMs: 0, trigger };
}

describe("captureClientBootSection", () => {
  test("passes a page-load trigger's clientBoot through, and it is ClientBootSection-valid", () => {
    const out = captureClientBootSection(
      ctxFor({
        kind: "page-load",
        label: "/agents",
        durationMs: 12_000,
        thresholdMs: 4_000,
        detail: { caller: null, clientBoot: section },
      }),
    );
    expect(out).toEqual(section);
    // The engine validates each section against the class schema before persist —
    // assert the passthrough output actually satisfies it (no empty/faked section).
    expect(ClientBootSectionSchema.safeParse(out).success).toBe(true);
  });

  test("returns undefined when a page-load trip carries no clientBoot (older client)", () => {
    expect(
      captureClientBootSection(
        ctxFor({
          kind: "page-load",
          label: "/agents",
          durationMs: 12_000,
          thresholdMs: 4_000,
          detail: { caller: null },
        }),
      ),
    ).toBeUndefined();
  });

  test("returns undefined for a non-page-load trip (no client-boot section on a slow span)", () => {
    expect(
      captureClientBootSection(
        ctxFor({
          kind: "element",
          label: "x",
          durationMs: 9_000,
          thresholdMs: 3_000,
          detail: { clientBoot: section },
        }),
      ),
    ).toBeUndefined();
    expect(
      captureClientBootSection(
        ctxFor({ kind: "loader", label: "y", durationMs: 500, thresholdMs: 100 }),
      ),
    ).toBeUndefined();
  });
});
