import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  useCursorSelector,
  useSonata,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { useLivePlay } from "@plugins/apps/plugins/sonata/plugins/audio/plugins/live-play/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type {
  Annotation,
  ChordData,
} from "@plugins/apps/plugins/sonata/plugins/score/core";

type ChordAnn = Annotation<"chord", ChordData>;

/**
 * The twelve circle-of-fifths positions, clockwise from the top (12 o'clock).
 * Each position sits a perfect fifth above the previous one, so the major
 * pitch class at position `i` is `(i * 7) % 12`. The outer ring shows the major
 * key, the inner ring its relative minor (a minor third / three semitones
 * below the major tonic).
 */
const MAJOR_LABELS = [
  "C", "G", "D", "A", "E", "B", "F♯", "D♭", "A♭", "E♭", "B♭", "F",
];
const MINOR_LABELS = [
  "Am", "Em", "Bm", "F♯m", "C♯m", "G♯m", "D♯m", "B♭m", "Fm", "Cm", "Gm", "Dm",
];

/** Pitch class (0–11) of the major key at each circle position. */
const MAJOR_PC = MAJOR_LABELS.map((_, i) => (i * 7) % 12);
/** Pitch class of the relative-minor tonic at each position (major − 3 semis). */
const MINOR_PC = MAJOR_PC.map((pc) => (pc + 9) % 12);

/**
 * Chord qualities built on a minor third — these highlight on the inner
 * (relative-minor) ring; everything else (major triads, dominants, …) lands on
 * the outer major ring.
 */
const MINOR_QUALITIES = new Set([
  "min", "min7", "min6", "min9", "halfdim7", "dim", "dim7",
]);

/** MIDI pitch of each pitch class in octave 4 (MIDI 60 = C4); the register the
 *  clicked tonic triad sounds in. */
const BASE_MIDI = 60;
/** Triad intervals above the tonic, in semitones. */
const MAJOR_TRIAD = [0, 4, 7];
const MINOR_TRIAD = [0, 3, 7];
/** How long a clicked chord rings before its note-off, in ms. */
const CHORD_RING_MS = 900;

// --- Wheel geometry (SVG user units; viewBox is 160×160, centre at 80,80) ---
const CX = 80;
const CY = 80;
const R_OUT = 76; // outer edge of the major ring
const R_MID = 50; // major/minor ring boundary
const R_IN = 26; // inner edge of the minor ring (centre hole)
const R_MAJOR_LABEL = (R_OUT + R_MID) / 2;
const R_MINOR_LABEL = (R_MID + R_IN) / 2;
const SEG_HALF = 15; // half a 30° segment

/** Point on the wheel at `r` units from centre, `deg` clockwise from the top. */
function point(r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [CX + r * Math.sin(a), CY - r * Math.cos(a)];
}

/** Path for an annular sector (a ring slice) between two radii and two angles. */
function sector(rIn: number, rOut: number, a0: number, a1: number): string {
  const [x0, y0] = point(rOut, a0);
  const [x1, y1] = point(rOut, a1);
  const [x2, y2] = point(rIn, a1);
  const [x3, y3] = point(rIn, a0);
  return [
    `M ${x0} ${y0}`,
    `A ${rOut} ${rOut} 0 0 1 ${x1} ${y1}`,
    `L ${x2} ${y2}`,
    `A ${rIn} ${rIn} 0 0 0 ${x3} ${y3}`,
    "Z",
  ].join(" ");
}

/**
 * The circle-of-fifths panel — a free-floating `Sonata.Section`, sibling to the
 * chord and key readouts. Reads the shared Score + cursor from `useSonata()` and
 * highlights the wedge for the chord under the playhead: a major-ish chord lights
 * its major key on the outer ring, a minor-ish chord lights its tonic on the
 * inner ring. Tracks the cursor as the transport advances.
 *
 * Every wedge is clickable: clicking it sounds that key's tonic triad (a major
 * triad on the outer ring, the relative minor on the inner ring) through the
 * live-play engine — a standalone audition of the chord that does NOT move the
 * playhead or start the song.
 */
