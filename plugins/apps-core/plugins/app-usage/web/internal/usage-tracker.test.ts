import { describe, expect, test } from "bun:test";
import type { AppUsageEntry } from "../../core";
import { localDay, splitByLocalDay } from "./day-split";
import { createUsageTracker, type TrackerDeps } from "./usage-tracker";

const MIN = 60_000;
// Local-time instants, so the tests hold in any timezone.
const T0 = new Date(2026, 9, 8, 10, 0, 0).getTime();

interface Harness {
  tracker: ReturnType<typeof createUsageTracker>;
  sent: AppUsageEntry[][];
  advance(ms: number): void;
  /** Settle the send promise chain. */
  settle(): Promise<void>;
  fail: { next: unknown };
}

function harness(over: Partial<TrackerDeps> = {}): Harness {
  let now = T0;
  const timers: { at: number; fn: () => void; id: number }[] = [];
  let nextId = 0;
  const sent: AppUsageEntry[][] = [];
  const fail: { next: unknown } = { next: null };
  const tracker = createUsageTracker({
    now: () => now,
    send: (entries) => {
      if (fail.next !== null) {
        const err = fail.next;
        fail.next = null;
        return Promise.reject(err);
      }
      sent.push(entries);
      return Promise.resolve();
    },
    isRetryable: (err) => err instanceof TypeError,
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.push({ at: now + ms, fn, id });
      return id;
    },
    clearTimer: (id) => {
      const i = timers.findIndex((t) => t.id === id);
      if (i >= 0) timers.splice(i, 1);
    },
    lastApp: undefined,
    ...over,
  });
  return {
    tracker,
    sent,
    fail,
    advance(ms) {
      const end = now + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const t = timers[0];
        if (!t || t.at > end) break;
        timers.shift();
        now = t.at;
        t.fn();
      }
      now = end;
    },
    settle: () => new Promise((r) => setTimeout(r, 0)),
  };
}

/** Sum every sent entry per app. */
function totals(sent: AppUsageEntry[][]) {
  const out: Record<string, { launches: number; focusedMs: number }> = {};
  for (const e of sent.flat()) {
    const t = (out[e.appId] ??= { launches: 0, focusedMs: 0 });
    t.launches += e.launches;
    t.focusedMs += e.focusedMs;
  }
  return out;
}

function activePage(h: Harness): void {
  h.tracker.setWindowFocused(true);
  h.tracker.setVisible(true);
}

describe("splitByLocalDay", () => {
  test("cuts a span at local midnight", () => {
    const start = new Date(2026, 9, 8, 23, 50).getTime();
    const end = new Date(2026, 9, 9, 0, 10).getTime();
    expect(splitByLocalDay(start, end)).toEqual([
      { day: "2026-10-08", ms: 10 * MIN },
      { day: "2026-10-09", ms: 10 * MIN },
    ]);
  });
  test("an empty span yields nothing", () => {
    expect(splitByLocalDay(T0, T0)).toEqual([]);
  });
  test("localDay pads", () => {
    expect(localDay(new Date(2026, 0, 5, 12).getTime())).toBe("2026-01-05");
  });
});

describe("usage tracker", () => {
  test("a focused-app change is a launch; time accrues while active", async () => {
    const h = harness();
    activePage(h);
    h.tracker.setApp("mail");
    h.advance(2 * MIN);
    h.tracker.input();
    h.advance(1 * MIN);
    h.tracker.setApp("pages");
    await h.settle();
    expect(totals(h.sent)).toEqual({
      mail: { launches: 1, focusedMs: 3 * MIN },
      pages: { launches: 1, focusedMs: 0 },
    });
  });

  test("re-focusing the same app, or a reload onto it, is not a launch", async () => {
    const h = harness({ lastApp: "mail" });
    activePage(h);
    h.tracker.setApp("mail");
    h.tracker.setApp(undefined);
    h.tracker.setApp("mail");
    await h.settle();
    expect(totals(h.sent).mail?.launches ?? 0).toBe(0);
  });

  test("idle stops the clock at the last input", async () => {
    const h = harness({ idleMs: 5 * MIN });
    activePage(h);
    h.tracker.setApp("mail");
    h.advance(1 * MIN);
    h.tracker.input();
    h.advance(30 * MIN); // away
    await h.settle();
    expect(totals(h.sent).mail?.focusedMs).toBe(1 * MIN);
    // Coming back resumes.
    h.tracker.input();
    h.advance(2 * MIN);
    h.tracker.pageHide();
    await h.settle();
    expect(totals(h.sent).mail?.focusedMs).toBe(3 * MIN);
  });

  test("hidden page and blurred window pause the clock", async () => {
    const h = harness();
    activePage(h);
    h.tracker.setApp("mail");
    h.advance(1 * MIN);
    h.tracker.setVisible(false);
    h.advance(10 * MIN);
    h.tracker.setVisible(true);
    h.advance(1 * MIN);
    h.tracker.setWindowFocused(false);
    h.advance(10 * MIN);
    h.tracker.pageHide();
    await h.settle();
    expect(totals(h.sent).mail?.focusedMs).toBe(2 * MIN);
  });

  test("a long session is checkpointed on input", async () => {
    const h = harness({ checkpointMs: MIN });
    activePage(h);
    h.tracker.setApp("mail");
    await h.settle();
    const before = h.sent.length;
    h.advance(90_000);
    h.tracker.input();
    await h.settle();
    expect(h.sent.length).toBe(before + 1);
    expect(totals(h.sent).mail?.focusedMs).toBe(90_000);
  });

  test("a failed flush is restored and retried", async () => {
    const h = harness();
    activePage(h);
    h.fail.next = new TypeError("network");
    h.tracker.setApp("mail");
    await h.settle();
    expect(h.sent.length).toBe(0);
    h.advance(60_000);
    await h.settle();
    expect(totals(h.sent).mail?.launches).toBe(1);
  });

  test("a stretch across midnight lands on both days", async () => {
    const h = harness();
    activePage(h);
    h.advance(new Date(2026, 9, 8, 23, 59).getTime() - T0);
    h.tracker.setApp("mail");
    h.tracker.input();
    h.advance(2 * MIN);
    h.tracker.pageHide();
    await h.settle();
    const byDay = h.sent
      .flat()
      .filter((e) => e.focusedMs > 0)
      .map((e) => [e.day, e.focusedMs]);
    expect(byDay).toEqual([
      ["2026-10-08", MIN],
      ["2026-10-09", MIN],
    ]);
  });
});
