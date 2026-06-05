import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { prepromptsConfig } from "../shared/config";

export { resolvePreprompt } from "./internal/resolve";

export default {
  name: "Preprompts",
  description:
    "Library of named system-prompt snippets appended to a task's agent via --append-system-prompt.",
  contributions: [ConfigV2.Register({ descriptor: prepromptsConfig })],
} satisfies ServerPluginDefinition;
