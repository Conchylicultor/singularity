/**
 * VexFlow engraver: draws an {@link EngraveModel} into an SVG host as a system of
 * **N staves × M voices**, and returns the geometry the React component needs to
 * follow playback — a beat→x anchor list, per-system bounding boxes, and the
 * note SVG elements (tagged for highlight + click-to-seek).
 *
 * Layout generalizes the original grand staff: a part owns one staff (single
 * clef) or two (a treble/bass grand staff joined by a brace); when there is more
 * than one part the whole system is wrapped in a bracket. Each staff carries one
 * VexFlow `Voice` per `EngVoice`, with opposed stems for a 2-voice staff; all of
 * a measure's voices are joined into one `Formatter` so onsets align across the
 * system.
 *
 * Theme-driven: colors are read from CSS custom properties by the component and
 * passed in, then applied to the VexFlow context, so the score re-skins with the
 * active light/dark theme. Sheet music stays monochrome — per-track color is
 * intentionally NOT used here.
 *
 * Line-break: measures are packed into a system greedily until the next would
 * overflow the container width, then a new system row starts. Widths come from
 * VexFlow's `Formatter.preCalculateMinTotalWidth`.
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
  Stem,
  Voice,
} from "vexflow";
import type {
  EngMeasure,
  EngPart,
  EngraveModel,
  EngStaff,
  EngTickable,
  EngVoice,
  StemDir,
} from "../internal/convert";

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
/** Top-to-top distance between the two staves of one grand-staff part. */
const STAFF_GAP = 80;
/** Top-to-top distance between two distinct parts (wider than within a part). */
const PART_PITCH = 112;
/** Rendered height of a single 5-line stave. */
const STAFF_HEIGHT = 40;
/** Blank space between one system's last staff and the next system's first. */
const SYSTEM_GAP = 64;
/** Padding above the first staff (room for chord symbols) in a system box. */
const SYSTEM_TOP_PAD = 26;
/** Padding below the last staff in a system box. */
const SYSTEM_BOTTOM_PAD = 12;
/** Slack added to each measure's measured minimum width. */
const MEASURE_PAD = 24;
/** Clef + opening barline room on a system's first measure. */
const CLEF_WIDTH = 44;
/** Width per key-signature accidental. */
const KEYSIG_PER_ACC = 11;
/** Time-signature room on the score's very first measure. */
const TIMESIG_WIDTH = 26;
/** Left gutter reserved for per-part labels when they're drawn. */
const LABEL_GUTTER = 64;

/** Number of sharps/flats in a VexFlow key-signature name. */
const KEYSIG_ACCIDENTALS: Record<string, number> = {
  C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, "F#": 6, "C#": 7,
  F: 1, Bb: 2, Eb: 3, Ab: 4, Db: 5, Gb: 6, Cb: 7,
  Am: 0, Em: 1, Bm: 2, "F#m": 3, "C#m": 4, "G#m": 5, "D#m": 6, "A#m": 7,
  Dm: 1, Gm: 2, Cm: 3, Fm: 4, Bbm: 5, Ebm: 6, Abm: 7,
};

function stemOf(stem: StemDir): number | undefined {
  if (stem === "up") return Stem.UP;
  if (stem === "down") return Stem.DOWN;
  return undefined;
}

/** Build a VexFlow StaveNote (chord or rest) from a tickable, with stem dir. */
function makeNote(
  t: EngTickable,
  clef: "treble" | "bass",
  stem: StemDir,
): StaveNote {
  const note = new StaveNote({
    keys: t.keys,
    duration: t.isRest ? `${t.duration}r` : t.duration,
    clef,
  });
  const dir = stemOf(stem);
  if (!t.isRest && dir !== undefined) note.setStemDirection(dir);
  for (let d = 0; d < t.dots; d++) Dot.buildAndAttach([note], { all: true });
  return note;
}

/** A built voice: its engraving spec + the VexFlow note objects + Voice. */
interface BuiltVoice {
  eng: EngVoice;
  clef: "treble" | "bass";
  notes: StaveNote[];
  voice: Voice;
}

