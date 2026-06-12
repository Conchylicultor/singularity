/**
 * The piano-roll's FX extension point. Visual effects (key-strike glow,
 * ripples, debris, …) are SUB-PLUGINS contributing here — the host renders
 * them generically (collection-consumer clean: it never names an effect), so
 * adding an effect is one new plugin with zero piano-roll edits.
 *
 * An effect is a HEADLESS React component: it renders nothing and instead
 * wires imperative Pixi objects into the {@link FxContext} inside an effect
 * (subscribe onNoteOn/onReset, add a ticker callback, parent containers into
 * `layers`), with full teardown on unmount. Each contribution also carries its
 * own one-field `{ enabled }` config — the host gates mounting on it AND the
 * config auto-appears in the generic settings pane, so a new effect ships its
 * own toggle for free.
 */
import type { ComponentType } from "react";
import type { Container, Renderer, Ticker } from "pixi.js";
import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { ConfigDescriptor } from "@plugins/config_v2/core";
import type { BoolFieldDef } from "@plugins/fields/plugins/bool/plugins/config/core";
import type { Note, Projection } from "@plugins/apps/plugins/sonata/plugins/score/core";

/** Icon component convention used across the platform (react-icons/md style). */
type IconType = ComponentType<{ className?: string }>;

/**
 * The shape every effect's config must take: exactly one `enabled` bool. The
 * host reads it generically (`useConfig(c.config).enabled`), so the type pins
 * the contract — an effect cannot register a config the host can't gate on.
 */
export type FxToggleConfig = ConfigDescriptor<{ enabled: BoolFieldDef }>;

/**
 * A note-on as seen by FX plugins. All values are render-ready: lane screen
 * pixels, resolved numeric colors, wall-clock duration. Fired by the scene's
 * onset tracker the same frame the note's onset crosses the now-line.
 */
export interface FxNoteEvent {
  note: Note;
  /** Left edge of the note's key column, lane screen px. */
  x: number;
  /** Key column width, lane screen px. */
  width: number;
  /** The now-line's screen y (lane bottom — where notes land). */
  laneY: number;
  /** Resolved track color (0xRRGGBB — undarkened, even for black keys). */
  color: number;
  /** Normalized velocity, 0..1. */
  velocity: number;
  isBlack: boolean;
  /** Wall-clock duration at the CURRENT tempo (authored / tempoScale). */
  durationSeconds: number;
}

/**
 * Everything an effect needs to paint: mount points, event streams, geometry
 * accessors, the shared ticker/renderer, and a quality budget.
 *
 * `getProjection`/`getLaneSize` are ACCESSORS (not snapshots) on purpose: the
 * context object stays identity-stable across lane resizes, and effects read
 * the latest geometry per tick instead of closing over stale values.
 */
export interface FxContext {
  /**
   * FX mount points in the scene graph: `belowNotes` paints under the falling
   * notes (subtle ambience), `aboveNotes` paints over them (strikes, debris).
   * Both are SCREEN-SPACE (they do not scroll with the content).
   */
  layers: { belowNotes: Container; aboveNotes: Container };
  /** Subscribe to note-ons; returns the unsubscribe. */
  onNoteOn(cb: (e: FxNoteEvent) => void): () => void;
  /** Seek/jump/score-change — drop all in-flight state. Returns unsubscribe. */
  onReset(cb: () => void): () => void;
  /** The roll's published projection (content-space geometry, latest). */
  getProjection(): Projection;
  /** Lane size in CSS px (latest — re-read per tick, never cache). */
  getLaneSize(): { width: number; height: number };
  /** The app ticker — add per-frame updates here; REMOVE them on unmount. */
  ticker: Ticker;
  /** The live renderer (texture generation, DPR). */
  renderer: Renderer;
  /**
   * Quality knobs. `particleBudget` is a per-pool capacity ceiling derived
   * from the lane area — size pools with it and let spawns drop when full so
   * effects degrade gracefully on small lanes instead of overdrawing.
   */
  quality: { particleBudget: number };
}

/**
 * One visual effect for the piano roll. `tier` groups the host's toggle UI
 * ("ambient" = subtle defaults, "fancy" = opt-in spectacle); `config` is the
 * effect's own `{ enabled }` descriptor (register it via ConfigV2 on both
 * runtimes); `component` is the headless wiring component.
 */
export const PianoRollFx = defineSlot<{
  id: string;
  label: string;
  icon?: IconType;
  tier: "ambient" | "fancy";
  config: FxToggleConfig;
  component: ComponentType<{ fx: FxContext }>;
}>("piano-roll.fx", { docLabel: (p) => p.label });
