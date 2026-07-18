import { useEffect, useMemo, useRef } from "react";
import {
  Sonata,
  useCursorSelector,
  useSonata,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import type {
  LyricAnnotation,
  Score,
  SectionAnnotation,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Inset, Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { revealElement } from "@plugins/primitives/plugins/scroll-reveal/web";
import { SongsheetLine, type ActiveChord } from "./songsheet-line";

/** Props the shell's `Sonata.Display.Dispatch` passes to the chosen display. The
 *  playback cursor is NOT a prop — it's read from the cursor store via
 *  `useCursorSelector` so a per-frame advance only re-renders on a line/chord
 *  boundary, never every frame. `tempoScale` is unused: the songsheet works
 *  purely in beat space (scroll is line-granular, not pixel-time). */
export interface SongsheetProps {
  score: Score;
  tempoScale: number;
  activeDisplayId: string;
}

const EPS = 1e-6;

/** A group of consecutive lines under one section header (or no header). */
interface LineGroup {
  /** Section name, or null for lines before/outside any section. */
  section: string | null;
  /** Global indices (into the flat `lines` array) of this group's lines. */
  lines: { line: LyricAnnotation; index: number }[];
}

/**
 * Group the score's lyric lines under their containing section header, in order.
 * A line's section is the section annotation whose `[start, end]` contains the
 * line's `start`; lines before/outside any section render under no header.
 * Consecutive lines sharing a section collapse into one group so the header
 * prints once.
 */
function groupLines(
  lines: LyricAnnotation[],
  sections: SectionAnnotation[],
): LineGroup[] {
  const groups: LineGroup[] = [];
  lines.forEach((line, index) => {
    // The section containing this line's start (last matching wins, so a later,
    // tighter section overrides an enclosing one if they ever overlap).
    let section: string | null = null;
    for (const s of sections) {
      if (s.start <= line.start + EPS && s.end >= line.start - EPS) {
        section = s.data.name;
      }
    }
    const last = groups.at(-1);
    if (last && last.section === section) {
      last.lines.push({ line, index });
    } else {
      groups.push({ section, lines: [{ line, index }] });
    }
  });
  return groups;
}

function SongsheetInner({ score }: SongsheetProps) {
  const { seekTo, isPlaying } = useSonata();

  // Lyric lines, sorted by start = the songsheet's rows. Memoized off the Score
  // so the per-frame cursor selectors below only walk this stable array.
  const lines = useMemo(
    () =>
      score.annotations
        .filter((a): a is LyricAnnotation => a.type === "lyric")
        .sort((a, b) => a.start - b.start),
    [score.annotations],
  );

  const sections = useMemo(
    () =>
      score.annotations.filter(
        (a): a is SectionAnnotation => a.type === "section",
      ),
    [score.annotations],
  );

  const groups = useMemo(
    () => groupLines(lines, sections),
    [lines, sections],
  );

  // Index of the line whose [start, end) contains the playhead, else -1. Bails
  // out (no re-render) until the playhead crosses into a different line.
  const activeLine = useCursorSelector(
    (beat) =>
      lines.findIndex((l) => beat >= l.start - EPS && beat < l.end - EPS),
    [lines],
  );

  // The chord under the playhead: the chord with the greatest `beat <= cursor`,
  // scanning lines in order. Returns a stable {line, chord} identity (compared by
  // value below) so the highlight reconciles only on a chord boundary.
  const activeChord = useCursorSelector<ActiveChord | null>(
    (beat) => {
      let best: ActiveChord | null = null;
      let bestBeat = -Infinity;
      lines.forEach((l, li) => {
        l.data.chords.forEach((c, ci) => {
          if (c.beat <= beat + EPS && c.beat >= bestBeat) {
            bestBeat = c.beat;
            best = { line: li, chord: ci };
          }
        });
      });
      return best;
    },
    [lines],
    (a, b) => a?.line === b?.line && a?.chord === b?.chord,
  );

  const lineRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Auto-scroll the active line to a comfortable position — but only while
  // playing, so a paused user can scroll and browse freely.
  useEffect(() => {
    if (!isPlaying || activeLine < 0) return;
    revealElement(lineRefs.current[activeLine], {
      behavior: "smooth",
      block: "center",
    });
  }, [activeLine, isPlaying]);

  if (lines.length === 0) {
    return (
      <Center className="h-full w-full bg-background">
        <Placeholder>No lyrics to display as a songsheet.</Placeholder>
      </Center>
    );
  }

  // Running global line index across groups, so a line's ref slot and its
  // active-state checks use the same flat index the selectors return.
  return (
    // eslint-disable-next-line layout/no-adhoc-layout -- positioning context for the corner-pinned HUD over the scroll body
    <div className="relative h-full w-full bg-background">
      <Scroll axis="y" className="h-full">
        <Inset pad="lg">
          <Stack gap="lg">
            {groups.map((group, gi) => (
              <Stack key={gi} gap="2xs">
                {group.section !== null ? (
                  <Text variant="eyebrow" tone="muted" as="div">
                    {group.section}
                  </Text>
                ) : null}
                <Stack gap="2xs">
                  {group.lines.map(({ line, index }) => (
                    <SongsheetLine
                      key={index}
                      ref={(el) => {
                        lineRefs.current[index] = el;
                      }}
                      lyric={line}
                      index={index}
                      isActive={index === activeLine}
                      activeChord={activeChord}
                      onSeek={seekTo}
                    />
                  ))}
                </Stack>
              </Stack>
            ))}
          </Stack>
        </Inset>
      </Scroll>

      {/* HUD: screen-anchored chips (current key, …) pinned to the top-right
          corner over the scroll body. Collection-consumer clean — renders the
          generic Sonata.Hud slot, never naming a contributor. */}
      <Pin to="top-right" offset="sm" layer="float" decorative>
        <Stack gap="xs" align="end">
          <Sonata.Hud.Render>
            {(h) => <h.component key={h.id} />}
          </Sonata.Hud.Render>
        </Stack>
      </Pin>
    </div>
  );
}

/**
 * The songsheet Display. Renders the score's lyric lines as a classic
 * chord-over-lyrics chart — chords printed over the syllable they sound on,
 * grouped by section — highlighting and auto-scrolling the line under the
 * playback cursor. A reading view: no projection, no capabilities; clicking a
 * line seeks the transport.
 */
export function Songsheet(props: SongsheetProps) {
  return <SongsheetInner {...props} />;
}
