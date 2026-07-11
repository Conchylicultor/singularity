import { describe, expect, test } from "bun:test";
import { pairBootLines } from "./pair-boot-lines";
import type { BootLine } from "./schema";

const T0 = Date.parse("2026-07-10T09:00:00.000Z");

const start = (psa: number): BootLine => ({
  sampledAt: psa,
  worktree: "wt-a",
  processStartedAt: psa,
  phase: "start",
});
const ready = (psa: number, readyAt: number, phase?: "ready"): BootLine => ({
  sampledAt: readyAt,
  worktree: "wt-a",
  processStartedAt: psa,
  readyAt,
  ...(phase !== undefined ? { phase } : {}),
});

describe("pairBootLines", () => {
  test("a start + ready pair collapses to one ready event", () => {
    const events = pairBootLines([start(T0), ready(T0, T0 + 9_000, "ready")]);
    expect(events).toEqual([
      { worktree: "wt-a", processStartedAt: T0, readyAt: T0 + 9_000, supersededAtMs: null },
    ]);
  });

  test("a pre-cutover ready line (no phase, no start) stands alone", () => {
    const events = pairBootLines([ready(T0, T0 + 9_000)]);
    expect(events).toEqual([
      { worktree: "wt-a", processStartedAt: T0, readyAt: T0 + 9_000, supersededAtMs: null },
    ]);
  });

  test("the latest unpaired start is open-ended (wedged mid-boot, or booting now)", () => {
    const events = pairBootLines([ready(T0, T0 + 9_000, "ready"), start(T0 + 60_000)]);
    expect(events[1]).toEqual({
      worktree: "wt-a",
      processStartedAt: T0 + 60_000,
      readyAt: null,
      supersededAtMs: null,
    });
  });

  test("a crash-loop's failed attempts are bounded by the next attempt's start", () => {
    const events = pairBootLines([
      start(T0),
      start(T0 + 30_000),
      start(T0 + 60_000),
      ready(T0 + 60_000, T0 + 69_000, "ready"),
    ]);
    expect(events).toEqual([
      { worktree: "wt-a", processStartedAt: T0, readyAt: null, supersededAtMs: T0 + 30_000 },
      {
        worktree: "wt-a",
        processStartedAt: T0 + 30_000,
        readyAt: null,
        supersededAtMs: T0 + 60_000,
      },
      {
        worktree: "wt-a",
        processStartedAt: T0 + 60_000,
        readyAt: T0 + 69_000,
        supersededAtMs: null,
      },
    ]);
  });

  test("events sort by process start", () => {
    const events = pairBootLines([ready(T0 + 60_000, T0 + 61_000, "ready"), ready(T0, T0 + 1_000)]);
    expect(events.map((e) => e.processStartedAt)).toEqual([T0, T0 + 60_000]);
  });
});
