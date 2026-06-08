import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { SongLibrary } from "./components/song-library";
import { sonataLibraryPane, sonataPlayerPane } from "./panes";

export { Library } from "./slots";
export type { SortOrderProps } from "./slots";
export { useOpenSong } from "./hooks";

export default {
  name: "Sonata: Library",
  description:
    "Source-agnostic song library landing for Sonata. Renders the gallery of saved songs (via Sonata.Home) and opens a song into the player by collecting every source's raw through the Library.Source registry. Sources contribute persistence/hydration + their own add affordances.",
  contributions: [
    Sonata.Home({ id: "library", component: SongLibrary }),
    Pane.Register({ pane: sonataLibraryPane }),
    Pane.Register({ pane: sonataPlayerPane }),
  ],
} satisfies PluginDefinition;
