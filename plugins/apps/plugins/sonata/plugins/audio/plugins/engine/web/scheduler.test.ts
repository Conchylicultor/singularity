import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  emptyScore,
  type Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import type {
  InstrumentVoices,
  ScheduledNote,
} from "@plugins/apps/plugins/sonata/plugins/audio/plugins/instruments/web";
import { RESYNC_LATE_SEC, startScheduling } from "./scheduler";

// A fake audio clock: the test sets `currentTime` and fires the scheduler's
// wake-up node by hand (`wake`), as the audio thread would at its stop time.
class FakeConstantSource {
  onended: (() => void) | null = null;
  constructor() {
    nodes.push(this);
  }
  connect(): void {}
  disconnect(): void {}
  start(): void {}
  stop(): void {}
}
let nodes: FakeConstantSource[] = [];
const ctx = { currentTime: 0, destination: {} } as unknown as AudioContext & {
  currentTime: number;
};
const original = (globalThis as { ConstantSourceNode?: unknown })
  .ConstantSourceNode;

beforeEach(() => {
  nodes = [];
  ctx.currentTime = 0;
  (globalThis as { ConstantSourceNode?: unknown }).ConstantSourceNode =
    FakeConstantSource;
});
afterEach(() => {
  (globalThis as { ConstantSourceNode?: unknown }).ConstantSourceNode =
    original;
});

/** Advance the audio clock to `t` in 20 ms wake-ups, as the ticker would. */
function runTo(t: number) {
  while (ctx.currentTime < t - 1e-9) {
    ctx.currentTime = Math.min(t, ctx.currentTime + 0.02);
    const node = nodes.at(-1);
    node?.onended?.();
  }
}

/** 120 bpm (0.5 s a beat), one note on every beat over `[0, beats)`. */
function song(beats: number): Score {
  return {
    ...emptyScore(),
    tracks: [{ id: "t" }],
    tempoMap: [{ beat: 0, bpm: 120 }],
    notes: Array.from({ length: beats }, (_, i) => ({
      id: `n${i}`,
      pitch: 60 + i,
      start: i,
      duration: 1,
      velocity: 80,
      track: "t",
    })),
  };
}

function recorder() {
  const played: ScheduledNote[] = [];
  const voices = {
    schedule: (n: ScheduledNote) => played.push(n),
  } as unknown as InstrumentVoices;
  return { played, resolve: () => voices };
}

describe("startScheduling: beatAt", () => {
  it("is the beat sounding at an audio time", () => {
    const r = recorder();
    const h = startScheduling(song(16), 2, 10, r.resolve, ctx);
    expect(h.beatAt(10)).toBeCloseTo(2, 9);
    expect(h.beatAt(11)).toBeCloseTo(4, 9);
    h.cancel();
  });

  it("folds an A–B loop's iterations", () => {
    const r = recorder();
    const h = startScheduling(song(16), 0, 0, r.resolve, ctx, {
      start: 4,
      end: 8,
    });
    // Head runs 0..8 (4 s), then each iteration is 4 beats (2 s).
    expect(h.beatAt(4)).toBeCloseTo(0 + 8, 9); // the boundary itself
    expect(h.beatAt(4.5)).toBeCloseTo(5, 9);
    expect(h.beatAt(7)).toBeCloseTo(6, 9);
    h.cancel();
  });
});

describe("startScheduling: resync", () => {
  it("re-anchors so the given beat sounds at the given time", () => {
    const r = recorder();
    const h = startScheduling(song(16), 0, 0, r.resolve, ctx);
    runTo(1);
    // The medium says beat 2.2 at t = 1 (the synth was 100 ms behind).
    h.resync(2.2, 1);
    expect(h.beatAt(1)).toBeCloseTo(2.2, 9);
    runTo(3);
    const n3 = r.played.find((n) => n.pitch === 63);
    expect(n3?.when).toBeCloseTo(1 + 0.4, 9);
    h.cancel();
  });

  it("never re-triggers a note when moved back, and drops what a jump forward left far behind", () => {
    const r = recorder();
    const h = startScheduling(song(16), 0, 0, r.resolve, ctx);
    runTo(1.02);
    const before = r.played.map((n) => n.pitch);
    expect(before).toEqual([60, 61, 62]);

    // Back 60 ms: beat 2 was already handed over — it is not played again.
    h.resync(1.92, 1.02);
    runTo(1.6);
    const pitches = r.played.map((n) => n.pitch);
    expect(pitches.filter((p) => p === 62).length).toBe(1);

    // Forward 1.2 beats (600 ms): beat 4 would be 500 ms late → dropped.
    // Beat 5 still lies ahead and sounds on the new anchor.
    const t = ctx.currentTime;
    const beat = h.beatAt(t);
    h.resync(beat + 1.2, t);
    runTo(t + 1);
    expect(r.played.some((n) => n.pitch === 64)).toBe(false);
    const n5 = r.played.find((n) => n.pitch === 65);
    expect(n5?.when).toBeGreaterThan(t - RESYNC_LATE_SEC);
    h.cancel();
  });

  it("lands in the loop iteration nearest the current one", () => {
    const r = recorder();
    const h = startScheduling(song(16), 4, 0, r.resolve, ctx, {
      start: 4,
      end: 8,
    });
    // The head (2 s) and one pass (2 s) in: the second pass, at beat 4.4.
    runTo(4.2);
    h.resync(4.5, 4.2);
    expect(h.beatAt(4.2)).toBeCloseTo(4.5, 9);
    // The next note (beat 5) follows 0.25 s later — not a whole pass away.
    runTo(5);
    const next = r.played.filter((n) => n.when > 4.2 && n.pitch === 65);
    expect(next[0]?.when).toBeCloseTo(4.45, 9);
    h.cancel();
  });
});
