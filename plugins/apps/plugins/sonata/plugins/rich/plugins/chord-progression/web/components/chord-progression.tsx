import { forwardRef, useEffect, useMemo, useRef } from "react";
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
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
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

/** One bar's row in the strip: its slices plus the beat span that owns the playhead. */
interface BarLine {
  /** 1-based bar number in the full score (kept stable across head-trim). */
  number: number;
  startBeat: number;
  endBeat: number;
  segs: Seg[];
}

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
function buildBars(score: Score, chords: ChordAnn[]): BarLine[] {
  if (chords.length === 0) return [];
  const barList = bars(score);
  const end = scoreEndBeat(score);

  const lines: BarLine[] = barList.map((b, i) => {
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
    return { number: b.index + 1, startBeat: barStart, endBeat: barEnd, segs };
  });

  let lo = 0;
  let hi = lines.length - 1;
  while (lo <= hi && lines[lo]!.segs.length === 0) lo++;
  while (hi >= lo && lines[hi]!.segs.length === 0) hi--;
  return lines.slice(lo, hi + 1);
}

/**
 * The chord-progression strip — a `Sonata.Section` panel beside the piano roll.
 * Renders the whole progression as a lead sheet: one bar per line, each chord
 * chip sized by its beat-duration so the rhythm is visible at a glance. The
 * strip scrolls with the song — the bar under the playhead is kept centred in a
 * bounded scroll viewport — and the active chip highlights (both tracked via
 * `useCursorSelector`, so the panel reconciles only on bar / chord boundaries,
 * not every frame). Clicking a chip seeks to that chord.
 */
export function ChordProgression() {
  const { score, seekTo } = useSonata();

  const chords = useMemo(
    () =>
      score.annotations.filter((a): a is ChordAnn => a.type === "chord"),
    [score.annotations],
  );

  const barLines = useMemo(() => buildBars(score, chords), [score, chords]);

  // Stable reference of the chord under the playhead (from the memoized `chords`
  // array, so chips can match by `===`). Falls back to the first chord at the
  // start so the strip isn't un-highlighted before playback begins.
  const active = useCursorSelector(
    (beat) =>
      chords.find((c) => beat >= c.start && beat < c.end) ??
      (beat <= 0 ? chords[0] : undefined),
    [chords],
  );

  // Index of the bar that owns the playhead — drives the auto-scroll. Reconciles
  // only when the playhead crosses a bar boundary (the selector bails otherwise).
  const activeBar = useCursorSelector(
    (beat) => {
      const i = barLines.findIndex(
        (l) => beat >= l.startBeat && beat < l.endBeat,
      );
      return i >= 0 ? i : beat <= 0 ? 0 : barLines.length - 1;
    },
    [barLines],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Keep the active bar centred in the scroll viewport as the song plays. The
  // container is `position: relative`, so each row's `offsetTop` is measured from
  // it directly; we scroll the container only, never the page.
  useEffect(() => {
    const container = scrollRef.current;
    const row = rowRefs.current[activeBar];
    if (!container || !row) return;
    const top =
      row.offsetTop - (container.clientHeight - row.clientHeight) / 2;
    container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [activeBar]);

  if (chords.length === 0) return null;

  return (
    <Card className="rounded-lg p-lg">
      <SectionLabel>Progression</SectionLabel>
      {/* Bounded, self-scrolling lead sheet. Inline overflow/maxHeight + the
          relative positioning context drive the playhead-follow scroll; no
          layout primitive covers a runtime-tracked scroll viewport. */}
      <div
        ref={scrollRef}
        style={{
          position: "relative",
          marginTop: "0.5rem",
          maxHeight: "18rem",
          overflowY: "auto",
        }}
      >
        <Stack gap="2xs">
          {barLines.map((line, i) => (
            <BarRow
              key={i}
              ref={(el) => {
                rowRefs.current[i] = el;
              }}
              line={line}
              active={active}
              onSeek={seekTo}
            />
          ))}
        </Stack>
      </div>
    </Card>
  );
}

/** One bar on its own line: a rigid bar-number gutter plus the chord slices. */
const BarRow = forwardRef<
  HTMLDivElement,
  { line: BarLine; active: ChordAnn | undefined; onSeek: (beat: number) => void }
>(function BarRow({ line, active, onSeek }, ref) {
  return (
    // `auto minmax(0,1fr)`: rigid number gutter + a flexible chip track that
    // owns the full bar width, so the per-chip `fr` weights map to real bar time.
    <div
      ref={ref}
      style={{
        display: "grid",
        gridTemplateColumns: "auto minmax(0, 1fr)",
        alignItems: "center",
        gap: "0.5rem",
      }}
    >
      <Text variant="caption" tone="muted" className="tabular-nums">
        {line.number}
      </Text>
      <BarBody segs={line.segs} active={active} onSeek={onSeek} />
    </div>
  );
});

/** A bar's chord slices as `minmax(0, fr)`-weighted chips — or a rest box. */
function BarBody({
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
      <div className="rounded-md bg-muted/30" style={{ height: "1.25rem" }} aria-hidden />
    );
  }
  return (
    // `minmax(0, …fr)` (never bare `…fr`): the `0` floor lets every track shrink
    // below its chip's content width, so chips truncate instead of overflowing
    // into — and overlapping — their neighbours.
    <div
      style={{
        display: "grid",
        gridTemplateColumns: segs.map((s) => `minmax(0, ${s.grow}fr)`).join(" "),
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
