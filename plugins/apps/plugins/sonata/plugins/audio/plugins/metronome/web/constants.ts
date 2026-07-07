/**
 * Click encoding shared by the click voice, the synthetic click-note builder,
 * and the count-in scheduler. A click is just a note whose `pitch` carries its
 * accent *tier* (no real pitch): the click voice reads the tier to choose the
 * timbre. Three tiers, brightest → quietest:
 *
 *  - `ACCENT_PITCH` — a bar downbeat (the first beat of each bar).
 *  - `NORMAL_PITCH` — a main (notated) beat that is not a downbeat.
 *  - `SUB_PITCH`    — an in-between subdivision click (eighths / triplets / …),
 *                     a lighter, quieter tick so the main pulse still stands out.
 *
 * Ordered so `pitch >= ACCENT_PITCH` still means "accent" and `pitch <= SUB_PITCH`
 * means "subdivision", leaving `NORMAL_PITCH` in the middle.
 */
export const SUB_PITCH = -1;
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
