/**
 * VexFlow engraver: draws an {@link EngraveModel} into an SVG host as a grand
 * staff (treble + bass), and returns the geometry the React component needs to
 * follow playback — a beat→x anchor list, per-system bounding boxes, and the
 * note SVG elements (tagged for highlight + click-to-seek).
 *
 * Theme-driven: colors are read from CSS custom properties by the component and
 * passed in, then applied to the VexFlow context, so the score re-skins with the
 * active light/dark theme rather than baking in fixed hex (the songsheet
 * approach, not the piano-roll's fixed-stage approach).
 *
 * Layout is a greedy line-break: measures are packed into a system until the next
 * one would overflow the container width, then a new system row starts. Widths
 * come from VexFlow's `Formatter.preCalculateMinTotalWidth`, so dense measures
 * get more room than sparse ones.
 */
import {
  Accidental,
  Annotation,
  Beam,
  Dot,
  Formatter,
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
  StaveTie,
  Voice,
} from "vexflow";
import type { EngMeasure, EngraveModel, EngTickable } from "../internal/convert";

/** An ascending beat→x mapping point within a system (drives the playhead). */
export interface BeatAnchor {
  beat: number;
  systemIndex: number;
  /** Absolute x in the SVG (px from the left edge). */
  x: number;
}

/** A system's vertical bounds (drives auto-scroll and the playhead height). */
export interface SystemBox {
  index: number;
  top: number;
  bottom: number;
  height: number;
}

/** A drawn melodic note element, tagged for highlight + seek. */
export interface NoteEl {
  el: SVGElement;
  beat: number;
  /** Beat at which this note stops sounding (start + its length). */
  end: number;
}

export interface EngraveResult {
  anchors: BeatAnchor[];
  systems: SystemBox[];
  notes: NoteEl[];
  /** Total rendered height in px (the host/SVG is sized to this). */
  height: number;
}

/** Theme colors, read from CSS custom properties at engrave time. */
export interface EngraveColors {
  /** Notes, clefs, staff lines, text (`--foreground`). */
  foreground: string;
  /** Highlight + playhead accent (`--primary`). */
  primary: string;
}

// --- Layout constants (px). ---
const TOP_PAD = 28;
const LEFT_PAD = 12;
const RIGHT_PAD = 12;
/** Treble-stave top → bass-stave top. */
const STAFF_GAP = 80;
/** Rendered height of a single 5-line stave. */
const STAFF_HEIGHT = 40;
/** Blank space between one system's bass staff and the next system's treble. */
const SYSTEM_GAP = 64;
const SYSTEM_PITCH = STAFF_GAP + STAFF_HEIGHT + SYSTEM_GAP;
/** Padding above the treble staff (room for chord symbols) in a system box. */
const SYSTEM_TOP_PAD = 26;
/** Slack added to each measure's measured minimum width. */
const MEASURE_PAD = 24;
/** Clef + opening barline room on a system's first measure. */
const CLEF_WIDTH = 44;
/** Width per key-signature accidental. */
const KEYSIG_PER_ACC = 11;
/** Time-signature room on the score's very first measure. */
const TIMESIG_WIDTH = 26;

/** Number of sharps/flats in a VexFlow key-signature name. */
const KEYSIG_ACCIDENTALS: Record<string, number> = {
  C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, "F#": 6, "C#": 7,
  F: 1, Bb: 2, Eb: 3, Ab: 4, Db: 5, Gb: 6, Cb: 7,
  Am: 0, Em: 1, Bm: 2, "F#m": 3, "C#m": 4, "G#m": 5, "D#m": 6, "A#m": 7,
  Dm: 1, Gm: 2, Cm: 3, Fm: 4, Bbm: 5, Ebm: 6, Abm: 7,
};

/** Per-measure VexFlow build artifacts, reused across measure + draw passes. */
interface BuiltMeasure {
  measure: EngMeasure;
  trebleNotes: StaveNote[];
  bassNotes: StaveNote[];
  trebleVoice: Voice;
  bassVoice: Voice;
  minWidth: number;
}

/** Build a VexFlow StaveNote (chord or rest) from a tickable. */
function makeNote(t: EngTickable, clef: "treble" | "bass"): StaveNote {
  const note = new StaveNote({
    keys: t.keys,
    duration: t.isRest ? `${t.duration}r` : t.duration,
    clef,
  });
  for (let d = 0; d < t.dots; d++) Dot.buildAndAttach([note], { all: true });
  return note;
}

