import type { ChordToken } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import {
  chordFunction,
  chordLabel,
  pickPage,
  type ChordDigit,
  type ChordKeyGroup,
} from "@plugins/apps/plugins/chord/plugins/vocabulary/core";
import {
  ChordNumeral,
  chordToneStyle,
} from "@plugins/apps/plugins/chord/plugins/vocabulary/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Kbd } from "@plugins/primitives/plugins/overlay/plugins/tooltip/web";
import type { Picking } from "../internal/use-chord-keys";

/**
 * One button per practised chord: its numeral, its colour (a bar at the left
 * edge, from its scale degree), the key that answers it, and under it either
 * the chord's function or — once reveal is on — its name in the song's key.
 * Before the check a click fills the selected box; after it, the chord plays on
 * the piano. `lit` is the chord on show, lit only once the round is checked.
 *
 * The buttons are laid out by key, 1 to 7, so the digits read left to right.
 * When several chords sit on one digit each also shows the number that picks
 * it, and while that digit is armed those buttons are lit. Past seven chords on
 * one digit the number depends on which page is showing, so at rest the button
 * shows its digit alone and the second number appears only while armed.
 */
export function ChordButtons({
  plan,
  lit,
  picking,
  nameChord,
  onPick,
}: {
  /** The practised chords grouped by the key that answers them (`chordKeyPlan`). */
  plan: readonly ChordKeyGroup[];
  lit: ChordToken | null;
  /** The digit waiting for its second key and what that key reaches, or null. */
  picking: Picking | null;
  /** Names a chord in the song's key. */
  nameChord: (token: ChordToken) => string;
  onPick: (token: ChordToken) => void;
}) {
  return (
    <Grid minCellWidth="9rem" gap="sm" aria-label="Chords to choose from">
      {plan.flatMap((group) => {
        const armed = picking !== null && picking.digit === group.digit;
        // At rest the badge is worth showing only when the digit alone does not
        // answer AND the number never changes — which is exactly "everything on
        // this digit fits on one page". Read off `pickPage` rather than a 7
        // written here, so the badge cannot claim a key the second stroke does
        // not honour.
        const firstPage = pickPage(group.tokens, 0);
        const stable = group.tokens.length > 1 && firstPage.pager === null;
        return group.tokens.map((token) => {
          const reachable = armed
            ? (picking?.numbers.get(token) ?? null)
            : null;
          const restNumber = stable
            ? (firstPage.numbers.get(token) ?? null)
            : null;
          return (
            <ChordPad
              key={token}
              token={token}
              digit={group.digit}
              // Armed and in reach: the key that picks it now. Armed and not:
              // the pager, dimmed, because that is the key that brings it into
              // reach. Otherwise its fixed number, when it has one.
              pickKey={
                armed ? (reachable ?? picking?.pager ?? null) : restNumber
              }
              outOfReach={armed && reachable === null}
              lit={lit === token}
              picking={armed && reachable !== null}
              nameChord={nameChord}
              onPick={onPick}
            />
          );
        });
      })}
    </Grid>
  );
}

function ChordPad({
  token,
  digit,
  pickKey,
  outOfReach,
  lit,
  picking,
  nameChord,
  onPick,
}: {
  token: ChordToken;
  digit: ChordDigit;
  /** The second key shown beside the digit: the one that picks it, or the pager. */
  pickKey: ChordDigit | null;
  /** The digit is armed but this chord is on another page: `pickKey` pages to it. */
  outOfReach: boolean;
  lit: boolean;
  picking: boolean;
  nameChord: (token: ChordToken) => string;
  onPick: (token: ChordToken) => void;
}) {
  const fn = chordFunction(token);
  const name = nameChord(token);
  const keys = pickKey === null ? digit : `${digit} ${pickKey}`;
  return (
    <button
      type="button"
      className="chord-pad chord-tone relative"
      style={chordToneStyle(token)}
      data-lit={lit ? "" : undefined}
      data-picking={picking ? "" : undefined}
      aria-label={`${chordLabel(token).text}, ${name}${fn === null ? "" : `, ${fn}`}, key ${keys}`}
      aria-keyshortcuts={digit}
      onClick={() => onPick(token)}
    >
      <Stack as="span" gap="none" justify="between" className="h-full">
        <Line as="span" className="gap-xs">
          <ChordNumeral token={token} />
          <Fill as="span" />
          <Kbd>{digit}</Kbd>
          {pickKey !== null && (
            // The title is named, because a dimmed number beside an armed digit
            // would otherwise read as "press this to answer" when it pages
            // instead. It sits on a wrapper because `Kbd` takes only a class.
            <Inline
              gap="none"
              title={
                outOfReach
                  ? `Press ${pickKey} to bring this chord into reach`
                  : undefined
              }
            >
              <Kbd
                className={
                  outOfReach
                    ? "chord-pad-pick chord-pad-pager"
                    : "chord-pad-pick"
                }
              >
                {pickKey}
              </Kbd>
            </Inline>
          )}
        </Line>
        <span className="chord-pad-fn">{name}</span>
      </Stack>
    </button>
  );
}
