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
  formatChordSymbolWithBass,
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
 * Default keyboard window: C4 (60) … B6 (95), three octaves — enough for a triad
 * or 7th chord and all its inversions, with room to spare on both sides. Held
 * fixed across chords wherever it fits, so changing chord only re-lights keys
 * instead of re-laying-out the whole keyboard (no flicker).
 */
const KB_LOW = 60;
const KB_HIGH = 95;
const KB_CENTER = (KB_LOW + KB_HIGH) / 2;

/**
 * Fit a chord's inversions to a keyboard window: octave-shift them toward the
 * center of the default window, then widen that window (in whole octaves, so it
 * still starts on a C and ends on a B — `keyLayout` tiles flush only then) if
 * anything still falls outside it.
 *
 * The shift is a multiple of 12 because the keyboard illustrates chord *shape*,
 * not sounding octave: an octave shift is free, anything else would light the
 * wrong keys. It's computed over ALL inversions at once, so the frame is stable
 * whether or not they're expanded and the bass visibly climbs from row to row.
 *
 * Widening is what makes wide chords honest rather than clipped. A rotation of a
 * chord stacked past an octave spans further than the chord itself — Bm7(♭9)'s
 * five inversions cover B4…A7 (34 semitones) — and since the shift is quantized
 * to octaves, no shift can slide that inside a 36-key window: it lands 1 key
 * over the bottom or 10 over the top. Such a chord gets four octaves; triads and
 * 7ths are untouched and keep the default three.
 */
function fitToWindow(voicings: number[][]): {
  low: number;
  high: number;
  voicings: number[][];
} {
  const all = voicings.flat();
  const min = Math.min(...all);
  const max = Math.max(...all);
  const shift = Math.round((KB_CENTER - (min + max) / 2) / 12) * 12;

  let low = KB_LOW;
  let high = KB_HIGH;
  while (min + shift < low) low -= 12;
  while (max + shift > high) high += 12;

  return {
    low,
    high,
    voicings: shift === 0 ? voicings : voicings.map((v) => v.map((p) => p + shift)),
  };
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
  // ascending MIDI voicing, with the keyboard window they're drawn in. Used for
  // the keyboards below the symbol.
  const fitted = useMemo(() => {
    if (!current) return null;
    const root = chordPitches(current.data);
    return fitToWindow(root.map((_, k) => invertVoicing(root, k)));
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

      {fitted && (
        <Stack gap="sm">
          <div className="flex items-center justify-between">
            <SectionLabel>Notes</SectionLabel>
            {fitted.voicings.length > 1 && (
              <ToggleChip
                active={showInversions}
                onClick={() => setShowInversions((v) => !v)}
              >
                Inversions
              </ToggleChip>
            )}
          </div>
          <Stack gap="sm">
            {(showInversions ? fitted.voicings : fitted.voicings.slice(0, 1)).map(
              (voicing, k) => {
                const slash = formatChordSymbolWithBass(
                  current.data,
                  ((voicing[0]! % 12) + 12) % 12,
                );
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
                      low={fitted.low}
                      high={fitted.high}
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
