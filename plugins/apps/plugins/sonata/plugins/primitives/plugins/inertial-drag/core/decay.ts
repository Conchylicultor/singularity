/**
 * Closed-form exponential-friction deceleration — the iOS/Android "fling" model.
 *
 * A flick imparts an initial velocity `v0` that decays exponentially under a
 * friction constant `k` (1/s):
 *
 *   v(t) = v0 · e^(−k·t)
 *   x(t) = x0 + (v0/k)·(1 − e^(−k·t))      → rest = x0 + v0/k
 *
 * Because these are closed forms in elapsed wall-time `t`, an animation that
 * SAMPLES them by `(now − start)` is frame-rate-independent: it lands at the
 * same place on a 60 Hz and a 120 Hz display with no integration drift.
 *
 * The functions are scale-agnostic scalars — the inertial-drag hook runs them in
 * pixel space and converts to value units only at emit time.
 */

/** Validate the friction constant; a non-positive `k` has no physical meaning. */
function assertFriction(friction: number): void {
  if (!(friction > 0)) {
    throw new Error(`friction must be > 0, got ${friction}`);
  }
}

/** Position after `elapsedSec` seconds of fling from `from` at initial `velocity`. */
export function flingPosition(
  from: number,
  velocity: number,
  friction: number,
  elapsedSec: number,
): number {
  assertFriction(friction);
  return from + (velocity / friction) * (1 - Math.exp(-friction * elapsedSec));
}

/** Velocity remaining after `elapsedSec` seconds of fling. */
export function flingVelocity(
  velocity: number,
  friction: number,
  elapsedSec: number,
): number {
  assertFriction(friction);
  return velocity * Math.exp(-friction * elapsedSec);
}

/** The position the fling asymptotically settles at (`t → ∞`). */
export function flingRest(
  from: number,
  velocity: number,
  friction: number,
): number {
  assertFriction(friction);
  return from + velocity / friction;
}
