import { ResourceErrorInline } from "@plugins/primitives/plugins/live-state/web";
import { useEffect, useMemo, useRef } from "react";
import {
  useCursorSelector,
  useSession,
} from "@plugins/apps/plugins/sonata/plugins/session/web";
import { useSongDocument } from "@plugins/apps/plugins/sonata/plugins/document/web";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import type {
  LyricAnnotation,
  Score,
  SectionAnnotation,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import {
  activeLyricChord,
  lyricLines,
  sameActiveChord,
  type ActiveChord,
} from "@plugins/apps/plugins/sonata/plugins/lyric-line/core";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import {
  Inset,
  Stack,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { revealElement } from "@plugins/primitives/plugins/dom/plugins/scroll-reveal/web";
import { SongsheetLine } from "./songsheet-line";

/** Props the player's `SonataPlayer.Display.Dispatch` passes to the chosen display. The
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
  /** The section, or null for lines before/outside any section. */
  section: SectionAnnotation | null;
  /** Global indices (into the flat `lines` array) of this group's lines. */
  lines: { line: LyricAnnotation; index: number }[];
}

/**
 * Group the score's lyric lines under their containing section header, in order.
 * A line's section is the section annotation whose `[start, end]` contains the
 * line's `start`; lines before/outside any section render under no header.
 * Consecutive lines sharing a section collapse into one group so the header
 * prints once — the same annotation, not the same name, so two "A" stanzas in a
 * row keep a header each.
 */
function groupLines(
  lines: LyricAnnotation[],
  sections: SectionAnnotation[],
): LineGroup[] {
  const groups: LineGroup[] = [];
  lines.forEach((line, index) => {
    // The section containing this line's start (last matching wins, so a later,
    // tighter section overrides an enclosing one if they ever overlap).
    let section: SectionAnnotation | null = null;
    for (const s of sections) {
      if (s.start <= line.start + EPS && s.end >= line.start - EPS) {
        section = s;
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
  const { seekTo, isPlaying } = useSession();
  const { content } = useSongDocument();
  const scorePending = content.kind === "pending";
  const scoreFailure = content.kind === "failed" ? content.failure : null;

  // Lyric lines, sorted by start = the songsheet's rows. Memoized off the Score
  // so the per-frame cursor selectors below only walk this stable array.
  const lines = useMemo(() => lyricLines(score), [score]);

  const sections = useMemo(
    () =>
      score.annotations.filter(
        (a): a is SectionAnnotation => a.type === "section",
      ),
    [score.annotations],
  );

  const groups = useMemo(() => groupLines(lines, sections), [lines, sections]);

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
    (beat) => activeLyricChord(lines, beat),
    [lines],
    sameActiveChord,
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

  if (scoreFailure !== null) {
    // A setting could not be read: say so, not "no lyrics" nor a spinner.
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
    // The song's settings are still loading (the score is withheld until they
    // settle): not "no lyrics".
    return (
      <Center className="h-full w-full bg-background">
        <Loading />
      </Center>
    );
  }
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
    // `relative` is the positioning context for the corner-pinned HUD over the
    // scroll body.
    <div className="relative h-full w-full bg-background">
      <Scroll axis="y" className="h-full">
        <Inset pad="lg">
          <Stack gap="lg">
            {groups.map((group, gi) => (
              <Stack key={gi} gap="2xs">
                {group.section !== null ? (
                  <Text variant="eyebrow" tone="muted" as="div">
                    {group.section.data.name}
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
                      isActive={index === activeLine}
                      activeChord={
                        activeChord?.line === index ? activeChord.chord : null
                      }
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
