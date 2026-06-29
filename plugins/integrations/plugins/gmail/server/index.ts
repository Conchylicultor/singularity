import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { gmailConfig } from "../shared/config";

export default {
  description: "Surfaces the Gmail access toggle in Settings.",
  contributions: [ConfigV2.Register({ descriptor: gmailConfig })],
} satisfies ServerPluginDefinition;
