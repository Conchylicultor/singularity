import { useMemo } from "react";
import {
  useCursorSelector,
  useSession,
} from "@plugins/apps/plugins/sonata/plugins/session/web";
import {
  effectiveKeyAt,
  type ChordAnnotation,
  type Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { chordVoicing } from "@plugins/apps/plugins/sonata/plugins/theory/core";
import {
  chordBoxFace,
  useChordDisplayMode,
  type ChordBoxFace,
} from "@plugins/apps/plugins/sonata/plugins/rich/plugins/chord-label/web";
import {
  ReadoutKeyboard,
  useReadoutPlane,
} from "@plugins/apps/plugins/sonata/plugins/rich/plugins/readout-keyboard/web";
import { useChordAudition } from "@plugins/apps/plugins/sonata/plugins/audio/plugins/live-play/web";
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
  /** Its colour: the degree's, which lights its keys. */
  colour: string;
  /** Its notes, root position with a slash bass lowest — before the readout window's octave fit. */
  voicing: number[];
  /** How many times it is struck. */
  uses: number;
}

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
    byKey.set(key, {
      key,
      first: c,
      face,
      colour: chordColour(face.degree),
      voicing: chordVoicing(c.data),
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
  const audition = useChordAudition();

  const entries = useMemo(() => distinctChords(score, mode), [score, mode]);

  // One plane for every row — the rows differ only in what is lit — fitted
  // to every chord's voicing at once.
  const voicings = useMemo(() => entries.map((e) => e.voicing), [entries]);
  const { plane, voicings: fitted } = useReadoutPlane(voicings);
  // Each row's notes as its keyboard lights them (and a click sounds them):
  // every pitch of its fitted voicing in the chord's colour.
  const rows = useMemo(
    () =>
      entries.map((entry, i) => ({
        entry,
        lit: new Map((fitted[i] ?? []).map((p) => [p, entry.colour])),
      })),
    [entries, fitted],
  );

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
      {rows.map(({ entry, lit }) => (
        <ChordRow
          key={entry.key}
          entry={entry}
          lit={lit}
          now={entry.key === nowKey}
          plane={plane}
          onPick={() => {
            audition?.([...lit.keys()]);
            seekTo(entry.first.start);
          }}
        />
      ))}
    </Stack>
  );
}

/** One chord: its box, its keyboard and its count, the whole row a play-and-seek button. */
function ChordRow({
  entry,
  lit,
  now,
  plane,
  onPick,
}: {
  entry: ChordEntry;
  lit: ReadonlyMap<number, string>;
  now: boolean;
  plane: ReturnType<typeof useReadoutPlane>["plane"];
  onPick: () => void;
}) {
  const { face, uses } = entry;
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
          onClick={onPick}
        />
      }
    >
      <div className="chord-list-cells">
        <ChordBox
          className="chord-list-box"
          degree={face.degree}
          state="filled"
          label={face.label}
          now={now}
        />
        <ReadoutKeyboard plane={plane} lit={lit} />
        <Text variant="caption" tone="muted" className="tabular-nums">
          ×{uses}
        </Text>
      </div>
    </Overlay>
  );
}
