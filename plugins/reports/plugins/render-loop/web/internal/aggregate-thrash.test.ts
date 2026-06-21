import { test, expect } from "bun:test";
import { AggregateWindow } from "./aggregate-thrash";

// All timestamps are explicit (no Date.now/performance.now) so the windowing is
// deterministic and the test never depends on wall-clock.

test("rate is summed events/sec over the window", () => {
  const w = new AggregateWindow(1000, 256);
  for (let i = 0; i < 5; i += 1) w.record("a", i * 100); // 5 events in [0,400]
  expect(w.rate(400)).toBe(5);
});

test("pruning drops events older than the window", () => {
  const w = new AggregateWindow(1000, 256);
  w.record("a", 0);
  w.record("a", 500);
  w.record("a", 1000);
  // At now=1600, only timestamps > 600 survive (1000 stays; 0 and 500 drop).
  expect(w.rate(1600)).toBe(1);
});

test("recurringBreadth counts only leaves hit >= minRepeat in window", () => {
  const w = new AggregateWindow(1000, 256);
  // a, b: hit twice → recurring. c: hit once → not recurring.
  w.record("a", 0);
  w.record("a", 100);
  w.record("b", 0);
  w.record("b", 200);
  w.record("c", 0);
  expect(w.recurringBreadth(300, 2)).toBe(2);
});

test("recurringBreadth ignores hits that aged out of the window", () => {
  const w = new AggregateWindow(1000, 256);
  w.record("a", 0); // ages out by now=1100
  w.record("a", 1050);
  // Only one in-window hit for "a" → below minRepeat=2.
  expect(w.recurringBreadth(1100, 2)).toBe(0);
});

test("maxLeaves cap rejects NEW leaves but still updates existing ones", () => {
  const w = new AggregateWindow(1000, 2);
  w.record("a", 0);
  w.record("b", 0);
  // Cap reached: "c" is a new key → rejected.
  w.record("c", 10);
  // But existing keys keep updating.
  w.record("a", 20);
  w.record("a", 30);
  // a (3 hits) and b (1 hit) tracked; c dropped entirely.
  expect(w.recurringBreadth(50, 2)).toBe(1); // only "a" recurs
  expect(w.sampleLeaves(50, 10)).toEqual(["a", "b"]);
});

test("sampleLeaves returns the hottest leaves, descending, capped at n", () => {
  const w = new AggregateWindow(1000, 256);
  for (let i = 0; i < 3; i += 1) w.record("hot", i * 10);
  w.record("mid", 0);
  w.record("mid", 10);
  w.record("cold", 0);
  expect(w.sampleLeaves(100, 2)).toEqual(["hot", "mid"]);
});

test("lastEventAt is the most recent event timestamp, or 0 when empty", () => {
  const w = new AggregateWindow(1000, 256);
  expect(w.lastEventAt).toBe(0);
  w.record("a", 42);
  w.record("a", 99);
  expect(w.lastEventAt).toBe(99);
});
