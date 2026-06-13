import { useMemo } from "react";
import {
  useCursorSelector,
  useSonata,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { Card } from "@plugins/primitives/plugins/card/web";
import { Stack } from "@plugins/primitives/plugins/spacing/web";
import { Keyboard } from "@plugins/apps/plugins/sonata/plugins/primitives/plugins/keyboard/web";
import {
  accidentalGlyph,
  collectKeyEntries,
  makeKeySpeller,
  type KeySignature,
} from "@plugins/apps/plugins/sonata/plugins/score/core";

/**
 * Fixed keyboard window: C4 (60) … B6 (95), three octaves. Matches the chord
 * readout's window exactly so the two sibling section panels render piano keys
 * at an identical size (both keyboards are `w-full` in the same-width column, so
 * the key width is set by the octave span). The frame is content-independent on
 * purpose — changing key only re-lights keys, never re-lays-out the keyboard
 * (no flicker); the scale's repeating pattern reads across all three octaves.
 */
const KB_LOW = 60;
const KB_HIGH = 95;

/** Pitch class (0–11) of a tonic note name like "C", "F#", "Bb". */
const LETTER_PC: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};
function tonicPc(tonic: string): number {
  let pc = LETTER_PC[tonic[0]?.toUpperCase() ?? "C"] ?? 0;
  for (const ch of tonic.slice(1)) {
    if (ch === "#" || ch === "♯") pc += 1;
    else if (ch === "b" || ch === "♭") pc -= 1;
  }
  return ((pc % 12) + 12) % 12;
}

/** Tint for non-tonic scale notes — the theme accent, softened so the tonic
 *  (full accent) stands out as the tonal centre. */
const SCALE_TINT = "color-mix(in srgb, var(--primary) 32%, transparent)";

/**
 * The "current key" readout — a free-floating `Sonata.Section` panel, sibling to
 * the chord readout. Reads the shared Score + cursor from `useSonata()` and shows
 * the key in force at the playhead (the song's `meta.key` plus mid-song `key`
 * annotations, reconciled by `effectiveKeyAt`). Where the chord readout lights a
 * chord's notes, this lights the key's *scale* notes — the tonic in the full
 * accent, the other six diatonic degrees in a softer tint.
 */
export function KeyReadout() {
  const { score } = useSonata();

  // Beat-indexed key entries — recomputed only when the Score changes. Walking
  // the memoized list (rather than `effectiveKeyAt`, which rebuilds it each call)
  // yields STABLE `key` references, so `useCursorSelector` re-renders this panel
  // only when the key changes — not on every cursor frame.
  const entries = useMemo(() => collectKeyEntries(score), [score]);

  // The key in force at the playhead, with the same cursor-at-0 fallback the
  // key chip uses so the panel is never blank on load when a key is known.
  const current = useCursorSelector<KeySignature | undefined>((cursorBeat) => {
    let active: KeySignature | undefined;
    for (const e of entries) {
      if (e.beat <= cursorBeat) active = e.key;
      else break; // entries are ascending — no later one can apply.
    }
    return active ?? entries[0]?.key;
  }, [entries]);

  const scale = useMemo(() => {
    if (!current) return null;
    const speller = makeKeySpeller(current);
    const root = tonicPc(current.tonic);

    // Diatonic pitch classes, ordered from the tonic up. `diatonic` returns null
    // for any pc outside the key, so it doubles as scale membership.
    const ordered: { pc: number; name: string }[] = [];
    for (let i = 0; i < 12; i++) {
      const pc = (root + i) % 12;
      if (!speller.diatonic(pc)) continue;
      const sp = speller.spell(pc + 60); // octave is irrelevant to step/alter
      ordered.push({ pc, name: sp.step + accidentalGlyph(sp.alter) });
    }
    const inScale = new Set(ordered.map((d) => d.pc));

    // pitch → color across the window: tonic full accent (""), others tinted.
    const lit = new Map<number, string>();
    for (let p = KB_LOW; p <= KB_HIGH; p++) {
      const pc = ((p % 12) + 12) % 12;
      if (inScale.has(pc)) lit.set(p, pc === root ? "" : SCALE_TINT);
    }

    // Relative key (shares the same notes): +3 semitones from a minor tonic to
    // its relative major, +9 from a major tonic to its relative minor.
    const relPc = (root + (current.mode === "major" ? 9 : 3)) % 12;
    const relSp = speller.spell(relPc + 60);
    const relative = {
      tonic: relSp.step + accidentalGlyph(relSp.alter),
      mode: current.mode === "major" ? "minor" : "major",
    };

    return { names: ordered.map((d) => d.name), lit, relative };
  }, [current]);

  return (
    <Card className="rounded-lg p-lg">
      <Stack gap="sm">
        <div className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          Current key
        </div>
        {current && scale ? (
          <>
            <Stack gap="2xs">
              {/* eslint-disable-next-line text/no-adhoc-typography -- large display readout (36px) matching the chord readout; exceeds the title token (20px), no equivalent variant */}
              <div className="text-4xl font-bold tracking-tight text-foreground">
                {current.tonic}{" "}
                <span className="font-semibold text-muted-foreground">
                  {current.mode}
                </span>
              </div>
              <Text as="div" variant="caption" className="text-muted-foreground">
                relative {scale.relative.tonic} {scale.relative.mode}
              </Text>
            </Stack>

            <Stack gap="xs">
              <div className="flex items-center justify-between">
                <div className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Scale
                </div>
                <div className="text-2xs tabular-nums text-muted-foreground/80">
                  {scale.names.join(" · ")}
                </div>
              </div>
              <Keyboard
                low={KB_LOW}
                high={KB_HIGH}
                lit={scale.lit}
                className="h-11 w-full"
              />
            </Stack>
          </>
        ) : (
          <Text as="div" variant="body" className="text-muted-foreground">
            No key detected.
          </Text>
        )}
      </Stack>
    </Card>
  );
}
