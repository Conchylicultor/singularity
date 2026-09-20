import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { revealConfig } from "../shared/config";

// Nothing but the config's server half. Reveal is a display preference: there
// is no state to keep, no endpoint to serve, and the value itself lives in the
// config store like every other one.
export default {
  description:
    "The Chord trainer's reveal setting, server side: registers the reveal config (off / chord names / chord names and keyboard) so it persists and shows in Settings.",
  contributions: [ConfigV2.Register({ descriptor: revealConfig })],
} satisfies ServerPluginDefinition;
