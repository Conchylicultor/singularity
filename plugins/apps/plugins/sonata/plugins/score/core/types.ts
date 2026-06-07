/**
 * The Sonata `Score` IR — the narrow waist of the Sonata pipeline.
 *
 * Pure TypeScript: no React, no framework, no UI. Every input source compiles
 * *into* a `Score`; every display reads *from* one. That collapses N inputs ×
 * M displays into N+M integrations (the compiler pattern: many front-ends → one
 * IR → many back-ends).
 *
 * The Score has two layers, and the split is the load-bearing idea:
 *  - `notes`       — the literal pitches over time (what plays / what the roll draws)
 *  - `annotations` — typed, time-ranged *meaning* on top of the notes (chord
 *    symbols, voicings, sections, key). This is the "rich display" data.
 *
 * Either layer can be authored or derived, so any display can render notes,
 * chord names, or both — regardless of which input authored what. Every
 * annotation records its `source` so a display can badge inferred data and an
 * Analyzer never clobbers authored truth.
 *
 * This module is the DAG leaf: it depends on nothing. Display-agnostic
 * rich-display contracts (`Capability`, `Projection`) live here too — NOT in the
 * piano-roll plugin — so analyzers/overlays import them via the barrel without
 * deep-importing a display's internals.
 */

// ---------------------------------------------------------------------------
// Full IR
// ---------------------------------------------------------------------------

/** A key signature, e.g. `{ tonic: "C", mode: "major" }`. */
export interface KeySignature {
  /** Tonic note name, e.g. "C", "F#", "Bb". */
  tonic: string;
  mode: "major" | "minor";
}

/** How a MIDI pitch is spelled on the staff (MIDI 61 is C#4 *or* Db4). */
export interface PitchSpelling {
  /** Diatonic step letter. */
  step: "C" | "D" | "E" | "F" | "G" | "A" | "B";
  /** Chromatic alteration in semitones: -1 = flat, 0 = natural, +1 = sharp. */
  alter: number;
  /** Scientific octave (middle C = C4). */
  octave: number;
}

/** A part / instrument. MIDI channel, sheet part, etc. */
export interface TrackMeta {
  id: string;
  name?: string;
  instrumentHint?: string;
}

/** A piecewise-constant tempo segment: from `beat` onward, the tempo is `bpm`. */
export type TempoEvent = { beat: number; bpm: number };

/** A time-signature change taking effect at `beat`. */
export type TimeSigEvent = {
  beat: number;
  numerator: number;
  denominator: number;
};

/** A single literal pitch event. */
export interface Note {
  /** Stable identity — annotations target notes by id and survive re-analysis. */
  id: string;
  /** MIDI note number (always present). */
  pitch: number;
  /** Staff spelling when known/inferred; raw MIDI may leave it undefined. */
  spelling?: PitchSpelling;
  /** Start in quarter-note beats (1.0 = one quarter note). */
  start: number;
  /** Duration in quarter-note beats. */
  duration: number;
  /** MIDI velocity (0–127). */
  velocity: number;
  /** -> TrackMeta.id (the part this note belongs to). */
  track: string;
  /** Melodic line within a track (an independent axis from `track`). */
  voice?: number;
}

/** Discriminated `data` payloads for built-in annotation types. */
// `symbol` is the normalized (sharps) name — always present and the primary
// label every display shows. `spelledSymbol` is the key-aware enharmonic
// refinement (e.g. `B♭m` where `symbol` is `A#m`), present *only* when a key
// context yields a spelling that differs from `symbol`; otherwise omitted.
// `bass` is the pitch-class in the bass when it differs from the root (an
// inversion / slash chord, e.g. `C/E`); present *only* on a genuine inversion
// where the bass is a chord tone, otherwise omitted. The slash is already baked
// into `symbol`/`spelledSymbol`, so displays need not special-case it.
export type ChordData = {
  symbol: string;
  root: number;
  quality: string;
  bass?: number;
  spelledSymbol?: string;
};
export type VoicingData = { label?: string }; // targets notes via target.noteIds
export type SectionData = { name: string };

