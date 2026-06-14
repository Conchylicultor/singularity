import type { ComponentType } from "react";
import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import {
  defineDispatchSlot,
  defineMountSlot,
  defineRenderSlot,
  defineWrapperSlot,
} from "@plugins/primitives/plugins/slot-render/web";
import { definePaneToolbar } from "@plugins/primitives/plugins/pane-toolbar/web";
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
 *  - Toolbar               — action widgets on the right of the top toolbar (play/pause, speed, …).
 *  - Transport             — full-width horizontal strip below the toolbar (progress bar, …).
 *  - Section               — pre-existing free-floating panels (current-chord readout, …).
 */
export const Sonata = {
  // INPUT — data registry. LoaderComponent is the UI to provide input
  // (dropzone / text editor); compile turns raw input into a Score (pure).
  // `raw` is the source's currently-loaded input (persisted in the shell across
  // source switches) so editor loaders can render *controlled* — switching the
  // visible source never loses what was typed. `onRaw` feeds new input back.
  Source: defineSlot<{
    id: string;
    label: string;
    icon?: IconType;
    LoaderComponent: ComponentType<{
      raw?: unknown;
      onRaw: (raw: unknown) => void;
    }>;
    compile: (raw: unknown) => Score;
  }>("sonata.source", { docLabel: (p) => p.label }),

  // DISPLAY — single-active selector. `Extra` carries the metadata the picker
  // enumerates (collection-consumer clean — never names a contributor). The
  // dispatch key is the active display id, carried in the render props so the
  // shell stays the single owner of `activeDisplayId`. The playback cursor is
  // NOT a prop — displays read it from the cursor store (`useCursorBeat` /
  // `useCursorApi().subscribe`) so a per-frame advance never re-renders the
  // dispatch site.
  Display: defineDispatchSlot<
    {
      score: Score;
      /** Playback tempo multiplier (1 = authored). Displays scale scroll speed by
       *  this so slowing down slows the scroll instead of stretching notes. */
      tempoScale: number;
      activeDisplayId: string;
    },
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
  // The optional fields below are generic metadata consumed only through the
  // collection API (`useContributions`) — never by naming a contributor: they
  // let a per-track resolver auto-map a track's MIDI program to a timbre, group
  // the picker, and pick a fallback. A timbre that opts out simply omits them.
  Instrument: defineSlot<{
    id: string;
    label: string;
    icon?: IconType;
    /** GM program (0-127) this timbre represents — the auto-map key. */
    gmProgram?: number;
    /** Picker grouping label (e.g. the GM family). */
    group?: string;
    /** Fallback timbre for tracks with no program/override (exactly one). */
    default?: boolean;
    /** Create a voice manager bound to `ctx`, routed into `destination`. */
    createVoices: (ctx: AudioContext, destination: AudioNode) => InstrumentVoices;
  }>("sonata.instrument", { docLabel: (p) => p.label }),

  // HOME — the app landing surface (song library). Single render slot; the
  // library plugin contributes its gallery here. Shell shows it when view==="library".
  Home: defineRenderSlot<{ component: ComponentType }>("sonata.home", {
    docLabel: (p) => p.id,
  }),

  // SURFACE PROVIDER — per-surface React context wrappers folded around the
  // SonataProvider's children (inside SonataContext, so wrappers may
  // `useSonata()`). Lets a plugin the shell can't import (a cycle) inject ONE
  // provider above a Sonata surface's whole subtree — so sibling consumers in
  // different slot branches (e.g. an audio engine and its volume control) share
  // one per-surface context. Contributions nest outside-in in contribution
  // order; the slot paints nothing itself.
  SurfaceProvider: defineWrapperSlot("sonata.surface-provider"),

  // EFFECT — headless, always-mounted Sonata-scoped side effects. Components
  // contributed here render nothing; they observe shared context (current song,
  // playback state) and run effects (e.g. recording a play, scrobbling). Mounted
  // once inside SonataProvider so contributors can `useSonata()`.
  Effect: defineMountSlot("sonata.effect", {
    docLabel: (p) => p.id,
  }),

  // TRANSPORT — full-width horizontal strip below the toolbar (progress bar, …).
  Transport: defineRenderSlot<{ component: ComponentType }>("sonata.transport", {
    docLabel: (p) => p.id,
  }),

  // HUD — screen-anchored heads-up overlays painted over a display, pinned to its
  // viewport corner (current-key chip, …). Unlike `Overlay`, which anchors to the
  // projection's geometry and scrolls with the content, a HUD stays fixed and
  // reads shared cursor/Score context via `useSonata()`. Display-agnostic: any
  // display hosts it with `.Render`; capability-free since it needs no projection.
  Hud: defineRenderSlot<{ component: ComponentType }>("sonata.hud", {
    docLabel: (p) => p.id,
  }),

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

/**
 * The player's top toolbar, hosted by the PaneToolbar primitive — the sanctioned
 * render-slot header host for full-surface (`chrome: false`) panes. `.Start`
 * (left: ← Library, title, display picker) and `.End` (right: transport, volume)
 * are both **reorderable** render-slot zones; the player surface renders `.Host`.
 * Hand-rolling a toolbar `<div>` is banned by the `no-adhoc-pane-toolbar` lint
 * rule. Nesting depth no longer matters: the build's slot facet does a
 * full-depth runtime walk over the barrel exports, so `.Start`/`.End` are
 * discovered as reorderable whether this lives top-level or nested under a group.
 */
export const SonataToolbar = definePaneToolbar("sonata.toolbar");