export function CircleOfFifths() {
  const { score } = useSonata();
  const live = useLivePlay();

  // Pending note-off timers, cleared on unmount so a clicked chord never fires
  // its release into an unmounted surface.
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers) clearTimeout(t);
      timers.clear();
      live?.releaseAll();
    };
  }, [live]);

  // Audition a chord: warm the voices, strike every pitch, then release after a
  // short ring-out. Pure note-on/note-off — independent of the transport.
  const playChord = useCallback(
    (pitches: number[]) => {
      if (!live) return;
      live.warmup();
      for (const p of pitches) live.press(p);
      const t = setTimeout(() => {
        for (const p of pitches) live.release(p);
        timersRef.current.delete(t);
      }, CHORD_RING_MS);
      timersRef.current.add(t);
    },
    [live],
  );

  const chords = useMemo(
    () =>
      score.annotations.filter(
        (a): a is ChordAnn => a.type === "chord",
      ),
    [score.annotations],
  );

  // The chord covering the playhead — a STABLE reference from the memoized
  // `chords` array, so this panel re-renders only when the chord changes, not on
  // every cursor frame. Falls back to the first chord before playback starts.
  const current = useCursorSelector(
    (cursorBeat) =>
      chords.find((c) => cursorBeat >= c.start && cursorBeat < c.end) ??
      (cursorBeat <= 0 ? chords[0] : undefined),
    [chords],
  );

  // Which wedge to light: position index on the major or the minor ring.
  const { majorPos, minorPos } = useMemo(() => {
    if (!current) return { majorPos: -1, minorPos: -1 };
    const { root, quality } = current.data;
    if (MINOR_QUALITIES.has(quality)) {
      return { majorPos: -1, minorPos: MINOR_PC.indexOf(root) };
    }
    return { majorPos: MAJOR_PC.indexOf(root), minorPos: -1 };
  }, [current]);

  return (
    <Card className="rounded-lg p-lg">
      <div className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        Circle of fifths
      </div>

      {/* eslint-disable-next-line spacing/no-adhoc-spacing -- top offset separating the wheel from the section label inside the Card chrome; no flex parent owns a gap here */}
      <div className="mt-3">
        <svg
          viewBox="0 0 160 160"
          className="mx-auto block w-full max-w-[14rem]"
          role="img"
          aria-label="Circle of fifths"
        >
          {MAJOR_LABELS.map((label, i) => (
            <Wedge
              key={`maj-${i}`}
              label={`${label} major`}
              text={label}
              rIn={R_MID}
              rOut={R_OUT}
              rLabel={R_MAJOR_LABEL}
              index={i}
              lit={i === majorPos}
              fontSize={9}
              baseFill="var(--muted)"
              textFill="var(--foreground)"
              onPlay={() =>
                playChord(MAJOR_TRIAD.map((iv) => BASE_MIDI + MAJOR_PC[i]! + iv))
              }
            />
          ))}

          {MINOR_LABELS.map((label, i) => (
            <Wedge
              key={`min-${i}`}
              label={`${label.replace("m", "")} minor`}
              text={label}
              rIn={R_IN}
              rOut={R_MID}
              rLabel={R_MINOR_LABEL}
              index={i}
              lit={i === minorPos}
              fontSize={7}
              baseFill="var(--background)"
              textFill="var(--muted-foreground)"
              onPlay={() =>
                playChord(MINOR_TRIAD.map((iv) => BASE_MIDI + MINOR_PC[i]! + iv))
              }
            />
          ))}

          {/* Centre hole — the current chord symbol, or a dash before playback. */}
          <circle cx={CX} cy={CY} r={R_IN} fill="var(--card)" />
          <text
            x={CX}
            y={CY}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={11}
            fontWeight={700}
            fill={current ? "var(--foreground)" : "var(--muted-foreground)"}
          >
            {current ? current.data.symbol : "—"}
          </text>
        </svg>
      </div>

      {chords.length === 0 && (
        <Text
          as="div"
          variant="caption"
          // eslint-disable-next-line spacing/no-adhoc-spacing -- top offset separating the empty-state caption from the wheel above; no flex parent owns a gap
          className="mt-2 text-center text-muted-foreground"
        >
          No chords detected.
        </Text>
      )}
    </Card>
  );
}

/**
 * One ring wedge: the annular sector plus its centred label. Always an
 * interactive chord audition (pointer cursor + hover feedback + a `button`
 * role); clicking it sounds the key's tonic triad via `onPlay`.
 */
function Wedge({
  label,
  text,
  rIn,
  rOut,
  rLabel,
  index,
  lit,
  fontSize,
  baseFill,
  textFill,
  onPlay,
}: {
  label: string;
  text: string;
  rIn: number;
  rOut: number;
  rLabel: number;
  index: number;
  lit: boolean;
  fontSize: number;
  baseFill: string;
  textFill: string;
  onPlay: () => void;
}) {
  const a0 = index * 30 - SEG_HALF;
  const a1 = index * 30 + SEG_HALF;
  const [lx, ly] = point(rLabel, index * 30);
  return (
    <g
      onClick={onPlay}
      role="button"
      aria-label={`Play ${label}`}
      className="cursor-pointer transition-opacity hover:opacity-80"
    >
      <path
        d={sector(rIn, rOut, a0, a1)}
        fill={lit ? "var(--primary)" : baseFill}
        stroke="var(--border)"
        strokeWidth={1}
      />
      <text
        x={lx}
        y={ly}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={fontSize}
        fontWeight={lit ? 700 : 500}
        fill={lit ? "var(--primary-foreground)" : textFill}
      >
        {text}
      </text>
    </g>
  );
}
