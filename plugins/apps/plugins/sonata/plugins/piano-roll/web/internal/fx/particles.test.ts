/**
 * Tests for the PURE half of the FX particle pool (particle-step.ts) — no pixi
 * import anywhere in this file's dependency graph, so it runs under plain
 * bun:test. The Pixi-coupled emitter (particles.ts) is exercised in the
 * browser via the e2e screenshot flow.
 */
import { describe, expect, test } from "bun:test";
import {
  createSim,
  easeOutCubic,
  lerp,
  particleProgress,
  spawnParticle,
  stepSim,
} from "./particle-step";

describe("createSim", () => {
  test("allocates the requested capacity with zero live particles", () => {
    const sim = createSim(8);
    expect(sim.capacity).toBe(8);
    expect(sim.count).toBe(0);
    expect(sim.x.length).toBe(8);
    expect(sim.tint.length).toBe(8);
  });

  test("throws on invalid capacity", () => {
    expect(() => createSim(-1)).toThrow();
    expect(() => createSim(Number.NaN)).toThrow();
  });
});

describe("spawnParticle", () => {
  test("writes the spec and applies defaults", () => {
    const sim = createSim(4);
    expect(
      spawnParticle(sim, { x: 10, y: 20, lifeSec: 2, tint: 0x336699 }),
    ).toBe(true);
    expect(sim.count).toBe(1);
    expect(sim.x[0]).toBe(10);
    expect(sim.y[0]).toBe(20);
    expect(sim.vx[0]).toBe(0);
    expect(sim.life[0]).toBe(2);
    expect(sim.maxLife[0]).toBe(2);
    expect(sim.scale0[0]).toBe(1);
    expect(sim.alpha0[0]).toBe(1);
    expect(sim.alpha1[0]).toBe(0); // default fade target
    expect(sim.tint[0]).toBe(0x336699);
  });

  test("scaleTo defaults to scaleFrom (no scale animation)", () => {
    const sim = createSim(1);
    spawnParticle(sim, { x: 0, y: 0, lifeSec: 1, scaleFrom: 2.5 });
    expect(sim.scale1[0]).toBe(2.5);
  });

  test("drops (returns false) when the pool is at capacity", () => {
    const sim = createSim(2);
    expect(spawnParticle(sim, { x: 0, y: 0, lifeSec: 1 })).toBe(true);
    expect(spawnParticle(sim, { x: 1, y: 0, lifeSec: 1 })).toBe(true);
    expect(spawnParticle(sim, { x: 2, y: 0, lifeSec: 1 })).toBe(false);
    expect(sim.count).toBe(2);
    // The dropped spawn wrote nothing — survivors untouched.
    expect(sim.x[0]).toBe(0);
    expect(sim.x[1]).toBe(1);
  });

  test("throws loudly on a non-positive lifetime", () => {
    const sim = createSim(1);
    expect(() => spawnParticle(sim, { x: 0, y: 0, lifeSec: 0 })).toThrow();
  });
});

describe("stepSim", () => {
  test("integrates velocity into position", () => {
    const sim = createSim(1);
    spawnParticle(sim, { x: 0, y: 0, vx: 10, vy: -20, lifeSec: 1 });
    stepSim(sim, 0.5);
    expect(sim.x[0]).toBeCloseTo(5);
    expect(sim.y[0]).toBeCloseTo(-10);
    expect(sim.life[0]).toBeCloseTo(0.5);
  });

  test("applies gravity to vy only", () => {
    const sim = createSim(1);
    spawnParticle(sim, { x: 0, y: 0, vx: 10, vy: 0, lifeSec: 10 });
    stepSim(sim, 1, { gravity: 100 });
    expect(sim.vy[0]).toBeCloseTo(100);
    expect(sim.vx[0]).toBeCloseTo(10);
    // Position integrates the post-gravity velocity (semi-implicit Euler).
    expect(sim.y[0]).toBeCloseTo(100);
  });

  test("applies drag as exponential-style damping", () => {
    const sim = createSim(1);
    spawnParticle(sim, { x: 0, y: 0, vx: 100, vy: 100, lifeSec: 10 });
    stepSim(sim, 0.1, { drag: 2 }); // factor = 1 - 2*0.1 = 0.8
    expect(sim.vx[0]).toBeCloseTo(80);
    expect(sim.vy[0]).toBeCloseTo(80);
  });

  test("drag never inverts velocity (factor floored at 0)", () => {
    const sim = createSim(1);
    spawnParticle(sim, { x: 0, y: 0, vx: 100, vy: 0, lifeSec: 10 });
    stepSim(sim, 1, { drag: 5 }); // raw factor would be -4
    expect(sim.vx[0]).toBe(0);
  });

  test("integrates spin into rotation", () => {
    const sim = createSim(1);
    spawnParticle(sim, { x: 0, y: 0, lifeSec: 1, rotation: 1, spin: 2 });
    stepSim(sim, 0.25);
    expect(sim.rotation[0]).toBeCloseTo(1.5);
  });

  test("swap-removes the dead and steps the swapped-in survivor", () => {
    const sim = createSim(3);
    spawnParticle(sim, { x: 0, y: 0, lifeSec: 0.1, tint: 0xaa0000 }); // dies
    spawnParticle(sim, { x: 1, y: 0, lifeSec: 5, tint: 0x00bb00 });
    spawnParticle(sim, { x: 2, y: 0, vx: 10, lifeSec: 5, tint: 0x0000cc }); // swapped into slot 0
    stepSim(sim, 1);
    expect(sim.count).toBe(2);
    const tints = [sim.tint[0], sim.tint[1]];
    expect(tints).toContain(0x00bb00);
    expect(tints).toContain(0x0000cc);
    // The swapped-in survivor was integrated this frame too (x: 2 → 12).
    const swapped = sim.tint[0] === 0x0000cc ? 0 : 1;
    expect(sim.x[swapped]).toBeCloseTo(12);
  });

  test("kills everything once lifetimes elapse", () => {
    const sim = createSim(8);
    for (let i = 0; i < 8; i++) {
      spawnParticle(sim, { x: i, y: 0, lifeSec: 0.2 + i * 0.05 });
    }
    stepSim(sim, 1);
    expect(sim.count).toBe(0);
    // Pool is reusable after a full die-off.
    expect(spawnParticle(sim, { x: 0, y: 0, lifeSec: 1 })).toBe(true);
  });
});

describe("interpolation helpers", () => {
  test("particleProgress runs 0 → 1 over the lifetime", () => {
    const sim = createSim(1);
    spawnParticle(sim, { x: 0, y: 0, lifeSec: 2 });
    expect(particleProgress(sim, 0)).toBeCloseTo(0);
    stepSim(sim, 1);
    expect(particleProgress(sim, 0)).toBeCloseTo(0.5);
    stepSim(sim, 0.9);
    expect(particleProgress(sim, 0)).toBeCloseTo(0.95);
  });

  test("lerp", () => {
    expect(lerp(0, 10, 0.25)).toBeCloseTo(2.5);
    expect(lerp(5, 5, 0.9)).toBe(5);
  });

  test("easeOutCubic hits the endpoints and front-loads progress", () => {
    expect(easeOutCubic(0)).toBeCloseTo(0);
    expect(easeOutCubic(1)).toBeCloseTo(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
});
