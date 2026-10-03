import { describe, expect, test } from "bun:test";
import { createFlushNotifier } from "./flush-notifier";

function setup() {
  const notifier = createFlushNotifier<"24h" | "7d">();
  const calls: string[] = [];
  const subscribe = (w: "24h" | "7d") =>
    notifier.subscribe(w, () => calls.push(w));
  return { notifier, calls, subscribe };
}

describe("createFlushNotifier", () => {
  test("a flush notifies only the subscribed windows", () => {
    const { notifier, calls, subscribe } = setup();
    subscribe("7d");
    notifier.flushed(60_000);
    expect(calls).toEqual(["7d"]);
  });

  test("an older or equal minute is a no-op", () => {
    const { notifier, calls, subscribe } = setup();
    subscribe("24h");
    notifier.flushed(120_000);
    notifier.flushed(120_000);
    notifier.flushed(60_000);
    expect(calls).toEqual(["24h"]);
    notifier.flushed(180_000);
    expect(calls).toEqual(["24h", "24h"]);
  });

  test("an unsubscribed window is not notified", () => {
    const { notifier, calls, subscribe } = setup();
    const stop24h = subscribe("24h");
    subscribe("7d");
    stop24h();
    notifier.flushed(60_000);
    expect(calls).toEqual(["7d"]);
  });

  test("a flush with nobody subscribed still advances the guard", () => {
    const { notifier, calls, subscribe } = setup();
    notifier.flushed(60_000);
    subscribe("24h");
    notifier.flushed(60_000);
    expect(calls).toEqual([]);
  });
});
