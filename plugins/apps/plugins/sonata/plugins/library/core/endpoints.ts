import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

/**
 * Delete a song. Generic and source-agnostic: the FK CASCADE on `sonata_songs`
 * drops every source's extension row (e.g. `sonata_songs_ext_midi`) and the
 * attachment link; the now-unlinked attachment is reclaimed by the orphan sweep.
 *
 * There is intentionally **no** generic `createSong` endpoint: a song is always
 * created *by a source* (which has both the generic metadata and its own raw to
 * persist). Sources call the server-side `createSongRow` helper from one of
 * their own endpoints (see e.g. the MIDI source's `createMidiSong`).
 */
export const deleteSong = defineEndpoint({
  route: "DELETE /api/sonata/songs/:id",
});
