import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { SongLibrary } from "./components/song-library";
import {
  BackToLibrary,
  DisplayPicker,
} from "./components/player-toolbar-items";
import { PlaySongAction } from "./components/play-song-action";
import { DeleteSongAction } from "./components/delete-song-action";
import { Library } from "./slots";
import { sonataLibraryPane, sonataPlayerPane } from "./panes";

export { Library } from "./slots";
// The player pane is the OWNER of the player's header slot
// (`sonataPlayerPane.Actions`), so every plugin contributing a control to that
// header — transport, volume, metronome, transpose, … — reaches it through here.
export { sonataLibraryPane, sonataPlayerPane } from "./panes";
export { useOpenSong } from "./hooks";
export { openSongImperative } from "./open-song";
export { useCurrentSong } from "./use-current-song";

export default {
  description:
    "Source-agnostic song library landing for Sonata. Renders the gallery of saved songs (via Sonata.Home) and opens a song into the player by collecting every source's raw through the Library.Source registry. Sources contribute persistence/hydration + their own add affordances.",
  contributions: [
    Sonata.Home({ id: "library", component: SongLibrary }),
    // The player pane's header. The song title is NOT here: a pane contributes
    // exactly one `title` item into its own header, and the player's title is
    // that item's value (`<PaneChrome title={<SongTitle/>}>` in `panes.tsx`).
    sonataPlayerPane.Actions({ id: "back", component: BackToLibrary }),
    sonataPlayerPane.Actions({
      id: "display-picker",
      component: DisplayPicker,
    }),
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
  slots: {
    ...Library,
    "sonata-library": sonataLibraryPane,
    "sonata-player": sonataPlayerPane,
  },
} satisfies PluginDefinition;
