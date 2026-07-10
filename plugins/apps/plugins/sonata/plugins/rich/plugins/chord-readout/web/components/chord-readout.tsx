import { useMemo } from "react";
import {
  useCursorSelector,
  useSonata,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { SectionLabel, Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import {
  chordPitches,
  invertVoicing,
  formatChordSymbol,
  romanNumeral,
} from "@plugins/apps/plugins/sonata/plugins/theory/core";
import { Keyboard } from "@plugins/apps/plugins/sonata/plugins/primitives/plugins/keyboard/web";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { useDraft } from "@plugins/primitives/plugins/persistent-draft/web";
import {
  effectiveKeyAt,
  type Annotation,
  type ChordData,
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
 * The "current chord" readout — the BODY of a `Sonata.Section` card whose chrome
 * (Card + collapsible "Current chord" title) the host paints (NOT a
 * geometry-anchored overlay). Reads the shared Score + cursor from `useSonata()`
 * and shows the chord annotation covering the playhead, tracking it as the
 * transport advances. Below the symbol, a mini keyboard lights up the chord's
 * notes; an "Inversions" toggle stacks one mini keyboard per inversion.
 *
 * Applicability is the contribution's `useAvailable` (`useHasChords`): the card
 * is not painted for a chordless song, so this body never renders a
 * "no chords" empty state — only the `—` placeholder when the cursor sits past
 * the last of the (existing) chords.
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

  // The chord's Roman-numeral function in the key in force at its onset — e.g.
  // "V7", "ii", "♭VII". `null` when no key is established (a keyless / atonal
  // score) or the quality is outside the vocabulary. Recomputes only when the
  // chord under the playhead changes (both `current` and `score` are stable
  // between cursor frames), so this never runs per-frame.
  const roman = useMemo(() => {
    if (!current) return null;
    const key = effectiveKeyAt(score, current.start);
    return key ? romanNumeral(current.data, key) : null;
  }, [current, score]);

  // Every inversion of the current chord (index 0 = root position), each an
  // ascending MIDI voicing. Used for the keyboards below the symbol.
  const voicings = useMemo(() => {
    if (!current) return null;
    const root = chordPitches(current.data);
    return centerInWindow(root.map((_, k) => invertVoicing(root, k)));
  }, [current]);

  if (!current) {
    return (
      // eslint-disable-next-line text/no-adhoc-typography -- large placeholder dash matching the 24px display readout (no equivalent variant above the title token, 20px)
      <div className="text-2xl font-semibold text-muted-foreground/60">—</div>
    );
  }

  return (
    <Stack gap="md">
      <Stack gap="2xs">
        {/* Row: the big chord symbol, and — when a key is in force — its
            Roman-numeral function trailing in the accent color, so the chord's
            name and its harmonic role read side by side. */}
        <div className="flex items-baseline gap-sm">
          {/* eslint-disable-next-line text/no-adhoc-typography -- large display readout (36px) exceeds the title token (20px), no equivalent variant */}
          <div className="text-4xl font-bold tracking-tight text-foreground">
            {current.data.symbol}
          </div>
          {roman && (
            <Text
              as="div"
              variant="title"
              tone="primary"
              className="tabular-nums font-semibold"
            >
              {roman}
            </Text>
          )}
        </div>
        <Text as="div" variant="caption" className="text-muted-foreground">
          {current.data.spelledSymbol ? `${current.data.spelledSymbol} · ` : ""}
          {current.data.quality}
          {current.confidence !== undefined
            ? ` · ${(current.confidence * 100).toFixed(0)}% confidence`
            : ""}
        </Text>
        <div className="text-2xs tabular-nums text-muted-foreground/70">
          beats {current.start.toFixed(2)}–{current.end.toFixed(2)}
        </div>
      </Stack>

      {voicings && (
        <Stack gap="sm">
          <div className="flex items-center justify-between">
            <SectionLabel>Notes</SectionLabel>
            {voicings.length > 1 && (
              <ToggleChip
                active={showInversions}
                onClick={() => setShowInversions((v) => !v)}
              >
                Inversions
              </ToggleChip>
            )}
          </div>
          <Stack gap="sm">
            {(showInversions ? voicings : voicings.slice(0, 1)).map(
              (voicing, k) => {
                const slash = formatChordSymbol({
                  root: current.data.root,
                  quality: current.data.quality,
                  bass: ((voicing[0]! % 12) + 12) % 12,
                });
                return (
                  <Stack key={k} gap="xs">
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
                  </Stack>
                );
              },
            )}
          </Stack>
        </Stack>
      )}
    </Stack>
  );
}
