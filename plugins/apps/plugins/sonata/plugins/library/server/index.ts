import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { createSong, deleteSong } from "../core/endpoints";
import { handleCreateSong } from "./internal/handle-create-song";
import { handleDeleteSong } from "./internal/handle-delete-song";
import { songsLiveResource } from "./internal/resources";
import { seedStarters } from "./internal/seed";

export { _songs } from "./internal/tables";
export { songsLiveResource } from "./internal/resources";

export default {
  name: "Sonata: Library",
  description:
    "Persists Sonata songs (DB row + MIDI attachment), seeds bundled public-domain starters at boot, and serves the reactive song list.",
  httpRoutes: {
    [createSong.route]: handleCreateSong,
    [deleteSong.route]: handleDeleteSong,
  },
  contributions: [Resource.Declare(songsLiveResource)],
  onReady: async () => {
    await seedStarters();
  },
} satisfies ServerPluginDefinition;
