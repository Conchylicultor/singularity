import { forwardRef } from "react";
import type { LyricAnnotation } from "@plugins/apps/plugins/sonata/plugins/score/core";
import { LyricLineText } from "@plugins/apps/plugins/sonata/plugins/lyric-line/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

interface SongsheetLineProps {
  /** This line's lyric annotation (text + chords-over-columns). */
  lyric: LyricAnnotation;
  /** True when the playhead is within this line's beat range. */
  isActive: boolean;
  /** Index (into this line's chords) of the chord sounding now, or null. */
  activeChord: number | null;
  /** Seek the transport to this line's start beat. */
  onSeek: (beat: number) => void;
}

/**
 * One songsheet line: the shared chord-over-words block (`LyricLineText`) as a
 * full-width click-to-seek button. The active line (playhead inside its range)
 * gets a raised surface tint and a left accent bar; the active chord is
 * emphasised in the chord row.
 */
export const SongsheetLine = forwardRef<HTMLButtonElement, SongsheetLineProps>(
  function SongsheetLine({ lyric, isActive, activeChord, onSeek }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        onClick={() => onSeek(lyric.start)}
        title={`Seek to beat ${lyric.start.toFixed(2)}`}
        // Clickable full-width songsheet row. The left accent bar is a rigid
        // border (border-l-2), only painted on the active line.
        className={cn(
          "block w-full rounded-md border-l-2 border-transparent px-md py-xs text-left transition-colors",
          "hover:bg-muted/40",
          isActive ? "border-l-primary bg-muted/60" : null,
        )}
      >
        <LyricLineText lyric={lyric} activeChord={activeChord} />
      </button>
    );
  },
);
