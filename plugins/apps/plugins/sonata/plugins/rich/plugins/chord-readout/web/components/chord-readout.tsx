import { useMemo } from "react";
import {
  useCursorSelector,
  useSonata,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { Card } from "@plugins/primitives/plugins/card/web";
import {
  chordPitches,
  invertVoicing,
  formatChordSymbol,
} from "@plugins/apps/plugins/sonata/plugins/theory/core";
import { Keyboard } from "@plugins/apps/plugins/sonata/plugins/primitives/plugins/keyboard/web";
import { ToggleChip } from "@plugins/primitives/plugins/toggle-chip/web";
import { useDraft } from "@plugins/primitives/plugins/persistent-draft/web";
import type {
  Annotation,
  ChordData,
} from "@plugins/apps/plugins/sonata/plugins/score/core";

/** Inversion row labels by index (0 = root position). */
const ORDINALS = ["Root", "1st", "2nd", "3rd", "4th", "5th"];

/**
 * Fixed keyboard window: C4 (60) … B6 (95), three octaves. Chord-independent on
 * purpose — the keyboard frame stays identical across chords, so changing chord
 * only re-lights keys instead of re-laying-out the whole keyboard (no flicker).
 * Each chord's voicings are octave-transposed to sit centered in this window
 * (see `centerInWindow`), so a triad and all its inversions fit with room to
 * spare on both sides.
 */
const KB_LOW = 60;
const KB_HIGH = 95;
const KB_CENTER = (KB_LOW + KB_HIGH) / 2;

/**
 * Shift a set of voicings by whole octaves so their overall midpoint lands as
 * close as possible to the window center. The keyboard only illustrates chord
 * *shape* (not the sounding octave), so an octave shift is free — and keeping it
 * a multiple of 12 preserves which keys (pitch classes) light. The shift is
 * computed over ALL inversions so it stays stable whether or not the inversions
 * are expanded.
 */
function centerInWindow(voicings: number[][]): number[][] {
  const all = voicings.flat();
  const mid = (Math.min(...all) + Math.max(...all)) / 2;
  const shift = Math.round((KB_CENTER - mid) / 12) * 12;
  return shift === 0 ? voicings : voicings.map((v) => v.map((p) => p + shift));
}

/**
 * The "current chord" readout — a free-floating `Sonata.Section` panel (NOT a
 * geometry-anchored overlay). Reads the shared Score + cursor from `useSonata()`
 * and shows the chord annotation covering the playhead, tracking it as the
 * transport advances. Below the symbol, a mini keyboard lights up the chord's
 * notes; an "Inversions" toggle stacks one mini keyboard per inversion.
 */
export function ChordReadout() {
  const { score } = useSonata();
  const [showInversions, setShowInversions] = useDraft<boolean>(
    "sonata:chord-readout:inversions",
    false,
  );

  const chords = useMemo(
    () =>
      score.annotations.filter(
        (a): a is Annotation<"chord", ChordData> => a.type === "chord",
      ),
    [score.annotations],
  );

  // `useCursorSelector` returns the matched chord's STABLE reference (from the
  // memoized `chords` array), so this panel re-renders only when the chord under
  // the playhead changes — not on every cursor frame.
  const current = useCursorSelector(
    (cursorBeat) =>
      chords.find((c) => cursorBeat >= c.start && cursorBeat < c.end) ??
      // Before playback starts (cursor at 0) show the first chord so the panel
      // isn't blank on load.
      (cursorBeat <= 0 ? chords[0] : undefined),
    [chords],
  );

  // Every inversion of the current chord (index 0 = root position), each an
  // ascending MIDI voicing. Used for the keyboards below the symbol.
  const voicings = useMemo(() => {
    if (!current) return null;
    const root = chordPitches(current.data);
    return centerInWindow(root.map((_, k) => invertVoicing(root, k)));
  }, [current]);

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

          {voicings && (
            <div className="mt-3">
              <div className="flex items-center justify-between">
                <div className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Notes
                </div>
                {voicings.length > 1 && (
                  <ToggleChip
                    size="sm"
                    active={showInversions}
                    onClick={() => setShowInversions((v) => !v)}
                  >
                    Inversions
                  </ToggleChip>
                )}
              </div>
              <div className="mt-2 flex flex-col gap-2.5">
                {(showInversions ? voicings : voicings.slice(0, 1)).map(
                  (voicing, k) => {
                    const slash = formatChordSymbol({
                      root: current.data.root,
                      quality: current.data.quality,
                      bass: ((voicing[0]! % 12) + 12) % 12,
                    });
                    return (
                      <div key={k} className="flex flex-col gap-1">
                        {/* Per-row caption — only when stacking inversions; the
                            big symbol above already names the root chord. */}
                        {showInversions && (
                          <div className="text-2xs">
                            <span className="font-medium text-foreground/80">
                              {ORDINALS[k] ?? `${k}th`}
                            </span>
                            <span className="text-muted-foreground/70">
                              {" · "}
                              {slash}
                            </span>
                          </div>
                        )}
                        <Keyboard
                          low={KB_LOW}
                          high={KB_HIGH}
                          lit={voicing}
                          className="h-11 w-full"
                        />
                      </div>
                    );
                  },
                )}
              </div>
            </div>
          )}
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
