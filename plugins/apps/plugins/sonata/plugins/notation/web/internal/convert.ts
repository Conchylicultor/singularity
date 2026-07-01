/**
 * PURE `Score` → `EngraveModel` converter — the genuinely hard half of the
 * notation lens, kept renderer-free and unit-tested.
 *
 * It turns the polyphonic, beat-based `Score` IR into ordered measures of
 * drawable tickables (chords / rests) arranged in a **part → staff → voice**
 * hierarchy, so the VexFlow engraver only has to lay them out.
 *
 * The pipeline is two phases:
 *
 *  1. **Plan (global).** Group notes into *parts* by the `staffLayout` mode,
 *     give each part one or two staves (single clef, or a treble/bass grand
 *     staff), and **voice-partition** each staff's notes once over the whole
 *     score (so a voice's membership is stable bar-to-bar). See
 *     {@link ./voices.partitionVoices}.
 *  2. **Build (per bar, per voice).** Feed each voice's notes — clipped to the
 *     bar and quantized to the {@link Q} grid — through {@link buildBarStaff},
 *     the unchanged run/quantize/decompose machinery. Because a voice never
 *     staggered-overlaps, runs collapse to the real note-units and ties are only
 *     the legitimate duration/barline ties — a held note is no longer re-struck
 *     when a neighbouring voice moves.
 *
 * Remaining simplifications (documented in CLAUDE.md): treble/bass clefs only, a
 * 1/16 quantization grid, no tuplets/grace notes, a per-staff display-voice cap.
 */
