/**
 * `buildActiveNoteIndex` tests. The contract under test: `at(beat)` returns the
 * notes whose half-open span `[start, start+duration)` contains `beat`, in the
 * original array order. Membership is overlap, not onset — a note longer than
 * one bucket is found at every beat inside its span (the core correctness case).
 * Zero-duration notes never sound; out-of-range beats return [].
 */

import { expect, test } from "bun:test";
import { buildActiveNoteIndex } from "./active-note-index";
import type { Note } from "./types";

let nid = 0;
const note = (start: number, duration: number, pitch = 60): Note => ({
  id: `n${nid++}`,
  pitch,
  start,
  duration,
  velocity: 90,
  track: "t1",
});

const ids = (notes: Note[]): string[] => notes.map((n) => n.id);

test("a note sounds within its half-open span [start, start+duration)", () => {
  const a = note(1, 1);
  const idx = buildActiveNoteIndex([a]);
  expect(ids(idx.at(0.9))).toEqual([]); // before onset
  expect(ids(idx.at(1.0))).toEqual([a.id]); // inclusive at start
  expect(ids(idx.at(1.5))).toEqual([a.id]); // mid-note
  expect(ids(idx.at(2.0))).toEqual([]); // exclusive at end
});

test("a multi-beat note is found at every beat across its span (overlap, not onset)", () => {
  const a = note(0, 4); // a 4-beat note spanning four 1-beat buckets
  const idx = buildActiveNoteIndex([a]);
  for (const t of [0, 0.5, 1, 1.5, 2, 2.9, 3, 3.99]) {
    expect(ids(idx.at(t))).toEqual([a.id]);
  }
  expect(ids(idx.at(4))).toEqual([]); // exclusive end
});

test("a note crossing a bucket boundary is returned on both sides", () => {
  const a = note(0.5, 1); // [0.5, 1.5): straddles the 1-beat bucket boundary
  const idx = buildActiveNoteIndex([a]);
  expect(ids(idx.at(0.6))).toEqual([a.id]); // bucket 0
  expect(ids(idx.at(1.4))).toEqual([a.id]); // bucket 1
  expect(ids(idx.at(1.5))).toEqual([]); // exclusive end
});

test("a span ending exactly on a bucket boundary does not leak into the next bucket", () => {
  const a = note(0, 1); // [0, 1): ends exactly on the bucket-1 boundary
  const idx = buildActiveNoteIndex([a]);
  expect(ids(idx.at(0.9))).toEqual([a.id]);
  expect(ids(idx.at(1.0))).toEqual([]);
});

test("a dense chord (many notes, one onset) is all returned together", () => {
  const chord = [note(2, 1, 60), note(2, 1, 64), note(2, 1, 67), note(2, 1, 71)];
  const idx = buildActiveNoteIndex(chord);
  expect(ids(idx.at(1.9))).toEqual([]);
  expect(ids(idx.at(2.5))).toEqual(ids(chord));
  expect(ids(idx.at(3.0))).toEqual([]);
});

test("result order follows input array order (stable per-pitch winner)", () => {
  // Two overlapping notes on the SAME pitch; a caller picking the first wins the
  // earlier array element regardless of onset order or bucket placement.
  const second = note(0, 3, 60);
  const first = note(0, 3, 60);
  const idx = buildActiveNoteIndex([first, second]); // array order, not onset
  expect(ids(idx.at(1.5))).toEqual([first.id, second.id]);
});

test("beats before the first onset and after the last end return []", () => {
  const a = note(5, 1);
  const b = note(7, 1);
  const idx = buildActiveNoteIndex([a, b]);
  expect(ids(idx.at(0))).toEqual([]); // before minStart
  expect(ids(idx.at(4.9))).toEqual([]);
  expect(ids(idx.at(6.0))).toEqual([]); // in the gap between notes
  expect(ids(idx.at(100))).toEqual([]); // past the end
});

test("an empty note list yields a constant-[] index", () => {
  const idx = buildActiveNoteIndex([]);
  expect(ids(idx.at(0))).toEqual([]);
  expect(ids(idx.at(42))).toEqual([]);
});

test("a zero-duration note is never sounding", () => {
  const a = note(1, 0);
  const idx = buildActiveNoteIndex([a]);
  expect(ids(idx.at(1.0))).toEqual([]);
  expect(ids(idx.at(0.9))).toEqual([]);
});

test("matches a brute-force scan across the whole timeline (no missed notes)", () => {
  // The real correctness guarantee: the index must agree with the naive O(n)
  // scan at EVERY beat. This mix is chosen to hit the cases bucket math could
  // get wrong — a non-zero minStart (timeline doesn't start at 0), ends landing
  // exactly on integer bucket boundaries, off-grid ends, dense overlaps, a note
  // spanning many buckets, and a note shorter than one bucket.
  const ns = [
    note(0.5, 3.5), // minStart = 0.5; ends at 4.0 (exact boundary)
    note(2, 2), //     ends at 4.0 (exact boundary)
    note(2, 0.25), //  sub-bucket span
    note(3, 1, 61), // ends at 4.0 (exact boundary)
    note(4, 4, 62), // long span across four buckets, ends at 8.0
    note(6.5, 0.5, 63),
    note(7, 1, 64),
    note(0.75, 8.0, 65), // spans almost the whole timeline
  ];
  const idx = buildActiveNoteIndex(ns);
  const brute = (t: number): string[] =>
    ns.filter((n) => n.start <= t && t < n.start + n.duration).map((n) => n.id);
  for (let i = 0; i <= 240; i++) {
    const t = i * 0.05; // 0 .. 12 in fine steps, crossing every boundary
    expect(idx.at(t).map((n) => n.id)).toEqual(brute(t));
  }
});

test("a coarser bucketBeats still resolves overlap correctly", () => {
  const a = note(0, 8, 60); // 8-beat note
  const b = note(3, 1, 64);
  const idx = buildActiveNoteIndex([a, b], { bucketBeats: 4 });
  expect(ids(idx.at(3.5))).toEqual([a.id, b.id]);
  expect(ids(idx.at(7.9))).toEqual([a.id]);
  expect(ids(idx.at(8.0))).toEqual([]);
});
