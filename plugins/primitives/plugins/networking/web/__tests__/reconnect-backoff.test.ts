/**
 * The shared reconnect schedule: the delay band per attempt (500 ms doubling to
 * a 5 s cap, jittered 0.5–1.5×), and the counter/timer life cycle every
 * reconnecting transport relies on (reset on open, cancel on teardown).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RECONNECT_DELAY, ReconnectSchedule } from "../reconnect-backoff";

describe("RECONNECT_DELAY", () => {
  afterEach(() => vi.restoreAllMocks());

  it("doubles from 500 ms to a 5 s cap at the jitter midpoint", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    expect([0, 1, 2, 3, 4, 10].map(RECONNECT_DELAY)).toEqual([
      500, 1000, 2000, 4000, 5000, 5000,
    ]);
  });

  it("spreads each delay across 0.5–1.5× so a tab fleet does not reconnect in step", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(RECONNECT_DELAY(0)).toBe(250);
    vi.spyOn(Math, "random").mockReturnValue(1);
    expect(RECONNECT_DELAY(0)).toBe(750);
  });
});

describe("ReconnectSchedule", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("runs the reconnect after the backoff delay and counts attempts", () => {
    const s = new ReconnectSchedule();
    const reconnect = vi.fn();
    expect(s.isFirstAttempt).toBe(true);

    expect(s.schedule(reconnect)).toBe(1);
    expect(s.isFirstAttempt).toBe(false);
    vi.advanceTimersByTime(499);
    expect(reconnect).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(reconnect).toHaveBeenCalledTimes(1);

    expect(s.schedule(reconnect)).toBe(2);
    vi.advanceTimersByTime(999);
    expect(reconnect).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(reconnect).toHaveBeenCalledTimes(2);
  });

  it("reset starts the next drop from the shortest delay again", () => {
    const s = new ReconnectSchedule();
    const reconnect = vi.fn();
    s.schedule(reconnect);
    vi.advanceTimersByTime(500);
    s.reset();
    expect(s.isFirstAttempt).toBe(true);
    s.schedule(reconnect);
    vi.advanceTimersByTime(500);
    expect(reconnect).toHaveBeenCalledTimes(2);
  });

  it("cancel drops the pending retry, and a new schedule replaces an old one", () => {
    const s = new ReconnectSchedule();
    const first = vi.fn();
    const second = vi.fn();
    s.schedule(first);
    s.cancel();
    vi.advanceTimersByTime(10_000);
    expect(first).not.toHaveBeenCalled();

    s.schedule(first);
    s.schedule(second);
    vi.advanceTimersByTime(10_000);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