/**
 * Typed, time-ranged meaning layered on top of the notes.
 *
 * `T` is the discriminating `type` tag and `D` its `data` shape. The built-in
 * union (`chord` | `voicing` | `section`) declares its `data` here so overlays
 * get type-safe payloads — the one place a little central coupling pays off.
 */
export interface Annotation<T extends string = string, D = unknown> {
  /** "chord" | "voicing" | "section" | "key" | … */
  type: T;
  /** Start in beats. */
  start: number;
  /** End in beats. */
  end: number;
  /** Optional anchor onto specific notes / track / voice. */
  target?: { noteIds?: string[]; track?: string; voice?: number };
  data: D;
  /** Whether this is authored truth or analyzer-derived. */
  source: "authored" | "derived";
  /** Optional [0,1] confidence for derived annotations. */
  confidence?: number;
}

/** Convenience aliases for the built-in annotation shapes. */
export type ChordAnnotation = Annotation<"chord", ChordData>;
export type VoicingAnnotation = Annotation<"voicing", VoicingData>;
export type SectionAnnotation = Annotation<"section", SectionData>;

/** The canonical in-memory model — the narrow waist. */
export interface Score {
  meta: { title?: string; key?: KeySignature; pickupBeats?: number };
  /** Parts / instruments. */
  tracks: TrackMeta[];
  /** Sorted, piecewise-constant — NOT a single bpm. */
  tempoMap: TempoEvent[];
  /** Sorted — NOT a single time signature. */
  timeSigMap: TimeSigEvent[];
  notes: Note[];
  annotations: Annotation[];
}

// ---------------------------------------------------------------------------
// Rich-display contracts (display-agnostic, kept here to keep the graph a DAG)
// ---------------------------------------------------------------------------

/**
 * A capability a Display offers. An Overlay declares the capabilities it
 * `requires`; the overlay host renders it only when its requirements are a
 * subset of the display's capabilities. Grows when staff / fretboard land.
 */
export type Capability = "time-axis" | "pitch-plane";

/**
 * One piano key on the pitch axis, in screen pixels. The piano roll is vertical
 * (pitch runs horizontally across the full keyboard), so `center`/`width` are X
 * coordinates. Both the falling-note rectangles and the keyboard renderer derive
 * their geometry from this single layout, so a note lands exactly on its key.
 */
export interface KeyLane {
  /** MIDI note number. */
  pitch: number;
  /** True for the five accidental pitch classes (drawn as narrow black keys). */
  isBlack: boolean;
  /** Pixel center along the pitch (X) axis. */
  center: number;
  /** Pixel column width (white-key vs. narrower black-key). */
  width: number;
}

/**
 * Geometry a Display publishes (via React context) so capability-compatible
 * overlays and pitch-axis decorations can anchor themselves to display
 * coordinates without knowing which display they're on. Optional accessors are
 * present iff the matching capability is offered.
 *
 * The piano roll is VERTICAL: time grows downward (Y) and pitch spans the full
 * 88-key keyboard horizontally (X). The accessor names reflect that screen
 * mapping; the capability names (`"time-axis"`, `"pitch-plane"`) stay semantic.
 */
export interface Projection {
  capabilities: ReadonlySet<Capability>;
  /** Lane pixel dimensions. Content-space and cursor-invariant — no scroll
   * position lives here; the playback cursor is applied as a translate by the
   * display, never baked into the projection. */
  viewport: { width: number; height: number };
  /** Present iff "time-axis": beat → screen Y (px from the top of the lane). */
  beatToY?: (beat: number) => number;
  /** Present iff "pitch-plane": pitch → screen X (px, key center). */
  pitchToX?: (pitch: number) => number;
  /** Present iff both axes. */
  noteToRect?: (note: Note) => { x: number; y: number; w: number; h: number };
  /** Present iff "pitch-plane": the full key layout the pitch axis renders. */
  keys?: readonly KeyLane[];
}