/** Build the voice + notes for one staff of a measure. */
function buildVoice(
  tickables: EngTickable[],
  clef: "treble" | "bass",
  measure: EngMeasure,
): { notes: StaveNote[]; voice: Voice } {
  const notes = tickables.map((t) => makeNote(t, clef));
  const voice = new Voice({
    num_beats: measure.timeSig.numerator,
    beat_value: measure.timeSig.denominator,
  }).setMode(Voice.Mode.SOFT);
  voice.addTickables(notes);
  Accidental.applyAccidentals([voice], measure.keyName);
  return { notes, voice };
}

export function engrave(
  host: HTMLDivElement,
  model: EngraveModel,
  width: number,
  endBeat: number,
  colors: EngraveColors,
): EngraveResult {
  host.innerHTML = "";

  // --- Pass 1: build every measure and measure its minimum width. ---
  const built: BuiltMeasure[] = model.measures.map((measure) => {
    const t = buildVoice(measure.treble, "treble", measure);
    const b = buildVoice(measure.bass, "bass", measure);
    const min = new Formatter()
      .joinVoices([t.voice, b.voice])
      .preCalculateMinTotalWidth([t.voice, b.voice]);
    return {
      measure,
      trebleNotes: t.notes,
      bassNotes: b.notes,
      trebleVoice: t.voice,
      bassVoice: b.voice,
      minWidth: min + MEASURE_PAD,
    };
  });

  // --- Pass 2: greedy line-break into systems. ---
  const available = Math.max(120, width - LEFT_PAD - RIGHT_PAD);
  const systems: BuiltMeasure[][] = [];
  let current: BuiltMeasure[] = [];
  let running = 0;
  const firstExtra = (bm: BuiltMeasure, isScoreStart: boolean): number =>
    CLEF_WIDTH +
    (KEYSIG_ACCIDENTALS[bm.measure.keyName] ?? 0) * KEYSIG_PER_ACC +
    (isScoreStart ? TIMESIG_WIDTH : 0);

  built.forEach((bm, i) => {
    const startingSystem = current.length === 0;
    const extra = startingSystem ? firstExtra(bm, i === 0) : 0;
    const cost = bm.minWidth + extra;
    if (!startingSystem && running + cost > available) {
      systems.push(current);
      current = [];
      running = firstExtra(bm, false) + bm.minWidth;
      current.push(bm);
    } else {
      running += cost;
      current.push(bm);
    }
  });
  if (current.length > 0) systems.push(current);

  // --- Pass 3: draw. ---
  const height = TOP_PAD + systems.length * SYSTEM_PITCH;
  const renderer = new Renderer(host, Renderer.Backends.SVG);
  renderer.resize(width, height);
  const ctx = renderer.getContext();
  ctx.setFillStyle(colors.foreground);
  ctx.setStrokeStyle(colors.foreground);

  const anchors: BeatAnchor[] = [];
  const systemBoxes: SystemBox[] = [];
  const noteEls: NoteEl[] = [];

  systems.forEach((sys, sysIndex) => {
    const trebleY = TOP_PAD + sysIndex * SYSTEM_PITCH;
    const bassY = trebleY + STAFF_GAP;
    const scoreStart = sysIndex === 0;

    systemBoxes.push({
      index: sysIndex,
      top: trebleY - SYSTEM_TOP_PAD,
      bottom: bassY + STAFF_HEIGHT + 10,
      height: bassY + STAFF_HEIGHT + 10 - (trebleY - SYSTEM_TOP_PAD),
    });

    // Distribute the row width proportionally to each measure's minimum.
    const first = sys[0]!;
    const extra0 = firstExtra(first, scoreStart);
    const totalMin = sys.reduce((s, bm) => s + bm.minWidth, 0);
    const scale = (available - extra0) / totalMin;

    // Per-staff flat note sequences for in-system tie drawing.
    const trebleSeq: { t: EngTickable; n: StaveNote }[] = [];
    const bassSeq: { t: EngTickable; n: StaveNote }[] = [];

    let x = LEFT_PAD;
    sys.forEach((bm, mi) => {
      const isFirst = mi === 0;
      const w = bm.minWidth * scale + (isFirst ? extra0 : 0);

      const trebleStave = new Stave(x, trebleY, w);
      const bassStave = new Stave(x, bassY, w);
      if (isFirst) {
        trebleStave.addClef("treble").addKeySignature(bm.measure.keyName);
        bassStave.addClef("bass").addKeySignature(bm.measure.keyName);
        if (scoreStart) {
          const ts = `${bm.measure.timeSig.numerator}/${bm.measure.timeSig.denominator}`;
          trebleStave.addTimeSignature(ts);
          bassStave.addTimeSignature(ts);
        }
      } else if (bm.measure.keyChanged) {
        trebleStave.addKeySignature(bm.measure.keyName);
        bassStave.addKeySignature(bm.measure.keyName);
      }

      trebleStave.setContext(ctx).draw();
      bassStave.setContext(ctx).draw();

      // Brace + left barline joining the grand staff at the system's start.
      if (isFirst) {
        new StaveConnector(trebleStave, bassStave)
          .setType("brace")
          .setContext(ctx)
          .draw();
        new StaveConnector(trebleStave, bassStave)
          .setType("singleLeft")
          .setContext(ctx)
          .draw();
      }
      // Right barline closing every measure.
      new StaveConnector(trebleStave, bassStave)
        .setType("singleRight")
        .setContext(ctx)
        .draw();

      // Chord symbol above the first treble note of the measure.
      if (bm.measure.chordSymbol && bm.trebleNotes.length > 0) {
        const ann = new Annotation(bm.measure.chordSymbol);
        ann.setVerticalJustification(Annotation.VerticalJustify.TOP);
        const anchor =
          bm.trebleNotes.find((_, i) => !bm.measure.treble[i]!.isRest) ??
          bm.trebleNotes[0]!;
        anchor.addModifier(ann, 0);
      }

      const inner = trebleStave.getNoteEndX() - trebleStave.getNoteStartX();
      new Formatter()
        .joinVoices([bm.trebleVoice, bm.bassVoice])
        .format([bm.trebleVoice, bm.bassVoice], Math.max(16, inner));

      const trebleBeams = Beam.generateBeams(bm.trebleNotes);
      const bassBeams = Beam.generateBeams(bm.bassNotes);
      bm.trebleVoice.draw(ctx, trebleStave);
      bm.bassVoice.draw(ctx, bassStave);
      [...trebleBeams, ...bassBeams].forEach((beam) =>
        beam.setContext(ctx).draw(),
      );

      // Tag drawn note elements + collect anchors.
      const tagStaff = (
        tickables: EngTickable[],
        notes: StaveNote[],
        seq: { t: EngTickable; n: StaveNote }[],
      ) => {
        tickables.forEach((t, i) => {
          const note = notes[i]!;
          seq.push({ t, n: note });
          const ax = note.getAbsoluteX();
          anchors.push({ beat: t.beat, systemIndex: sysIndex, x: ax });
          if (t.isRest) return;
          const el = note.getSVGElement();
          if (!el) return;
          el.classList.add("vf-note");
          el.dataset.beat = String(t.beat);
          noteEls.push({ el, beat: t.beat, end: t.beat + t.beats });
        });
      };
      tagStaff(bm.measure.treble, bm.trebleNotes, trebleSeq);
      tagStaff(bm.measure.bass, bm.bassNotes, bassSeq);

      x += w;
    });

    // Draw in-system ties (cross-system ties are dropped — acceptable for v1).
    const drawTies = (seq: { t: EngTickable; n: StaveNote }[]) => {
      for (let i = 0; i < seq.length - 1; i++) {
        if (!seq[i]!.t.tieToNext || seq[i]!.t.isRest || seq[i + 1]!.t.isRest) {
          continue;
        }
        new StaveTie({
          first_note: seq[i]!.n,
          last_note: seq[i + 1]!.n,
        })
          .setContext(ctx)
          .draw();
      }
    };
    drawTies(trebleSeq);
    drawTies(bassSeq);
  });

  // Terminal anchor at the score end, so the playhead can travel to the finish.
  const lastSys = systemBoxes.at(-1);
  if (lastSys && anchors.length > 0) {
    const lastX = Math.max(...anchors.map((a) => a.x));
    anchors.push({ beat: endBeat, systemIndex: lastSys.index, x: lastX + 20 });
  }
  anchors.sort((a, b) => a.beat - b.beat);

  return { anchors, systems: systemBoxes, notes: noteEls, height };
}
