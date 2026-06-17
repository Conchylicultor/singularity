import { useMemo } from "react";
import {
  useCursorSelector,
  useSonata,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import {
  bars,
  scoreEndBeat,
  type Annotation,
  type ChordData,
  type Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/section-label/web";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

type ChordAnn = Annotation<"chord", ChordData>;

/** A chord's visible slice within one bar. */
interface Seg {
  chord: ChordAnn;
  /** Beats this slice spans inside the bar — used as the chip's `fr` weight. */
  grow: number;
  /** True when the chord was struck in an earlier bar and is held into this one. */
  isContinuation: boolean;
}

/** How many bars to lay across one row (lead-sheet phrasing). */
const BARS_PER_ROW = 4;
const EPS = 1e-6;

/**
 * Slice every chord annotation against the score's bar grid. A chord occupies a
 * `fr`-weighted slot in each bar it overlaps, so within-bar groups (`(E E6)`)
 * split a bar, in-bar holds (`(C . . D)`) widen the held chord, and cross-bar
 * holds (`Cmaj7 . .`) carry the chord forward as ghosted continuation slices.
 * Source-agnostic: reads the canonical Score, so authored chord-grids and
 * analyzer-derived chords render identically. Empty (rest) bars at the head/tail
 * are trimmed so the strip starts and ends on a chord.
 */
function buildBars(score: Score, chords: ChordAnn[]): Seg[][] {
  if (chords.length === 0) return [];
  const barList = bars(score);
  const end = scoreEndBeat(score);

  const cells: Seg[][] = barList.map((b, i) => {
    const barStart = b.startBeat;
    const barEnd = barList[i + 1]?.startBeat ?? Math.max(end, barStart + 1);
    const segs: Seg[] = [];
    for (const ch of chords) {
      if (ch.end <= barStart + EPS || ch.start >= barEnd - EPS) continue;
      const grow = Math.min(ch.end, barEnd) - Math.max(ch.start, barStart);
      if (grow <= EPS) continue;
      segs.push({ chord: ch, grow, isContinuation: ch.start < barStart - EPS });
    }
    segs.sort((a, z) => a.chord.start - z.chord.start);
    return segs;
  });

  let lo = 0;
  let hi = cells.length - 1;
  while (lo <= hi && cells[lo]!.length === 0) lo++;
  while (hi >= lo && cells[hi]!.length === 0) hi--;
  return cells.slice(lo, hi + 1);
}

/**
 * The chord-progression strip — a `Sonata.Section` panel beside the piano roll.
 * Renders the whole progression as chips laid out bar-by-bar, each chip sized by
 * its beat-duration so the rhythm of the chord changes is visible at a glance.
 * The chip(s) under the playhead highlight (tracked via `useCursorSelector`, so
 * the panel reconciles only on chord boundaries, not every frame); clicking a
 * chip seeks to that chord.
 */
export function ChordProgression() {
  const { score, seekTo } = useSonata();

  const chords = useMemo(
    () =>
      score.annotations.filter((a): a is ChordAnn => a.type === "chord"),
    [score.annotations],
  );

  const barCells = useMemo(() => buildBars(score, chords), [score, chords]);

  // Stable reference of the chord under the playhead (from the memoized `chords`
  // array, so chips can match by `===`). Falls back to the first chord at the
  // start so the strip isn't un-highlighted before playback begins.
  const active = useCursorSelector(
    (beat) =>
      chords.find((c) => beat >= c.start && beat < c.end) ??
      (beat <= 0 ? chords[0] : undefined),
    [chords],
  );

  if (chords.length === 0) return null;

  return (
    <Card className="rounded-lg p-lg">
      <SectionLabel>Progression</SectionLabel>
      {/* Fixed lead-sheet grid: BARS_PER_ROW equal bar columns. The data-driven
          proportional `fr` tracks live one level down (per bar). Inline grid
          styles express runtime-computed track weights no layout primitive
          covers. */}
      <div
        style={{
          marginTop: "0.5rem",
          display: "grid",
          gridTemplateColumns: `repeat(${BARS_PER_ROW}, minmax(0, 1fr))`,
          alignItems: "start",
          gap: "0.25rem",
        }}
      >
        {barCells.map((segs, i) => (
          <BarCell key={i} segs={segs} active={active} onSeek={seekTo} />
        ))}
      </div>
    </Card>
  );
}

/** One bar: its chord slices laid out as `fr`-weighted chips (or a rest box). */
function BarCell({
  segs,
  active,
  onSeek,
}: {
  segs: Seg[];
  active: ChordAnn | undefined;
  onSeek: (beat: number) => void;
}) {
  if (segs.length === 0) {
    return (
      <div
        className="rounded-md bg-muted/30"
        style={{ minHeight: "1.5rem" }}
        aria-hidden
      />
    );
  }
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: segs.map((s) => `${s.grow}fr`).join(" "),
        alignItems: "center",
        gap: "0.125rem",
      }}
    >
      {segs.map((seg, j) => (
        <ChordChip
          key={j}
          seg={seg}
          isActive={seg.chord === active}
          onSeek={onSeek}
        />
      ))}
    </div>
  );
}

/** A single chord chip — fills its `fr` track; dimmed when it's a held carry-over. */
function ChordChip({
  seg,
  isActive,
  onSeek,
}: {
  seg: Seg;
  isActive: boolean;
  onSeek: (beat: number) => void;
}) {
  const { chord, isContinuation } = seg;
  return (
    <ToggleChip
      active={isActive}
      size="sm"
      mono
      onClick={() => onSeek(chord.start)}
      title={`${chord.data.symbol} · beats ${chord.start.toFixed(2)}–${chord.end.toFixed(2)}`}
      className={cn("w-full", isContinuation && "opacity-40")}
    >
      {chord.data.symbol}
    </ToggleChip>
  );
}
