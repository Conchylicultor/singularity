import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { Library } from "@plugins/apps/plugins/sonata/plugins/library/web";
import { midiFoldersConfig } from "../shared/config";
import { SourceDeletedBadge } from "./components/source-deleted-badge";

export default {
  description:
    "Watched-folder UI for the MIDI source: registers the midi-folders config (settings pane renders it for free) and badges library cards whose folder-imported file has been deleted from disk.",
  contributions: [
    ConfigV2.WebRegister({ descriptor: midiFoldersConfig }),
    Library.CardMeta({ id: "midi-source-deleted", component: SourceDeletedBadge }),
  ],
} satisfies PluginDefinition;