import {
  bars,
  effectiveKeyAt,
  makeKeySpeller,
  scoreEndBeat,
  type ChordAnnotation,
  type KeySignature,
  type Note,
  type PitchSpelling,
  type Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { decomposeDuration, Q } from "./durations";
import { partitionVoices, type NoteLike } from "./voices";

/** One drawable tickable — a chord (≥1 key) or a rest (`isRest`). */
export interface EngTickable {
  /** Absolute start beat — feeds the BeatIndex (playhead / highlight / seek). */
  beat: number;
  /** VexFlow keys, e.g. `["c#/4", "e/4"]`. For a rest, a single placement key. */
  keys: string[];
  /** VexFlow base duration token ("w" | "h" | "q" | "8" | "16"). */
  duration: string;
  /** Augmentation dots (0–2), applied via `Dot.buildAndAttach` at draw time. */
  dots: number;
  /** Length in quarter-note beats this tickable occupies (for highlight ranges). */
  beats: number;
  /** Whether this is a rest (drawn with the `"r"` suffix). */
  isRest: boolean;
  /** Tied into the following tickable in this voice's flat sequence. */
  tieToNext: boolean;
  /** Per-key chromatic alteration, parallel to `keys` (for explicit accidentals). */
  alters: number[];
}

/** Stem direction of a voice on a staff. */
export type StemDir = "up" | "down" | "auto";

/** One independent melodic line on a staff (own stem direction). */
export interface EngVoice {
  tickables: EngTickable[];
  /** "up" for the upper voice of a 2-voice staff, "down" for the lower, "auto" alone. */
  stem: StemDir;
}

/** One staff of a measure: a clef + 1..N voices. */
export interface EngStaff {
  clef: "treble" | "bass";
  /** Owning part/track id — for bracketing + the system label. */
  partId: string;
  voices: EngVoice[];
}

/** One engraved measure, spanning every part top-to-bottom. */
export interface EngMeasure {
  index: number;
  startBeat: number;
  timeSig: { numerator: number; denominator: number };
  /** VexFlow key-signature name for this measure (e.g. "C", "Bb", "F#m"). */
  keyName: string;
  /** Whether `keyName` differs from the previous measure (draw a new key sig). */
  keyChanged: boolean;
  /** Ordered top→bottom across ALL parts; the same shape in every measure. */
  staves: EngStaff[];
  /** Chord symbol anchored to the measure start, when `showChordSymbols`. */
  chordSymbol?: string;
}

/** Part metadata, ordered top→bottom, for brackets + labels. */
export interface EngPart {
  id: string;
  name?: string;
  /** Number of staves this part owns (1 = single staff, 2 = grand staff). */
  staffCount: 1 | 2;
}

/** The full engraving input: ordered measures + the part layout. */
export interface EngraveModel {
  measures: EngMeasure[];
  /** Ordered top→bottom; >1 part → draw a system bracket, else a brace only. */
  parts: EngPart[];
}

/** How tracks are mapped onto staves. */
export type StaffLayout = "auto" | "grand" | "perTrack";

export interface ConvertOptions {
  /** MIDI pitch at/above which a note goes to the treble staff (default 60). */
  splitPitch: number;
  /** Whether to attach per-measure chord symbols. */
  showChordSymbols: boolean;
  /** Track→staff mapping mode. */
  staffLayout: StaffLayout;
  /** When true, partition each staff into independent voices (stems up/down). */
  separateVoices: boolean;
  /** Max display voices per staff (default 2; classical max 4). */
  maxVoicesPerStaff?: number;
  /**
   * Track metadata for staff labels and `auto` instrument grouping. `name`
   * labels per-track staves; `gmProgram`/`instrumentHint` form the instrument
   * key `auto` groups same-instrument tracks by (e.g. a piano's two hands).
   */
  tracks?: {
    id: string;
    name?: string;
    gmProgram?: number;
    instrumentHint?: string;
  }[];
}

const EPS = 1e-6;

/**
 * A part wants a grand staff iff its notes straddle the split pitch by a wide
 * enough margin to be unreadable on one clef (a hand-spanning instrument).
 */
const GRAND_STAFF_MIN_SPAN = 16;

/** Quantize a beat value to the {@link Q} (sixteenth-note) grid. */
function quantize(x: number): number {
  return Math.round(x / Q) * Q;
}

/**
 * Rest placement keys per clef + stem. A 2-voice staff nudges the upper voice's
 * rests above and the lower voice's below center so they don't collide.
 */
const REST_KEY: Record<"treble" | "bass", Record<StemDir, string>> = {
  treble: { auto: "b/4", up: "d/5", down: "g/4" },
  bass: { auto: "d/3", up: "f/3", down: "a/2" },
};

/** VexFlow accepts these key-signature names; anything else falls back to "C". */
const VEXFLOW_KEYS = new Set<string>([
  // Major
  "C", "G", "D", "A", "E", "B", "F#", "C#", "F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb",
  // Minor
  "Am", "Em", "Bm", "F#m", "C#m", "G#m", "D#m", "A#m",
  "Dm", "Gm", "Cm", "Fm", "Bbm", "Ebm", "Abm",
]);

/** A `KeySignature` → a VexFlow key-sig name, normalized and allowlist-guarded. */
export function vexflowKeyName(key: KeySignature | undefined): string {
  if (!key) return "C";
  const tonic = key.tonic.replace(/♯/g, "#").replace(/♭/g, "b");
  const name = tonic + (key.mode === "minor" ? "m" : "");
  return VEXFLOW_KEYS.has(name) ? name : "C";
}

/** Chromatic alteration → VexFlow accidental characters embedded in a key string. */
function accidentalChars(alter: number): string {
  if (alter === 0) return "";
  return (alter > 0 ? "#" : "b").repeat(Math.abs(alter));
}

/** A spelled pitch → a VexFlow key string, e.g. `{C,#,4}` → `"c#/4"`. */
function keyOf(spelling: PitchSpelling): string {
  return `${spelling.step.toLowerCase()}${accidentalChars(spelling.alter)}/${spelling.octave}`;
}

/** A note clipped to a bar, with quantized bounds and its true (unclipped) end. */
interface Seg {
  id: string;
  pitch: number;
  spelling: PitchSpelling;
  /** Quantized start clipped to the bar. */
  qs: number;
  /** Quantized end clipped to the bar. */
  qe: number;
  /** Quantized end BEFORE clipping — > barEnd means the note crosses the barline. */
  fullEnd: number;
}

/** Build the tickable sequence for one voice within one bar. */
function buildBarStaff(
  segs: Seg[],
  barStart: number,
  barEnd: number,
): EngTickable[] {
  const numCells = Math.max(0, Math.round((barEnd - barStart) / Q));
  if (numCells === 0) return [];

  // Per-cell sounding-note id set, as a stable string key for run grouping.
  const cellIds: string[][] = [];
  for (let k = 0; k < numCells; k++) {
    const cb = barStart + k * Q;
    const ids = segs
      .filter((s) => s.qs <= cb + EPS && s.qe >= cb + Q - EPS)
      .map((s) => s.id);
    cellIds.push(ids);
  }
  const keyFor = (ids: string[]) => ids.slice().sort().join(",");

  const out: EngTickable[] = [];
  let cell = 0;
  while (cell < numCells) {
    const runKey = keyFor(cellIds[cell]!);
    let runLen = 1;
    while (cell + runLen < numCells && keyFor(cellIds[cell + runLen]!) === runKey) {
      runLen++;
    }
    const ids = cellIds[cell]!;
    const runStartBeat = barStart + cell * Q;
    const runEndCell = cell + runLen;
    const runBeats = runLen * Q;
    const pieces = decomposeDuration(runBeats);

    if (ids.length === 0) {
      // A rest run — one rest tickable per decomposed piece (rests never tie).
      // The placement key is filled per-voice by `withRestKeys`.
      pieces.forEach((p, i) => {
        out.push({
          beat: runStartBeat + offsetBeats(pieces, i),
          keys: [], // filled by the caller (it knows the clef + stem).
          duration: p.duration,
          dots: p.dots,
          beats: p.beats,
          isRest: true,
          tieToNext: false,
          alters: [0],
        });
      });
    } else {
      // A chord run — its notes (sorted low→high) share every piece; pieces tie.
      const chord = segs
        .filter((s) => ids.includes(s.id))
        .sort((a, b) => a.pitch - b.pitch);
      const keys = chord.map((s) => keyOf(s.spelling));
      const alters = chord.map((s) => s.spelling.alter);
      const continuesPastBar =
        runEndCell === numCells && chord.some((s) => s.fullEnd > barEnd + EPS);
      pieces.forEach((p, i) => {
        const isLastPiece = i === pieces.length - 1;
        out.push({
          beat: runStartBeat + offsetBeats(pieces, i),
          keys: [...keys],
          duration: p.duration,
          dots: p.dots,
          beats: p.beats,
          isRest: false,
          // Tie to the next piece (same chord) or, on the final piece, to the
          // continuation in the next bar.
          tieToNext: isLastPiece ? continuesPastBar : true,
          alters: [...alters],
        });
      });
    }
    cell = runEndCell;
  }
  return out;
}

/** Cumulative beat offset of piece `i` within a decomposed run. */
function offsetBeats(pieces: { beats: number }[], i: number): number {
  let sum = 0;
  for (let j = 0; j < i; j++) sum += pieces[j]!.beats;
  return sum;
}

/** Clip + quantize a voice's notes into bar-local segments. */
function buildSegs(
  notes: Note[],
  barStart: number,
  barEnd: number,
  speller: { spell: (pitch: number) => PitchSpelling },
): Seg[] {
  const out: Seg[] = [];
  for (const n of notes) {
    const qs = Math.max(barStart, quantize(n.start));
    const fullEnd = quantize(n.start + n.duration);
    const qe = Math.min(barEnd, fullEnd);
    if (qe - qs < Q - EPS) continue; // no representable overlap with this bar.
    out.push({
      id: n.id,
      pitch: n.pitch,
      spelling: n.spelling ?? speller.spell(n.pitch),
      qs,
      qe,
      fullEnd,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Plan — global part/staff/voice grouping (computed once over the whole score)
// ---------------------------------------------------------------------------

/** One planned staff: its clef, owning part, and global voice note-buckets. */
interface PlanStaff {
  clef: "treble" | "bass";
  partId: string;
  /** Each voice's notes (full score), top→bottom. May be empty (all-rest staff). */
  voices: Note[][];
}

interface PlanPart {
  id: string;
  name?: string;
  staves: PlanStaff[];
}

function toNoteLike(n: Note): NoteLike {
  return {
    id: n.id,
    pitch: n.pitch,
    start: n.start,
    end: n.start + n.duration,
    voice: n.voice,
  };
}

/** Partition a staff's notes into voice note-buckets (single bucket when off). */
function voiceBuckets(
  notes: Note[],
  separateVoices: boolean,
  maxVoicesPerStaff: number,
): Note[][] {
  if (notes.length === 0) return [];
  if (!separateVoices) return [[...notes]];
  const byId = new Map(notes.map((n) => [n.id, n]));
  const groups = partitionVoices(notes.map(toNoteLike), { maxVoicesPerStaff });
  return groups.map((g) => g.notes.map((nl) => byId.get(nl.id)!));
}

function meanPitchOf(notes: readonly Note[]): number {
  if (notes.length === 0) return 0;
  let sum = 0;
  for (const n of notes) sum += n.pitch;
  return sum / notes.length;
}

function medianPitchOf(notes: readonly Note[]): number {
  if (notes.length === 0) return 60;
  const sorted = notes.map((n) => n.pitch).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

/** Build one part: a grand staff when the range is wide, else a single staff. */
function buildPart(
  id: string,
  name: string | undefined,
  notes: Note[],
  forceGrand: boolean,
  splitPitch: number,
  separateVoices: boolean,
  maxVoicesPerStaff: number,
): PlanPart {
  const above = notes.some((n) => n.pitch >= splitPitch);
  const below = notes.some((n) => n.pitch < splitPitch);
  let span = 0;
  if (notes.length > 0) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const n of notes) {
      if (n.pitch < lo) lo = n.pitch;
      if (n.pitch > hi) hi = n.pitch;
    }
    span = hi - lo;
  }
  const grand = forceGrand || (above && below && span >= GRAND_STAFF_MIN_SPAN);

  if (grand) {
    const treble = notes.filter((n) => n.pitch >= splitPitch);
    const bass = notes.filter((n) => n.pitch < splitPitch);
    return {
      id,
      name,
      staves: [
        {
          clef: "treble",
          partId: id,
          voices: voiceBuckets(treble, separateVoices, maxVoicesPerStaff),
        },
        {
          clef: "bass",
          partId: id,
          voices: voiceBuckets(bass, separateVoices, maxVoicesPerStaff),
        },
      ],
    };
  }
  const clef = medianPitchOf(notes) >= splitPitch ? "treble" : "bass";
  return {
    id,
    name,
    staves: [
      {
        clef,
        partId: id,
        voices: voiceBuckets(notes, separateVoices, maxVoicesPerStaff),
      },
    ],
  };
}

/** A pre-part group: an id, an optional label, and its pooled notes. */
interface NoteGroup {
  id: string;
  name?: string;
  notes: Note[];
}

type TrackInfo = NonNullable<ConvertOptions["tracks"]>[number];

/**
 * A track's instrument key — the axis `auto` groups by. The first defined of a
 * stable `gmProgram` then `instrumentHint`; with neither, the track is its own
 * group (key = its id), so unknown instruments never wrongly merge.
 */
function instrumentKeyOf(trackId: string, meta: TrackInfo | undefined): string {
  if (meta?.gmProgram !== undefined) return `gm:${meta.gmProgram}`;
  if (meta?.instrumentHint !== undefined) return `hint:${meta.instrumentHint}`;
  return `track:${trackId}`;
}

/** Build ordered parts from note-groups: descending mean pitch, score order tiebreak. */
function partsFromGroups(
  groups: NoteGroup[],
  splitPitch: number,
  separateVoices: boolean,
  maxVoicesPerStaff: number,
): PlanPart[] {
  const orderIndex = new Map(groups.map((g, i) => [g.id, i]));
  const ordered = [...groups].sort((a, b) => {
    const dm = meanPitchOf(b.notes) - meanPitchOf(a.notes);
    if (Math.abs(dm) > EPS) return dm;
    return (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0);
  });
  return ordered.map((g, i) =>
    buildPart(
      g.id,
      g.name ?? `Track ${i + 1}`,
      g.notes,
      /* forceGrand */ false,
      splitPitch,
      separateVoices,
      maxVoicesPerStaff,
    ),
  );
}

/** Resolve the layout mode + group notes into ordered parts. */
function buildPlan(score: Score, opts: ConvertOptions): PlanPart[] {
  const { splitPitch, separateVoices, staffLayout } = opts;
  const maxVoicesPerStaff = opts.maxVoicesPerStaff ?? 2;
  const trackMeta = new Map<string, TrackInfo>(
    (opts.tracks ?? []).map((t) => [t.id, t]),
  );

  // Tracks that actually carry notes, in score order.
  const trackOrder: string[] = [];
  const byTrack = new Map<string, Note[]>();
  for (const n of score.notes) {
    let bucket = byTrack.get(n.track);
    if (!bucket) {
      bucket = [];
      byTrack.set(n.track, bucket);
      trackOrder.push(n.track);
    }
    bucket.push(n);
  }

  // A single merged grand staff over every visible note (also the `auto`
  // single-instrument result).
  const grandPart = (): PlanPart =>
    buildPart(
      "_grand",
      undefined,
      score.notes,
      /* forceGrand */ true,
      splitPitch,
      separateVoices,
      maxVoicesPerStaff,
    );

  if (staffLayout === "grand") return [grandPart()];

  if (staffLayout === "perTrack") {
    // Strictly one part per track, regardless of instrument.
    const groups: NoteGroup[] = trackOrder.map((trackId) => ({
      id: trackId,
      name: trackMeta.get(trackId)?.name,
      notes: byTrack.get(trackId)!,
    }));
    return partsFromGroups(groups, splitPitch, separateVoices, maxVoicesPerStaff);
  }

  // `auto`: group tracks by instrument key into parts. A solo-piano piece split
  // into left/right-hand tracks shares one GM program → one group → one grand
  // staff; a true ensemble of distinct instruments stays one part per instrument.
  const byInstrument = new Map<string, string[]>();
  const keyOrder: string[] = [];
  for (const trackId of trackOrder) {
    const key = instrumentKeyOf(trackId, trackMeta.get(trackId));
    let ids = byInstrument.get(key);
    if (!ids) {
      ids = [];
      byInstrument.set(key, ids);
      keyOrder.push(key);
    }
    ids.push(trackId);
  }

  // Exactly one instrument group (or no tracks) → render like `grand`.
  if (byInstrument.size <= 1) return [grandPart()];

  const groups: NoteGroup[] = keyOrder.map((key) => {
    const ids = byInstrument.get(key)!;
    const notes = ids.flatMap((id) => byTrack.get(id) ?? []);
    const names = [
      ...new Set(
        ids.map((id) => trackMeta.get(id)?.name).filter((n): n is string => !!n),
      ),
    ];
    return {
      id: key,
      name: names.length > 0 ? names.join(", ") : undefined,
      notes,
    };
  });
  return partsFromGroups(groups, splitPitch, separateVoices, maxVoicesPerStaff);
}

// ---------------------------------------------------------------------------
// Convert
// ---------------------------------------------------------------------------

/**
 * Convert a `Score` into an `EngraveModel`: ordered measures arranged as
 * parts → staves → voices, with key/time-signature metadata and optional chord
 * symbols. Pure — never mutates the input.
 */
export function convert(score: Score, opts: ConvertOptions): EngraveModel {
  const { showChordSymbols } = opts;
  const plan = buildPlan(score, opts);
  const planStaves = plan.flatMap((p) => p.staves);

  const barList = bars(score);
  const end = scoreEndBeat(score);
  const sigs =
    score.timeSigMap.length > 0
      ? [...score.timeSigMap].sort((a, b) => a.beat - b.beat)
      : [{ beat: 0, numerator: 4, denominator: 4 }];

  const chords = score.annotations.filter(
    (a): a is ChordAnnotation => a.type === "chord",
  );

  const measures: EngMeasure[] = [];
  let prevKeyName: string | null = null;

  for (let i = 0; i < barList.length; i++) {
    const barStart = barList[i]!.startBeat;
    // Time signature in force at the bar start.
    let sig = sigs[0]!;
    for (const s of sigs) {
      if (s.beat <= barStart + EPS) sig = s;
      else break;
    }
    const barLen = sig.numerator * (4 / sig.denominator);
    const barEnd = barList[i + 1]?.startBeat ?? Math.max(barStart + barLen, end);

    const keyName = vexflowKeyName(
      effectiveKeyAt(score, barStart) ?? score.meta.key,
    );
    const speller = makeKeySpeller(
      effectiveKeyAt(score, barStart) ?? score.meta.key,
    );

    const staves: EngStaff[] = planStaves.map((ps) => ({
      clef: ps.clef,
      partId: ps.partId,
      voices: buildStaffVoices(ps, barStart, barEnd, speller),
    }));

    let chordSymbol: string | undefined;
    if (showChordSymbols) {
      const c = chords.find(
        (a) => a.start >= barStart - EPS && a.start < barEnd - EPS,
      );
      if (c) chordSymbol = c.data.spelledSymbol ?? c.data.symbol;
    }

    measures.push({
      index: barList[i]!.index,
      startBeat: barStart,
      timeSig: { numerator: sig.numerator, denominator: sig.denominator },
      keyName,
      keyChanged: prevKeyName !== null && keyName !== prevKeyName,
      staves,
      chordSymbol,
    });
    prevKeyName = keyName;
  }

  // `bars()` emits a trailing bar when content ends exactly on a barline; drop
  // any trailing measures that are pure rests with no chord symbol so the score
  // doesn't end on a spurious empty measure. Interior rest measures stay.
  while (measures.length > 1) {
    const last = measures.at(-1)!;
    const allRests = last.staves.every((s) =>
      s.voices.every((v) => v.tickables.every((t) => t.isRest)),
    );
    if (allRests && last.chordSymbol === undefined) measures.pop();
    else break;
  }

  const parts: EngPart[] = plan.map((p) => ({
    id: p.id,
    name: p.name,
    staffCount: p.staves.length === 2 ? 2 : 1,
  }));

  return { measures, parts };
}

/** Build a measure's voices for one planned staff (or one bar-rest voice). */
function buildStaffVoices(
  ps: PlanStaff,
  barStart: number,
  barEnd: number,
  speller: { spell: (pitch: number) => PitchSpelling },
): EngVoice[] {
  // Build each global voice's tickables for this bar; keep only those that
  // actually sound here, so a bar without a second voice isn't cluttered with a
  // silent rest voice.
  const present = ps.voices
    .map((notes) => buildSegs(notes, barStart, barEnd, speller))
    .filter((segs) => segs.length > 0)
    .map((segs) => buildBarStaff(segs, barStart, barEnd));

  if (present.length === 0) {
    // Empty staff/voice in this bar → a single whole-measure rest voice.
    const rest = buildBarStaff([], barStart, barEnd);
    return [{ tickables: withRestKeys(rest, ps.clef, "auto"), stem: "auto" }];
  }

  return present.map((tickables, pos) => {
    const stem = stemFor(pos, present.length);
    return { tickables: withRestKeys(tickables, ps.clef, stem), stem };
  });
}

/** Stem direction for the voice at index `pos` of `count` present voices. */
function stemFor(pos: number, count: number): StemDir {
  if (count <= 1) return "auto";
  if (pos === 0) return "up";
  if (pos === count - 1) return "down";
  return "auto";
}

/** Fill rest tickables' placement key for the given clef + stem (in place). */
function withRestKeys(
  tickables: EngTickable[],
  clef: "treble" | "bass",
  stem: StemDir,
): EngTickable[] {
  for (const t of tickables) {
    if (t.isRest) t.keys = [REST_KEY[clef][stem]];
  }
  return tickables;
}
