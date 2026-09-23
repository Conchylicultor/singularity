// ── What the loop is heard with ──────────────────────────────────────────────
//
// The trainer has two sounds for one loop, and they answer different
// questions:
//
//  - **the song** — the real recording, in its YouTube player. This is the ear
//    training: what the chords sound like inside a record, under a voice.
//  - **the piano** — the app's own sampled grand, striking each chord of the
//    loop as the song's playhead reaches it. This is the reference: the bare
//    chords behind the record, with nothing else in the way.
//
// They are two CHANNELS rather than one choice between them, because hearing
// both at once is the useful middle: the piano spelling out the harmony the ear
// is trying to pull out of the mix. Each channel is on or off and has its own
// level, and each is set on the thing it belongs to — the song on the song
// card, the piano on the keyboard. "Piano only" is not a mode: it is the song
// turned off.
//
// The song always plays, even when off: it is muted, not paused, because its
// playhead is the clock the piano follows.

/** Every channel of the mix, in the order they appear on screen. */
export const SOUND_CHANNELS = ["song", "piano"] as const;

/** One channel of what the loop is heard with. */
export type SoundChannel = (typeof SOUND_CHANNELS)[number];

/** A channel's setting: whether it sounds, and how loud (0–100) when it does. */
export type ChannelLevel = {
  on: boolean;
  volume: number;
};

/** The whole mix: one level per channel. */
export type SoundMix = Record<SoundChannel, ChannelLevel>;

/** The top of a channel's volume range; the bottom is 0. */
export const MAX_VOLUME = 100;
