import { useMemo } from "react";
import {
  useCursorSelector,
  useKeyAutoDetect,
  setKeyAutoDetect,
  useSonata,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { saveKeyAutoDetect } from "@plugins/apps/plugins/sonata/plugins/rich/plugins/key-mode/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { Card } from "@plugins/primitives/plugins/card/web";
import { Stack } from "@plugins/primitives/plugins/spacing/web";
import { ToggleChip } from "@plugins/primitives/plugins/toggle-chip/web";
import { Keyboard } from "@plugins/apps/plugins/sonata/plugins/primitives/plugins/keyboard/web";
import {
  accidentalGlyph,
  collectKeyEntries,
  makeKeySpeller,
  type KeySignature,
} from "@plugins/apps/plugins/sonata/plugins/score/core";

/** The active key plus where it came from, for the source badge. */
type ActiveKey = { key: KeySignature; source: "authored" | "derived" };

function sameActiveKey(a: ActiveKey | undefined, b: ActiveKey | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return (
    a.key.tonic === b.key.tonic &&
    a.key.mode === b.key.mode &&
    a.source === b.source
  );
}

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
  const { score, currentSongId } = useSonata();
  const keyAutoDetect = useKeyAutoDetect();

  // Beat-indexed key entries — recomputed only when the Score changes. Walking
  // the memoized list (rather than `effectiveKeyAt`, which rebuilds it each call)
  // yields STABLE `key` references, so `useCursorSelector` re-renders this panel
  // only when the key changes — not on every cursor frame.
  const entries = useMemo(() => collectKeyEntries(score), [score]);

  // The active entry (key + source) at the playhead, with the same cursor-at-0
  // fallback the key chip uses so the panel is never blank on load. The selector
  // mints a fresh object each call, so pass a value-comparing `isEqual` to keep
  // the per-frame re-render bailout.
  const active = useCursorSelector<ActiveKey | undefined>(
    (cursorBeat) => {
      let found: ActiveKey | undefined;
      for (const e of entries) {
        if (e.beat <= cursorBeat) found = { key: e.key, source: e.source };
        else break; // entries are ascending — no later one can apply.
      }
      if (found) return found;
      const first = entries[0];
      return first ? { key: first.key, source: first.source } : undefined;
    },
    [entries],
    sameActiveKey,
  );
  const current = active?.key;

  // Show the per-song "auto-detect key" toggle only for songs that carry an
  // authored key to override — or that already have the override on (in which
  // case the authored key is stripped from `entries`, so OR the live flag).
  const showToggle =
    entries.some((e) => e.source === "authored") || keyAutoDetect;

  const toggleAutoDetect = () => {
    const next = !keyAutoDetect;
    setKeyAutoDetect(next); // optimistic: re-spell/readout update instantly
    if (currentSongId) saveKeyAutoDetect(currentSongId, next); // persist per song
  };

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
        <div className="flex items-center justify-between gap-sm">
          <div className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            Current key
          </div>
          {showToggle && (
            <ToggleChip
              active={keyAutoDetect}
              variant="ghost"
              size="sm"
              onClick={toggleAutoDetect}
              title={
                keyAutoDetect
                  ? "Using a key auto-detected from the notes. Turn off to use the song's own (MIDI) key."
                  : "Using the song's own (MIDI) key. Turn on to auto-detect the key from the notes instead."
              }
            >
              Auto-detect
            </ToggleChip>
          )}
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
              <div className="flex items-baseline justify-between gap-sm">
                <Text as="div" variant="caption" className="text-muted-foreground">
                  relative {scale.relative.tonic} {scale.relative.mode}
                </Text>
                <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground/80">
                  {active?.source === "derived" ? "Auto-detected" : "From MIDI"}
                </span>
              </div>
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
