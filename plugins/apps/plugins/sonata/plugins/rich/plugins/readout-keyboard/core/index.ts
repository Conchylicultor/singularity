/**
 * `@plugins/apps/plugins/sonata/plugins/rich/plugins/readout-keyboard/core` —
 * the readout keyboard's window and the pure fit of voicings into it.
 *
 * Pure, framework-free barrel: `READOUT_WINDOW` (C4–B5) and `fitVoicings`, the
 * one joint octave shift + whole-octave widening every readout keyboard shares.
 */

export type { ReadoutWindow } from "./fit-voicings";
export { READOUT_WINDOW, fitVoicings } from "./fit-voicings";
