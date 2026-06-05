/**
 * Stable id of the MIDI source. Lives in its own file (not the barrel, which
 * may not declare runtime `const`s) so consumers — e.g. the library, which
 * hydrates this source from a saved song's bytes — reference an id rather than
 * a magic string. This is a declared, intentional DAG edge: the library is
 * MIDI-backed by design.
 */
export const MIDI_SOURCE_ID = "midi";
