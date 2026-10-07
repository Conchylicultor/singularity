import { useMemo } from "react";
import {
  useCursorSelector,
  useSession,
} from "@plugins/apps/plugins/sonata/plugins/session/web";
import {
  effectiveKeyAt,
  type ChordAnnotation,
  type PitchPlane,
  type Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { chordPitches } from "@plugins/apps/plugins/sonata/plugins/theory/core";
import {
  chordBoxFace,
  useChordDisplayMode,
  type ChordBoxFace,
} from "@plugins/apps/plugins/sonata/plugins/rich/plugins/chord-label/web";
import {
  Keyboard,
  useSonataKeySkin,
} from "@plugins/apps/plugins/sonata/plugins/primitives/plugins/keyboard/web";
import { useChordAudition } from "@plugins/apps/plugins/sonata/plugins/audio/plugins/live-play/web";
import { pitchKeyboardHeight } from "@plugins/apps/plugins/sonata/plugins/pitch-layout/core";
import { usePitchGeometry } from "@plugins/apps/plugins/sonata/plugins/pitch-layout/web";
import {
  ChordBox,
  chordColour,
  chordToneStyle,
} from "@plugins/music/plugins/chord-box/web";
import { Overlay } from "@plugins/primitives/plugins/css/plugins/overlay/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import "./chord-list.css";

/** One distinct chord of the song. */
interface ChordEntry {
  /** Its spelled name plus root: two occurrences with the same key are the same chord. */
  key: string;
  /** Its first occurrence, which names, paints and voices it and is where a click seeks. */
  first: ChordAnnotation;
  face: ChordBoxFace;
  /** Its notes as the keyboard lights them (and a click sounds them): each pitch in the chord's colour. */
  lit: ReadonlyMap<number, string>;
  /** How many times it is struck. */
  uses: number;
}

/** The keyboards' lowest key, C4: `chordPitches` stacks every chord from its root in octave 4. */
const KB_LOW = 60;
/** The keyboards' default top, B5 — two octaves, room for any triad or seventh. */
const KB_HIGH = 83;

const entryKey = (c: ChordAnnotation) =>
  `${c.data.spelledSymbol ?? c.data.symbol}|${String(c.data.root)}`;

/** Every distinct chord in order of first appearance, with how often it is played. */
function distinctChords(
  score: Score,
  mode: ReturnType<typeof useChordDisplayMode>,
): ChordEntry[] {
  const byKey = new Map<string, ChordEntry>();
  const chords = score.annotations
    .filter((a): a is ChordAnnotation => a.type === "chord")
    .sort((a, b) => a.start - b.start);
  for (const c of chords) {
    const key = entryKey(c);
    const known = byKey.get(key);
    if (known) {
      known.uses++;
      continue;
    }
    const face = chordBoxFace(
      c.data,
      effectiveKeyAt(score, c.start) ?? null,
      mode,
    );
    const colour = chordColour(face.degree);
    byKey.set(key, {
      key,
      first: c,
      face,
      lit: new Map(chordPitches(c.data).map((p) => [p, colour])),
      uses: 1,
    });
  }
  return [...byKey.values()];
}

/**
 * The song's chord vocabulary — the BODY of a `Sonata.Section` card whose
 * chrome (Card + collapsible "Chord list" title) the host paints. One row per
 * distinct chord, in the order the song first plays them: its chord box, a
 * keyboard lit with its notes in its colour, and how many times it is played.
 * The chord under the playhead is marked; clicking a row sounds the chord (the
 * notes its keyboard lights) and seeks to its first occurrence.
 *
 * Applicability is the contribution's `useAvailable` (`useHasChords`), so this
 * body never renders for a chordless song.
 *
 * Not a DataView: the rows are derived from the open score, not stored records,
 * their order (first appearance) is the content itself rather than a sort, and
 * the row's body is a keyboard, which no DataView field renders.
 */
export function ChordList() {
  const { score, seekTo } = useSession();
  const mode = useChordDisplayMode();
  const skin = useSonataKeySkin();
  const audition = useChordAudition();

  const entries = useMemo(() => distinctChords(score, mode), [score, mode]);

  // One plane for every row — the rows differ only in what is lit — wide
  // enough for the tallest chord.
  const high = useMemo(() => {
    let top = KB_HIGH;
    for (const e of entries)
      for (const p of e.lit.keys()) top = Math.max(top, p);
    return top;
  }, [entries]);
  const plane = usePitchGeometry(KB_LOW, high);

  // The key of the chord under the playhead; reconciles only on a chord boundary.
  const nowKey = useCursorSelector(
    (beat) => {
      const c = score.annotations.find(
        (a): a is ChordAnnotation =>
          a.type === "chord" && beat >= a.start && beat < a.end,
      );
      return c === undefined ? undefined : entryKey(c);
    },
    [score.annotations],
  );

  return (
    <Stack gap="2xs">
      {entries.map((entry) => (
        <ChordRow
          key={entry.key}
          entry={entry}
          now={entry.key === nowKey}
          plane={plane}
          skin={skin}
          onPick={(e) => {
            audition?.([...e.lit.keys()]);
            seekTo(e.first.start);
          }}
        />
      ))}
    </Stack>
  );
}

/** One chord: its box, its keyboard and its count, the whole row a play-and-seek button. */
function ChordRow({
  entry,
  now,
  plane,
  skin,
  onPick,
}: {
  entry: ChordEntry;
  now: boolean;
  plane: PitchPlane;
  skin: ReturnType<typeof useSonataKeySkin>;
  onPick: (entry: ChordEntry) => void;
}) {
  const { face, lit, uses } = entry;
  return (
    <Overlay
      className="chord-list-row"
      style={chordToneStyle(face.degree)}
      data-now={now ? "" : undefined}
      clickThrough
      behind={
        <button
          type="button"
          className="chord-list-hit size-full"
          aria-label={`${face.name}, played ${String(uses)} times — play it and go to its first time`}
          aria-current={now ? "true" : undefined}
          onClick={() => onPick(entry)}
        />
      }
    >
      <div className="chord-list-cells">
        <ChordBox
          className="chord-list-box"
          degree={face.degree}
          state="filled"
          label={face.label}
        />
        <Keyboard
          plane={plane}
          lit={lit}
          skin={skin}
          className="w-full"
          style={{ height: pitchKeyboardHeight(plane.layout, "chip") }}
        />
        <Text variant="caption" tone="muted" className="tabular-nums">
          ×{uses}
        </Text>
      </div>
    </Overlay>
  );
}
