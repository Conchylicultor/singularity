/**
 * Pooled FX particle emitter over Pixi v8 `ParticleContainer`/`Particle`.
 *
 * The simulation half (SoA arrays, integration, swap-remove) lives in the pure
 * `particle-step.ts` (unit-tested without pixi); this module owns the Pixi
 * coupling: one `ParticleContainer` per emitter (all particles share ONE
 * texture — a ParticleContainer constraint), a preallocated `Particle[]`
 * mirroring the sim slots, and the per-frame sim→particle sync.
 *
 * POOLING STRATEGY: all `capacity` Particles are created up-front and stay in
 * the container forever; "dead" slots are parked at scale 0 / color 0 instead
 * of being added/removed (add/remove churns the container's static buffers and
 * forces `update()` calls). With `vertex/position/rotation/color` dynamic, the
 * per-frame upload covers everything — and when the emitter is idle
 * (`count === 0`) the container is made invisible, which skips the render AND
 * the upload entirely, so an idle effect costs nothing per frame.
 *
 * COLOR: a Particle's GPU color is one packed ABGR u32 (alpha<<24 | BGR). We
 * write `particle.color` directly from the sim's RGB tint + interpolated alpha
 * — bypassing the `tint`/`alpha` setters avoids two `Color.setValue` calls per
 * particle per frame.
 */
import {
  Particle,
  ParticleContainer,
  type Container,
  type Texture,
} from "pixi.js";
import {
  createSim,
  lerp,
  particleProgress,
  spawnParticle,
  stepSim,
  type SpawnSpec,
  type StepParams,
} from "./particle-step";

export type { SpawnSpec } from "./particle-step";

export interface EmitterOptions extends StepParams {
  /** The single shared texture every particle in this emitter renders with. */
  texture: Texture;
  /** Pool capacity — spawns beyond it are dropped (budget degradation). */
  capacity: number;
  /**
   * Easing applied to the life progress before alpha/scale interpolation.
   * Defaults to linear; pass `easeOutCubic` for fast-attack/soft-decay looks.
   */
  ease?: (p: number) => number;
  /** Blend mode for the whole batch. FX default is additive. */
  blendMode?: "add" | "normal";
}

export interface ParticleEmitter {
  /**
   * Spawn up to `n` particles; `init(i)` builds each spec. Stops early when
   * the pool is full (drops the remainder). Returns the number spawned.
   */
  spawn(n: number, init: (i: number) => SpawnSpec): number;
  /** Advance the sim by `dtSec` and sync live particles to the GPU mirror. */
  update(dtSec: number): void;
  /** Kill every live particle immediately (seek/reset). */
  clear(): void;
  liveCount(): number;
  /** Remove + destroy the container and pool. Does NOT destroy the texture. */
  destroy(): void;
}

/** RGB → BGR channel swap (Pixi packs particle color as ABGR). */
function rgbToBgr(rgb: number): number {
  return ((rgb & 0xff) << 16) | (rgb & 0x00ff00) | ((rgb >> 16) & 0xff);
}

export function createEmitter(
  parent: Container,
  opts: EmitterOptions,
): ParticleEmitter {
  const sim = createSim(opts.capacity);
  const ease = opts.ease ?? ((p: number) => p);
  const step: StepParams = { gravity: opts.gravity, drag: opts.drag };

  const container = new ParticleContainer({
    // `vertex` carries scale/anchor, `color` carries tint+alpha — both animate
    // per frame here, so all four must be dynamic (uvs stay static: one texture).
    dynamicProperties: { vertex: true, position: true, rotation: true, color: true },
    texture: opts.texture,
  });
  container.blendMode = opts.blendMode ?? "add";
  container.visible = false;
  parent.addChild(container);

  // The GPU mirror: slot i renders sim particle i. Parked dead (scale 0).
  const particles: Particle[] = [];
  for (let i = 0; i < opts.capacity; i++) {
    const p = new Particle({
      texture: opts.texture,
      anchorX: 0.5,
      anchorY: 0.5,
      scaleX: 0,
      scaleY: 0,
      alpha: 0,
    });
    particles.push(p);
    container.addParticle(p);
  }

  /** Highest slot written last sync — the range to park when count shrinks. */
  let prevLive = 0;

  const sync = (): void => {
    const n = sim.count;
    for (let i = 0; i < n; i++) {
      const p = particles[i]!;
      const t = ease(particleProgress(sim, i));
      const scale = lerp(sim.scale0[i]!, sim.scale1[i]!, t);
      const alpha = lerp(sim.alpha0[i]!, sim.alpha1[i]!, t);
      p.x = sim.x[i]!;
      p.y = sim.y[i]!;
      p.rotation = sim.rotation[i]!;
      p.scaleX = scale;
      p.scaleY = scale;
      const a = alpha <= 0 ? 0 : alpha >= 1 ? 255 : (alpha * 255) | 0;
      p.color = rgbToBgr(sim.tint[i]!) | (a << 24);
    }
    // Park slots that died this frame so they stop rendering.
    for (let i = n; i < prevLive; i++) {
      const p = particles[i]!;
      p.scaleX = 0;
      p.scaleY = 0;
      p.color = 0;
    }
    prevLive = n;
    container.visible = n > 0;
  };

  return {
    spawn(n, init) {
      let spawned = 0;
      for (let i = 0; i < n; i++) {
        if (!spawnParticle(sim, init(i))) break; // pool full — drop the rest
        spawned++;
      }
      return spawned;
    },

    update(dtSec) {
      // Idle fast-path: nothing alive and the mirror already parked.
      if (sim.count === 0 && prevLive === 0) return;
      stepSim(sim, dtSec, step);
      sync();
    },

    clear() {
      sim.count = 0;
      sync();
    },

    liveCount: () => sim.count,

    destroy() {
      parent.removeChild(container);
      // Texture ownership stays with the effect (it may be shared across
      // emitters); destroy only the container + its particle buffer.
      container.destroy();
      particles.length = 0;
    },
  };
}
