import { memo, useMemo } from "react";
import {
  effectiveKeyAt,
  type ChordAnnotation,
  type Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { formatChordLabel } from "@plugins/apps/plugins/sonata/plugins/theory/core";
import { useChordDisplayMode } from "@plugins/apps/plugins/sonata/plugins/rich/plugins/chord-label/web";
import { useCursorSelector } from "@plugins/apps/plugins/sonata/plugins/session/web";
import {
  LANE_ABOVE_Y,
  LANE_HEIGHT,
} from "@plugins/apps/plugins/sonata/plugins/progress/plugins/scrubber/web";
import {
  pct,
  Placed,
} from "@plugins/primitives/plugins/css/plugins/coords/web";
import { Layer } from "@plugins/primitives/plugins/css/plugins/layer/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { ControlSizeProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { chordIndexAt } from "../chord-index";

/** The visual gap between adjacent chips, taken off each chip's trailing edge. */
const CHIP_GAP = "2px";

/** One chip's data, resolved once per score + label mode. */
interface LaneChip {
  key: string;
  startF: number;
  widthF: number;
  label: string;
}

/**
 * The chord lane: one chip per chord annotation in the band just above the
 * progression rail (`LANE_ABOVE_Y`), each placed by the scrubber's own
 * `beatToFraction` so it lines up with the bar ticks and the loop region, sized
 * by its chord's duration, and labelled in the shared chord-label mode — the same
 * label the progression panel and piano-roll overlay show. The chord under the
 * playhead is accent-tinted.
 *
 * Reads the chords from the marker's `score` (the session score), so the labels
 * follow transpose. The current chord is a `useCursorSelector` over the chord
 * index, so the lane reconciles only when the playhead crosses a chord boundary
 * — never per frame — and the memoised chips mean only the two whose highlight
 * flips re-render. The whole lane is pointer-transparent: pressing it scrubs like
 * the rail.
 */
export function ChordLane({
  score,
  beatToFraction,
}: {
  score: Score;
  /** beat → [0,1] position along the track. */
  beatToFraction: (beat: number) => number;
}) {
  const mode = useChordDisplayMode();

  // Sorted by onset: `chordIndexAt` binary-searches them every frame.
  const chords = useMemo(
    () =>
      score.annotations
        .filter((a): a is ChordAnnotation => a.type === "chord")
        .sort((a, b) => a.start - b.start),
    [score.annotations],
  );

  // Each chord's label resolved against the key in force at its onset (a chord's
  // function follows mid-song key changes). Memoised on the score + mode, so a
  // cursor frame never recomputes it.
  const chips = useMemo<LaneChip[]>(
    () =>
      chords.map((c, i) => {
        const startF = beatToFraction(c.start);
        return {
          key: `${i}-${c.start}`,
          startF,
          widthF: beatToFraction(c.end) - startF,
          label: formatChordLabel(
            c.data,
            effectiveKeyAt(score, c.start) ?? null,
            mode,
          ),
        };
      }),
    [chords, score, mode, beatToFraction],
  );

  const current = useCursorSelector(
    (beat) => chordIndexAt(chords, beat),
    [chords],
  );

  if (chips.length === 0) return null;

  return (
    // `xs` density steps the chip labels down to the tag role's compact rung —
    // small enough for the 1rem lane.
    <ControlSizeProvider size="xs">
      <Layer decorative>
        {chips.map((c, i) => (
          <ChordChip
            key={c.key}
            startF={c.startF}
            widthF={c.widthF}
            label={c.label}
            current={i === current}
          />
        ))}
      </Layer>
    </ControlSizeProvider>
  );
}

/**
 * One chord chip. Its label is clipped, never ellipsized — and a label wider
 * than the chip is hidden whole rather than cut, since a cut `Cmaj7` reading
 * `Cm` names the wrong chord. That needs no measurement: the chip is a wrapping
 * row whose first item is a zero-width strut of the lane's full height, so a
 * label that does not fit beside it wraps onto a second line, which the chip
 * clips away.
 */
const ChordChip = memo(function ChordChip({
  startF,
  widthF,
  label,
  current,
}: {
  startF: number;
  widthF: number;
  label: string;
  current: boolean;
}) {
  // The chord under the playhead always names itself: a chip too narrow for
  // its label grows to the label (min-width: max-content) and paints above its
  // neighbours, so a song of short chords still says what is playing. Every
  // other chip hides a label it cannot fit whole (a cut "Cmaj7" reads "Cm").
  if (current)
    return (
      <Placed
        x={{ start: pct(startF), size: `calc(${pct(widthF)} - ${CHIP_GAP})` }}
        y={LANE_ABOVE_Y}
        layer="raised"
        className="rounded-sm bg-primary px-xs text-primary-foreground"
        style={{ minWidth: "max-content" }}
      >
        <Text variant="tag">{label}</Text>
      </Placed>
    );
  return (
    <Placed
      as={Clip}
      x={{ start: pct(startF), size: `calc(${pct(widthF)} - ${CHIP_GAP})` }}
      y={LANE_ABOVE_Y}
      className="rounded-sm bg-muted px-xs"
    >
      <Stack direction="row" wrap align="center" gap="none">
        <span aria-hidden style={{ height: LANE_HEIGHT }} />
        <Text variant="tag" tone="muted" className="whitespace-nowrap">
          {label}
        </Text>
      </Stack>
    </Placed>
  );
});
