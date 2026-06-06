import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { prepromptsConfig } from "../shared/config";

export { resolvePreprompt, resolvePrepromptItem } from "./internal/resolve";

export default {
  name: "Preprompts",
  description:
    "Library of named instruction snippets prepended to a task's agent first user turn as a <special_instructions> block.",
  contributions: [ConfigV2.Register({ descriptor: prepromptsConfig })],
} satisfies ServerPluginDefinition;
