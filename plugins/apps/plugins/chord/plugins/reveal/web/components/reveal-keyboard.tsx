import { useMemo } from "react";
import type { ChordToken } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import {
  chordVoicing,
  songVocabulary,
  type SongKey,
} from "@plugins/apps/plugins/chord/plugins/vocabulary/core";
import {
  ChordNumeral,
  chordToneStyle,
} from "@plugins/apps/plugins/chord/plugins/vocabulary/web";
import {
  pitchGeometry,
  pitchKeyboardHeight,
} from "@plugins/apps/plugins/sonata/plugins/pitch-layout/core";
import { Keyboard } from "@plugins/apps/plugins/sonata/plugins/primitives/plugins/keyboard/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { keyboardWindowFor } from "../internal/keyboard-window";
import "../reveal.css";

/**
 * The chord on show, on a piano: its name in the song's key, its numeral, and
 * the notes the app plays for it, lit and labelled.
 *
 * With no chord to show — before the round is checked, or while the playhead
 * crosses a rest — the card renders the SAME keyboard, unlit, with a line
 * saying what it is waiting for. It never collapses: the panel below it would
 * otherwise jump every time a chord stops sounding. (Sonata's chord readout
 * makes the same call for the same reason.)
 */
export function RevealKeyboardCard({
  token,
  songKey,
  tonicPc,
}: {
  /** The chord to show, or null when there is none to show yet. */
  token: ChordToken | null;
  /** The song's key: what the chord and its notes are named against. */
  songKey: SongKey;
  /** The key's tonic as a pitch class (0–11): what the voicing is built on. */
  tonicPc: number;
}) {
  // THE call the trainer's piano plays (`usePiano` → `chordVoicing(token,
  // round.keyTonicPc)`). The picture and the sound come from one expression, so
  // they cannot disagree about which notes this chord is.
  //
  // The mockup also draws a greyed root an octave below the voicing; we do not,
  // because the app never plays that note.
  const voicing = useMemo(
    () => (token === null ? [] : chordVoicing(token, tonicPc)),
    [token, tonicPc],
  );

  // The window, and the pads it lays out. Memoized on the two NUMBERS, not on
  // the window object, so the keyboard is re-laid out only when the window
  // actually changes — changing chord inside it only re-lights keys.
  const { low, high } = keyboardWindowFor(voicing);
  // "piano" is passed explicitly rather than read through `usePitchGeometry()`,
  // which reads Sonata's own piano/Jankó setting: the Chord app is not Sonata,
  // and a learner who set Sonata to Jankó has said nothing about this card.
  const plane = useMemo(() => pitchGeometry("piano", low, high), [low, high]);

  const words = useMemo(() => songVocabulary(songKey), [songKey]);

  // Every sounding note in the chord's own tile colour — the same `--fn-bg` a
  // filled answer box is painted with, derived by the one `.chord-tone` rule
  // below. So a lit key reads as the same object as the box above it.
  const lit = useMemo(
    () =>
      new Map(
        voicing.map((pitch): [number, string] => [pitch, "var(--fn-bg)"]),
      ),
    [voicing],
  );

  return (
    <Card className="rounded-2xl">
      <Stack
        gap="sm"
        className="chord-tone"
        style={token === null ? undefined : chordToneStyle(token)}
      >
        {token === null ? (
          <Text variant="caption" tone="faint">
            Check the round, then click a chord or a box to see its notes.
          </Text>
        ) : (
          <Line className="gap-xs">
            <Text variant="body" className="chord-reveal-name font-bold">
              {words.nameChord(token)}
            </Text>
            <Text variant="caption" tone="faint">
              ·
            </Text>
            <ChordNumeral token={token} className="chord-reveal-num" />
          </Line>
        )}
        <Keyboard
          plane={plane}
          lit={lit}
          renderKey={(key, state) =>
            state.lit ? (
              <span className="chord-key-label">
                {words.noteName(key.pitch)}
              </span>
            ) : null
          }
          className="w-full"
          // The keybed height is a number the LAYOUT chooses (four rows of
          // Jankó pads need more room than one row of piano keys), so it is not
          // a size class here.
          style={{ height: pitchKeyboardHeight("piano", "chip") }}
        />
      </Stack>
    </Card>
  );
}
