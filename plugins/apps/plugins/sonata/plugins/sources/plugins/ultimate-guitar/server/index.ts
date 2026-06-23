import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import {
  fetchUgTab,
  searchUgTabs,
  createUltimateGuitarSong,
  getSongUltimateGuitar,
  updateUltimateGuitarSong,
} from "../shared/endpoints";
import {
  handleFetchUgTab,
  handleSearchUgTabs,
  handleCreateUltimateGuitarSong,
  handleGetSongUltimateGuitar,
  handleUpdateUltimateGuitarSong,
} from "./internal/routes";

export { fetchUgTabContent } from "./internal/ug-client";
export { songUltimateGuitar } from "./internal/tables";

export default {
  description:
    "Ultimate Guitar source server: fetches raw tabs from UG's private mobile API (fails loudly), and owns the sonata_songs_ext_ultimate_guitar side-table — creating UG-backed songs from a fetched tab and persisting edits (syncing the parent song's title/duration).",
  httpRoutes: {
    [fetchUgTab.route]: handleFetchUgTab,
    [searchUgTabs.route]: handleSearchUgTabs,
    [createUltimateGuitarSong.route]: handleCreateUltimateGuitarSong,
    [getSongUltimateGuitar.route]: handleGetSongUltimateGuitar,
    [updateUltimateGuitarSong.route]: handleUpdateUltimateGuitarSong,
  },
} satisfies ServerPluginDefinition;
