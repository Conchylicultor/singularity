import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { createHoverIntent } from "./hover-intent";

function setup(openDelay = 120, closeDelay = 200) {
  const calls: string[] = [];
  const intent = createHoverIntent({
    openDelay,
    closeDelay,
    onOpen: () => calls.push("open"),
    onClose: () => calls.push("close"),
  });
  return { intent, calls };
}

describe("createHoverIntent", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("opens only after the pointer rests for openDelay", () => {
    const { intent, calls } = setup();
    intent.enter();
    jest.advanceTimersByTime(119);
    expect(calls).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(calls).toEqual(["open"]);
  });

  test("a pointer that only passes over never opens", () => {
    const { intent, calls } = setup();
    intent.enter();
    jest.advanceTimersByTime(50);
    intent.leave();
    jest.advanceTimersByTime(1000);
    expect(calls).toEqual(["close"]);
  });

  test("re-entering within the grace keeps it open (trigger → panel crossing)", () => {
    const { intent, calls } = setup();
    intent.enter();
    jest.advanceTimersByTime(120);
    intent.leave();
    jest.advanceTimersByTime(150);
    intent.enter();
    jest.advanceTimersByTime(1000);
    expect(calls).toEqual(["open", "open"]);
  });

  test("closes after the grace once the pointer is gone", () => {
    const { intent, calls } = setup();
    intent.enter();
    jest.advanceTimersByTime(120);
    intent.leave();
    jest.advanceTimersByTime(200);
    expect(calls).toEqual(["open", "close"]);
  });

  test("openDelay 0 opens synchronously on arrival", () => {
    const { intent, calls } = setup(0);
    intent.enter();
    expect(calls).toEqual(["open"]);
  });

  test("cancel drops the pending close", () => {
    const { intent, calls } = setup(0);
    intent.enter();
    intent.leave();
    intent.cancel();
    jest.advanceTimersByTime(1000);
    expect(calls).toEqual(["open"]);
  });
});
