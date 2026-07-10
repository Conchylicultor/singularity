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
    "Owns the sonata_songs_ext_chord_grid side-table: per-song chord text. Creates chord-grid–backed songs and persists grid edits (syncing the parent song's derived duration only; the title is library-owned).",
  httpRoutes: {
    [createChordGridSong.route]: handleCreateChordGridSong,
    [getSongChordGrid.route]: handleGetSongChordGrid,
    [updateChordGridSong.route]: handleUpdateChordGridSong,
  },
} satisfies ServerPluginDefinition;
