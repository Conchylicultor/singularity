/**
 * Onset-tracker tests. The contract under test: `advance(cur)` returns onsets
 * in the half-open `(prev, cur]` exactly once; seeks (backward jumps, forward
 * jumps beyond `maxGapBeats`) re-anchor silently and return []. Resets anchor
 * INCLUSIVELY: a note starting exactly at the anchor fires on the next advance,
 * because the audio scheduler sounds a note sitting exactly at the resume
 * position (most visibly the first note of a score when playing from the top).
 */

import { expect, test } from "bun:test";
import type { Note } from "@plugins/apps/plugins/sonata/plugins/score/core";
import { createOnsetTracker } from "./onset-tracker";

let nid = 0;
const note = (start: number, pitch = 60): Note => ({
  id: `n${nid++}`,
  pitch,
  start,
  duration: 1,
  velocity: 90,
  track: "t1",
});

const ids = (notes: Note[]): string[] => notes.map((n) => n.id);

test("normal advance fires onsets crossed by each frame, in onset order", () => {
  const a = note(0.5);
  const b = note(1.0);
  const c = note(2.5);
  const tracker = createOnsetTracker([c, a, b]); // construction order ≠ onset order
  expect(ids(tracker.advance(0.4))).toEqual([]);
  expect(ids(tracker.advance(1.2))).toEqual([a.id, b.id]);
  expect(ids(tracker.advance(2.4))).toEqual([]);
  expect(ids(tracker.advance(3.0))).toEqual([c.id]);
});

test("interval is open at prev, closed at cur — boundary onsets fire exactly once", () => {
  const a = note(1.0);
  const tracker = createOnsetTracker([a]);
  // Frame lands EXACTLY on the onset: closed upper bound includes it.
  expect(ids(tracker.advance(1.0))).toEqual([a.id]);
  // Next frame starts at prev=1.0: open lower bound excludes it — no re-fire.
  expect(ids(tracker.advance(1.5))).toEqual([]);
});

test("an onset exactly at the playback anchor fires (inclusive reset)", () => {
  // The tracker anchors at 0 inclusively: a note authored at exactly beat 0 —
  // the most common opening — fires when play starts from the top, just as the
  // audio scheduler sounds it.
  const a = note(0);
  const b = note(0.25);
  const tracker = createOnsetTracker([a, b]);
  expect(ids(tracker.advance(0.5))).toEqual([a.id, b.id]);
});

test("a dense chord (many notes, one onset) all fire in the same advance", () => {
  const chord = [note(2, 60), note(2, 64), note(2, 67), note(2, 71)];
  const tracker = createOnsetTracker(chord);
  expect(ids(tracker.advance(1.9))).toEqual([]);
  expect(ids(tracker.advance(2.0))).toEqual(ids(chord));
  expect(ids(tracker.advance(2.1))).toEqual([]);
});

test("backward jump resets and returns [] — and replays onsets after re-anchor", () => {
  const a = note(1.0);
  const tracker = createOnsetTracker([a]);
  expect(ids(tracker.advance(1.5))).toEqual([a.id]);
  // Rewind behind the note: seek — no burst.
  expect(ids(tracker.advance(0.2))).toEqual([]);
  // Playing forward again re-crosses the onset: it fires again (a real replay).
  expect(ids(tracker.advance(1.1))).toEqual([a.id]);
});

test("forward gap beyond maxGapBeats resets and returns [] (no onset burst on seek)", () => {
  const skipped = [note(1), note(2), note(3), note(4), note(5)];
  const after = note(10.5);
  const tracker = createOnsetTracker([...skipped, after], { maxGapBeats: 4 });
  // Jump from 0 to 10 (gap 10 > 4): all five skipped onsets are swallowed.
  expect(ids(tracker.advance(10))).toEqual([]);
  // The tracker re-anchored at 10, so playback continues normally from there.
  expect(ids(tracker.advance(11))).toEqual([after.id]);
});

test("a forward gap exactly at maxGapBeats is still a normal advance", () => {
  const a = note(3);
  const tracker = createOnsetTracker([a], { maxGapBeats: 4 });
  expect(ids(tracker.advance(4))).toEqual([a.id]);
});

test("repeated advance at the same beat is idempotent (no double-fire)", () => {
  const a = note(1.0);
  const tracker = createOnsetTracker([a]);
  expect(ids(tracker.advance(1.0))).toEqual([a.id]);
  expect(ids(tracker.advance(1.0))).toEqual([]);
  expect(ids(tracker.advance(1.0))).toEqual([]);
});

test("explicit reset(atBeat) drops pending onsets and re-anchors", () => {
  const a = note(1);
  const b = note(5);
  const tracker = createOnsetTracker([a, b]);
  tracker.reset(4.5); // e.g. seekEpoch bumped: jump straight past `a`
  expect(ids(tracker.advance(5.0))).toEqual([b.id]);
  // Reset exactly onto an onset: inclusive anchor — it fires again on the next
  // advance, consistent with the audio replaying a note seeked-onto exactly.
  tracker.reset(5.0);
  expect(ids(tracker.advance(5.5))).toEqual([b.id]);
});
