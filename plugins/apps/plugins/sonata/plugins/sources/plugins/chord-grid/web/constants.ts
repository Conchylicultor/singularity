/**
 * The chord-grid source id — the key under which its raw lives in the Sonata
 * context (`rawById`) and the `sourceId` of its `Library.Source` contribution.
 * Shared so the registration, the editor section, and the add affordance never
 * drift on a string literal.
 */
export const CHORD_GRID_SOURCE_ID = "chord-grid";

/** The track id chord-grid's derived notes belong to (a single voiced track). */
export const CHORD_GRID_TRACK = "cg0";

/**
 * Note-id namespace for chord-grid's derived notes. Voiced note ids are
 * `cg-${eventIndex}-${toneIndex}`; the shared voicing leaf builds them from this
 * prefix so chord-grid notes never collide with another source's.
 */
export const CHORD_GRID_NOTE_PREFIX = "cg";
