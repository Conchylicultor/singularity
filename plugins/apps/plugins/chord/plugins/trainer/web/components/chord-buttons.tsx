import type { ChordToken } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import {
  chordFunction,
  chordLabel,
  type ChordDigit,
  type ChordKeyGroup,
} from "@plugins/apps/plugins/chord/plugins/vocabulary/core";
import {
  ChordNumeral,
  chordToneStyle,
} from "@plugins/apps/plugins/chord/plugins/vocabulary/web";
import { NextStepPad } from "@plugins/apps/plugins/chord/plugins/curriculum/web";
import type { StepReadiness } from "@plugins/apps/plugins/chord/plugins/curriculum/web";
import type { NextStep } from "@plugins/apps/plugins/chord/plugins/curriculum/core";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Kbd } from "@plugins/primitives/plugins/overlay/plugins/tooltip/web";

/**
 * One button per unlocked chord: its numeral, its colour (a bar at the left
 * edge, from its scale degree), the key that answers it and its function.
 * Before the check a click fills the selected box; after it, the chord plays on
 * the piano. `lit` is the chord sounding now, lit only once the round is
 * checked.
 *
 * The buttons are laid out by key, 1 to 7, so the digits read left to right.
 * When several chords sit on one digit each also shows the number that picks
 * it, and while that digit is waiting for its second key those buttons are lit.
 *
 * At the end sits the locked next step, when it is a chord (`<NextStepPad>`).
 */
export function ChordButtons({
  plan,
  lit,
  picking,
  nextStep,
  onPick,
}: {
  /** The unlocked chords grouped by the key that answers them (`chordKeyPlan`). */
  plan: readonly ChordKeyGroup[];
  lit: ChordToken | null;
  /** The digit waiting for its second key, or null. */
  picking: ChordDigit | null;
  /** The locked next step, when there is one to show. */
  nextStep: {
    step: NextStep;
    level: number;
    readiness: StepReadiness;
    adding: boolean;
    onAdd: () => void;
  } | null;
  onPick: (token: ChordToken) => void;
}) {
  return (
    <Grid minCellWidth="9rem" gap="sm" aria-label="Chords to choose from">
      {plan.flatMap((group) =>
        group.tokens.map((token, index) => (
          <ChordPad
            key={token}
            token={token}
            digit={group.digit}
            /** Only worth showing when the digit alone does not answer. */
            pickNumber={group.tokens.length > 1 ? index + 1 : null}
            lit={lit === token}
            picking={picking === group.digit && group.tokens.length > 1}
            onPick={onPick}
          />
        )),
      )}
      {nextStep !== null && (
        <NextStepPad
          step={nextStep.step}
          level={nextStep.level}
          readiness={nextStep.readiness}
          adding={nextStep.adding}
          onAdd={nextStep.onAdd}
        />
      )}
    </Grid>
  );
}

function ChordPad({
  token,
  digit,
  pickNumber,
  lit,
  picking,
  onPick,
}: {
  token: ChordToken;
  digit: ChordDigit;
  /** The second key that picks this chord, when its digit is shared. */
  pickNumber: number | null;
  lit: boolean;
  picking: boolean;
  onPick: (token: ChordToken) => void;
}) {
  const fn = chordFunction(token);
  const keys = pickNumber === null ? digit : `${digit} ${String(pickNumber)}`;
  return (
    <button
      type="button"
      className="chord-pad chord-tone relative"
      style={chordToneStyle(token)}
      data-lit={lit ? "" : undefined}
      data-picking={picking ? "" : undefined}
      aria-label={`${chordLabel(token).text}${fn === null ? "" : `, ${fn}`}, key ${keys}`}
      aria-keyshortcuts={digit}
      onClick={() => onPick(token)}
    >
      <Stack as="span" gap="none" justify="between" className="h-full">
        <Line as="span" className="gap-xs">
          <ChordNumeral token={token} />
          <Fill as="span" />
          <Kbd>{digit}</Kbd>
          {pickNumber !== null && (
            <Kbd className="chord-pad-pick">{String(pickNumber)}</Kbd>
          )}
        </Line>
        <span className="chord-pad-fn">{fn ?? "outside the key"}</span>
      </Stack>
    </button>
  );
}
