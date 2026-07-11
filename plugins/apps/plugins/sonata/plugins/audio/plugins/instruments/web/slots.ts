import type { ComponentType } from "react";
import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";

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
  /** Live, interactive note-on for hand-played keys: starts a sustaining voice
   *  immediately (no scheduled when/duration) and returns a note-off fn that
   *  releases it. Optional — instruments that cannot sustain on demand omit it. */
  play?(pitch: number, velocity: number): () => void;
}

/**
 * The Sonata audio Instrument axis — an audio contract, not an app-shell
 * extension point. A host with an `AudioContext` (the Sonata player, or the
 * website's app-gallery vignette) consumes it without importing the Sonata app
 * shell. Kept as a namespace object because the slots facet derives `groupName`
 * from the top-level export key.
 */
export const SonataAudio = {
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
};
