import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Sonata, SonataToolbar } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { SongLibrary } from "./components/song-library";
import {
  BackToLibrary,
  DisplayPicker,
  SongTitle,
} from "./components/player-toolbar-items";
import { PlaySongAction } from "./components/play-song-action";
import { Library } from "./slots";
import { sonataLibraryPane, sonataPlayerPane } from "./panes";

export { Library } from "./slots";
export { useOpenSong } from "./hooks";
export { openSongImperative } from "./open-song";

export default {
  description:
    "Source-agnostic song library landing for Sonata. Renders the gallery of saved songs (via Sonata.Home) and opens a song into the player by collecting every source's raw through the Library.Source registry. Sources contribute persistence/hydration + their own add affordances.",
  contributions: [
    Sonata.Home({ id: "library", component: SongLibrary }),
    // Player toolbar leading zone: ← Library, song title, display picker.
    SonataToolbar.Start({ id: "back", component: BackToLibrary }),
    SonataToolbar.Start({ id: "title", component: SongTitle }),
    SonataToolbar.Start({ id: "display-picker", component: DisplayPicker }),
    Library.SongActions({ id: "play", component: PlaySongAction }),
    Pane.Register({ pane: sonataLibraryPane }),
    Pane.Register({ pane: sonataPlayerPane }),
  ],
} satisfies PluginDefinition;
