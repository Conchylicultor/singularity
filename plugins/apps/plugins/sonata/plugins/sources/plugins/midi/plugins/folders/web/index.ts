import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { Library } from "@plugins/apps/plugins/sonata/plugins/library/web";
import { midiFoldersConfig } from "../shared/config";
import { SourceMissingField } from "./components/source-missing-field";

export default {
  description:
    "Watched-folder UI for the MIDI source: registers the midi-folders config (settings pane renders it for free) and contributes the Source field (Library.Fields) that flags — and lets you filter for — folder-imported songs whose file has been deleted from disk.",
  contributions: [
    ConfigV2.WebRegister({ descriptor: midiFoldersConfig }),
    Library.Fields({
      id: "source-missing",
      section: null,
      component: SourceMissingField,
    }),
  ],
} satisfies PluginDefinition;
