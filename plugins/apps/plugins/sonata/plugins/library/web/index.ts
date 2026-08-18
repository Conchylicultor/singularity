import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import {
  Sonata,
  SonataToolbar,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { SongLibrary } from "./components/song-library";
import {
  BackToLibrary,
  DisplayPicker,
} from "./components/player-toolbar-items";
import { SongTitle } from "./components/song-title-field";
import { PlaySongAction } from "./components/play-song-action";
import { DeleteSongAction } from "./components/delete-song-action";
import { Library } from "./slots";
import { sonataLibraryPane, sonataPlayerPane } from "./panes";

export { Library } from "./slots";
export { useOpenSong } from "./hooks";
export { openSongImperative } from "./open-song";
export { useCurrentSong } from "./use-current-song";

export default {
  description:
    "Source-agnostic song library landing for Sonata. Renders the gallery of saved songs (via Sonata.Home) and opens a song into the player by collecting every source's raw through the Library.Source registry. Sources contribute persistence/hydration + their own add affordances.",
  contributions: [
    Sonata.Home({ id: "library", component: SongLibrary }),
    // Player toolbar leading zone: ← Library, song title, display picker.
    SonataToolbar.Start({ id: "back", component: BackToLibrary }),
    SonataToolbar.Start({ id: "title", component: SongTitle }),
    // The picker is the header's expanding cell, and it says so itself: the
    // `AdaptiveBar` inside it asks the chain for the room (`grow-relay`), so
    // there is no layout flag here to keep in sync with it.
    SonataToolbar.Start({ id: "display-picker", component: DisplayPicker }),
    // Play is the library's one at-rest affordance: it earns a permanent slot
    // on every view that has one (the card's footer, the table's trailing
    // track). Delete keeps the default hover-revealed zone.
    Library.SongActions({
      id: "play",
      component: PlaySongAction,
      zone: "persistent",
    }),
    Library.SongActions({ id: "delete", component: DeleteSongAction }),
    Pane.Register({ pane: sonataLibraryPane }),
    Pane.Register({ pane: sonataPlayerPane }),
  ],
  slots: [Library, sonataLibraryPane, sonataPlayerPane],
} satisfies PluginDefinition;
