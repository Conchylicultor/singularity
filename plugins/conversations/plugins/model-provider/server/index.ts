import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { modelProviderConfig } from "../shared/config";

export { resolveCliFlag } from "./internal/resolve-cli-flag";

export default {
  description: "Registry mapping logical ConversationModel IDs to pinned Claude CLI flags and display metadata.",
  contributions: [
    ConfigV2.Register({ descriptor: modelProviderConfig }),
  ],
} satisfies ServerPluginDefinition;