/** A built staff: its spec + built voices. */
interface BuiltStaff {
  staff: EngStaff;
  voices: BuiltVoice[];
}

/** Per-measure VexFlow build artifacts, reused across measure + draw passes. */
interface BuiltMeasure {
  measure: EngMeasure;
  staves: BuiltStaff[];
  minWidth: number;
}

/** Build the VexFlow voice + notes for one staff voice of a measure. */
function buildVoice(
  ev: EngVoice,
  clef: "treble" | "bass",
  measure: EngMeasure,
): BuiltVoice {
  const notes = ev.tickables.map((t) => makeNote(t, clef, ev.stem));
  const voice = new Voice({
    num_beats: measure.timeSig.numerator,
    beat_value: measure.timeSig.denominator,
  }).setMode(Voice.Mode.SOFT);
  voice.addTickables(notes);
  Accidental.applyAccidentals([voice], measure.keyName);
  return { eng: ev, clef, notes, voice };
}

/** All the VexFlow voices of a built measure, in staff/voice order. */
function allVoices(bm: BuiltMeasure): Voice[] {
  return bm.staves.flatMap((s) => s.voices.map((v) => v.voice));
}

/** Vertical staff offsets (relative to the first staff top) for one system. */
function staffOffsets(staves: readonly EngStaff[]): number[] {
  const offsets: number[] = [];
  let off = 0;
  for (let i = 0; i < staves.length; i++) {
    offsets[i] = off;
    const next = staves[i + 1];
    if (next) {
      off += next.partId === staves[i]!.partId ? STAFF_GAP : PART_PITCH;
    }
  }
  return offsets;
}

function connect(
  a: Stave,
  b: Stave,
  type: "brace" | "bracket" | "singleLeft" | "singleRight",
  ctx: ReturnType<Renderer["getContext"]>,
): void {
  new StaveConnector(a, b).setType(type).setContext(ctx).draw();
}

