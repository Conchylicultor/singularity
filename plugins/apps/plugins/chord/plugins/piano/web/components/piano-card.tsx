import { useMemo, useState } from "react";
import type { ChordToken } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import {
  chordSound,
  songVocabulary,
  type SongKey,
} from "@plugins/apps/plugins/chord/plugins/vocabulary/core";
import {
  ChordNumeral,
  chordToneStyle,
} from "@plugins/apps/plugins/chord/plugins/vocabulary/web";
import {
  SONATA_DEFAULT_LOOK,
  SONATA_LOOK_STYLES,
} from "@plugins/apps/plugins/sonata/plugins/look/core";
import {
  pitchGeometry,
  pitchKeyboardHeight,
} from "@plugins/apps/plugins/sonata/plugins/pitch-layout/core";
import { Keyboard } from "@plugins/apps/plugins/sonata/plugins/primitives/plugins/keyboard/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { useEventCallback } from "@plugins/primitives/plugins/latest-ref/web";
import { keyboardWindowFor } from "../internal/keyboard-window";
import { SoundChannelControl } from "./sound-channel";
import "../piano.css";

/**
 * The app's piano: a four-octave keyboard showing the chord on show — its name
 * in the song's key, its numeral, the notes the app plays for it lit and
 * labelled, and its bass doubled an octave below in a greyed tile — with the
 * piano's own sound channel (on/off and level) above it.
 *
 * Three things it is worth saying plainly:
 *
 *  - **The lit keys are `chordSound`'s own output**, the very call the piano
 *    plays. One expression feeds the picture and the sound, so they cannot
 *    disagree about which notes this chord is — the doubled bass included,
 *    which is why it is drawn: it is heard.
 *  - **The keys are playable.** Clicking, tapping or sliding across them
 *    strikes that note on the same piano, and the key lights while it is held.
 *    A key is played on the piano whether or not the piano channel is on: the
 *    channel decides whether the piano FOLLOWS the song, not whether it can
 *    be played.
 *  - **Nothing is lit before the check**, by construction: the trainer's shown
 *    chord is null until the round is checked, so there is no guard here that
 *    could be forgotten. With `null` the card draws the SAME keyboard unlit and
 *    still playable, with a line saying so, rather than collapsing — the panel
 *    below it would otherwise jump every time a chord stopped sounding.
 */
/** Flat keys: the Chord app's own choice, fixed, never Sonata's setting. */
const CHORD_KEY_SKIN = SONATA_LOOK_STYLES[SONATA_DEFAULT_LOOK].keys;

export function PianoCard({
  token,
  songKey,
  tonicPc,
  play,
}: {
  /** The chord to show, or null when there is none to show yet. */
  token: ChordToken | null;
  /** The song's key: what the chord and its notes are named against. */
  songKey: SongKey;
  /** The key's tonic as a pitch class (0–11): what the voicing is built on. */
  tonicPc: number;
  /**
   * Strikes a set of pitches on the app's piano. Handed in rather than taken
   * from `usePiano()` here: the trainer already holds one piano for the screen
   * (one AudioContext, one voice set), and a second hook instance would open a
   * second context beside it.
   */
  play: (pitches: readonly number[]) => void;
}) {
  // THE call the trainer's piano plays. The picture and the sound come from one
  // expression, so they cannot disagree about which notes this chord is.
  const sound = useMemo(
    () => (token === null ? null : chordSound(token, tonicPc)),
    [token, tonicPc],
  );
  const words = useMemo(() => songVocabulary(songKey), [songKey]);

  // The keys the learner is pressing right now, so a played key lights like a
  // sounding one. Stable handlers, so the keyboard's pointer tracking is not
  // rebuilt under a drag.
  const [held, setHeld] = useState<ReadonlySet<number>>(() => new Set());
  const onPress = useEventCallback((pitch: number) => {
    play([pitch]);
    setHeld((s) => new Set(s).add(pitch));
  });
  const onRelease = useEventCallback((pitch: number) => {
    setHeld((s) => {
      const next = new Set(s);
      next.delete(pitch);
      return next;
    });
  });
  const interaction = useMemo(
    () => ({ onPress, onRelease }),
    [onPress, onRelease],
  );

  // The window, and the pads it lays out. Memoized on the two NUMBERS, not on
  // the window object, so the keyboard is re-laid out only when the window
  // actually changes — changing chord inside it only re-lights keys.
  const { low, high } = keyboardWindowFor(sound?.pitches ?? []);
  // "piano" is passed explicitly rather than read through `usePitchGeometry()`,
  // which reads Sonata's own piano/Jankó setting: the Chord app is not Sonata,
  // and a learner who set Sonata to Jankó has said nothing about this card.
  const plane = useMemo(() => pitchGeometry("piano", low, high), [low, high]);

  // Every sounding note in the chord's own tile colour — the same `--fn-bg` a
  // filled answer box is painted with — with the doubled bass in the greyed
  // `--fn-bass` the mockup gives it, so it reads as support rather than as a
  // fourth chord tone. A held key that is not already lit takes the accent.
  const lit = useMemo(() => {
    const map = new Map<number, string>();
    if (sound !== null) {
      map.set(sound.bass, "var(--fn-bass)");
      for (const pitch of sound.voicing) map.set(pitch, "var(--fn-bg)");
    }
    for (const pitch of held) if (!map.has(pitch)) map.set(pitch, "");
    return map;
  }, [sound, held]);

  return (
    <Card className="rounded-2xl">
      <Stack
        gap="sm"
        className="chord-tone chord-piano"
        style={token === null ? undefined : chordToneStyle(token)}
      >
        <Line className="gap-xs">
          {token === null ? (
            <Text variant="caption" tone="faint">
              Click a key to hear it. Check the round to see its chords.
            </Text>
          ) : (
            <>
              <Text variant="body" className="chord-piano-name font-bold">
                {words.nameChord(token)}
              </Text>
              <Text variant="caption" tone="faint">
                ·
              </Text>
              <ChordNumeral token={token} className="chord-piano-num" />
            </>
          )}
          <Fill />
          <SoundChannelControl channel="piano" />
        </Line>
        <Keyboard
          plane={plane}
          lit={lit}
          // The Chord app is not Sonata, so it picks its own skin rather than
          // following Sonata's look — the same call this card already makes for
          // the layout. Flat keys, which is what the mockup draws.
          skin={CHORD_KEY_SKIN}
          interaction={interaction}
          renderKey={(key, state) =>
            state.lit ? (
              <span
                className="chord-key-label"
                data-bass={
                  sound !== null && key.pitch === sound.bass ? "" : undefined
                }
              >
                {words.noteName(key.pitch)}
              </span>
            ) : null
          }
          className="w-full"
          // The keybed height is a number the LAYOUT chooses (four rows of
          // Jankó pads need more room than one row of piano keys), so it is not
          // a size class here. "keybed", not "chip": these keys are what the
          // learner reads the chord off, and they are played.
          style={{ height: pitchKeyboardHeight("piano", "keybed") }}
        />
      </Stack>
    </Card>
  );
}
