import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { createMidiSong, getSongMidi } from "../shared/endpoints";
import { handleCreateMidiSong, handleGetSongMidi } from "./internal/routes";
import { songMidiLiveResource } from "./internal/resource";
import { seedMidiStarters } from "./internal/seed";
import { backfillContentHashes } from "./internal/import";

export { songMidi } from "./internal/tables";
export { songMidiLiveResource } from "./internal/resource";
export {
  importMidiSong,
  getSongMidiBySourcePath,
  setSourceMissing,
  listFolderImportedSongs,
} from "./internal/import";
export type { ImportMidiSongInput } from "./internal/import";

export default {
  description:
    "Owns the sonata_songs_ext_midi side-table: per-song MIDI attachment + track count. Creates MIDI-backed songs, serves the reactive MIDI rollup, and seeds the bundled public-domain MIDI starters at boot.",
  httpRoutes: {
    [createMidiSong.route]: handleCreateMidiSong,
    [getSongMidi.route]: handleGetSongMidi,
  },
  contributions: [Resource.Declare(songMidiLiveResource)],
  onReady: async () => {
    await seedMidiStarters();
    await backfillContentHashes();
  },
} satisfies ServerPluginDefinition;
