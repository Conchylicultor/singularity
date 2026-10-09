import type { CSSProperties } from "react";
import type {
  LyricAnnotation,
  LyricChord,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { Placed } from "@plugins/primitives/plugins/css/plugins/coords/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

/** How a caller paints one chord name over the words. */
export interface LyricChordStyle {
  className?: string;
  style?: CSSProperties;
}

export interface LyricLineTextProps {
  /** The songsheet line: its words and the chords printed over them. */
  lyric: LyricAnnotation;
  /** Index (into `lyric.data.chords`) of the chord sounding now, or null when
   *  none of this line's chords is. */
  activeChord: number | null;
  /** Paints a chord name; `active` is true for the sounding one. Omitted, the
   *  chords read in the primary colour, the sounding one stronger and bold. */
  chordStyle?: (chord: LyricChord, active: boolean) => LyricChordStyle;
}

function defaultChordStyle(_: LyricChord, active: boolean): LyricChordStyle {
  return {
    className: active
      ? "font-bold text-primary-text"
      : "font-semibold text-primary-text/70",
  };
}

/**
 * One songsheet line as text: a chord row (each chord pinned over its lyric
 * column) stacked over the lyric row, in a monospace `whitespace-pre` context
 * so `1ch` is exactly one printed column — chords land over the syllable they
 * sound on, classic-songbook style. No chrome of its own: the caller frames it
 * (a seek button, a grid cell) and decides how the chords are painted.
 */
export function LyricLineText({
  lyric,
  activeChord,
  chordStyle = defaultChordStyle,
}: LyricLineTextProps) {
  const { text, chords } = lyric.data;
  return (
    <Stack gap="none">
      {/* Chord row: monospace baseline; each chord pinned to its column via
          an inline `left: <charOffset>ch` (a computed geometric value, not a
          spacing token). `whitespace-pre` keeps the empty row's height. */}
      <Text
        variant="body"
        as="div"
        // `relative` is the positioning context the absolutely-placed
        // chords below need.
        className="relative h-[1.5em] whitespace-pre font-mono font-semibold"
      >
        {chords.length === 0
          ? " "
          : chords.map((c, i) => {
              const paint = chordStyle(c, i === activeChord);
              return (
                // Pinned to its exact monospace column: `start` is a computed
                // `ch` offset (one column = one char), not a spacing token.
                <Placed
                  key={i}
                  as="span"
                  x={{ start: `${c.charOffset}ch` }}
                  y={{ end: 0 }}
                >
                  <Text
                    as="span"
                    className={cn("font-mono", paint.className)}
                    style={paint.style}
                  >
                    {c.symbol}
                  </Text>
                </Placed>
              );
            })}
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
  );
}
