import { describe, expect, test } from "bun:test";
import { backendHealthPoints, hostHealthPoints } from "./health-map";

const T0 = Date.parse("2026-07-10T09:00:00.000Z");
const fromMs = T0;
const toMs = T0 + 60 * 60 * 1000;

const backendSample = (atMs: number, p99: number) => ({
  sampledAt: atMs,
  eventLoopP99Ms: p99,
  eventLoopMaxMs: p99 * 2,
  physFootprintMb: 512,
});

const hostSample = (atMs: number, load: number) => ({
  sampledAt: atMs,
  loadAvg1: load,
  swapInPagesPerSec: 3,
  swapOutPagesPerSec: 4,
});

describe("backendHealthPoints", () => {
  test("filters to the window and maps to wire points", () => {
    const pts = backendHealthPoints(
      [backendSample(T0 - 1000, 5), backendSample(T0 + 60_000, 42), backendSample(toMs + 1, 9)],
      fromMs,
      toMs,
    );
    expect(pts).toEqual([{ atMs: T0 + 60_000, p99Ms: 42, maxMs: 84, physMb: 512 }]);
  });

  test("downsamples to the cap keeping the p99 peak", () => {
    // 3600 samples (10s cadence over 1h); one 466ms spike.
    const samples = Array.from({ length: 3600 }, (_, i) =>
      backendSample(T0 + i * 1000, i === 1234 ? 466 : 8),
    );
    const pts = backendHealthPoints(samples, fromMs, toMs, 500);
    expect(pts.length).toBeLessThanOrEqual(500);
    expect(pts.some((p) => p.p99Ms === 466)).toBe(true);
  });
});

describe("hostHealthPoints", () => {
  test("maps to the host lane shape, folding swap in+out", () => {
    const pts = hostHealthPoints([hostSample(T0 + 60_000, 14.5)], fromMs, toMs);
    expect(pts).toEqual([{ atMs: T0 + 60_000, loadAvg1: 14.5, swap: 7 }]);
  });

  test("downsamples on loadAvg1 so the load peak survives", () => {
    const samples = Array.from({ length: 2000 }, (_, i) =>
      hostSample(T0 + i * 1500, i === 777 ? 30 : 2),
    );
    const pts = hostHealthPoints(samples, fromMs, toMs, 100);
    expect(pts.length).toBeLessThanOrEqual(100);
    expect(pts.some((p) => p.loadAvg1 === 30)).toBe(true);
  });
});
