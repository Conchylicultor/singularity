import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import {
  createChordGridSong,
  getSongChordGrid,
  updateChordGridSong,
} from "../shared/endpoints";
import {
  handleCreateChordGridSong,
  handleGetSongChordGrid,
  handleUpdateChordGridSong,
} from "./internal/routes";

export { songChordGrid } from "./internal/tables";

export default {
  description:
    "Owns the sonata_songs_ext_chord_grid side-table: per-song chord text, voicing, and octave. Creates chord-grid–backed songs and persists edits (syncing the parent song's title/duration).",
  httpRoutes: {
    [createChordGridSong.route]: handleCreateChordGridSong,
    [getSongChordGrid.route]: handleGetSongChordGrid,
    [updateChordGridSong.route]: handleUpdateChordGridSong,
  },
} satisfies ServerPluginDefinition;
