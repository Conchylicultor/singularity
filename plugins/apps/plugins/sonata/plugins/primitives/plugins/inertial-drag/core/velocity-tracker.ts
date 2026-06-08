/**
 * Trailing-window pointer-velocity estimator.
 *
 * Feed `(timeMs, position)` samples during a drag; `velocity()` returns the
 * average position-units-per-SECOND over the most recent `windowMs` of motion.
 * Bounding the window to the last few frames means a drag that PAUSES before
 * release reports ≈0 — so a deliberate stop does not fling, only an in-motion
 * flick does.
 */

interface Sample {
  t: number;
  pos: number;
}

export interface VelocityTracker {
  /** Record a pointer sample. `timeMs` is a monotonic ms clock (e.g. event.timeStamp). */
  sample(timeMs: number, position: number): void;
  /** Position-units per second over the trailing window. 0 if undeterminable. */
  velocity(): number;
  /** Drop all samples (call on a fresh grab). */
  reset(): void;
}

/** Create a velocity tracker keeping a `windowMs` trailing window (default 80 ms). */
export function createVelocityTracker(windowMs = 80): VelocityTracker {
  let samples: Sample[] = [];

  function prune(now: number): void {
    const cutoff = now - windowMs;
    samples = samples.filter((s) => s.t >= cutoff);
  }

  return {
    sample(timeMs, position) {
      samples.push({ t: timeMs, pos: position });
      prune(timeMs);
    },
    velocity() {
      if (samples.length < 2) return 0;
      const oldest = samples[0]!;
      const newest = samples[samples.length - 1]!;
      const dtSec = (newest.t - oldest.t) / 1000;
      if (dtSec <= 0) return 0;
      return (newest.pos - oldest.pos) / dtSec;
    },
    reset() {
      samples = [];
    },
  };
}
