import { useEffect, useMemo, useRef } from "react";
import { ResourceErrorInline } from "@plugins/primitives/plugins/live-state/web";
import {
  useCursorApi,
  useCursorSelector,
  useSession,
} from "@plugins/apps/plugins/sonata/plugins/session/web";
import { useSongDocument } from "@plugins/apps/plugins/sonata/plugins/document/web";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import {
  chordBars,
  effectiveKeyAt,
  type ChordAnnotation,
  type ChordBar,
  type Score,
  type SectionAnnotation,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import {
  chordBoxFace,
  useChordDisplayMode,
  type ChordBoxFace,
} from "@plugins/apps/plugins/sonata/plugins/rich/plugins/chord-label/web";
import { ChordBox } from "@plugins/music/plugins/chord-box/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import {
  Inset,
  Stack,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { revealElement } from "@plugins/primitives/plugins/dom/plugins/scroll-reveal/web";
import "./chord-chart.css";

/** Props the player's `SonataPlayer.Display.Dispatch` passes to the chosen
 *  display. The cursor is not a prop: it is read from the cursor store, so a
 *  playback frame re-renders only on a bar or chord boundary. */
export interface ChordChartProps {
  score: Score;
  tempoScale: number;
  activeDisplayId: string;
}

const EPS = 1e-6;

/** A run of consecutive bars under one section header (or none). */
interface BarGroup {
  section: SectionAnnotation | null;
  /** The bars, each with its index into the flat bar list the selectors use. */
  bars: { bar: ChordBar; index: number }[];
}

/**
 * Group the bars under the section each starts in, in order. A bar's section is
 * the section annotation covering its first beat (the last one wins, so a
 * tighter section overrides an enclosing one); consecutive bars sharing a
 * section collapse into one group so its header prints once — the same
 * annotation, not the same name, so two "A" stanzas in a row keep a header each.
 */
function groupBars(
  bars: ChordBar[],
  sections: SectionAnnotation[],
): BarGroup[] {
  const groups: BarGroup[] = [];
  bars.forEach((bar, index) => {
    let section: SectionAnnotation | null = null;
    for (const s of sections) {
      if (s.start <= bar.startBeat + EPS && s.end > bar.startBeat + EPS) {
        section = s;
      }
    }
    const last = groups.at(-1);
    if (last && last.section === section) last.bars.push({ bar, index });
    else groups.push({ section, bars: [{ bar, index }] });
  });
  return groups;
}

/** The playhead's position through `bar`, 0 at its downbeat to 1 at its end. */
function barProgress(bar: ChordBar, beat: number): number {
  const p = (beat - bar.startBeat) / (bar.endBeat - bar.startBeat);
  return Math.min(1, Math.max(0, p));
}

function ChordChartInner({ score }: ChordChartProps) {
  const { seekTo, isPlaying } = useSession();
  const cursor = useCursorApi();
  const { content } = useSongDocument();
  const mode = useChordDisplayMode();
  const scorePending = content.kind === "pending";
  const scoreFailure = content.kind === "failed" ? content.failure : null;

  const bars = useMemo(() => chordBars(score), [score]);
  const groups = useMemo(
    () =>
      groupBars(
        bars,
        score.annotations.filter(
          (a): a is SectionAnnotation => a.type === "section",
        ),
      ),
    [bars, score.annotations],
  );

  // Each chord's face (paint + text) under the active label mode, in the key in
  // force at its onset — keyed by the score's own chord reference, so it never
  // recomputes on a cursor frame.
  const faces = useMemo(() => {
    const m = new Map<ChordAnnotation, ChordBoxFace>();
    for (const bar of bars) {
      for (const { chord } of bar.segs) {
        if (m.has(chord)) continue;
        m.set(
          chord,
          chordBoxFace(
            chord.data,
            effectiveKeyAt(score, chord.start) ?? null,
            mode,
          ),
        );
      }
    }
    return m;
  }, [bars, score, mode]);

  // The bar holding the playhead (-1 outside the chart) and the chord sounding
  // there. Both reconcile only when the playhead crosses a boundary.
  const activeBar = useCursorSelector(
    (beat) =>
      bars.findIndex(
        (b) => beat >= b.startBeat - EPS && beat < b.endBeat - EPS,
      ),
    [bars],
  );
  const activeChord = useCursorSelector(
    (beat) =>
      bars[activeBar]?.segs.find(
        (s) => beat >= s.chord.start - EPS && beat < s.chord.end - EPS,
      )?.chord,
    [bars, activeBar],
  );

  const barRefs = useRef<(HTMLDivElement | null)[]>([]);

  // The beat line through the active bar: its position is a CSS variable on the
  // bar, written from the cursor store's own subscription — no React render per
  // frame. Re-armed when the playhead enters another bar.
  useEffect(() => {
    const el = barRefs.current[activeBar];
    const bar = bars[activeBar];
    if (!el || !bar) return;
    const apply = () =>
      el.style.setProperty(
        "--chord-chart-progress",
        String(barProgress(bar, cursor.getBeat())),
      );
    apply();
    return cursor.subscribe(apply);
  }, [cursor, bars, activeBar]);

  // Keep the active bar's row in view — only while playing, so a paused reader
  // can scroll freely.
  useEffect(() => {
    if (!isPlaying || activeBar < 0) return;
    revealElement(barRefs.current[activeBar], {
      behavior: "smooth",
      block: "center",
    });
  }, [activeBar, isPlaying]);

  if (scoreFailure !== null) {
    return (
      <Center className="h-full w-full bg-background">
        <ResourceErrorInline
          variant="block"
          subject="the song's settings"
          error={scoreFailure.error}
          refetch={scoreFailure.refetch}
        />
      </Center>
    );
  }
  if (scorePending) {
    return (
      <Center className="h-full w-full bg-background">
        <Loading />
      </Center>
    );
  }
  if (bars.length === 0) {
    return (
      <Center className="h-full w-full bg-background">
        <Placeholder>No chords to display as a chord grid.</Placeholder>
      </Center>
    );
  }

  return (
    <Column
      fill
      className="h-full w-full bg-background"
      data-playing={isPlaying ? "" : undefined}
      // The HUD (the generic Sonata.Hud slot: current key, view options) gets
      // its own strip above the sheet rather than floating over it: a grid
      // fills the width, so a pinned HUD would cover the last bar of the
      // first row.
      header={
        <Inset y="sm" x="lg">
          <Stack direction="row" gap="xs" align="center" justify="end">
            <Sonata.Hud.Render>
              {(h) => <h.component key={h.id} />}
            </Sonata.Hud.Render>
          </Stack>
        </Inset>
      }
      body={
        <Inset pad="lg" t="none">
          <div className="chord-chart-sheet">
            <Stack gap="lg">
              {groups.map((group, gi) => (
                <Stack key={gi} gap="xs">
                  {group.section !== null ? (
                    <Text variant="eyebrow" tone="muted" as="div">
                      {group.section.data.name}
                    </Text>
                  ) : null}
                  <div className="chord-chart-bars">
                    {group.bars.map(({ bar, index }) => (
                      <BarCell
                        key={index}
                        ref={(el) => {
                          barRefs.current[index] = el;
                        }}
                        bar={bar}
                        active={index === activeBar}
                        activeChord={
                          index === activeBar ? activeChord : undefined
                        }
                        faces={faces}
                        onSeek={seekTo}
                      />
                    ))}
                  </div>
                </Stack>
              ))}
            </Stack>
          </div>
        </Inset>
      }
    />
  );
}

/**
 * One bar, unframed: its bar number, its chords as chord boxes
 * weighted by the beats they last in it, and a dot per beat. A chord held over
 * the barline is a tie — the dimmed box, no text. The active bar gets a quiet wash
 * and carries the beat line.
 */
function BarCell({
  bar,
  active,
  activeChord,
  faces,
  onSeek,
  ref,
}: {
  bar: ChordBar;
  active: boolean;
  /** The chord sounding now, when this is the active bar. */
  activeChord: ChordAnnotation | undefined;
  faces: Map<ChordAnnotation, ChordBoxFace>;
  onSeek: (beat: number) => void;
  ref: (el: HTMLDivElement | null) => void;
}) {
  const beats = Math.max(1, Math.round(bar.endBeat - bar.startBeat));
  return (
    <div
      ref={ref}
      className="chord-chart-bar"
      data-active={active ? "" : undefined}
    >
      <Text variant="caption" tone="muted" as="div" className="tabular-nums">
        {bar.number}
      </Text>
      <div className="chord-chart-segs">
        {bar.segs.length === 0 ? (
          <span className="chord-chart-rest" aria-label="No chord">
            —
          </span>
        ) : (
          bar.segs.map((seg, i) => {
            const face = faces.get(seg.chord)!;
            const tie = seg.isContinuation;
            return (
              <ChordBox
                key={i}
                className="chord-chart-seg"
                style={{ flexGrow: seg.grow }}
                degree={face.degree}
                state={tie ? "given" : "filled"}
                label={tie ? undefined : face.label}
                now={seg.chord === activeChord}
                data-tie={tie ? "" : undefined}
                hit={{
                  ariaLabel: tie ? `${face.name}, held` : face.name,
                  onClick: () =>
                    onSeek(Math.max(seg.chord.start, bar.startBeat)),
                }}
              />
            );
          })
        )}
        {active && <span className="chord-chart-beatline" aria-hidden />}
      </div>
      <div className="chord-chart-beats" aria-hidden>
        {Array.from({ length: beats }, (_, k) => (
          <i key={k} />
        ))}
      </div>
    </div>
  );
}

/**
 * The chord grid Display: the song's chords as bars in rows of four under
 * their section headers, each chord a chord box painted in its root's degree
 * colour and labelled by the shared chord-label mode, following playback. A
 * reading view: no projection, no capabilities; clicking a chord seeks to it.
 */
export function ChordChart(props: ChordChartProps) {
  return <ChordChartInner {...props} />;
}
