/**
 * fx-core — the ambient baseline effect set, three pieces per note-on:
 *
 *  1. KEY-STRIKE GLOW — one pooled additive sprite of a shared radial-gradient
 *     texture at the strike point (x center, laneY), tinted the event color,
 *     scaled to the key width, ~250 ms ease-out fade.
 *  2. RISING SPARKS — 3–8 (velocity-scaled) small additive particles drifting
 *     up from the strike with jitter and spread, ~600 ms fade.
 *  3. ACTIVE-NOTE BRIGHTEN — an additive white quad tinted the event color
 *     (alpha ≈ 0.18) over the portion of the sounding bar still ABOVE the
 *     now-line, shrinking as the bar scrolls past it.
 *
 * BRIGHTEN GEOMETRY (the documented approximation): at onset the bar's bottom
 * sits exactly AT the now-line (laneY) and then scrolls DOWN below it at the
 * lane's px/sec rate. Because the bar's full pixel height corresponds to its
 * full wall-clock duration at that SAME rate, the still-above-the-line portion
 * is simply `rect.h · remaining/duration`, anchored bottom-at-laneY — no
 * scroll offset or px/sec constant needed. `rect` comes fresh from
 * `getProjection().noteToRect(note)` each tick, so resizes stay pixel-exact.
 * This is exact under constant tempo across the note; a tempo-map change (or
 * a live tempo-scale tweak) mid-note drifts the linear countdown slightly —
 * acceptable for a glow, and every seek clears in-flight bars via onReset.
 *
 * Headless: renders nothing; all painting is imperative Pixi wired in one
 * effect with full teardown (unsubscribe, ticker.remove, destroy containers
 * and generated textures).
 */
import { useEffect } from "react";
import {
  Container,
  Graphics,
  Sprite,
  Texture,
  type Renderer,
  type Ticker,
} from "pixi.js";
import {
  createEmitter,
  easeOutCubic,
  type FxContext,
  type FxNoteEvent,
} from "@plugins/apps/plugins/sonata/plugins/piano-roll/web";

/** Brighten quad base alpha (additive, so it reads as a gentle lift). */
const BRIGHTEN_ALPHA = 0.18;
/** Fade-out window at the end of a brighten (avoids a visible pop). */
const BRIGHTEN_RELEASE_SEC = 0.12;
/** Bars shorter than this aren't worth a brighten (grace-note spam guard). */
const BRIGHTEN_MIN_SEC = 0.05;
/** Hard cap on simultaneous brighten quads (dense chords degrade gracefully). */
const BRIGHTEN_MAX_LIVE = 64;

/**
 * Soft radial glow: stacked concentric discs of low constant alpha approximate
 * a Gaussian falloff (alpha accumulates toward the center). Generated once per
 * mount; the caller owns (and must destroy) the texture.
 */
function makeGlowTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  const R = 32;
  const STEPS = 16;
  for (let s = 0; s < STEPS; s++) {
    g.circle(R, R, R * (1 - s / STEPS)).fill({ color: 0xffffff, alpha: 0.1 });
  }
  const tex = renderer.generateTexture({ target: g, antialias: true });
  g.destroy();
  return tex;
}

/** Small soft dot for sparks: bright core + faint halo. */
function makeSparkTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  g.circle(4, 4, 3.5).fill({ color: 0xffffff, alpha: 0.35 });
  g.circle(4, 4, 2).fill({ color: 0xffffff, alpha: 1 });
  const tex = renderer.generateTexture({ target: g, antialias: true });
  g.destroy();
  return tex;
}

interface LiveBar {
  note: FxNoteEvent["note"];
  /** Wall-clock duration at onset (FxNoteEvent.durationSeconds). */
  dur: number;
  /** Elapsed wall-clock seconds since onset. */
  t: number;
  sprite: Sprite;
}

