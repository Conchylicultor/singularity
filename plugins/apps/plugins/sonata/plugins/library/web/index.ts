import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { SongLibrary } from "./components/song-library";

export { Library } from "./slots";
export type { SortOrderProps } from "./slots";

export default {
  name: "Sonata: Library",
  description:
    "Song library landing for Sonata. Renders the gallery of saved songs (via Sonata.Home), opens a song into the player, and imports MIDI files.",
  contributions: [Sonata.Home({ id: "library", component: SongLibrary })],
} satisfies PluginDefinition;
