/**
 * Click encoding shared by the click voice, the synthetic click-note builder,
 * and the count-in scheduler. A click is just a note whose `pitch` carries the
 * accent flag (no real pitch): `ACCENT_PITCH` for a bar downbeat, `NORMAL_PITCH`
 * for an off-beat. The click voice reads `pitch >= ACCENT_PITCH` to choose the
 * brighter accent timbre.
 */
export const NORMAL_PITCH = 0;
export const ACCENT_PITCH = 1;

/** Track id every synthetic click note carries (the engine resolver is by track). */
export const METRONOME_TRACK = "metronome";

/**
 * Nominal click-note duration in quarter-note beats. A click is a percussive
 * transient (<60ms of audio); the value only needs to be a tiny positive so the
 * note has a non-degenerate span in the scheduler.
 */
export const CLICK_DURATION_BEATS = 0.01;
