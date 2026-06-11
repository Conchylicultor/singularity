import { useMemo } from "react";
import {
  useSonata,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { Card } from "@plugins/primitives/plugins/card/web";
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
    <Card className="rounded-lg p-4">
      <div className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        Current chord
      </div>
      {current ? (
        <>
          {/* eslint-disable-next-line text/no-adhoc-typography -- large display readout (36px); exceeds the title token (20px), no equivalent variant */}
          <div className="mt-2 text-4xl font-bold tracking-tight text-foreground">
            {current.data.symbol}
          </div>
          <Text as="div" variant="caption" className="mt-1 text-muted-foreground">
            {current.data.spelledSymbol ? `${current.data.spelledSymbol} · ` : ""}
            {current.data.quality}
            {current.confidence !== undefined
              ? ` · ${(current.confidence * 100).toFixed(0)}% confidence`
              : ""}
          </Text>
          <div className="mt-1 text-2xs tabular-nums text-muted-foreground/70">
            beats {current.start.toFixed(2)}–{current.end.toFixed(2)}
          </div>
        </>
      ) : chords.length === 0 ? (
        <Text as="div" variant="body" className="mt-2 text-muted-foreground">
          No chords detected.
        </Text>
      ) : (
        // eslint-disable-next-line text/no-adhoc-typography -- large placeholder dash matching the 24px display readout; no equivalent variant above the title token (20px)
        <div className="mt-2 text-2xl font-semibold text-muted-foreground/60">
          —
        </div>
      )}
    </Card>
  );
}