export function engrave(
  host: HTMLDivElement,
  model: EngraveModel,
  width: number,
  endBeat: number,
  colors: EngraveColors,
): EngraveResult {
  host.innerHTML = "";

  // The staff shape is identical in every measure; take it from the first.
  const staffDefs = model.measures[0]?.staves ?? [];
  const staffCount = staffDefs.length;
  const offsets = staffOffsets(staffDefs);
  const contentHeight = (offsets[staffCount - 1] ?? 0) + STAFF_HEIGHT;
  const systemPitch = SYSTEM_TOP_PAD + contentHeight + SYSTEM_GAP;

  // Per-part labels: only meaningful for a multi-part (per-track) layout.
  const hasLabels = model.parts.length > 1 && model.parts.some((p) => p.name);
  const leftPad = LEFT_PAD + (hasLabels ? LABEL_GUTTER : 0);

  // --- Pass 1: build every measure and measure its minimum width. ---
  const built: BuiltMeasure[] = model.measures.map((measure) => {
    const staves = measure.staves.map((staff) => ({
      staff,
      voices: staff.voices.map((ev) => buildVoice(ev, staff.clef, measure)),
    }));
    const bm: BuiltMeasure = { measure, staves, minWidth: 0 };
    const vfVoices = allVoices(bm);
    const min =
      vfVoices.length > 0
        ? new Formatter()
            .joinVoices(vfVoices)
            .preCalculateMinTotalWidth(vfVoices)
        : 60;
    bm.minWidth = min + MEASURE_PAD;
    return bm;
  });

  // --- Pass 2: greedy line-break into systems. ---
  const available = Math.max(120, width - leftPad - RIGHT_PAD);
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
  const firstStaffTopOf = (sysIndex: number): number =>
    TOP_PAD + SYSTEM_TOP_PAD + sysIndex * systemPitch;
  const height =
    systems.length === 0
      ? TOP_PAD * 2
      : firstStaffTopOf(systems.length - 1) +
        contentHeight +
        SYSTEM_BOTTOM_PAD +
        TOP_PAD;

  const renderer = new Renderer(host, Renderer.Backends.SVG);
  renderer.resize(width, height);
  const ctx = renderer.getContext();
  ctx.setFillStyle(colors.foreground);
  ctx.setStrokeStyle(colors.foreground);

  const anchors: BeatAnchor[] = [];
  const systemBoxes: SystemBox[] = [];
  const noteEls: NoteEl[] = [];

  systems.forEach((sys, sysIndex) => {
    const firstStaffTop = firstStaffTopOf(sysIndex);
    const staffTop = (i: number): number => firstStaffTop + (offsets[i] ?? 0);
    const scoreStart = sysIndex === 0;

    const boxTop = firstStaffTop - SYSTEM_TOP_PAD;
    const boxBottom = firstStaffTop + contentHeight + SYSTEM_BOTTOM_PAD;
    systemBoxes.push({
      index: sysIndex,
      top: boxTop,
      bottom: boxBottom,
      height: boxBottom - boxTop,
    });

    // Distribute the row width proportionally to each measure's minimum.
    const first = sys[0]!;
    const extra0 = firstExtra(first, scoreStart);
    const totalMin = sys.reduce((s, bm) => s + bm.minWidth, 0);
    const scale = (available - extra0) / totalMin;

    // Per (staffIndex:voiceIndex) flat note sequence, for in-system tie drawing.
    const seqs = new Map<string, { t: EngTickable; n: StaveNote }[]>();

    let x = leftPad;
    sys.forEach((bm, mi) => {
      const isFirst = mi === 0;
      const w = bm.minWidth * scale + (isFirst ? extra0 : 0);

      // Create one VexFlow Stave per staff at its vertical position.
      const vfStaves = bm.staves.map(
        (_, si) => new Stave(x, staffTop(si), w),
      );

      vfStaves.forEach((st, si) => {
        const def = bm.staves[si]!.staff;
        if (isFirst) {
          st.addClef(def.clef).addKeySignature(bm.measure.keyName);
          if (scoreStart) {
            st.addTimeSignature(
              `${bm.measure.timeSig.numerator}/${bm.measure.timeSig.denominator}`,
            );
          }
        } else if (bm.measure.keyChanged) {
          st.addKeySignature(bm.measure.keyName);
        }
        st.setContext(ctx).draw();
      });

      drawConnectors(vfStaves, bm.measure.staves, model.parts, isFirst, ctx);

      // Chord symbol above the first non-rest note of the top staff's top voice.
      if (bm.measure.chordSymbol && bm.staves.length > 0) {
        const topVoice = bm.staves[0]!.voices[0];
        if (topVoice && topVoice.notes.length > 0) {
          const idx = topVoice.eng.tickables.findIndex((t) => !t.isRest);
          const anchor =
            idx >= 0 ? topVoice.notes[idx]! : topVoice.notes[0]!;
          const ann = new Annotation(bm.measure.chordSymbol);
          ann.setVerticalJustification(Annotation.VerticalJustify.TOP);
          anchor.addModifier(ann, 0);
        }
      }

      // Join + format ALL voices of the measure so onsets align across staves.
      const vfVoices = allVoices(bm);
      const inner = vfStaves[0]
        ? vfStaves[0].getNoteEndX() - vfStaves[0].getNoteStartX()
        : Math.max(16, w - 24);
      if (vfVoices.length > 0) {
        new Formatter()
          .joinVoices(vfVoices)
          .format(vfVoices, Math.max(16, inner));
      }

      // Draw each voice on its staff, with per-voice beams + note tagging.
      bm.staves.forEach((bs, si) => {
        const st = vfStaves[si]!;
        bs.voices.forEach((bv, vi) => {
          const dir = stemOf(bv.eng.stem);
          const beams = Beam.generateBeams(
            bv.notes,
            dir !== undefined ? { stem_direction: dir } : undefined,
          );
          bv.voice.draw(ctx, st);
          beams.forEach((beam) => beam.setContext(ctx).draw());

          const key = `${si}:${vi}`;
          let seq = seqs.get(key);
          if (!seq) {
            seq = [];
            seqs.set(key, seq);
          }
          tagVoice(bv.eng.tickables, bv.notes, seq, sysIndex, anchors, noteEls);
        });
      });

      x += w;
    });

    // Draw in-system ties per voice sequence (cross-system ties are dropped).
    for (const seq of seqs.values()) drawTies(seq, ctx);

    // Part labels (per-track only), on the first system, monochrome.
    if (hasLabels && sysIndex === 0) {
      drawPartLabels(model.parts, offsets, firstStaffTop, ctx);
    }
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

/**
 * Draw the connectors joining a system's staves:
 *  - a `brace` + `singleLeft` across each grand-staff part (2 adjacent staves);
 *  - a `bracket` + `singleLeft` spanning the whole system when >1 part;
 *  - a `singleRight` barline across all staves closing every measure.
 * A lone single staff relies on the Stave's own barlines.
 */
function drawConnectors(
  vfStaves: Stave[],
  staffDefs: readonly EngStaff[],
  parts: readonly EngPart[],
  isFirst: boolean,
  ctx: ReturnType<Renderer["getContext"]>,
): void {
  const n = vfStaves.length;
  if (n < 2) return;
  const top = vfStaves[0]!;
  const bottom = vfStaves[n - 1]!;

  if (isFirst) {
    // Brace + left barline per grand-staff part (2 adjacent same-partId staves).
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && staffDefs[j + 1]!.partId === staffDefs[i]!.partId) {
        j++;
      }
      if (j > i) {
        connect(vfStaves[i]!, vfStaves[j]!, "brace", ctx);
        connect(vfStaves[i]!, vfStaves[j]!, "singleLeft", ctx);
      }
      i = j + 1;
    }
    if (parts.length > 1) {
      connect(top, bottom, "bracket", ctx);
    }
    // A single grand-staff part already has its own singleLeft above; a
    // multi-part system needs one spanning everything.
    if (parts.length > 1) connect(top, bottom, "singleLeft", ctx);
  }

  // Right barline closing every measure, across all staves.
  connect(top, bottom, "singleRight", ctx);
}

/** Tag drawn note elements + collect beat anchors for one voice. */
function tagVoice(
  tickables: readonly EngTickable[],
  notes: readonly StaveNote[],
  seq: { t: EngTickable; n: StaveNote }[],
  sysIndex: number,
  anchors: BeatAnchor[],
  noteEls: NoteEl[],
): void {
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
}

/** Draw in-system ties for one voice's flat note sequence. */
function drawTies(
  seq: { t: EngTickable; n: StaveNote }[],
  ctx: ReturnType<Renderer["getContext"]>,
): void {
  for (let i = 0; i < seq.length - 1; i++) {
    if (!seq[i]!.t.tieToNext || seq[i]!.t.isRest || seq[i + 1]!.t.isRest) {
      continue;
    }
    new StaveTie({ first_note: seq[i]!.n, last_note: seq[i + 1]!.n })
      .setContext(ctx)
      .draw();
  }
}

/** Draw a small left-margin label centered on each part's staves. */
function drawPartLabels(
  parts: readonly EngPart[],
  offsets: readonly number[],
  firstStaffTop: number,
  ctx: ReturnType<Renderer["getContext"]>,
): void {
  ctx.save();
  ctx.setFont("Arial", 10, "normal");
  let staffIdx = 0;
  for (const part of parts) {
    const count = part.staffCount;
    if (part.name) {
      const topOff = offsets[staffIdx] ?? 0;
      const botOff = (offsets[staffIdx + count - 1] ?? topOff) + STAFF_HEIGHT;
      const cy = firstStaffTop + (topOff + botOff) / 2;
      ctx.fillText(part.name, 4, cy);
    }
    staffIdx += count;
  }
  ctx.restore();
}
