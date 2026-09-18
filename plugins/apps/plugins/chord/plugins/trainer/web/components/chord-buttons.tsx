import type { ChordToken } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import {
  chordFunction,
  chordLabel,
  chordShortcutKey,
} from "@plugins/apps/plugins/chord/plugins/vocabulary/core";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Kbd } from "@plugins/primitives/plugins/overlay/plugins/tooltip/web";
import { chordToneStyle } from "../internal/chord-tone";
import { ChordNumeral } from "./chord-numeral";

/**
 * One button per unlocked chord: its numeral, its colour (a bar at the left
 * edge, from its scale degree), its key (1–7) and its function. Before the
 * check a click fills the selected box; after it, the chord plays on the piano.
 * `lit` is the chord sounding now, lit only once the round is checked.
 */
export function ChordButtons({
  chords,
  lit,
  onPick,
}: {
  chords: readonly ChordToken[];
  lit: ChordToken | null;
  onPick: (token: ChordToken) => void;
}) {
  return (
    <Grid minCellWidth="9rem" gap="sm" aria-label="Chords to choose from">
      {chords.map((token) => (
        <ChordPad
          key={token}
          token={token}
          lit={lit === token}
          onPick={onPick}
        />
      ))}
    </Grid>
  );
}

function ChordPad({
  token,
  lit,
  onPick,
}: {
  token: ChordToken;
  lit: boolean;
  onPick: (token: ChordToken) => void;
}) {
  const key = chordShortcutKey(token);
  const fn = chordFunction(token);
  return (
    <button
      type="button"
      className="chord-pad chord-tone relative"
      style={chordToneStyle(token)}
      data-lit={lit ? "" : undefined}
      aria-label={`${chordLabel(token).text}${fn === null ? "" : `, ${fn}`}${
        key === null ? "" : `, key ${key}`
      }`}
      aria-keyshortcuts={key ?? undefined}
      onClick={() => onPick(token)}
    >
      <Stack as="span" gap="none" justify="between" className="h-full">
        <Line as="span" className="gap-xs">
          <ChordNumeral token={token} />
          <Fill as="span" />
          {key !== null && <Kbd>{key}</Kbd>}
        </Line>
        <span className="chord-pad-fn">{fn ?? "outside the key"}</span>
      </Stack>
    </button>
  );
}
