import { describe, expect, test } from "bun:test";
import { backendHealthPoints, hostHealthPoints } from "./health-map";

const T0 = Date.parse("2026-07-10T09:00:00.000Z");
const fromMs = T0;
const toMs = T0 + 60 * 60 * 1000;

const backendSample = (atMs: number, p99: number, wallJumpMs?: number) => ({
  sampledAt: atMs,
  eventLoopP99Ms: p99,
  eventLoopMaxMs: p99 * 2,
  physFootprintMb: 512,
  wallJumpMs,
});

const hostSample = (atMs: number, load: number, decompPerSec = 0) => ({
  sampledAt: atMs,
  loadAvg1: load,
  swapInPagesPerSec: 3,
  swapOutPagesPerSec: 4,
  compressionsPerSec: decompPerSec / 2,
  decompressionsPerSec: decompPerSec,
  compressorMb: 1024,
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

  test("a calm wall-jump (sleep wake) point survives downsampling — it classifies the gap", () => {
    const samples = Array.from({ length: 3600 }, (_, i) => backendSample(T0 + i * 1000, 8));
    samples[1234] = backendSample(T0 + 1_234_000, 1, 900_000);
    const pts = backendHealthPoints(samples, fromMs, toMs, 100);
    expect(pts.some((p) => p.wallJumpMs === 900_000)).toBe(true);
    // Order stays chronological after the force-keep union.
    expect([...pts].sort((a, b) => a.atMs - b.atMs).map((p) => p.atMs)).toEqual(
      pts.map((p) => p.atMs),
    );
  });
});

describe("hostHealthPoints", () => {
  test("maps to the host lane shape, folding swap in+out and carrying the compressor channel", () => {
    const pts = hostHealthPoints([hostSample(T0 + 60_000, 14.5, 8_000)], fromMs, toMs);
    expect(pts).toEqual([
      {
        atMs: T0 + 60_000,
        loadAvg1: 14.5,
        swap: 7,
        decompPerSec: 8_000,
        compPerSec: 4_000,
        compressorMb: 1024,
      },
    ]);
  });

  test("pre-cutover lines without compressor fields still map (score on load alone)", () => {
    const pts = hostHealthPoints(
      [
        {
          sampledAt: T0 + 60_000,
          loadAvg1: 2,
          swapInPagesPerSec: 0,
          swapOutPagesPerSec: 0,
        },
      ],
      fromMs,
      toMs,
    );
    expect(pts).toEqual([{ atMs: T0 + 60_000, loadAvg1: 2, swap: 0 }]);
  });

  test("downsamples on the pressure score so the load peak survives", () => {
    const samples = Array.from({ length: 2000 }, (_, i) =>
      hostSample(T0 + i * 1500, i === 777 ? 30 : 2),
    );
    const pts = hostHealthPoints(samples, fromMs, toMs, 100, 8);
    expect(pts.length).toBeLessThanOrEqual(100);
    expect(pts.some((p) => p.loadAvg1 === 30)).toBe(true);
  });

  test("a compressor spike inside a calm-load bucket survives downsampling", () => {
    // Both freezes' signature: load calm, decompressions 240k–442k/s. Bucket-max
    // on loadAvg1 alone would keep a neighboring higher-load sample instead.
    const samples = Array.from({ length: 2000 }, (_, i) =>
      hostSample(T0 + i * 1500, i === 778 ? 4 : 2, i === 777 ? 340_000 : 500),
    );
    const pts = hostHealthPoints(samples, fromMs, toMs, 100, 8);
    expect(pts.some((p) => p.decompPerSec === 340_000)).toBe(true);
  });
});
