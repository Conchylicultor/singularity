import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { songIndexConfig } from "../shared/config";

export { SongIndexGate } from "./components/song-index-gate";

export default {
  description:
    "The song index's web half: the settings registration for its load scope, and SongIndexGate — opens the index on mount and shows the load's progress (or its failure, with Retry) until the index is ready, then its children.",
  contributions: [ConfigV2.WebRegister({ descriptor: songIndexConfig })],
} satisfies PluginDefinition;
