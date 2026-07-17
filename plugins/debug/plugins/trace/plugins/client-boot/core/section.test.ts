import { describe, expect, test } from "bun:test";
import type {
  AssetTiming,
  BootTrace,
} from "@plugins/primitives/plugins/perfs/plugins/boot-trace/core";
import { ClientBootSectionSchema, toClientBootSection } from "./section";

function makeAsset(i: number, transferSize: number): AssetTiming {
  return {
    name: `http://wt.localhost:9000/assets/plugins/some/deeply/nested/plugin/web/chunk-${i}-Bq3f9xYz.js`,
    initiatorType: "script",
    startMs: 10 + i,
    responseStartMs: 40 + i,
    responseEndMs: 90 + i,
    transferSize,
    decodedBodySize: transferSize * 3,
  };
}

function makeTrace(nAssets: number): BootTrace {
  return {
    spans: Array.from({ length: 60 }, (_, i) => ({
      id: `span-${i}`,
      phase: i % 2 === 0 ? ("resources" as const) : ("boot-tasks" as const),
      label: `resource:some.plugin.resource-${i} {"worktree":"att-1784284442"}`,
      startMs: 100 + i,
      durationMs: 250,
      workMs: 120,
      detail: "queued 30ms",
    })),
    navigation: {
      fetchStartMs: 0,
      domainLookupStartMs: 0,
      domainLookupEndMs: 1,
      connectStartMs: 1,
      connectEndMs: 2,
      requestStartMs: 2,
      responseStartMs: 180,
      responseEndMs: 220,
      domInteractiveMs: 400,
      domContentLoadedEndMs: 900,
    },
    paint: { firstPaintMs: 1200, firstContentfulPaintMs: 1250 },
    firstCommitMs: 1100,
    longTasks: Array.from({ length: 20 }, (_, i) => ({
      startMs: 300 + i * 40,
      durationMs: 80,
      name: "self",
    })),
    // Descending transferSize by construction, so index order = size order.
    assets: Array.from({ length: nAssets }, (_, i) =>
      makeAsset(i, 100_000 - i * 100),
    ),
    capturedAt: Date.now(),
  };
}

describe("toClientBootSection", () => {
  test("caps assets to maxAssets, keeping the biggest by transferSize", () => {
    const section = toClientBootSection(makeTrace(50), 20);
    expect(section.assets).toHaveLength(20);
    // Biggest-first: the kept rows are exactly the 20 largest.
    expect(section.assets[0]!.transferSize).toBe(100_000);
    expect(section.assets[19]!.transferSize).toBe(100_000 - 19 * 100);
  });

  test("rollup sums cover ALL assets, and droppedCount is the trimmed remainder", () => {
    const trace = makeTrace(50);
    const section = toClientBootSection(trace, 20);
    const total = trace.assets.reduce((s, a) => s + a.transferSize, 0);
    const decoded = trace.assets.reduce((s, a) => s + a.decodedBodySize, 0);
    expect(section.assetRollup).toEqual({
      count: 50,
      transferSize: total,
      decodedBodySize: decoded,
      droppedCount: 30,
    });
  });

  test("passes all assets through when under the cap (droppedCount 0)", () => {
    const trace = makeTrace(5);
    const section = toClientBootSection(trace, 20);
    expect(section.assets).toHaveLength(5);
    expect(new Set(section.assets)).toEqual(new Set(trace.assets));
    expect(section.assetRollup.droppedCount).toBe(0);
    expect(section.assetRollup.count).toBe(5);
  });

  test("non-asset fields pass through untouched", () => {
    const trace = makeTrace(3);
    const section = toClientBootSection(trace);
    expect(section.spans).toBe(trace.spans);
    expect(section.navigation).toBe(trace.navigation);
    expect(section.paint).toBe(trace.paint);
    expect(section.firstCommitMs).toBe(trace.firstCommitMs);
    expect(section.longTasks).toBe(trace.longTasks);
    expect(section.capturedAt).toBe(trace.capturedAt);
  });

  test("output satisfies ClientBootSectionSchema (the class validates it before persist)", () => {
    const section = toClientBootSection(makeTrace(50));
    expect(ClientBootSectionSchema.safeParse(section).success).toBe(true);
  });

  test("a realistic worst-case section serializes far under the 64KB keepalive cap", () => {
    // 60 spans + 20 long tasks + 120 assets (long chunk URLs) — a chunk-heavy
    // main-worktree boot. The trimmed section must leave generous headroom
    // under the 64KB fetch-keepalive budget the beacon shares.
    const section = toClientBootSection(makeTrace(120), 20);
    const bytes = JSON.stringify(section).length;
    expect(bytes).toBeGreaterThan(1_000); // sanity: not accidentally empty
    expect(bytes).toBeLessThan(32_768); // ≤ half the 64KB cap
  });
});
