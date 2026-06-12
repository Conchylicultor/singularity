/**
 * Pure particle simulation — the math half of the FX particle pool, kept free
 * of any pixi import so it unit-tests under plain bun:test (see
 * particles.test.ts; the Pixi-coupled emitter lives in particles.ts).
 *
 * DESIGN: a fixed-capacity structure-of-arrays. FX run every frame during
 * playback, so the hot path must do ZERO allocation: spawning writes into
 * preallocated typed arrays, death swap-removes (copy the last live particle
 * into the freed index), and `stepSim` is a tight loop over flat Float32Arrays.
 * Capacity is the budget: `spawnParticle` returns false (drops) when full —
 * graceful degradation instead of unbounded growth.
 *
 * Visual interpolation (alpha/scale over life) is stored per particle as
 * from→to pairs and resolved by the renderer-side sync via {@link lerp} on the
 * (optionally eased) progress — the sim itself only integrates motion.
 */

export interface ParticleSim {
  readonly capacity: number;
  /** Live particle count; indices [0, count) are alive and packed. */
  count: number;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  /** Seconds remaining. Reaching <= 0 kills the particle. */
  life: Float32Array;
  /** Total lifetime, for progress = 1 - life/maxLife. */
  maxLife: Float32Array;
  scale0: Float32Array;
  scale1: Float32Array;
  alpha0: Float32Array;
  alpha1: Float32Array;
  rotation: Float32Array;
  /** Angular velocity, rad/s. */
  vr: Float32Array;
  /** 0xRRGGBB tint. */
  tint: Uint32Array;
}

export interface SpawnSpec {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  /** Lifetime in seconds. Must be > 0. */
  lifeSec: number;
  scaleFrom?: number;
  scaleTo?: number;
  alphaFrom?: number;
  alphaTo?: number;
  rotation?: number;
  /** Angular velocity, rad/s. */
  spin?: number;
  /** 0xRRGGBB. Defaults to white. */
  tint?: number;
}

export interface StepParams {
  /** Constant downward acceleration, px/s² (negative = upward). */
  gravity?: number;
  /** Velocity damping rate, 1/s (v *= 1 - drag·dt, floored at 0). */
  drag?: number;
}

export function createSim(capacity: number): ParticleSim {
  if (!Number.isFinite(capacity) || capacity < 0) {
    throw new Error(`createSim: invalid capacity ${capacity}`);
  }
  return {
    capacity,
    count: 0,
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    vx: new Float32Array(capacity),
    vy: new Float32Array(capacity),
    life: new Float32Array(capacity),
    maxLife: new Float32Array(capacity),
    scale0: new Float32Array(capacity),
    scale1: new Float32Array(capacity),
    alpha0: new Float32Array(capacity),
    alpha1: new Float32Array(capacity),
    rotation: new Float32Array(capacity),
    vr: new Float32Array(capacity),
    tint: new Uint32Array(capacity),
  };
}

/**
 * Spawn one particle. Returns false (and writes nothing) when the pool is at
 * capacity — the caller's burst silently degrades, which is the intended
 * budget behavior (a dropped spark is invisible; a growing pool is a leak).
 */
export function spawnParticle(sim: ParticleSim, spec: SpawnSpec): boolean {
  if (sim.count >= sim.capacity) return false;
  if (!(spec.lifeSec > 0)) {
    throw new Error(`spawnParticle: lifeSec must be > 0, got ${spec.lifeSec}`);
  }
  const i = sim.count++;
  sim.x[i] = spec.x;
  sim.y[i] = spec.y;
  sim.vx[i] = spec.vx ?? 0;
  sim.vy[i] = spec.vy ?? 0;
  sim.life[i] = spec.lifeSec;
  sim.maxLife[i] = spec.lifeSec;
  sim.scale0[i] = spec.scaleFrom ?? 1;
  sim.scale1[i] = spec.scaleTo ?? spec.scaleFrom ?? 1;
  sim.alpha0[i] = spec.alphaFrom ?? 1;
  sim.alpha1[i] = spec.alphaTo ?? 0;
  sim.rotation[i] = spec.rotation ?? 0;
  sim.vr[i] = spec.spin ?? 0;
  sim.tint[i] = spec.tint ?? 0xffffff;
  return true;
}

/**
 * Advance every particle by `dtSec`: age, integrate gravity/drag/velocity/spin,
 * swap-remove the dead. Order within the array is NOT preserved (swap-remove),
 * which is fine — particles are visually independent.
 */
export function stepSim(sim: ParticleSim, dtSec: number, params?: StepParams): void {
  const g = params?.gravity ?? 0;
  const dragFactor = Math.max(0, 1 - (params?.drag ?? 0) * dtSec);
  let i = 0;
  while (i < sim.count) {
    const life = sim.life[i]! - dtSec;
    if (life <= 0) {
      // Swap-remove: copy the last live particle into this slot. Do NOT
      // advance `i` — the swapped-in particle still needs this frame's step.
      const last = --sim.count;
      if (i !== last) {
        sim.x[i] = sim.x[last]!;
        sim.y[i] = sim.y[last]!;
        sim.vx[i] = sim.vx[last]!;
        sim.vy[i] = sim.vy[last]!;
        sim.life[i] = sim.life[last]!;
        sim.maxLife[i] = sim.maxLife[last]!;
        sim.scale0[i] = sim.scale0[last]!;
        sim.scale1[i] = sim.scale1[last]!;
        sim.alpha0[i] = sim.alpha0[last]!;
        sim.alpha1[i] = sim.alpha1[last]!;
        sim.rotation[i] = sim.rotation[last]!;
        sim.vr[i] = sim.vr[last]!;
        sim.tint[i] = sim.tint[last]!;
      }
      continue;
    }
    sim.life[i] = life;
    sim.vy[i] = (sim.vy[i]! + g * dtSec) * dragFactor;
    sim.vx[i] = sim.vx[i]! * dragFactor;
    sim.x[i] = sim.x[i]! + sim.vx[i]! * dtSec;
    sim.y[i] = sim.y[i]! + sim.vy[i]! * dtSec;
    sim.rotation[i] = sim.rotation[i]! + sim.vr[i]! * dtSec;
    i++;
  }
}

/** Life progress of particle `i`: 0 at spawn → 1 at death. */
export function particleProgress(sim: ParticleSim, i: number): number {
  const max = sim.maxLife[i]!;
  return max > 0 ? 1 - sim.life[i]! / max : 1;
}

export function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

/** Classic ease-out: fast start, soft landing. */
export function easeOutCubic(p: number): number {
  const q = 1 - p;
  return 1 - q * q * q;
}
