import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { modelProviderConfig } from "../shared/config";

export default {
  id: "conversations-model-provider",
  name: "Model Provider",
  description: "Registry mapping logical ConversationModel IDs to pinned Claude CLI flags and display metadata.",
  contributions: [
    ConfigV2.WebRegister({ descriptor: modelProviderConfig }),
  ],
} satisfies PluginDefinition;
