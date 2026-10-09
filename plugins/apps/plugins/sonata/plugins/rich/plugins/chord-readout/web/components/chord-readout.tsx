import { useMemo } from "react";
import { useSession } from "@plugins/apps/plugins/sonata/plugins/session/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import {
  chordPitches,
  chordVoicing,
  invertVoicing,
  formatChordSymbolWithBass,
  romanNumeral,
} from "@plugins/apps/plugins/sonata/plugins/theory/core";
import type { KeyboardProps } from "@plugins/apps/plugins/sonata/plugins/primitives/plugins/keyboard/web";
import {
  KeyboardCaption,
  ReadoutKeyboard,
  useReadoutPlane,
} from "@plugins/apps/plugins/sonata/plugins/rich/plugins/readout-keyboard/web";
import {
  accidentalGlyph,
  effectiveKeyAt,
  makeKeySpeller,
  type KeySpeller,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import {
  useCurrentChord,
  useShowInversions,
} from "../internal/use-current-chord";

/** Inversion caption leads by index (0 = root position). */
const ORDINALS = ["Root", "1st", "2nd", "3rd", "4th", "5th"];

/** Stable "nothing lit" voicing for the resting keyboard. */
const NO_KEYS: readonly number[] = [];

const pc12 = (p: number): number => ((p % 12) + 12) % 12;

/**
 * Labels each LIT key with its note name, spelled for the key in force at the
 * chord's onset (so a B♭ chord in a flat key reads B♭, not A#). Unlit keys stay
 * blank — the readout is about the chord's notes, not keyboard orientation.
 */
function noteLabels(speller: KeySpeller): KeyboardProps["renderKey"] {
  return (key, { lit, narrow }) => {
    if (!lit) return null;
    const s = speller.spell(key.pitch);
    return (
      <span
        // eslint-disable-next-line text/no-adhoc-typography, type-scale-tokens/no-arbitrary-font-size -- 9px/7px labels tuned to fit a narrow key cap (same as the roll's piano keyboard); below the 10px token floor
        className={`select-none leading-none text-primary-foreground ${narrow ? "text-[7px]" : "text-[9px]"}`}
      >
        {`${s.step}${accidentalGlyph(s.alter)}`}
      </span>
    );
  };
}

/**
 * One readout keyboard lighting one voicing, fitted ON ITS OWN into the readout
 * window. Each inversion row fits separately (not jointly): a joint fit of a
 * 7th chord's inversions often widens to three octaves, and every readout
 * keyboard must keep the same two-octave shape.
 */
function VoicingKeyboard({
  voicing,
  renderKey,
}: {
  voicing: readonly number[];
  renderKey?: KeyboardProps["renderKey"];
}) {
  const voicings = useMemo(() => [voicing], [voicing]);
  const { plane, voicings: fitted } = useReadoutPlane(voicings);
  return (
    <ReadoutKeyboard
      plane={plane}
      lit={fitted[0] ?? NO_KEYS}
      renderKey={renderKey}
    />
  );
}

/**
 * The "current chord" readout — the BODY of a `Sonata.Section` whose chrome
 * (and the Inversions toggle in its header, `ChordReadoutActions`) the host
 * paints. Shows the chord annotation covering the playhead: the big symbol,
 * beside it the Roman numeral over the short quality, and the detection
 * confidence at the right when the chord has one. Below, a readout keyboard
 * lights the chord's voicing — or, with Inversions on, one captioned keyboard
 * per inversion.
 *
 * Applicability is the contribution's `useAvailable` (`useHasChords`): the
 * section is not painted for a chordless song, so this body never renders a
 * "no chords" empty state — only the resting state, when the playhead sits in a
 * gap between chords. That state keeps the skeleton (a dash for the symbol, an
 * unlit keyboard of the same shape) so the section column doesn't jump at
 * every gap.
 */
export function ChordReadout() {
  const { score } = useSession();
  const current = useCurrentChord();
  const [showInversions] = useShowInversions();

  // The key in force at the chord's onset: names the Roman numeral and spells
  // the key labels. Recomputes only when the chord under the playhead changes.
  const key = useMemo(
    () => (current ? effectiveKeyAt(score, current.start) : undefined),
    [current, score],
  );
  const roman = useMemo(
    () => (current && key ? romanNumeral(current.data, key) : null),
    [current, key],
  );
  const renderKey = useMemo(() => noteLabels(makeKeySpeller(key)), [key]);

  // The chord as voiced (root position, slash bass lowest).
  const voicing = useMemo(
    () => (current ? chordVoicing(current.data) : NO_KEYS),
    [current],
  );

  // Every inversion of the chord (index 0 = root position), each captioned
  // with its ordinal and slash-chord name.
  const inversions = useMemo(() => {
    if (!current) return [];
    const root = chordPitches(current.data);
    if (root.length < 2) return [];
    return root.map((_, k) => {
      const v = invertVoicing(root, k);
      return {
        voicing: v,
        lead: ORDINALS[k] ?? `${k}th`,
        trail: formatChordSymbolWithBass(current.data, pc12(v[0]!)),
      };
    });
  }, [current]);

  return (
    <Stack gap="md">
      <Stack direction="row" align="center" gap="md">
        {/* eslint-disable-next-line text/no-adhoc-typography -- large display readout (36px) exceeds the title token (20px), no equivalent variant */}
        <div className="text-4xl font-bold tracking-tight text-foreground">
          {current ? (
            current.data.symbol
          ) : (
            <span className="text-muted-foreground/50">—</span>
          )}
        </div>
        {current && (
          <Stack gap="none">
            {roman && (
              <Text
                variant="subheading"
                tone="primary"
                className="tabular-nums"
              >
                {roman}
              </Text>
            )}
            <Text variant="caption" tone="muted">
              {current.data.quality}
            </Text>
          </Stack>
        )}
        <Fill />
        {current?.confidence !== undefined && (
          <Text
            variant="caption"
            tone="muted"
            className="tabular-nums"
            title="Detection confidence"
          >
            {`${(current.confidence * 100).toFixed(0)}%`}
          </Text>
        )}
      </Stack>

      {showInversions && inversions.length > 0 ? (
        <Stack gap="sm">
          {inversions.map((inv) => (
            <Stack key={inv.lead} gap="xs">
              <KeyboardCaption lead={inv.lead} trail={inv.trail} />
              <VoicingKeyboard voicing={inv.voicing} renderKey={renderKey} />
            </Stack>
          ))}
        </Stack>
      ) : (
        <VoicingKeyboard voicing={voicing} renderKey={renderKey} />
      )}
    </Stack>
  );
}