export function NoteGlowSparksFx({ fx }: { fx: FxContext }) {
  useEffect(() => {
    const glowTex = makeGlowTexture(fx.renderer);
    const sparkTex = makeSparkTexture(fx.renderer);
    const budget = fx.quality.particleBudget;

    const glow = createEmitter(fx.layers.aboveNotes, {
      texture: glowTex,
      capacity: Math.min(48, budget),
      ease: easeOutCubic,
    });
    const sparks = createEmitter(fx.layers.aboveNotes, {
      texture: sparkTex,
      capacity: Math.min(320, budget),
      // Gentle deceleration so sparks drift to a stop rather than flying off.
      gravity: 40,
      drag: 0.8,
    });

    // --- brighten quads: a visible/invisible sprite pool over Texture.WHITE --
    const brightenLayer = new Container();
    fx.layers.aboveNotes.addChild(brightenLayer);
    const freeSprites: Sprite[] = [];
    const liveBars: LiveBar[] = [];
    const acquireSprite = (): Sprite => {
      const s = freeSprites.pop() ?? new Sprite(Texture.WHITE);
      if (!s.parent) {
        s.blendMode = "add";
        brightenLayer.addChild(s);
      }
      s.visible = true;
      return s;
    };
    const releaseSprite = (s: Sprite): void => {
      s.visible = false;
      freeSprites.push(s);
    };

    const offNoteOn = fx.onNoteOn((e) => {
      const cx = e.x + e.width / 2;

      // 1. Glow: diameter ≈ 2.4× the key width, alpha scaled by velocity.
      const glowScale = (e.width * 2.4) / glowTex.width;
      glow.spawn(1, () => ({
        x: cx,
        y: e.laneY,
        lifeSec: 0.25,
        scaleFrom: glowScale,
        scaleTo: glowScale * 1.35,
        alphaFrom: 0.18 + 0.32 * e.velocity,
        alphaTo: 0,
        tint: e.color,
      }));

      // 2. Sparks: 3–8 by velocity, rising with jitter and slight spread.
      const n = 3 + Math.round(e.velocity * 5);
      sparks.spawn(n, () => ({
        x: cx + (Math.random() - 0.5) * e.width * 0.8,
        y: e.laneY,
        vx: (Math.random() - 0.5) * 60,
        vy: -(50 + Math.random() * 90 + e.velocity * 90),
        lifeSec: 0.45 + Math.random() * 0.3,
        scaleFrom: 0.7 + Math.random() * 0.5,
        scaleTo: 0.25,
        alphaFrom: 0.5 + 0.4 * e.velocity,
        alphaTo: 0,
        tint: e.color,
      }));

      // 3. Brighten: track the sounding bar (see header for the geometry).
      if (e.durationSeconds > BRIGHTEN_MIN_SEC && liveBars.length < BRIGHTEN_MAX_LIVE) {
        const sprite = acquireSprite();
        sprite.tint = e.color;
        sprite.alpha = BRIGHTEN_ALPHA;
        liveBars.push({ note: e.note, dur: e.durationSeconds, t: 0, sprite });
      }
    });

    const offReset = fx.onReset(() => {
      // Seek/score-change: every in-flight visual is stale — drop it all.
      for (const bar of liveBars) releaseSprite(bar.sprite);
      liveBars.length = 0;
      glow.clear();
      sparks.clear();
    });

    const tick = (ticker: Ticker): void => {
      const dt = ticker.deltaMS / 1000;
      glow.update(dt);
      sparks.update(dt);

      if (liveBars.length === 0) return;
      const proj = fx.getProjection();
      // `noteToRect` is optional on Projection (capability-dependent), but the
      // piano roll always publishes a pitch-plane projection — fail loudly if
      // that invariant ever breaks rather than silently skipping the effect.
      const noteToRect = proj.noteToRect;
      if (!noteToRect) {
        throw new Error("fx-core: projection lacks noteToRect (pitch-plane capability expected)");
      }
      const laneY = fx.getLaneSize().height;
      for (let i = liveBars.length - 1; i >= 0; i--) {
        const bar = liveBars[i]!;
        bar.t += dt;
        const remaining = bar.dur - bar.t;
        if (remaining <= 0) {
          releaseSprite(bar.sprite);
          liveBars.splice(i, 1);
          continue;
        }
        // Fresh rect per tick → resize-proof; height shrinks linearly with
        // remaining duration (the approximation documented in the header).
        const rect = noteToRect(bar.note);
        const h = rect.h * (remaining / bar.dur);
        const s = bar.sprite;
        s.position.set(rect.x, laneY - h);
        s.width = rect.w;
        s.height = h;
        s.alpha = BRIGHTEN_ALPHA * Math.min(1, remaining / BRIGHTEN_RELEASE_SEC);
      }
    };
    fx.ticker.add(tick);

    return () => {
      offNoteOn();
      offReset();
      fx.ticker.remove(tick);
      glow.destroy();
      sparks.destroy();
      // Destroys pooled sprites too; Texture.WHITE is shared and untouched
      // (sprite destroy does not destroy textures by default).
      brightenLayer.destroy({ children: true });
      glowTex.destroy(true);
      sparkTex.destroy(true);
    };
  }, [fx]);

  return null;
}
