import { forwardRef } from "react";
import type { LyricAnnotation } from "@plugins/apps/plugins/sonata/plugins/score/core";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

/** Identity of the active chord within a line, derived from the cursor selector. */
export interface ActiveChord {
  /** Index of the active line. */
  line: number;
  /** Index of the active chord within that line's `chords`. */
  chord: number;
}

interface SongsheetLineProps {
  /** This line's lyric annotation (text + chords-over-columns). */
  lyric: LyricAnnotation;
  /** Index of this line among all lines (matched against the active selectors). */
  index: number;
  /** True when the playhead is within this line's beat range. */
  isActive: boolean;
  /** The active chord, or null when none / not in this line. */
  activeChord: ActiveChord | null;
  /** Seek the transport to this line's start beat. */
  onSeek: (beat: number) => void;
}

/**
 * One songsheet line: a chord row (chords absolutely positioned over their
 * lyric column) stacked over a lyric row, in a monospace `whitespace-pre`
 * context so `1ch` equals exactly one printed column — chords land over the
 * syllable they sound on, classic-songbook style.
 *
 * The whole line is a click-to-seek button. The active line (playhead inside its
 * range) gets a raised surface tint and a left accent bar; the active chord is
 * emphasised in the chord row.
 */
export const SongsheetLine = forwardRef<HTMLButtonElement, SongsheetLineProps>(
  function SongsheetLine(
    { lyric, index, isActive, activeChord, onSeek },
    ref,
  ) {
    const { text, chords } = lyric.data;
    return (
      <button
        ref={ref}
        type="button"
        onClick={() => onSeek(lyric.start)}
        title={`Seek to beat ${lyric.start.toFixed(2)}`}
        // eslint-disable-next-line layout/no-adhoc-layout -- clickable full-width songsheet row; the left accent bar is a rigid border (border-l-2), only painted on the active line
        className={cn(
          "block w-full rounded-md border-l-2 border-transparent px-md py-xs text-left transition-colors",
          "hover:bg-muted/40",
          isActive ? "border-l-primary bg-muted/60" : null,
        )}
      >
        <Stack gap="none">
          {/* Chord row: monospace baseline; each chord pinned to its column via
              an inline `left: <charOffset>ch` (a computed geometric value, not a
              spacing token). `whitespace-pre` keeps the empty row's height. */}
          <Text
            variant="body"
            as="div"
            // eslint-disable-next-line layout/no-adhoc-layout -- positioning context for the absolutely-placed chords; `relative` is not banned but the chords below need a positioned ancestor
            className="relative h-[1.5em] whitespace-pre font-mono font-semibold"
          >
            {chords.length === 0 ? (
              " "
            ) : (
              chords.map((c, i) => (
                <span
                  key={i}
                  // eslint-disable-next-line layout/no-adhoc-layout -- chord pinned to its exact monospace column; `left` is a computed `ch` offset (one column = one char), not an ad-hoc spacing token
                  className="absolute bottom-0"
                  style={{ left: `${c.charOffset}ch` }}
                >
                  <Text
                    as="span"
                    className={cn(
                      "font-mono",
                      activeChord && activeChord.line === index &&
                        activeChord.chord === i
                        ? "font-bold text-primary"
                        : "font-semibold text-primary/70",
                    )}
                  >
                    {c.symbol}
                  </Text>
                </span>
              ))
            )}
          </Text>

          {/* Lyric row: the raw text, leading spaces preserved. An empty line
              renders a non-breaking space so the row keeps its height. */}
          <Text
            variant="body"
            as="div"
            tone={text.trim().length === 0 ? "muted" : "default"}
            className="whitespace-pre font-mono"
          >
            {text.length === 0 ? " " : text}
          </Text>
        </Stack>
      </button>
    );
  },
);
