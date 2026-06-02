import { useMemo } from "react";
import {
  useSonata,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import type {
  Annotation,
  ChordData,
} from "@plugins/apps/plugins/sonata/plugins/score/core";

/**
 * The "current chord" readout — a free-floating `Sonata.Section` panel (NOT a
 * geometry-anchored overlay). Reads the shared Score + cursor from `useSonata()`
 * and shows the chord annotation covering the playhead, tracking it as the
 * transport advances.
 */
export function ChordReadout() {
  const { score, cursorBeat } = useSonata();

  const chords = useMemo(
    () =>
      score.annotations.filter(
        (a): a is Annotation<"chord", ChordData> => a.type === "chord",
      ),
    [score.annotations],
  );

  const current = useMemo(
    () =>
      chords.find((c) => cursorBeat >= c.start && cursorBeat < c.end) ??
      // Before playback starts (cursor at 0) show the first chord so the panel
      // isn't blank on load.
      (cursorBeat <= 0 ? chords[0] : undefined),
    [chords, cursorBeat],
  );

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Current chord
      </div>
      {current ? (
        <>
          <div className="mt-2 text-4xl font-bold tracking-tight text-foreground">
            {current.data.symbol}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {current.data.quality}
            {current.confidence !== undefined
              ? ` · ${(current.confidence * 100).toFixed(0)}% confidence`
              : ""}
          </div>
          <div className="mt-1 text-[11px] tabular-nums text-muted-foreground/70">
            beats {current.start.toFixed(2)}–{current.end.toFixed(2)}
          </div>
        </>
      ) : chords.length === 0 ? (
        <div className="mt-2 text-sm text-muted-foreground">
          No chords detected.
        </div>
      ) : (
        <div className="mt-2 text-2xl font-semibold text-muted-foreground/60">
          —
        </div>
      )}
    </div>
  );
}
