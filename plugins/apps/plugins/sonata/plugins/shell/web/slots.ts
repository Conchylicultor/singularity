import type { ComponentType } from "react";
import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import {
  defineDispatchSlot,
  defineRenderSlot,
} from "@plugins/primitives/plugins/slot-render/web";
import type {
  Annotation,
  Capability,
  Projection,
  Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { NoDisplay } from "./components/no-display";

/** Icon component convention used across the platform (react-icons/md style). */
type IconType = ComponentType<{ className?: string }>;

/** One note to sound, timed against the AudioContext clock (absolute seconds). */
export interface ScheduledNote {
  pitch: number;     // MIDI 0-127
  velocity: number;  // MIDI 0-127
  when: number;      // absolute AudioContext.currentTime-based start
  duration: number;  // seconds
}

/** A live, audio-context-bound voice manager produced by an Instrument. */
export interface InstrumentVoices {
  loaded: Promise<void>;          // resolves when samples are ready to sound
  schedule(note: ScheduledNote): void;
  allOff(): void;                 // cancel everything scheduled/sounding (stop/seek)
  dispose(): void;                // release audio resources
}

/**
 * The Sonata extension axes. Three axes, four contribution slots, plus the
 * existing free-floating `Section` panels:
 *
 *  - Source   (input)      — data registry; shell calls `compile()` on the active one.
 *  - Display  (display)    — single-active selector; a display *is* one component.
 *  - Analyzer (rich data)  — pure `(Score) => Annotation[]`; all run, merged in.
 *  - Overlay  (rich visual)— capability-filtered geometry, rendered via `renderIsolated`.
 *  - Instrument            — audio voice manager bound to a Web Audio context.
 *  - Section               — pre-existing free-floating panels (current-chord readout, …).
 */
export const Sonata = {
  // INPUT — data registry. LoaderComponent is the UI to provide input
  // (dropzone / text editor); compile turns raw input into a Score (pure).
  Source: defineSlot<{
    id: string;
    label: string;
    icon?: IconType;
    LoaderComponent: ComponentType<{ onRaw: (raw: unknown) => void }>;
    compile: (raw: unknown) => Score;
  }>("sonata.source", { docLabel: (p) => p.label }),

  // DISPLAY — single-active selector. `Extra` carries the metadata the picker
  // enumerates (collection-consumer clean — never names a contributor). The
  // dispatch key is the active display id, carried in the render props so the
  // shell stays the single owner of `activeDisplayId`.
  Display: defineDispatchSlot<
    { score: Score; cursorBeat: number; activeDisplayId: string },
    string,
    { id: string; label: string; icon?: IconType; capabilities: Capability[] }
  >("sonata.display", {
    key: (props) => props.activeDisplayId,
    fallback: NoDisplay,
    docLabel: (c) => c.label,
  }),

  // RICH DATA — pure analyzers; emit only source:"derived".
  Analyzer: defineSlot<{
    id: string;
    analyze: (score: Score) => Annotation[];
  }>("sonata.analyzer", { docLabel: (p) => p.id }),

  // RICH VISUAL — geometry-anchored overlays, capability-filtered. The host
  // renders an overlay only when `requires ⊆ display.capabilities` and the Score
  // has annotations of its `annotationType` (filters on generic fields only).
  Overlay: defineSlot<{
    id: string;
    annotationType: string;
    requires: Capability[];
    component: ComponentType<{
      projection: Projection;
      annotations: Annotation[];
    }>;
  }>("sonata.overlay", { docLabel: (p) => p.id }),

  // PITCH AXIS — decorations rendered in a display's pitch-axis gutter (the
  // piano keyboard, future fretboards / pitch rulers). Capability-filtered like
  // Overlay: the host renders one only when `requires ⊆ display.capabilities`.
  // Anchors via the published projection (`keys` / `pitchToX`).
  PitchAxis: defineSlot<{
    id: string;
    requires: Capability[];
    component: ComponentType<{ projection: Projection }>;
  }>("sonata.pitch-axis", { docLabel: (p) => p.id }),

  // INSTRUMENTS — contribute a voice manager bound to a Web Audio AudioContext.
  Instrument: defineSlot<{
    id: string;
    label: string;
    icon?: IconType;
    /** Create a voice manager bound to `ctx`, routed into `destination`. */
    createVoices: (ctx: AudioContext, destination: AudioNode) => InstrumentVoices;
  }>("sonata.instrument", { docLabel: (p) => p.label }),

  // EXISTING — free-floating panels (current-chord readout, controls) that read
  // shared Score + cursor context.
  Section: defineRenderSlot<{
    label: string;
    icon?: ComponentType<{ className?: string }>;
    component: ComponentType;
    area?: "editor" | "player";
  }>("sonata.section", {
    docLabel: (p) => p.label,
  }),
};
