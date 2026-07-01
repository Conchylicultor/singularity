/**
 * Stable id of the MIDI source — the key under which its raw lives in `rawById`,
 * the `sourceId` of its `Library.Source` / `Sonata.Source` contributions, and the
 * opaque `source` discriminator stamped onto the `sonata_songs` row at creation.
 * Lives in `shared/` (not `web/`) so the server-side create path can stamp the
 * same id without a web import. The library never references this: it collects
 * sources generically via the `Library.Source` registry, so MIDI is just one
 * contributor among many.
 */
export const MIDI_SOURCE_ID = "midi";
