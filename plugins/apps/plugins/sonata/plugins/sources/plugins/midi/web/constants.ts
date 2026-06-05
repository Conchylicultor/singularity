/**
 * Stable id of the MIDI source — the key under which its raw lives in `rawById`
 * and the `sourceId` of its `Library.Source` / `Sonata.Source` contributions.
 * Lives in its own file (not the barrel, which may not declare runtime `const`s).
 * The library never references this: it collects sources generically via the
 * `Library.Source` registry, so MIDI is just one contributor among many.
 */
export const MIDI_SOURCE_ID = "midi";
