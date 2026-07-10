import { describe, expect, test } from "bun:test";
import { mapBootEvents } from "./boot-map";

const T0 = Date.parse("2026-07-10T09:00:00.000Z");
const fromMs = T0;
const toMs = T0 + 60 * 60 * 1000;

describe("mapBootEvents", () => {
  test("maps a boot line to the interval [processStartedAt, readyAt]", () => {
    const start = T0 + 5 * 60 * 1000;
    const ready = start + 12_000;
    const [ev] = mapBootEvents(
      [{ processStartedAt: start, readyAt: ready }],
      "wt-a",
      fromMs,
      toMs,
    );
    expect(ev).toEqual({
      id: `boot:wt-a:${ready}`,
      source: "boot",
      worktree: "wt-a",
      startMs: start,
      endMs: ready,
      label: "backend boot",
      severity: "info",
      detail: { processStartedAt: start, readyAt: ready, bootMs: 12_000 },
    });
  });

  test("keeps a boot straddling the window edge, drops one fully outside", () => {
    const straddling = { processStartedAt: fromMs - 5000, readyAt: fromMs + 5000 };
    const outside = { processStartedAt: fromMs - 60_000, readyAt: fromMs - 30_000 };
    const events = mapBootEvents([straddling, outside], "wt-a", fromMs, toMs);
    expect(events.length).toBe(1);
    expect(events[0]!.startMs).toBe(fromMs - 5000);
  });
});
